import { describe, expect, it } from "vitest";
import { updateCompanySchema } from "./company.js";

describe("company validators", () => {
  it("rejects malformed email template website URLs without throwing", () => {
    const result = updateCompanySchema.safeParse({
      emailTemplateWebsiteUrl: "http://[::1",
    });

    expect(result.success).toBe(false);
  });

  it("accepts only http and https email template website URLs", () => {
    expect(updateCompanySchema.safeParse({
      emailTemplateWebsiteUrl: "https://ops.example.com",
    }).success).toBe(true);
    expect(updateCompanySchema.safeParse({
      emailTemplateWebsiteUrl: "http://ops.example.com",
    }).success).toBe(true);
    expect(updateCompanySchema.safeParse({
      emailTemplateWebsiteUrl: "ftp://ops.example.com",
    }).success).toBe(false);
  });
});
