import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { secretService } from "./secrets.js";
import { SMTP_PASSWORD_SECRET_NAME } from "./companies.js";
import { logger } from "../middleware/logger.js";

type SmtpConfig = {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  signatureHtml: string | null;
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function loadSmtpConfig(
  db: Db | null,
  companyId: string | null | undefined,
): Promise<SmtpConfig | null> {
  let host = process.env.SMTP_HOST ?? null;
  let port = Number(process.env.SMTP_PORT ?? 587);
  let user: string | null = process.env.SMTP_USER ?? null;
  let pass: string | null = process.env.SMTP_PASS ?? null;
  let from: string = process.env.SMTP_FROM ?? "noreply@paperclip.local";
  let signatureHtml: string | null = null;

  if (db && companyId) {
    try {
      const row = await db
        .select({
          smtpHost: companies.smtpHost,
          smtpPort: companies.smtpPort,
          smtpUser: companies.smtpUser,
          smtpFrom: companies.smtpFrom,
          emailSignatureHtml: companies.emailSignatureHtml,
        })
        .from(companies)
        .where(eq(companies.id, companyId))
        .then((rows) => rows[0] ?? null);
      signatureHtml = nonEmpty(row?.emailSignatureHtml);
      if (row?.smtpHost) {
        host = row.smtpHost;
        port = row.smtpPort ?? port;
        user = row.smtpUser ?? null;
        from = row.smtpFrom ?? from;
        const secrets = secretService(db);
        const secret = await secrets.getByName(companyId, SMTP_PASSWORD_SECRET_NAME);
        if (secret) {
          try {
            pass = await secrets.resolveSecretValue(companyId, secret.id, "latest");
          } catch (err) {
            logger.warn({ err, companyId }, "email: failed to resolve SMTP password secret, sending without auth");
            pass = null;
          }
        } else {
          pass = null;
        }
      }
    } catch (err) {
      logger.warn({ err, companyId }, "email: failed to load company SMTP config from DB, falling back to env");
    }
  }

  if (!host) return null;
  return { host, port, user, pass, from, signatureHtml };
}

function buildTransport(config: SmtpConfig) {
  if (config.user && !config.pass) {
    logger.warn({ host: config.host }, "email: SMTP user configured but no password; sending unauthenticated");
  }
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailWrapper(params: {
  headerColor: string;
  headerIcon: string;
  headerTitle: string;
  headerSubtitle: string;
  body: string;
  signatureHtml: string | null;
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
            ${params.signatureHtml ?? ""}
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

function quoteBlock(title: string, content: string, accent = "#10b981", maxLen: number | null = 4000): string {
  const trimmed = maxLen !== null && content.length > maxLen
    ? content.slice(0, maxLen) + `\n\n… (truncated at ${maxLen} chars)`
    : content;
  return `<div style="margin:20px 0;">
    <div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">${escapeHtml(title)}</div>
    <div style="margin:0;padding:14px 18px;background:#f9fafb;border-left:4px solid ${accent};border-radius:4px;color:#111827;font-size:14px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;">${escapeHtml(trimmed)}</div>
  </div>`;
}

function alertBox(color: string, bgColor: string, borderColor: string, message: string): string {
  return `<div style="margin:16px 0;padding:14px 16px;background:${bgColor};border-left:4px solid ${borderColor};border-radius:4px;">
    <span style="color:${color};font-size:14px;font-weight:600;">${escapeHtml(message)}</span>
  </div>`;
}

export async function sendTestEmail(params: {
  to: string;
  db?: Db | null;
  companyId?: string | null;
}): Promise<void> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) throw new Error("SMTP is not configured");
  const transport = buildTransport(config);
  const now = new Date().toISOString();

  const body = `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    This is a test email to confirm that your SMTP configuration is working correctly.
  </p>
  ${metaTable([
    ["From", config.from],
    ["SMTP host", config.host],
    ["SMTP port", String(config.port)],
    ["Time", now],
  ])}
  <p style="color:#6b7280;font-size:13px;margin:20px 0 0;">
    If you received this email, your email notification settings are configured correctly.
  </p>`;

  const html = buildEmailWrapper({
    headerColor: "#2563eb",
    headerIcon: "✉️",
    headerTitle: "Test Email",
    headerSubtitle: "Email configuration test",
    body,
    signatureHtml: config.signatureHtml,
  });

  await transport.sendMail({
    from: config.from,
    to: params.to,
    subject: "✉️ Test email from Paperclip",
    text: `This is a test email.\n\nFrom: ${config.from}\nSMTP host: ${config.host}\nTime: ${now}`,
    html,
  });
}

export type IssueCompletionEmailParams = {
  to: string;
  issueTitle: string;
  issueId: string;
  issueIdentifier: string | null;
  completedByName: string;
  completedByKind: "agent" | "user";
  agentComment?: string | null;
  issueDescription?: string | null;
  completedAt?: Date;
  db?: Db | null;
  companyId?: string | null;
};

export type IssueCompletionEmailSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "smtp_not_configured" };

export async function sendIssueCompletionEmailWithResult(
  params: IssueCompletionEmailParams,
): Promise<IssueCompletionEmailSendResult> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return { status: "skipped", reason: "smtp_not_configured" };
  const transport = buildTransport(config);
  const from = config.from;
  const completedAt = params.completedAt ?? new Date();
  const completedAtIso = completedAt.toISOString();
  const identifierLabel = params.issueIdentifier ?? params.issueId.slice(0, 8);
  const headerSubtitle = params.issueIdentifier
    ? `${params.issueIdentifier} — ${params.issueTitle}`
    : params.issueTitle;
  const completedByLabel = `${params.completedByName} (${params.completedByKind})`;

  const bodyParts: string[] = [];

  bodyParts.push(`<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    Issue <strong>${escapeHtml(identifierLabel)} — ${escapeHtml(params.issueTitle)}</strong>
    has just been marked as <strong style="color:#059669;">done</strong> by
    <strong>${escapeHtml(params.completedByName)}</strong>.
  </p>`);

  const trimmedComment = params.agentComment?.trim();
  if (trimmedComment) {
    const commentTitle = params.completedByKind === "agent" ? "Closing comment from agent" : "Closing comment";
    bodyParts.push(quoteBlock(commentTitle, trimmedComment, "#10b981", null));
  }

  bodyParts.push(metaTable([
    ["Issue", params.issueTitle],
    ["Identifier", params.issueIdentifier ?? "—"],
    ["Issue ID", params.issueId],
    ["Completed by", completedByLabel],
    ["Time", completedAtIso],
  ]));

  const trimmedDescription = params.issueDescription?.trim();
  if (trimmedDescription) {
    bodyParts.push(quoteBlock("Issue description", trimmedDescription, "#9ca3af", null));
  }

  bodyParts.push(`<p style="color:#6b7280;font-size:13px;margin:20px 0 0;">
    This is an automated notification sent because an issue you created has been completed.
  </p>`);

  const html = buildEmailWrapper({
    headerColor: "#059669",
    headerIcon: "✅",
    headerTitle: "Issue Done",
    headerSubtitle,
    body: bodyParts.join("\n"),
    signatureHtml: config.signatureHtml,
  });

  const textLines: string[] = [
    `Issue "${identifierLabel} — ${params.issueTitle}" has been marked as done by ${params.completedByName}.`,
    ``,
    `Identifier: ${params.issueIdentifier ?? "—"}`,
    `Issue ID: ${params.issueId}`,
    `Completed by: ${completedByLabel}`,
    `Time: ${completedAtIso}`,
  ];
  if (trimmedComment) {
    textLines.push(``, `--- Closing comment ---`, trimmedComment);
  }
  if (trimmedDescription) {
    textLines.push(``, `--- Issue description ---`, trimmedDescription);
  }

  const subjectIdent = params.issueIdentifier ? `${params.issueIdentifier} ` : "";
  await transport.sendMail({
    from,
    to: params.to,
    subject: `✅ Issue done: ${subjectIdent}${params.issueTitle}`.slice(0, 200),
    text: textLines.join("\n"),
    html,
  });
  return { status: "sent" };
}

