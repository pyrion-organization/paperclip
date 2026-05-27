import { describe, expect, it } from "vitest";
import { calendarItemCategorySchema, paymentEntryFilterSchema } from "../index.js";

describe("payment validators", () => {
  it("accepts comma-separated payment entry status filters", () => {
    expect(paymentEntryFilterSchema.parse({ status: "open,partially_paid" }).status)
      .toEqual(["open", "partially_paid"]);
  });

  it("keeps legacy calendar categories valid for existing rows", () => {
    expect(calendarItemCategorySchema.parse("project")).toBe("project");
    expect(calendarItemCategorySchema.parse("account")).toBe("account");
    expect(calendarItemCategorySchema.parse("insurance")).toBe("insurance");
  });
});
