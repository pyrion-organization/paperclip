import type { ComponentType } from "react";
import type { PluginSlotContext, ResolvedPluginSlot } from "./slots";

export type PluginSlotComponentProps = {
  slot: ResolvedPluginSlot;
  context: PluginSlotContext;
};

export type RegisteredPluginComponent =
  | {
    kind: "react";
    component: ComponentType<PluginSlotComponentProps>;
  }
  | {
    kind: "web-component";
    tagName: string;
  };

const registry = new Map<string, RegisteredPluginComponent>();
const registryListeners = new Set<() => void>();

function buildRegistryKey(pluginKey: string, exportName: string): string {
  return `${pluginKey}:${exportName}`;
}

export function registerPluginReactComponent(
  pluginKey: string,
  exportName: string,
  component: ComponentType<PluginSlotComponentProps>,
): void {
  registry.set(buildRegistryKey(pluginKey, exportName), {
    kind: "react",
    component,
  });
  notifyPluginComponentRegistryListeners();
}

export function registerPluginWebComponent(
  pluginKey: string,
  exportName: string,
  tagName: string,
): void {
  registry.set(buildRegistryKey(pluginKey, exportName), {
    kind: "web-component",
    tagName,
  });
  notifyPluginComponentRegistryListeners();
}

export function resolveRegisteredComponent(slot: ResolvedPluginSlot): RegisteredPluginComponent | null {
  return registry.get(buildRegistryKey(slot.pluginKey, slot.exportName)) ?? null;
}

export function resolveRegisteredPluginComponent(
  pluginKey: string,
  exportName: string,
): RegisteredPluginComponent | null {
  return registry.get(buildRegistryKey(pluginKey, exportName)) ?? null;
}

export function clearPluginComponentRegistry(): void {
  registry.clear();
  notifyPluginComponentRegistryListeners();
}

export function subscribePluginComponentRegistry(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
}

function notifyPluginComponentRegistryListeners(): void {
  for (const listener of registryListeners) {
    listener();
  }
}
