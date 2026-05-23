import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
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

function sanitizeSignatureHtml(html: string): string {
  const dom = new JSDOM("");
  const purify = createDOMPurify(dom.window as unknown as Parameters<typeof createDOMPurify>[0]);
  return purify.sanitize(html, { FORCE_BODY: true });
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
            ${params.signatureHtml ? sanitizeSignatureHtml(params.signatureHtml) : ""}
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

export type CalendarReminderEmailParams = {
  to: string;
  title: string;
  category: string;
  riskLevel: string;
  dueDate: string | null;
  providerName?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  purchaseEmail?: string | null;
  accountLoginEmail?: string | null;
  billingEmail?: string | null;
  loginUrl?: string | null;
  billingUrl?: string | null;
  documentationUrl?: string | null;
  notes?: string | null;
  daysUntilDue: number;
  db?: Db | null;
  companyId?: string | null;
};

export type CalendarReminderEmailSendResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "smtp_not_configured" };

export async function sendCalendarReminderEmailWithResult(
  params: CalendarReminderEmailParams,
): Promise<CalendarReminderEmailSendResult> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return { status: "skipped", reason: "smtp_not_configured" };
  const transport = buildTransport(config);
  const dueLabel = params.dueDate ?? "not set";
  const amount = params.amountCents == null
    ? null
    : `${params.currency ?? "USD"} ${(params.amountCents / 100).toFixed(2)}`;
  const isOverdue = params.daysUntilDue < 0;
  const subject = isOverdue
    ? `[Calendar Paperclip] OVERDUE: ${params.title}`
    : `[Calendar Paperclip] Upcoming deadline: ${params.title} - due ${dueLabel}`;

  const body = `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(isOverdue
      ? `This calendar item is overdue by ${Math.abs(params.daysUntilDue)} day${Math.abs(params.daysUntilDue) === 1 ? "" : "s"}.`
      : `This calendar item is due in ${params.daysUntilDue} day${params.daysUntilDue === 1 ? "" : "s"}.`)}
  </p>
  ${metaTable([
    ["Item", params.title],
    ["Category", params.category],
    ["Risk", params.riskLevel],
    ["Due date", dueLabel],
    ["Provider", params.providerName ?? "Not set"],
    ...(amount ? [["Amount", amount] as [string, string]] : []),
    ["Purchase email", params.purchaseEmail ?? "Not set"],
    ["Login email", params.accountLoginEmail ?? "Not set"],
    ["Billing email", params.billingEmail ?? "Not set"],
    ["Login URL", params.loginUrl ?? "Not set"],
    ["Billing URL", params.billingUrl ?? "Not set"],
    ["Documentation URL", params.documentationUrl ?? "Not set"],
  ])}
  ${params.notes ? quoteBlock("Notes", params.notes, isOverdue ? "#dc2626" : "#2563eb", 2000) : ""}
  ${alertBox(
    isOverdue ? "#991b1b" : "#1d4ed8",
    isOverdue ? "#fef2f2" : "#eff6ff",
    isOverdue ? "#dc2626" : "#2563eb",
    isOverdue ? "Action required now: resolve the overdue obligation and update the calendar item." : "Action required: confirm ownership, payment, proof, and next due date.",
  )}`;

  const html = buildEmailWrapper({
    headerColor: isOverdue ? "#dc2626" : "#2563eb",
    headerIcon: isOverdue ? "!" : "C",
    headerTitle: isOverdue ? "Calendar Item Overdue" : "Calendar Reminder",
    headerSubtitle: `${params.title} - ${dueLabel}`,
    body,
    signatureHtml: config.signatureHtml,
  });

  const text = [
    `Item: ${params.title}`,
    `Category: ${params.category}`,
    `Risk: ${params.riskLevel}`,
    `Due date: ${dueLabel}`,
    `Provider: ${params.providerName ?? "Not set"}`,
    amount ? `Amount: ${amount}` : null,
    "",
    "Account / email information:",
    `- Purchase email: ${params.purchaseEmail ?? "Not set"}`,
    `- Login email: ${params.accountLoginEmail ?? "Not set"}`,
    `- Billing email: ${params.billingEmail ?? "Not set"}`,
    "",
    "Useful links:",
    `- Login: ${params.loginUrl ?? "Not set"}`,
    `- Billing: ${params.billingUrl ?? "Not set"}`,
    `- Documentation: ${params.documentationUrl ?? "Not set"}`,
    params.notes ? `\nNotes:\n${params.notes}` : null,
  ].filter(Boolean).join("\n");

  await transport.sendMail({
    from: config.from,
    to: params.to,
    subject,
    text,
    html,
  });
  return { status: "sent" };
}

