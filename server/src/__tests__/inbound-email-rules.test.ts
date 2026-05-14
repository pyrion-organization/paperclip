import { describe, expect, it } from "vitest";
import { matchesPattern } from "../services/inbound-email.js";

describe("matchesPattern", () => {
  it("returns true when pattern is empty or whitespace", () => {
    expect(matchesPattern("anything", null)).toBe(true);
    expect(matchesPattern("anything", undefined)).toBe(true);
    expect(matchesPattern("anything", "   ")).toBe(true);
  });

  it("is case-insensitive substring match", () => {
    expect(matchesPattern("alerts@example.com", "EXAMPLE")).toBe(true);
    expect(matchesPattern("ALERTS@Example.COM", "alerts@")).toBe(true);
  });

  it("returns false when value is null and pattern is non-empty", () => {
    expect(matchesPattern(null, "x")).toBe(false);
  });

  it("returns false when no overlap", () => {
    expect(matchesPattern("alerts@example.com", "missing")).toBe(false);
  });
});
