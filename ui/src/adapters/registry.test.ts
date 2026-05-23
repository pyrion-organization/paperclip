import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { UIAdapterModule } from "./types";
import {
  findUIAdapter,
  getUIAdapter,
  listUIAdapters,
  registerUIAdapter,
  syncExternalAdapters,
  unregisterUIAdapter,
} from "./registry";
import { SchemaConfigFields } from "./schema-config-fields";

const externalUIAdapter: UIAdapterModule = {
  type: "external_test",
  label: "External Test",
  parseStdoutLine: () => [],
  ConfigFields: () => null,
  buildAdapterConfig: () => ({}),
};

describe("ui adapter registry", () => {
  beforeEach(() => {
    syncExternalAdapters([]);
    unregisterUIAdapter("external_test");
  });

  afterEach(() => {
    syncExternalAdapters([]);
    unregisterUIAdapter("external_test");
  });

  it("registers adapters for lookup and listing", () => {
    registerUIAdapter(externalUIAdapter);

    expect(findUIAdapter("external_test")).toBe(externalUIAdapter);
    expect(getUIAdapter("external_test")).toBe(externalUIAdapter);
    expect(listUIAdapters().some((adapter) => adapter.type === "external_test")).toBe(true);
  });

  it("falls back to the process parser for unknown types after unregistering", () => {
    registerUIAdapter(externalUIAdapter);

    unregisterUIAdapter("external_test");

    expect(findUIAdapter("external_test")).toBeNull();
    const fallback = getUIAdapter("external_test");
    // Unknown types return a lazy-loading wrapper (for external adapters),
    // not the process adapter directly. The type is preserved.
    expect(fallback.type).toBe("external_test");
    // But it uses the schema-based config fields for external adapter forms.
    expect(fallback.ConfigFields).toBe(SchemaConfigFields);
  });

  it("does not register disabled external adapters from server sync", () => {
    syncExternalAdapters([
      { type: "external_test", label: "External Test", disabled: true },
    ]);

    expect(findUIAdapter("external_test")).toBeNull();
    expect(listUIAdapters().some((adapter) => adapter.type === "external_test")).toBe(false);
  });

  it("removes non-builtin external adapters missing from a later server sync", () => {
    syncExternalAdapters([{ type: "external_test", label: "External Test" }]);
    expect(findUIAdapter("external_test")).not.toBeNull();

    syncExternalAdapters([]);

    expect(findUIAdapter("external_test")).toBeNull();
    expect(listUIAdapters().some((adapter) => adapter.type === "external_test")).toBe(false);
  });
});
