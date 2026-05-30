import { describe, expect, it } from "vitest";
import { normalizeStorageObjectKey } from "../storage/object-key.js";

describe("storage object keys", () => {
  it("normalizes safe keys and rejects traversal for every provider", () => {
    expect(normalizeStorageObjectKey("company-1//issues\\demo.txt")).toBe("company-1/issues/demo.txt");
    expect(() => normalizeStorageObjectKey("/company-1/demo.txt")).toThrow("Invalid object key");
    expect(() => normalizeStorageObjectKey("company-1/../demo.txt")).toThrow("Invalid object key");
    expect(() => normalizeStorageObjectKey("   ")).toThrow("Invalid object key");
  });
});
