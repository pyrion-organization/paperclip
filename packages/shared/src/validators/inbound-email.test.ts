import { describe, expect, it } from "vitest";
import {
  inboundEmailExternalIntakeMetadataSchema,
  inboundEmailExternalIntakeSourceLocationSchema,
} from "./inbound-email.js";

describe("inbound email validators", () => {
  it("rejects credential-like metadata values as well as keys", () => {
    expect(inboundEmailExternalIntakeMetadataSchema.safeParse({
      source: {
        url: "https://example.com/event?token=secret-value",
      },
    }).success).toBe(false);

    expect(inboundEmailExternalIntakeMetadataSchema.safeParse({
      auth: "Bearer secret-value",
    }).success).toBe(false);
  });

  it("allows ordinary external metadata values", () => {
    expect(inboundEmailExternalIntakeMetadataSchema.safeParse({
      source: {
        id: "queue-message-1",
        provider: "ses",
      },
    }).success).toBe(true);
  });

  it("rejects encoded signed URLs nested in source locations", () => {
    expect(inboundEmailExternalIntakeSourceLocationSchema.safeParse(
      "https://example.test/object?download=https%3A%2F%2Fs3.test%2Ffile%3FX-Amz-Signature%3Dabc",
    ).success).toBe(false);
  });
});
