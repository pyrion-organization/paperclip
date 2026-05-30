import { describe, expect, it } from "vitest";
import { resolveLegacyInstanceSettingsTarget } from "./legacy-settings-route";

describe("resolveLegacyInstanceSettingsTarget", () => {
  it("preserves recognized legacy settings subpaths", () => {
    expect(resolveLegacyInstanceSettingsTarget("/settings/adapters")).toBe("adapters");
    expect(resolveLegacyInstanceSettingsTarget("/PER/settings/access")).toBe("access");
  });

  it("falls back to general settings for unknown or root settings paths", () => {
    expect(resolveLegacyInstanceSettingsTarget("/settings")).toBe("general");
    expect(resolveLegacyInstanceSettingsTarget("/settings/unknown")).toBe("general");
  });
});
