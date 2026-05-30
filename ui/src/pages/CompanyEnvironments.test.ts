import { describe, expect, it } from "vitest";
import { parseSshPort } from "./CompanyEnvironments";

describe("CompanyEnvironments", () => {
  it("validates SSH ports before environment save", () => {
    expect(parseSshPort("")).toBe(22);
    expect(parseSshPort("22")).toBe(22);
    expect(parseSshPort("65535")).toBe(65535);
    expect(parseSshPort("0")).toBeNull();
    expect(parseSshPort("65536")).toBeNull();
    expect(parseSshPort("22abc")).toBeNull();
  });
});
