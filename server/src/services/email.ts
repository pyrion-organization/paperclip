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
  const status = params.succeeded ? "succeeded" : "failed again";
  const lines: string[] = [
    `Routine "${params.routineTitle}" was automatically re-run after agent remediation.`,
    ``,
    `Result: ${params.succeeded ? "✓ Success" : "✗ Failed again"}`,
    `Routine ID: ${params.routineId}`,
    `Run ID: ${params.runId}`,
    `Time: ${new Date().toISOString()}`,
  ];
  if (!params.succeeded && params.failureReason) {
    lines.push(``, `Failure reason: ${params.failureReason}`);
  }
  if (params.remediationDiff) {
    lines.push(``, `--- Changes made by remediation agent ---`, params.remediationDiff);
  }
  if (params.scriptOutput) {
    lines.push(``, `--- Script output ---`, params.scriptOutput.slice(0, 3000));
  }
  await transport.sendMail({
    from,
    to: params.to,
    subject: `Routine re-run ${status}: ${params.routineTitle}`,
    text: lines.join("\n"),
  });
}

export async function sendRoutineFailureEmail(params: {
  to: string;
  routineTitle: string;
  routineId: string;
  runId: string;
  failureReason: string | null;
}): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  const from = process.env.SMTP_FROM ?? "noreply@paperclip.local";
  await transport.sendMail({
    from,
    to: params.to,
    subject: `Routine failed: ${params.routineTitle}`,
    text: [
      `Routine "${params.routineTitle}" failed.`,
      ``,
      `Failure reason: ${params.failureReason ?? "Unknown"}`,
      `Routine ID: ${params.routineId}`,
      `Run ID: ${params.runId}`,
      `Time: ${new Date().toISOString()}`,
    ].join("\n"),
  });
}
