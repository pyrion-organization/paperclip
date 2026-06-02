// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvVarEditor } from "./EnvVarEditor";
import type { CompanySecret, EnvBinding } from "@paperclipai/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function renderEditor(input: {
  value?: Record<string, EnvBinding>;
  secrets?: CompanySecret[];
  onCreateSecret?: (name: string, value: string) => Promise<CompanySecret>;
  onChange?: (env: Record<string, EnvBinding> | undefined) => void;
}) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const onChange = input.onChange ?? vi.fn();
  const onCreateSecret = input.onCreateSecret ?? vi.fn();
  act(() => {
    root?.render(
      <EnvVarEditor
        value={input.value ?? {}}
        secrets={input.secrets ?? []}
        onCreateSecret={onCreateSecret}
        onChange={onChange}
      />,
    );
  });
  return { container, onChange, onCreateSecret };
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function changeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("EnvVarEditor", () => {
  it("clears plaintext after sealing a value as a secret", async () => {
    const createdSecret = {
      id: "secret-1",
      companyId: "company-1",
      key: "token",
      name: "token",
      provider: "local_encrypted",
      description: null,
      status: "active",
      managedMode: "paperclip_managed",
      externalRef: null,
      providerConfigId: null,
      providerMetadata: null,
      latestVersion: 1,
      lastResolvedAt: null,
      lastRotatedAt: null,
      deletedAt: null,
      createdByUserId: null,
      createdByAgentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } satisfies CompanySecret;
    const onChange = vi.fn();
    const onCreateSecret = vi.fn(async () => createdSecret);
    vi.spyOn(window, "prompt").mockReturnValue("token");

    const { container } = renderEditor({ onChange, onCreateSecret });
    const keyInput = container.querySelector<HTMLInputElement>('input[aria-label="Key"]')!;
    const valueInput = container.querySelector<HTMLInputElement>('input[aria-label="Plain Value"]')!;

    act(() => {
      changeInput(keyInput, "GH_TOKEN");
    });
    act(() => {
      changeInput(valueInput, "secret-value");
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="Store value as secret and replace with reference"]')!.click();
    });

    expect(onCreateSecret).toHaveBeenCalledWith("token", "secret-value");
    expect(onChange).toHaveBeenLastCalledWith({
      GH_TOKEN: { type: "secret_ref", secretId: "secret-1", version: "latest" },
    });

    const sourceSelect = container.querySelector<HTMLSelectElement>("select")!;
    act(() => {
      changeSelect(sourceSelect, "plain");
    });

    expect(container.querySelector<HTMLInputElement>('input[aria-label="Plain Value"]')!.value).toBe("");
    expect(onChange).toHaveBeenLastCalledWith({
      GH_TOKEN: { type: "plain", value: "" },
    });
  });
});
