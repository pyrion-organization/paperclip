import type { ComponentType } from "react";
import * as ReactModule from "react";
import type { PluginLauncherDeclaration } from "@paperclipai/shared";
import type { PluginUiContribution } from "@/api/plugins";
import {
  clearPluginComponentRegistry,
  registerPluginReactComponent,
  registerPluginWebComponent,
  type PluginSlotComponentProps,
} from "./slots-registry";

type PluginLoadState = "idle" | "loading" | "loaded" | "error";

const pluginLoadStates = new Map<string, PluginLoadState>();
const inflightImports = new Map<string, Promise<void>>();
const shimBlobUrls: Record<string, string> = {};
let pluginBridgeInitPromise: Promise<void> | null = null;

function buildPluginModuleKey(contribution: PluginUiContribution): string {
  const cacheHint = contribution.updatedAt ?? contribution.version ?? "0";
  return `${contribution.pluginId}:${cacheHint}`;
}

function buildPluginUiUrl(contribution: PluginUiContribution): string {
  const cacheHint = encodeURIComponent(contribution.updatedAt ?? contribution.version ?? "0");
  return `/_plugins/${encodeURIComponent(contribution.pluginId)}/ui/${contribution.uiEntryFile}?v=${cacheHint}`;
}

function applyJsxRuntimeKey(
  props: Record<string, unknown> | null | undefined,
  key: string | number | undefined,
): Record<string, unknown> {
  if (key === undefined) return props ?? {};
  return { ...(props ?? {}), key };
}

function createReactShimSource(reactModule: object): string {
  const exportNames = Object.keys(reactModule)
    .filter((name) => name !== "default" && /^[A-Za-z_$][\w$]*$/.test(name))
    .sort();
  const namedExports = exportNames
    .map((name) => `        export const ${name} = R.${name};`)
    .join("\n");

  return `
        const R = globalThis.__paperclipPluginBridge__?.react;
        if (!R) {
          throw new Error("Paperclip plugin React runtime is not initialized.");
        }
        export default R;
${namedExports}
      `;
}

