// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanySecret } from "@paperclipai/shared";
import { SecretBindingPicker } from "./SecretBindingPicker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const secretsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
}));

vi.mock("../api/secrets", () => ({
  secretsApi: secretsApiMock,
}));

vi.mock("../context/CompanyContext", () => ({
  useCompany: () => ({ selectedCompanyId: "company-1" }),
}));

function makeSecret(id: string, status: CompanySecret["status"]): CompanySecret {
  return {
    id,
    companyId: "company-1",
    key: `secret.${id}`,
    name: `Secret ${id}`,
    provider: "local_encrypted",
    status,
    managedMode: "paperclip_managed",
    externalRef: null,
    providerConfigId: null,
    providerMetadata: null,
    latestVersion: 1,
    description: null,
    lastResolvedAt: null,
    lastRotatedAt: null,
    deletedAt: null,
    createdByAgentId: null,
    createdByUserId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("SecretBindingPicker", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    secretsApiMock.list.mockReset();
    secretsApiMock.create.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
  });

  it("keeps the selected secret option visible when filtered by status", async () => {
    secretsApiMock.list.mockResolvedValue([
      makeSecret("disabled-secret", "disabled"),
      makeSecret("active-secret", "active"),
    ]);

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <SecretBindingPicker
            value={{ secretId: "disabled-secret" }}
            onChange={() => {}}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.value).toBe("disabled-secret");
      const options = Array.from(select?.querySelectorAll("option") ?? []).map((option) => option.textContent);
      expect(options).toContain("Secret disabled-secret, local encrypted (disabled)");
      expect(options).toContain("Secret active-secret, local encrypted");
    });
  });
});
