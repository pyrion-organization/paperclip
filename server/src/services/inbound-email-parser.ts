import { createHash } from "node:crypto";

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

type ParsedPart = {
  headers: Map<string, string>;
  body: Buffer;
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function splitHeaderBody(raw: Buffer): { header: string; body: Buffer } {
  const text = raw.toString("binary");
  const marker = text.indexOf("\r\n\r\n");
  const fallback = text.indexOf("\n\n");
  const idx = marker >= 0 ? marker : fallback;
  if (idx < 0) return { header: raw.toString("utf8"), body: Buffer.alloc(0) };
  const separatorLength = marker >= 0 ? 4 : 2;
  return {
    header: raw.subarray(0, idx).toString("utf8"),
    body: raw.subarray(idx + separatorLength),
  };
}

function parseHeaders(headerBlock: string): Map<string, string> {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headers = new Map<string, string>();
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers.set(key, value);
  }
  return headers;
}

function getHeader(headers: Map<string, string>, key: string): string | null {
  const value = headers.get(key.toLowerCase());
  return value?.trim() || null;
}

function parseHeaderParams(value: string | null): { value: string; params: Record<string, string> } {
  if (!value) return { value: "", params: {} };
  const parts = value.split(";").map((part) => part.trim()).filter(Boolean);
  const base = parts.shift()?.toLowerCase() ?? "";
  const params: Record<string, string> = {};
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase();
    let paramValue = part.slice(idx + 1).trim();
    if (
      (paramValue.startsWith("\"") && paramValue.endsWith("\"")) ||
      (paramValue.startsWith("'") && paramValue.endsWith("'"))
    ) {
      paramValue = paramValue.slice(1, -1);
    }
    params[key] = decodeMimeWords(paramValue) ?? paramValue;
  }
  return { value: base, params };
}

function decodeMimeWords(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_match, charsetRaw, encodingRaw, encoded) => {
    const charset = String(charsetRaw).toLowerCase();
    const encoding = String(encodingRaw).toUpperCase();
    try {
      const buffer = encoding === "B"
        ? Buffer.from(String(encoded), "base64")
        : Buffer.from(String(encoded).replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
      if (charset === "utf-8" || charset === "utf8" || charset === "us-ascii") {
        return buffer.toString("utf8");
      }
      return buffer.toString("latin1");
    } catch {
      return String(encoded);
    }
  });
}

function extractAddresses(value: string | null): string[] {
  if (!value) return [];
  const matches = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return matches ? [...new Set(matches.map((entry) => entry.toLowerCase()))] : [];
}

function decodeTransferBody(body: Buffer, encoding: string | null): Buffer {
  const normalized = encoding?.toLowerCase() ?? "";
  if (normalized === "base64") {
    return Buffer.from(body.toString("ascii").replace(/\s+/g, ""), "base64");
  }
  if (normalized === "quoted-printable") {
    const text = body.toString("binary").replace(/=\r?\n/g, "");
    return Buffer.from(text.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16))), "binary");
  }
  return body;
}

function parseMultipart(body: Buffer, boundary: string): ParsedPart[] {
  const marker = `--${boundary}`;
  const text = body.toString("binary");
  const parts: ParsedPart[] = [];
  for (const section of text.split(marker).slice(1)) {
    if (section.startsWith("--")) break;
    const cleaned = section.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (!cleaned.trim()) continue;
    const partBuffer = Buffer.from(cleaned, "binary");
    const { header, body: partBody } = splitHeaderBody(partBuffer);
    parts.push({ headers: parseHeaders(header), body: partBody });
  }
  return parts;
}

function collectParts(headers: Map<string, string>, body: Buffer): ParsedPart[] {
  const contentType = parseHeaderParams(getHeader(headers, "content-type"));
  const boundary = contentType.params.boundary;
  if (contentType.value.startsWith("multipart/") && boundary) {
    return parseMultipart(body, boundary).flatMap((part) => collectParts(part.headers, part.body));
  }
  return [{ headers, body }];
}

function bodyTextFromPart(part: ParsedPart): string {
  const decoded = decodeTransferBody(part.body, getHeader(part.headers, "content-transfer-encoding"));
  return decoded.toString("utf8").trim();
}

export function parseInboundEmail(rawInput: Buffer | string): ParsedInboundEmail {
  const raw = Buffer.isBuffer(rawInput) ? rawInput : Buffer.from(rawInput, "utf8");
  const { header, body } = splitHeaderBody(raw);
  const headers = parseHeaders(header);
  const topLevelParts = collectParts(headers, body);
  const attachments: ParsedInboundEmailAttachment[] = [];
  let bodyText: string | null = null;
  let bodyHtml: string | null = null;

  for (const part of topLevelParts) {
    const contentType = parseHeaderParams(getHeader(part.headers, "content-type"));
    const disposition = parseHeaderParams(getHeader(part.headers, "content-disposition"));
    const filename = disposition.params.filename ?? contentType.params.name ?? null;
    const isAttachment = disposition.value === "attachment" || Boolean(filename);
    if (isAttachment) {
      const decoded = decodeTransferBody(part.body, getHeader(part.headers, "content-transfer-encoding"));
      attachments.push({
        filename,
        contentType: contentType.value || "application/octet-stream",
        body: decoded,
        sha256: sha256(decoded),
      });
      continue;
    }
    if (contentType.value === "text/html" && !bodyHtml) {
      bodyHtml = bodyTextFromPart(part);
    } else if ((contentType.value === "text/plain" || !contentType.value) && !bodyText) {
      bodyText = bodyTextFromPart(part);
    }
  }

  const dateHeader = getHeader(headers, "date");
  const parsedDate = dateHeader ? new Date(dateHeader) : null;

  return {
    messageId: getHeader(headers, "message-id"),
    fromAddress: extractAddresses(getHeader(headers, "from"))[0] ?? null,
    toAddresses: extractAddresses(getHeader(headers, "to")),
    subject: decodeMimeWords(getHeader(headers, "subject")),
    receivedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
    bodyText,
    bodyHtml,
    rawSha256: sha256(raw),
    attachments,
  };
}
