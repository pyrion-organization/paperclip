const LEGACY_INSTANCE_SETTINGS_TARGETS = new Set([
  "access",
  "adapters",
  "experimental",
  "heartbeats",
  "plugins",
  "profile",
]);

export function resolveLegacyInstanceSettingsTarget(pathname: string): string {
  const tail = pathname.split("/settings/")[1]?.split(/[?#]/)[0] ?? "";
  return LEGACY_INSTANCE_SETTINGS_TARGETS.has(tail) ? tail : "general";
}
