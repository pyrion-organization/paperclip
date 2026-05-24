// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterConfigSchema, ConfigFieldSchema, CreateConfigValues } from "@paperclipai/adapter-utils";
import {
  fieldMatchesVisibleWhen,
  invalidateConfigSchemaCache,
  SchemaConfigFields,
} from "./schema-config-fields";
import type { AdapterConfigFieldsProps } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const sourceField: ConfigFieldSchema = {
  key: "provider",
  label: "Provider",
  type: "select",
  options: [
    { label: "Claude", value: "claude" },
    { label: "Codex", value: "codex" },
  ],
};

const schema: AdapterConfigSchema = {
  fields: [sourceField],
};

function targetWithVisibleWhen(visibleWhen: Record<string, unknown>): ConfigFieldSchema {
  return {
    key: "model",
    label: "Model",
    type: "text",
    meta: { visibleWhen },
  };
}

describe("fieldMatchesVisibleWhen", () => {
  it("treats an empty values array as no match", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: [] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(false);
  });

  it("treats all non-string values as no match", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: [null, 42] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(false);
  });

  it("matches non-empty string values", () => {
    const field = targetWithVisibleWhen({ key: "provider", values: ["claude"] });

    expect(fieldMatchesVisibleWhen(field, () => "claude", schema)).toBe(true);
    expect(fieldMatchesVisibleWhen(field, () => "codex", schema)).toBe(false);
  });
});

function okSchemaResponse(schema: AdapterConfigSchema): Response {
  return {
    ok: true,
    json: async () => schema,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createValues(adapterSchemaValues: Record<string, unknown>): CreateConfigValues {
  return {
    adapterType: "schema_switch",
    cwd: "",
    promptTemplate: "",
    model: "",
    thinkingEffort: "",
    chrome: false,
    dangerouslySkipPermissions: false,
    search: false,
    fastMode: false,
    dangerouslyBypassSandbox: false,
    command: "",
    args: "",
    extraArgs: "",
    envVars: "",
    envBindings: {},
    url: "",
    bootstrapPrompt: "",
    maxTurnsPerRun: 0,
    heartbeatEnabled: false,
    intervalSec: 0,
    adapterSchemaValues,
  };
}

describe("SchemaConfigFields", () => {
  let container: HTMLDivElement;
  let root: Root;

  const baseProps: Omit<AdapterConfigFieldsProps, "adapterType" | "values" | "set"> = {
    mode: "create",
    isCreate: true,
    config: {},
    eff: (_group, _field, original) => original,
    mark: vi.fn(),
    models: [],
  };

  beforeEach(() => {
    invalidateConfigSchemaCache("schema_switch_a");
    invalidateConfigSchemaCache("schema_switch_b");
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("clears stale fields and applies defaults when adapterType changes", async () => {
    const schemaA: AdapterConfigSchema = {
      fields: [
        {
          key: "alphaToken",
          label: "Alpha token",
          type: "text",
          default: "alpha-default",
        },
      ],
    };
    const schemaB: AdapterConfigSchema = {
      fields: [
        {
          key: "betaToken",
          label: "Beta token",
          type: "text",
          default: "beta-default",
        },
      ],
    };
    const pendingSchemaB = deferred<Response>();
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("schema_switch_a")) {
        return Promise.resolve(okSchemaResponse(schemaA));
      }
      if (url.includes("schema_switch_b")) {
        return pendingSchemaB.promise;
      }
      return Promise.resolve({ ok: false } as Response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const set = vi.fn();
    await act(async () => {
      root.render(
        createElement(SchemaConfigFields, {
          ...baseProps,
          adapterType: "schema_switch_a",
          values: createValues({}),
          set,
        }),
      );
    });

    expect(container.textContent).toContain("Alpha token");
    expect(set).toHaveBeenCalledWith({
      adapterSchemaValues: { alphaToken: "alpha-default" },
    });

    set.mockClear();
    await act(async () => {
      root.render(
        createElement(SchemaConfigFields, {
          ...baseProps,
          adapterType: "schema_switch_b",
          values: createValues({ alphaToken: "alpha-default" }),
          set,
        }),
      );
    });

    expect(container.textContent).not.toContain("Alpha token");
    expect(container.textContent).not.toContain("Beta token");
    expect(set).not.toHaveBeenCalled();

    await act(async () => {
      pendingSchemaB.resolve(okSchemaResponse(schemaB));
      await pendingSchemaB.promise;
    });

    expect(container.textContent).toContain("Beta token");
    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      adapterSchemaValues: { betaToken: "beta-default" },
    });
  });
});