export type InboundEmailAuthorizationReplyReason =
  | "employee_not_registered"
  | "project_not_authorized"
  | "project_not_identified"
  | "project_match_ambiguous";

export type InboundEmailAuthorizationReplyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "smtp_not_configured" | "send_failed" };

export type InboundEmailSupportReplyReason =
  | "code_bug_received"
  | "infra_incident_received"
  | "feature_request_received"
  | "how_to_question_received"
  | "account_access_received"
  | "unclear_request_more_info";

export type InboundEmailSupportReplyResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "smtp_not_configured" }
  | { status: "failed"; reason: "send_failed"; error: string };

export async function sendInboundEmailSupportReply(params: {
  to: string;
  reason: InboundEmailSupportReplyReason;
  originalSubject?: string | null;
  issueIdentifier?: string | null;
  issueId?: string | null;
  db?: Db | null;
  companyId?: string | null;
}): Promise<InboundEmailSupportReplyResult> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return { status: "skipped", reason: "smtp_not_configured" };
  const transport = buildTransport(config);

  const originalSubject = nonEmpty(params.originalSubject);
  const subject = originalSubject
    ? `Re: ${originalSubject}`.slice(0, 200)
    : params.reason === "unclear_request_more_info"
      ? "Mais informações necessárias"
      : "Solicitação recebida";
  const issueLabel = nonEmpty(params.issueIdentifier) ?? nonEmpty(params.issueId)?.slice(0, 8) ?? null;
  const issueSentence = issueLabel
    ? `Abrimos a solicitação ${issueLabel} para acompanhamento.`
    : "Registramos sua mensagem para acompanhamento.";

  const bodyMessageByReason: Record<InboundEmailSupportReplyReason, string> = {
    code_bug_received: "Recebemos seu relato de erro no sistema.",
    infra_incident_received: "Recebemos seu relato de problema de infraestrutura, disponibilidade ou acesso ao serviço.",
    feature_request_received: "Recebemos sua sugestão de melhoria ou mudança no produto.",
    how_to_question_received: "Recebemos sua dúvida de uso ou solicitação de orientação.",
    account_access_received: "Recebemos sua solicitação relacionada a conta, login ou permissões.",
    unclear_request_more_info: "Recebemos sua mensagem, mas precisamos de mais informações para encaminhar corretamente.",
  };
  const actionMessageByReason: Record<InboundEmailSupportReplyReason, string> = {
    code_bug_received: `${issueSentence} A equipe vai analisar o comportamento reportado.`,
    infra_incident_received: `${issueSentence} O caso foi registrado para triagem operacional.`,
    feature_request_received: `${issueSentence} A mudança será avaliada como solicitação de produto.`,
    how_to_question_received: `${issueSentence} A equipe de suporte vai responder com orientação.`,
    account_access_received: `${issueSentence} A equipe vai revisar o pedido de acesso.`,
    unclear_request_more_info: "Responda a este e-mail informando o nome do projeto, URL ou tela afetada, passos para reproduzir, resultado esperado e resultado atual. Screenshots ou logs também ajudam.",
  };
  const bodyMessage = bodyMessageByReason[params.reason];
  const actionMessage = actionMessageByReason[params.reason];
  const body = `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(bodyMessage)}
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(actionMessage)}
  </p>`;

  const needsMoreInfo = params.reason === "unclear_request_more_info";
  const html = buildEmailWrapper({
    headerColor: needsMoreInfo ? "#b45309" : "#047857",
    headerIcon: needsMoreInfo ? "!" : "✓",
    headerTitle: needsMoreInfo ? "Mais informações necessárias" : "Solicitação recebida",
    headerSubtitle: needsMoreInfo ? "Aguardando detalhes" : "Registro automático de suporte",
    body,
    signatureHtml: config.signatureHtml,
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: params.to,
      subject,
      text: [
        bodyMessage,
        "",
        actionMessage,
      ].join("\n"),
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, to: params.to, reason: params.reason }, "inbound support reply send failed");
    return { status: "failed", reason: "send_failed", error: message };
  }
  return { status: "sent" };
}

