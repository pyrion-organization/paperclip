import { describe, expect, it } from "vitest";
import { nextCronTickFromExpression, parseCron, validateCron } from "../services/cron.js";

describe("cron service", () => {
  it("rejects numeric tokens with trailing characters", () => {
    expect(validateCron("0abc * * * *")).toMatch(/Invalid value/);
    expect(validateCron("*/5junk * * * *")).toMatch(/Invalid step/);
    expect(validateCron("1-5x * * * *")).toMatch(/Invalid range end/);
    expect(validateCron("1x-5 * * * *")).toMatch(/Invalid range start/);
    expect(validateCron("1-5/2x * * * *")).toMatch(/Invalid step/);
  });

  it("still accepts normal values, ranges, and steps", () => {
    expect(validateCron("0 */6 1-5 * 1,3,5")).toBeNull();
    expect(parseCron("0 */6 1-5 * 1,3,5")).toMatchObject({
      minutes: [0],
      hours: [0, 6, 12, 18],
      daysOfMonth: [1, 2, 3, 4, 5],
      daysOfWeek: [1, 3, 5],
    });
  });

  it("uses standard OR semantics when both day fields are restricted", () => {
    expect(nextCronTickFromExpression("0 9 15 * 1", new Date("2026-06-01T09:00:00.000Z"))?.toISOString()).toBe(
      "2026-06-08T09:00:00.000Z",
    );
  });
});
