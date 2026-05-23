// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginUiContribution } from "@/api/plugins";
import {
  PluginLauncherProvider,
  usePluginLauncherRuntime,
  type PluginLauncherContext,
  type ResolvedPluginLauncher,
} from "./launchers";

const mockPluginsApi = vi.hoisted(() => ({
  bridgePerformAction: vi.fn(),
  listUiContributions: vi.fn(),
}));

const mockAuthApi = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const mockNavigate = vi.hoisted(() => vi.fn());
const mockLocation = vi.hoisted(() => ({ key: "initial" }));

const mockEnsurePluginContributionLoaded = vi.hoisted(() => vi.fn());
const mockResolveRegisteredPluginComponent = vi.hoisted(() => vi.fn());

vi.mock("@/api/plugins", () => ({
  pluginsApi: mockPluginsApi,
}));

vi.mock("@/api/auth", () => ({
  authApi: mockAuthApi,
}));

vi.mock("@/lib/router", () => ({
  useLocation: () => mockLocation,
  useNavigate: () => mockNavigate,
}));

vi.mock("./slots", () => ({
  ensurePluginContributionLoaded: mockEnsurePluginContributionLoaded,
  resolveRegisteredPluginComponent: mockResolveRegisteredPluginComponent,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function flushReact() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function iframeLauncher(): ResolvedPluginLauncher {
  return {
    id: "inspect",
    displayName: "Inspect",
    placementZone: "toolbarButton",
    action: {
      type: "openModal",
      target: "panel.html",
    },
    render: {
      environment: "iframe",
      bounds: "default",
    },
    pluginId: "plugin-iframe",
    pluginKey: "paperclipai.iframe-plugin",
    pluginDisplayName: "Iframe Plugin",
    pluginVersion: "0.1.0",
    uiEntryFile: "ui.js",
  };
}

function iframeContribution(launcher: ResolvedPluginLauncher): PluginUiContribution {
  return {
    pluginId: launcher.pluginId,
    pluginKey: launcher.pluginKey,
    displayName: launcher.pluginDisplayName,
    version: launcher.pluginVersion,
    uiEntryFile: launcher.uiEntryFile,
    slots: [],
    launchers: [launcher],
  };
}

describe("PluginLauncherProvider iframe launchers", () => {
  let container: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = null;
    mockAuthApi.getSession.mockResolvedValue({ session: { userId: "user-1" } });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens iframe launchers without loading plugin UI into the host", async () => {
    let runtime: ReturnType<typeof usePluginLauncherRuntime> | null = null;
    function Probe() {
      runtime = usePluginLauncherRuntime();
      return null;
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <QueryClientProvider client={queryClient}>
          <PluginLauncherProvider>
            <Probe />
          </PluginLauncherProvider>
        </QueryClientProvider>,
      );
    });

    const launcher = iframeLauncher();
    const hostContext: PluginLauncherContext = { companyId: "company-1" };

    await act(async () => {
      await runtime?.activateLauncher(
        launcher,
        hostContext,
        iframeContribution(launcher),
      );
    });
    await flushReact();

    expect(mockResolveRegisteredPluginComponent).not.toHaveBeenCalled();
    expect(mockEnsurePluginContributionLoaded).not.toHaveBeenCalled();

    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe("/_plugins/plugin-iframe/ui/panel.html");
    expect(iframe?.getAttribute("title")).toBe("Iframe Plugin Inspect");
  });
});
