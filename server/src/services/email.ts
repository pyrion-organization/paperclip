import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SIGNATURE_HTML = `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
  <tr>
    <td>
      <table cellpadding="0" cellspacing="0" border="0"
        style="background:hsl(210,8%,7%);padding:14px 22px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <tr valign="middle">
          <td style="padding-right:0;">
            <span style="display:block;color:rgb(252,154,34);letter-spacing:-0.025em;line-height:1;white-space:nowrap;font-size:28px;font-weight:700;">Pyrion</span>
            <span style="display:block;font-weight:400;color:rgb(229,231,235);letter-spacing:0.01em;line-height:1.4;white-space:nowrap;font-size:9px;margin-top:4px;">Tecnologia aplicada à eficiência operacional</span>
          </td>
          <td style="width:1px;background:rgba(255,255,255,0.2);padding:0 16px;">
            <div style="width:1px;height:41px;background:rgba(255,255,255,0.2);"></div>
          </td>
          <td style="font-size:10px;text-align:left;">
            <div style="font-weight:700;color:#ffffff;margin-bottom:4px;">Automations</div>
            <div style="color:rgb(229,231,235);margin-bottom:4px;">Agentes de IA &amp; E-mails Automatizados</div>
            <div style="margin-bottom:4px;"><a href="https://www.pyrion.com.br" style="color:#ffffff;text-decoration:none;">www.pyrion.com.br</a></div>
            <div style="color:rgb(180,180,180);font-size:8px;">Por favor, não responda este e-mail automático.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

function buildEmailWrapper(params: {
  headerColor: string;
  headerIcon: string;
  headerTitle: string;
  headerSubtitle: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(params.headerTitle)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f7;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:${params.headerColor};border-radius:8px 8px 0 0;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr valign="middle">
                <td style="font-size:32px;line-height:1;">${params.headerIcon}</td>
                <td style="padding-left:16px;">
                  <div style="color:#ffffff;font-size:20px;font-weight:700;line-height:1.2;">${escapeHtml(params.headerTitle)}</div>
                  <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:4px;">${escapeHtml(params.headerSubtitle)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none;">
            ${params.body}
            ${SIGNATURE_HTML}
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function metaRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:13px;white-space:nowrap;padding-right:24px;">${escapeHtml(label)}</td>
    <td style="padding:6px 0;color:#111827;font-size:13px;font-family:'Courier New',monospace;word-break:break-all;">${escapeHtml(value)}</td>
  </tr>`;
}