export async function sendInboundEmailAuthorizationReply(params: {
  to: string;
  reason: InboundEmailAuthorizationReplyReason;
  originalSubject?: string | null;
  clientName?: string | null;
  db?: Db | null;
  companyId?: string | null;
}): Promise<InboundEmailAuthorizationReplyResult> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return { status: "skipped", reason: "smtp_not_configured" };
  const transport = buildTransport(config);

  const originalSubject = nonEmpty(params.originalSubject);
  const subject = originalSubject
    ? `Re: ${originalSubject}`.slice(0, 200)
    : params.reason === "project_not_identified" || params.reason === "project_match_ambiguous"
      ? "Projeto necessário para envio de solicitações"
      : "Cadastro necessário para envio de solicitações";
  const clientLabel = nonEmpty(params.clientName) ?? "sua empresa";
  const bodyMessageByReason: Record<InboundEmailAuthorizationReplyReason, string> = {
    employee_not_registered: `Recebemos sua mensagem, mas o endereço ${params.to} não está cadastrado como funcionário autorizado de ${clientLabel}. Por isso, sua solicitação não pôde ser processada.`,
    project_not_authorized: `Recebemos sua mensagem, mas o endereço ${params.to} não tem autorização para abrir solicitações para este projeto. Por isso, sua solicitação não pôde ser processada.`,
    project_not_identified: "Recebemos sua mensagem, mas não conseguimos identificar com segurança a qual projeto ela se refere. Por isso, sua solicitação ainda não pôde ser processada.",
    project_match_ambiguous: "Recebemos sua mensagem, mas ela parece mencionar mais de um projeto possível. Por isso, sua solicitação ainda não pôde ser processada.",
  };
  const actionMessageByReason: Record<InboundEmailAuthorizationReplyReason, string> = {
    employee_not_registered: "Peça para um usuário já cadastrado enviar uma solicitação pedindo o seu cadastro. Depois que o cadastro for concluído, você poderá enviar novas solicitações por e-mail.",
    project_not_authorized: "Peça para um usuário autorizado solicitar a atualização do seu cadastro ou enviar a solicitação em seu nome.",
    project_not_identified: "Responda a este e-mail informando o nome do projeto ou um apelido conhecido do projeto para que possamos abrir a solicitação corretamente.",
    project_match_ambiguous: "Responda a este e-mail esclarecendo qual é o projeto correto para que possamos abrir a solicitação corretamente.",
  };
  const bodyMessage = bodyMessageByReason[params.reason];
  const actionMessage = actionMessageByReason[params.reason];

  const body = `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(bodyMessage)}
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(actionMessage)}
  </p>`;

  const html = buildEmailWrapper({
    headerColor: "#b45309",
    headerIcon: "⚠️",
    headerTitle: params.reason === "project_not_identified" || params.reason === "project_match_ambiguous"
      ? "Projeto necessário"
      : "Cadastro necessário",
    headerSubtitle: "Solicitação não processada",
    body,
    signatureHtml: config.signatureHtml,
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: params.to,
      subject,
      text: [
        bodyMessage,
        "",
        actionMessage,
      ].join("\n"),
      html,
    });
  } catch (err) {
    logger.warn({ err, to: params.to, reason: params.reason }, "inbound auth reply send failed");
    return { status: "skipped", reason: "send_failed" };
  }
  return { status: "sent" };
}

