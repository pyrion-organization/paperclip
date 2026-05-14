import { describe, expect, it } from "vitest";
import { updateCompanySchema } from "./company.js";

describe("company validators", () => {
  it("accepts email signature HTML and rejects oversized signatures", () => {
    expect(updateCompanySchema.safeParse({
      emailSignatureHtml: "<table><tr><td>Acme</td></tr></table>",
    }).success).toBe(true);
    expect(updateCompanySchema.safeParse({
      emailSignatureHtml: "x".repeat(20_001),
    }).success).toBe(false);
  });
});
