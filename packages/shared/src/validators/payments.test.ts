import { describe, expect, it } from "vitest";
import {
  calendarItemCategorySchema,
  createPaymentEntrySchema,
  paymentEntryFilterSchema,
  recordPaymentSchema,
  updatePaymentRecordSchema,
} from "../index.js";

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

  it("does not default omitted payment record currency before entry lookup", () => {
    expect(recordPaymentSchema.parse({ amountCents: 1000 }).currency).toBeUndefined();
    expect(recordPaymentSchema.parse({ amountCents: 1000, currency: "usd" }).currency).toBe("USD");
  });

  it("rejects malformed payment currency codes", () => {
    expect(() => createPaymentEntrySchema.parse({ title: "Invoice", currency: "123" })).toThrow();
    expect(() => recordPaymentSchema.parse({ amountCents: 1000, currency: "12$" })).toThrow();
  });

  it("preserves omitted payment record notes on partial updates", () => {
    const amountOnly = updatePaymentRecordSchema.parse({ amountCents: 1000 });
    expect(Object.prototype.hasOwnProperty.call(amountOnly, "notes")).toBe(false);

    expect((updatePaymentRecordSchema.parse({ notes: "" }) as { notes?: string | null }).notes).toBeNull();
    expect((updatePaymentRecordSchema.parse({ notes: null }) as { notes?: string | null }).notes).toBeNull();
    expect((updatePaymentRecordSchema.parse({ notes: "  Receipt uploaded  " }) as { notes?: string | null }).notes)
      .toBe("Receipt uploaded");
  });
});
