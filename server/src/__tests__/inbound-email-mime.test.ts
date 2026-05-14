import { describe, expect, it } from "vitest";
import { parseInboundEmail } from "../services/inbound-email-mime.js";

describe("parseInboundEmail", () => {
  it("decodes a plain UTF-8 message with subject and Message-ID", async () => {
    const raw = [
      "Message-ID: <abc@example.com>",
      "From: Customer <customer@example.com>",
      "To: intake@example.com, support@example.com",
      "Subject: Hello",
      "Date: Tue, 12 May 2026 10:00:00 +0000",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hi there",
    ].join("\r\n");
    const parsed = await parseInboundEmail(raw);
    expect(parsed.messageId).toBe("abc@example.com");
    expect(parsed.subject).toBe("Hello");
    expect(parsed.fromAddress).toBe("customer@example.com");
    expect(parsed.toAddresses.sort()).toEqual(["intake@example.com", "support@example.com"]);
    expect(parsed.bodyText).toBe("Hi there");
    expect(parsed.attachments).toEqual([]);
    expect(parsed.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("decodes a Latin-1 body via mailparser", async () => {
    const subjectMime = "=?ISO-8859-1?Q?Caf=E9?=";
    const body = Buffer.from("Caf\xe9 au lait", "latin1");
    const raw = Buffer.concat([
      Buffer.from(
        [
          "From: customer@example.com",
          "To: intake@example.com",
          `Subject: ${subjectMime}`,
          "Content-Type: text/plain; charset=ISO-8859-1",
          "",
          "",
        ].join("\r\n"),
        "utf8",
      ),
      body,
    ]);
    const parsed = await parseInboundEmail(raw);
    expect(parsed.subject).toBe("Café");
    expect(parsed.bodyText).toBe("Café au lait");
  });

  it("extracts multipart bodies and attachments", async () => {
    const raw = [
      "From: customer@example.com",
      "To: intake@example.com",
      "Subject: With attachment",
      'Content-Type: multipart/mixed; boundary="boundary-x"',
      "",
      "--boundary-x",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Body text here.",
      "--boundary-x",
      'Content-Type: application/octet-stream; name="hello.bin"',
      'Content-Disposition: attachment; filename="hello.bin"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("hello").toString("base64"),
      "--boundary-x--",
      "",
    ].join("\r\n");
    const parsed = await parseInboundEmail(raw);
    expect(parsed.bodyText).toBe("Body text here.");
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe("hello.bin");
    expect(parsed.attachments[0].body.toString("utf8")).toBe("hello");
    expect(parsed.attachments[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