export type InboundEmailRegistrationReplyReason =
  | "missing_info"
  | "invalid_email"
  | "invalid_domain"
  | "created"
  | "updated"
  | "already_registered";

export type InboundEmailRegistrationReplyResult = InboundEmailAuthorizationReplyResult;

export async function sendInboundEmailRegistrationReply(params: {
  to: string;
  reason: InboundEmailRegistrationReplyReason;
  originalSubject?: string | null;
  missingFields?: string[];
  requestedName?: string | null;
  requestedEmail?: string | null;
  clientName?: string | null;
  db?: Db | null;
  companyId?: string | null;
}): Promise<InboundEmailRegistrationReplyResult> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return { status: "skipped", reason: "smtp_not_configured" };
  const transport = buildTransport(config);

  const originalSubject = nonEmpty(params.originalSubject);
  const subject = originalSubject
    ? `Re: ${originalSubject}`.slice(0, 200)
    : "Cadastro de usuário";
  const clientLabel = nonEmpty(params.clientName) ?? "sua empresa";
  const requestedEmail = nonEmpty(params.requestedEmail) ?? "não informado";
  const requestedName = nonEmpty(params.requestedName) ?? "não informado";
  const missingFields = (params.missingFields ?? []).filter(Boolean);
  const missingLabel = missingFields.length > 0 ? missingFields.join(" e ") : "informações obrigatórias";
  const template = [
    "Cadastro de usuário",
    "Nome: Maria Silva",
    "Email: maria@empresa.com",
  ].join("\n");

  const bodyMessageByReason: Record<InboundEmailRegistrationReplyReason, string> = {
    missing_info: `Recebemos sua solicitação de cadastro, mas faltou informar ${missingLabel}.`,
    invalid_email: `Recebemos sua solicitação de cadastro, mas o e-mail informado (${requestedEmail}) não é válido.`,
    invalid_domain: `Recebemos sua solicitação de cadastro, mas o domínio do e-mail informado (${requestedEmail}) não está autorizado para ${clientLabel}.`,
    created: `O usuário ${requestedName} (${requestedEmail}) foi cadastrado com sucesso.`,
    updated: `O cadastro de ${requestedEmail} foi atualizado com as suas permissões atuais.`,
    already_registered: `O usuário ${requestedEmail} já está cadastrado com as mesmas permissões.`,
  };
  const actionMessageByReason: Record<InboundEmailRegistrationReplyReason, string> = {
    missing_info: "Envie uma nova solicitação usando o modelo abaixo.",
    invalid_email: "Confira o endereço de e-mail e envie uma nova solicitação usando o modelo abaixo.",
    invalid_domain: "Use um e-mail de um domínio aceito para este cliente e envie uma nova solicitação.",
    created: "Nenhuma ação adicional é necessária.",
    updated: "Nenhuma ação adicional é necessária.",
    already_registered: "Nenhuma ação adicional é necessária.",
  };
  const bodyMessage = bodyMessageByReason[params.reason];
  const actionMessage = actionMessageByReason[params.reason];
  const includeTemplate = params.reason === "missing_info" || params.reason === "invalid_email" || params.reason === "invalid_domain";
  const templateHtml = includeTemplate
    ? `<pre style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-size:13px;line-height:1.5;margin:0 0 16px;padding:12px;white-space:pre-wrap;">${escapeHtml(template)}</pre>`
    : "";

  const body = `<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(bodyMessage)}
  </p>
  <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    ${escapeHtml(actionMessage)}
  </p>
  ${templateHtml}`;

  const html = buildEmailWrapper({
    headerColor: params.reason === "created" || params.reason === "updated" || params.reason === "already_registered"
      ? "#047857"
      : "#b45309",
    headerIcon: params.reason === "created" || params.reason === "updated" || params.reason === "already_registered"
      ? "✓"
      : "⚠️",
    headerTitle: params.reason === "created" || params.reason === "updated" || params.reason === "already_registered"
      ? "Cadastro processado"
      : "Cadastro incompleto",
    headerSubtitle: "Solicitação de cadastro por e-mail",
    body,
    signatureHtml: config.signatureHtml,
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: params.to,
      subject,
      text: [
        bodyMessage,
        "",
        actionMessage,
        ...(includeTemplate ? ["", template] : []),
      ].join("\n"),
      html,
    });
  } catch (err) {
    logger.warn({ err, to: params.to, reason: params.reason }, "inbound registration reply send failed");
    return { status: "skipped", reason: "send_failed" };
  }
  return { status: "sent" };
}

export type ProjectDeployMaintenanceEmailResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "smtp_not_configured" }
  | { status: "failed"; reason: "send_failed"; error: string };

export async function sendProjectDeployMaintenanceEmailWithResult(params: {
  to: string[];
  projectName: string;
  targetName: string;
  targetEnvironment: string;
  deployStatus: string;
  message: string;
  issueIdentifier?: string | null;
  issueTitle?: string | null;
  approvalId?: string | null;
  deployEventId?: string | null;
  db?: Db | null;
  companyId?: string | null;
}): Promise<ProjectDeployMaintenanceEmailResult> {
  const config = await loadSmtpConfig(params.db ?? null, params.companyId);
  if (!config) return { status: "skipped", reason: "smtp_not_configured" };
  const transport = buildTransport(config);
  const from = config.from;
  const recipients = params.to.map((value) => value.trim()).filter(Boolean);
  const now = new Date().toISOString();
  const statusLabel = params.deployStatus.replace(/_/g, " ");
  const issueLabel = nonEmpty(params.issueIdentifier) ?? nonEmpty(params.issueTitle) ?? null;

  const bodyParts: string[] = [];
  bodyParts.push(`<p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;">
    Atualização de manutenção para <strong>${escapeHtml(params.projectName)}</strong>.
  </p>`);
  bodyParts.push(quoteBlock("Mensagem", params.message, "#0ea5e9", null));
  bodyParts.push(metaTable([
    ["Projeto", params.projectName],
    ["Alvo", params.targetName],
    ["Ambiente", params.targetEnvironment],
    ["Status", statusLabel],
    ["Issue", issueLabel ?? "—"],
    ["Approval", params.approvalId ?? "—"],
    ["Deploy event", params.deployEventId ?? "—"],
    ["Time", now],
  ]));
  bodyParts.push(`<p style="color:#6b7280;font-size:13px;margin:20px 0 0;">
    Esta mensagem foi enviada por um fluxo aprovado de atualização de deploy no Paperclip.
  </p>`);

  const html = buildEmailWrapper({
    headerColor: params.deployStatus === "failed" ? "#dc2626" : "#2563eb",
    headerIcon: params.deployStatus === "failed" ? "!" : "i",
    headerTitle: "Atualização de manutenção",
    headerSubtitle: `${params.projectName} · ${statusLabel}`,
    body: bodyParts.join("\n"),
    signatureHtml: config.signatureHtml,
  });

  const text = [
    `Atualização de manutenção para ${params.projectName}.`,
    ``,
    params.message,
    ``,
    `Projeto: ${params.projectName}`,
    `Alvo: ${params.targetName}`,
    `Ambiente: ${params.targetEnvironment}`,
    `Status: ${statusLabel}`,
    `Issue: ${issueLabel ?? "—"}`,
    `Approval: ${params.approvalId ?? "—"}`,
    `Deploy event: ${params.deployEventId ?? "—"}`,
    `Time: ${now}`,
  ].join("\n");

  try {
    await transport.sendMail({
      from,
      to: recipients,
      subject: `Atualização de manutenção: ${params.projectName}`.slice(0, 200),
      text,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, to: recipients, deployEventId: params.deployEventId }, "deploy maintenance email send failed");
    return { status: "failed", reason: "send_failed", error: message };
  }

  return { status: "sent" };
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