function getShimBlobUrl(specifier: "react" | "react-dom" | "react-dom/client" | "react/jsx-runtime" | "sdk-ui"): string {
  if (shimBlobUrls[specifier]) return shimBlobUrls[specifier];

  let source: string;
  switch (specifier) {
    case "react":
      source = createReactShimSource(ReactModule);
      break;
    case "react/jsx-runtime":
      source = `
        const R = globalThis.__paperclipPluginBridge__?.react;
        const withKey = ${applyJsxRuntimeKey.toString()};
        export const jsx = (type, props, key) => R.createElement(type, withKey(props, key));
        export const jsxs = (type, props, key) => R.createElement(type, withKey(props, key));
        export const Fragment = R.Fragment;
      `;
      break;
    case "react-dom":
    case "react-dom/client":
      source = `
        const RD = globalThis.__paperclipPluginBridge__?.reactDom;
        export default RD;
        const { createRoot, hydrateRoot, createPortal, flushSync } = RD ?? {};
        export { createRoot, hydrateRoot, createPortal, flushSync };
      `;
      break;
    case "sdk-ui":
      source = `
        const SDK = globalThis.__paperclipPluginBridge__?.sdkUi ?? {};
        function missing(name) {
          return function MissingPaperclipSdkUiComponent() {
            throw new Error('Paperclip plugin UI runtime is not initialized for "' + name + '". Ensure the host loaded the plugin bridge before rendering this UI module.');
          };
        }
        const { usePluginData, usePluginAction, useHostContext, useHostLocation, useHostNavigation, usePluginStream, usePluginToast } = SDK;
        const MetricCard = SDK.MetricCard ?? missing("MetricCard");
        const StatusBadge = SDK.StatusBadge ?? missing("StatusBadge");
        const DataTable = SDK.DataTable ?? missing("DataTable");
        const TimeseriesChart = SDK.TimeseriesChart ?? missing("TimeseriesChart");
        const MarkdownBlock = SDK.MarkdownBlock ?? missing("MarkdownBlock");
        const MarkdownEditor = SDK.MarkdownEditor ?? missing("MarkdownEditor");
        const KeyValueList = SDK.KeyValueList ?? missing("KeyValueList");
        const ActionBar = SDK.ActionBar ?? missing("ActionBar");
        const LogView = SDK.LogView ?? missing("LogView");
        const JsonTree = SDK.JsonTree ?? missing("JsonTree");
        const Spinner = SDK.Spinner ?? missing("Spinner");
        const ErrorBoundary = SDK.ErrorBoundary ?? missing("ErrorBoundary");
        const FileTree = SDK.FileTree ?? missing("FileTree");
        const IssuesList = SDK.IssuesList ?? missing("IssuesList");
        const AssigneePicker = SDK.AssigneePicker ?? missing("AssigneePicker");
        const ProjectPicker = SDK.ProjectPicker ?? missing("ProjectPicker");
        const ManagedRoutinesList = SDK.ManagedRoutinesList ?? missing("ManagedRoutinesList");
        export { usePluginData, usePluginAction, useHostContext, useHostLocation, useHostNavigation, usePluginStream, usePluginToast, MetricCard, StatusBadge, DataTable, TimeseriesChart, MarkdownBlock, MarkdownEditor, KeyValueList, ActionBar, LogView, JsonTree, Spinner, ErrorBoundary, FileTree, IssuesList, AssigneePicker, ProjectPicker, ManagedRoutinesList };
      `;
      break;
  }

  const blob = new Blob([source], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  shimBlobUrls[specifier] = url;
  return url;
}

async function ensurePluginBridgeInitialized(): Promise<void> {
  if (globalThis.__paperclipPluginBridge__) return;

  pluginBridgeInitPromise ??= Promise.all([
    import("./bridge-init"),
    import("react-dom"),
  ]).then(([{ initPluginBridge }, reactDom]) => {
    initPluginBridge(ReactModule, reactDom);
  });

  await pluginBridgeInitPromise;
}

function rewriteBareSpecifiers(source: string): string {
  const rewrites: Record<string, string> = {
    '"@paperclipai/plugin-sdk/ui"': `"${getShimBlobUrl("sdk-ui")}"`,
    "'@paperclipai/plugin-sdk/ui'": `'${getShimBlobUrl("sdk-ui")}'`,
    '"@paperclipai/plugin-sdk/ui/hooks"': `"${getShimBlobUrl("sdk-ui")}"`,
    "'@paperclipai/plugin-sdk/ui/hooks'": `'${getShimBlobUrl("sdk-ui")}'`,
    '"react/jsx-runtime"': `"${getShimBlobUrl("react/jsx-runtime")}"`,
    "'react/jsx-runtime'": `'${getShimBlobUrl("react/jsx-runtime")}'`,
    '"react-dom/client"': `"${getShimBlobUrl("react-dom/client")}"`,
    "'react-dom/client'": `'${getShimBlobUrl("react-dom/client")}'`,
    '"react-dom"': `"${getShimBlobUrl("react-dom")}"`,
    "'react-dom'": `'${getShimBlobUrl("react-dom")}'`,
    '"react"': `"${getShimBlobUrl("react")}"`,
    "'react'": `'${getShimBlobUrl("react")}'`,
  };

  let result = source;
  for (const [from, to] of Object.entries(rewrites)) {
    result = result.replaceAll(` from ${from}`, ` from ${to}`);
    result = result.replaceAll(`import ${from}`, `import ${to}`);
  }

  return result;
}

async function importPluginModule(url: string): Promise<Record<string, unknown>> {
  await ensurePluginBridgeInitialized();

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch plugin module: ${response.status} ${response.statusText}`);
  }

  const source = await response.text();
  const rewritten = rewriteBareSpecifiers(source);
  const blob = new Blob([rewritten], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  try {
    const mod = await import(/* @vite-ignore */ blobUrl);
    return mod;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function isLauncherComponentTarget(launcher: PluginLauncherDeclaration): boolean {
  return launcher.action.type === "openModal"
    || launcher.action.type === "openDrawer"
    || launcher.action.type === "openPopover";
}

async function loadPluginModule(contribution: PluginUiContribution): Promise<void> {
  const { pluginId, pluginKey, slots, launchers } = contribution;
  const moduleKey = buildPluginModuleKey(contribution);

  const state = pluginLoadStates.get(moduleKey);
  if (state === "loaded" || state === "loading") {
    const inflight = inflightImports.get(pluginId);
    if (inflight) await inflight;
    return;
  }

  const running = inflightImports.get(pluginId);
  if (running) {
    await running;
    const recheckedState = pluginLoadStates.get(moduleKey);
    if (recheckedState === "loaded") {
      return;
    }
  }

  pluginLoadStates.set(moduleKey, "loading");

  const url = buildPluginUiUrl(contribution);

  const importPromise = (async () => {
    try {
      const mod: Record<string, unknown> = await importPluginModule(url);
      const declaredExports = new Set<string>();
      for (const slot of slots) {
        declaredExports.add(slot.exportName);
      }
      for (const launcher of launchers) {
        if (launcher.exportName) {
          declaredExports.add(launcher.exportName);
        }
        if (isLauncherComponentTarget(launcher)) {
          declaredExports.add(launcher.action.target);
        }
      }

      for (const exportName of declaredExports) {
        const exported = mod[exportName];
        if (exported === undefined) {
          console.warn(
            `Plugin "${pluginKey}" declares slot export "${exportName}" but the module does not export it.`,
          );
          continue;
        }

        if (typeof exported === "function") {
          registerPluginReactComponent(
            pluginKey,
            exportName,
            exported as ComponentType<PluginSlotComponentProps>,
          );
        } else if (typeof exported === "string") {
          registerPluginWebComponent(pluginKey, exportName, exported);
        } else {
          console.warn(
            `Plugin "${pluginKey}" export "${exportName}" is neither a function nor a string tag name — skipping.`,
          );
        }
      }

      pluginLoadStates.set(moduleKey, "loaded");
    } catch (err) {
      pluginLoadStates.set(moduleKey, "error");
      console.error(`Failed to load UI module for plugin "${pluginKey}"`, err);
    } finally {
      inflightImports.delete(pluginId);
    }
  })();

  inflightImports.set(pluginId, importPromise);
  await importPromise;
}

export async function ensurePluginModulesLoaded(contributions: PluginUiContribution[]): Promise<void> {
  await Promise.all(
    contributions.map((c) => loadPluginModule(c)),
  );
}

export async function ensurePluginContributionLoaded(
  contribution: PluginUiContribution,
): Promise<void> {
  await loadPluginModule(contribution);
}

export function aggregateLoadState(contributions: PluginUiContribution[]): "loading" | "loaded" {
  for (const c of contributions) {
    const state = pluginLoadStates.get(buildPluginModuleKey(c));
    if (state === "loading" || state === "idle" || state === undefined) {
      return "loading";
    }
  }
  return "loaded";
}

export function getPluginLoadState(contribution: PluginUiContribution): PluginLoadState | undefined {
  return pluginLoadStates.get(buildPluginModuleKey(contribution));
}

export function getInflightPluginImport(pluginId: string): Promise<void> | undefined {
  return inflightImports.get(pluginId);
}

export function _resetPluginModuleLoader(): void {
  pluginLoadStates.clear();
  inflightImports.clear();
  clearPluginComponentRegistry();
  if (typeof URL.revokeObjectURL === "function") {
    for (const url of Object.values(shimBlobUrls)) {
      URL.revokeObjectURL(url);
    }
  }
  for (const key of Object.keys(shimBlobUrls)) {
    delete shimBlobUrls[key];
  }
}

export const _applyJsxRuntimeKeyForTests = applyJsxRuntimeKey;
export const _createReactShimSourceForTests = createReactShimSource;
export const _rewriteBareSpecifiersForTests = rewriteBareSpecifiers;