export async function sendIssueCompletionEmail(params: IssueCompletionEmailParams): Promise<void> {
  await sendIssueCompletionEmailWithResult(params);
}

function formatDurationMs(startedAt: Date, completedAt: Date): string {
  const durationMs = Math.max(0, completedAt.getTime() - startedAt.getTime());
  if (durationMs < 1_000) return `${durationMs}ms`;
  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export async function sendRoutineSuccessEmail(params: {
  to: string;
  routineTitle: string;
  routineId: string;
  runId: string;
  source: string;
  triggeredAt: Date;
  completedAt: Date;
  scriptExitCode: number | null;
  scriptOutput?: string | null;
  db?: Db | null;
  companyId?: string | null;
}): Promise<void> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return;
  const transport = buildTransport(config);
  const from = config.from;
  const triggeredAtIso = params.triggeredAt.toISOString();
  const completedAtIso = params.completedAt.toISOString();
  const duration = formatDurationMs(params.triggeredAt, params.completedAt);

  const bodyParts: string[] = [];

  bodyParts.push(`<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    The routine <strong>${escapeHtml(params.routineTitle)}</strong> completed successfully without errors.
    The details below describe the stored run record.
  </p>`);

  bodyParts.push(alertBox("#075985", "#f0f9ff", "#0ea5e9", "Routine script completed successfully."));

  bodyParts.push(metaTable([
    ["Routine", params.routineTitle],
    ["Routine ID", params.routineId],
    ["Run ID", params.runId],
    ["Source", params.source],
    ["Triggered at", triggeredAtIso],
    ["Completed at", completedAtIso],
    ["Duration", duration],
    ["Exit code", params.scriptExitCode == null ? "—" : String(params.scriptExitCode)],
  ]));

  if (params.scriptOutput) {
    bodyParts.push(codeBlock("Script Output", params.scriptOutput));
  }

  bodyParts.push(`<p style="color:#6b7280;font-size:13px;margin:20px 0 0;">
    This is an automated notification sent because a script or bash routine completed successfully.
  </p>`);

  const html = buildEmailWrapper({
    headerColor: "#0891b2",
    headerIcon: "✅",
    headerTitle: "Routine Completed",
    headerSubtitle: params.routineTitle,
    body: bodyParts.join("\n"),
    signatureHtml: config.signatureHtml,
  });

  const textLines: string[] = [
    `Routine "${params.routineTitle}" completed successfully.`,
    ``,
    `Routine ID: ${params.routineId}`,
    `Run ID: ${params.runId}`,
    `Source: ${params.source}`,
    `Triggered at: ${triggeredAtIso}`,
    `Completed at: ${completedAtIso}`,
    `Duration: ${duration}`,
    `Exit code: ${params.scriptExitCode == null ? "—" : String(params.scriptExitCode)}`,
  ];
  if (params.scriptOutput) {
    textLines.push(``, `--- Script output ---`, params.scriptOutput.slice(0, 3000));
  }

  await transport.sendMail({
    from,
    to: params.to,
    subject: `✅ Routine completed: ${params.routineTitle}`.slice(0, 200),
    text: textLines.join("\n"),
    html,
  });
}

export async function sendRoutineFailureEmail(params: {
  to: string;
  routineTitle: string;
  routineId: string;
  runId: string;
  failureReason: string | null;
  scriptOutput?: string | null;
  db?: Db | null;
  companyId?: string | null;
}): Promise<void> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return;
  const transport = buildTransport(config);
  const from = config.from;
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
    signatureHtml: config.signatureHtml,
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
  db?: Db | null;
  companyId?: string | null;
}): Promise<void> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return;
  const transport = buildTransport(config);
  const from = config.from;
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
    signatureHtml: config.signatureHtml,
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
