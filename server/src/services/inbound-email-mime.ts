import { createHash } from "node:crypto";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

export type ParsedInboundEmailAttachment = {
  filename: string | null;
  contentType: string;
  body: Buffer;
  sha256: string;
};

export type ParsedInboundEmail = {
  messageId: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  subject: string | null;
  receivedAt: Date | null;
  bodyText: string | null;
  bodyHtml: string | null;
  rawSha256: string;
  attachments: ParsedInboundEmailAttachment[];
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizeMessageId(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^<+|>+$/g, "") || null;
}

function collectAddresses(field: AddressObject | AddressObject[] | undefined): string[] {
  if (!field) return [];
  const list = Array.isArray(field) ? field : [field];
  const out: string[] = [];
  for (const entry of list) {
    for (const addr of entry.value ?? []) {
      const email = addr.address?.trim().toLowerCase();
      if (email) out.push(email);
    }
  }
  return [...new Set(out)];
}

function firstAddress(field: AddressObject | AddressObject[] | undefined): string | null {
  const all = collectAddresses(field);
  return all[0] ?? null;
}

export async function parseInboundEmail(rawInput: Buffer | string): Promise<ParsedInboundEmail> {
  const raw = Buffer.isBuffer(rawInput) ? rawInput : Buffer.from(rawInput, "utf8");
  const parsed: ParsedMail = await simpleParser(raw, { skipImageLinks: true });

  const attachments: ParsedInboundEmailAttachment[] = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename?.trim() || null,
    contentType: a.contentType || "application/octet-stream",
    body: a.content,
    sha256: sha256(a.content),
  }));

  return {
    messageId: normalizeMessageId(parsed.messageId),
    fromAddress: firstAddress(parsed.from),
    toAddresses: collectAddresses(parsed.to),
    subject: parsed.subject?.trim() || null,
    receivedAt: parsed.date ?? null,
    bodyText: parsed.text?.trim() || null,
    bodyHtml: typeof parsed.html === "string" ? parsed.html : null,
    rawSha256: sha256(raw),
    attachments,
  };
}