function metaTable(rows: Array<[string, string]>): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:16px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px 16px;">
    ${rows.map(([k, v]) => metaRow(k, v)).join("")}
  </table>`;
}

function codeBlock(title: string, content: string, maxLen = 3000): string {
  const trimmed = content.length > maxLen
    ? content.slice(0, maxLen) + `\n\n… (truncated at ${maxLen} chars)`
    : content;
  return `<div style="margin:20px 0;">
    <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${escapeHtml(title)}</div>
    <pre style="margin:0;padding:16px;background:#1e1e2e;color:#cdd6f4;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.6;border-radius:6px;white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(trimmed)}</pre>
  </div>`;
}

function alertBox(color: string, bgColor: string, borderColor: string, message: string): string {
  return `<div style="margin:16px 0;padding:14px 16px;background:${bgColor};border-left:4px solid ${borderColor};border-radius:4px;">
    <span style="color:${color};font-size:14px;font-weight:600;">${escapeHtml(message)}</span>
  </div>`;
}

export async function sendRoutineFailureEmail(params: {
  to: string;
  routineTitle: string;
  routineId: string;
  runId: string;
  failureReason: string | null;
  scriptOutput?: string | null;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  const from = process.env.SMTP_FROM ?? "noreply@paperclip.local";
  const now = new Date().toISOString();

  const bodyParts: string[] = [];

  bodyParts.push(`<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    The routine <strong>${escapeHtml(params.routineTitle)}</strong> has failed during script execution.
    Review the details below to understand what went wrong.
  </p>`);

  if (params.failureReason) {
    bodyParts.push(alertBox("#991b1b", "#fef2f2", "#ef4444", `Failure reason: ${params.failureReason}`));
  }

  bodyParts.push(metaTable([
    ["Routine", params.routineTitle],
    ["Routine ID", params.routineId],
    ["Run ID", params.runId],
    ["Time", now],
  ]));

  if (params.scriptOutput) {
    bodyParts.push(codeBlock("Script Output", params.scriptOutput));
  }

  bodyParts.push(`<p style="color:#6b7280;font-size:13px;margin:20px 0 0;">
    If failure remediation is enabled, an agent will automatically attempt to fix the issue and re-run the script.
  </p>`);

  const html = buildEmailWrapper({
    headerColor: "#dc2626",
    headerIcon: "❌",
    headerTitle: "Routine Script Failed",
    headerSubtitle: params.routineTitle,
    body: bodyParts.join("\n"),
  });

  const text = [
    `Routine "${params.routineTitle}" failed.`,
    ``,
    `Failure reason: ${params.failureReason ?? "Unknown"}`,
    `Routine ID: ${params.routineId}`,
    `Run ID: ${params.runId}`,
    `Time: ${now}`,
    params.scriptOutput ? `\n--- Script output ---\n${params.scriptOutput.slice(0, 3000)}` : "",
  ].join("\n");

  await transport.sendMail({
    from,
    to: params.to,
    subject: `❌ Routine failed: ${params.routineTitle}`,
    text,
    html,
  });
}

export async function sendRemediationResultEmail(params: {
  to: string;
  routineTitle: string;
  routineId: string;
  runId: string;
  succeeded: boolean;
  failureReason: string | null;
  scriptOutput: string | null;
  remediationDiff: string | null;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  const from = process.env.SMTP_FROM ?? "noreply@paperclip.local";
  const now = new Date().toISOString();

  const bodyParts: string[] = [];

  if (params.succeeded) {
    bodyParts.push(`<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
      The remediation agent has successfully fixed the issue in <strong>${escapeHtml(params.routineTitle)}</strong>.
      The script was automatically re-run and completed successfully.
    </p>`);
    bodyParts.push(alertBox("#065f46", "#ecfdf5", "#10b981", "Script re-run completed successfully after remediation."));
  } else {
    bodyParts.push(`<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
      The remediation agent attempted to fix <strong>${escapeHtml(params.routineTitle)}</strong>,
      but the script failed again after the fix was applied. Manual intervention may be required.
    </p>`);
    if (params.failureReason) {
      bodyParts.push(alertBox("#991b1b", "#fef2f2", "#ef4444", `Still failing: ${params.failureReason}`));
    }
  }

  bodyParts.push(metaTable([
    ["Routine", params.routineTitle],
    ["Routine ID", params.routineId],
    ["Run ID", params.runId],
    ["Result", params.succeeded ? "✓ Success" : "✗ Failed again"],
    ["Time", now],
  ]));

  if (params.remediationDiff) {
    bodyParts.push(codeBlock("Changes Made by Remediation Agent", params.remediationDiff, 4000));
  }

  if (params.scriptOutput) {
    bodyParts.push(codeBlock("Script Output", params.scriptOutput));
  }

  const html = buildEmailWrapper({
    headerColor: params.succeeded ? "#059669" : "#dc2626",
    headerIcon: params.succeeded ? "✅" : "⚠️",
    headerTitle: params.succeeded ? "Routine Fixed & Re-run Successful" : "Routine Still Failing After Remediation",
    headerSubtitle: params.routineTitle,
    body: bodyParts.join("\n"),
  });

  const textLines: string[] = [
    `Routine "${params.routineTitle}" re-run result: ${params.succeeded ? "SUCCESS" : "FAILED AGAIN"}`,
    ``,
    `Routine ID: ${params.routineId}`,
    `Run ID: ${params.runId}`,
    `Time: ${now}`,
  ];
  if (!params.succeeded && params.failureReason) {
    textLines.push(``, `Failure reason: ${params.failureReason}`);
  }
  if (params.remediationDiff) {
    textLines.push(``, `--- Changes made by remediation agent ---`, params.remediationDiff);
  }
  if (params.scriptOutput) {
    textLines.push(``, `--- Script output ---`, params.scriptOutput.slice(0, 3000));
  }

  const subject = params.succeeded
    ? `✅ Routine fixed: ${params.routineTitle}`
    : `⚠️ Routine still failing: ${params.routineTitle}`;

  await transport.sendMail({
    from,
    to: params.to,
    subject,
    text: textLines.join("\n"),
    html,
  });
}
