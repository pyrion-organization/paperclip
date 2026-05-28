import type {
  CompanySecretProviderConfig,
  SecretProvider,
  SecretProviderDescriptor,
} from "@paperclipai/shared";
import type { SecretProviderHealthResponse } from "../api/secrets";

export type CreateMode = "managed" | "external";

function healthEntryForProvider(
  health: SecretProviderHealthResponse | null,
  providerId: SecretProvider,
) {
  return health?.providers.find((entry) => entry.provider === providerId) ?? null;
}

function detailString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSecretKeyForPreview(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function getCreateProviderBlockReason(
  provider: SecretProviderDescriptor | null | undefined,
  mode: CreateMode,
  health: SecretProviderHealthResponse | null,
) {
  if (!provider) return "Select a provider.";
  if (mode === "managed" && provider.supportsManagedValues === false) {
    return `${provider.label} does not support Paperclip-managed secret values.`;
  }
  if (mode === "external" && provider.supportsExternalReferences === false) {
    return `${provider.label} does not support linked external references.`;
  }
  if (provider.configured === false) {
    const healthEntry = healthEntryForProvider(health, provider.id);
    return healthEntry?.message
      ? `${provider.label} is not configured in this deployment. ${healthEntry.message}`
      : `${provider.label} is not configured in this deployment.`;
  }
  const healthEntry = healthEntryForProvider(health, provider.id);
  if (healthEntry?.status === "error") {
    return `${provider.label} health check failed: ${healthEntry.message}`;
  }
  return null;
}

export function getProviderConfigBlockReason(
  config: CompanySecretProviderConfig | null | undefined,
) {
  if (!config) return null;
  if (config.status === "disabled") return "This provider vault is disabled.";
  if (config.status === "coming_soon") return "This provider vault is saved as draft metadata only.";
  if (config.healthStatus === "error") {
    return config.healthMessage ?? "This provider vault health check failed.";
  }
  return null;
}

export function getDefaultProviderConfigId(
  configs: CompanySecretProviderConfig[],
  provider: SecretProvider,
) {
  const providerConfigs = configs.filter((config) => config.provider === provider);
  const selectable = providerConfigs.filter((config) => !getProviderConfigBlockReason(config));
  return (
    selectable.find((config) => config.isDefault)?.id ??
    selectable[0]?.id ??
    providerConfigs.find((config) => config.isDefault)?.id ??
    ""
  );
}

export function getAwsManagedPathPreview(input: {
  provider: SecretProviderDescriptor | null | undefined;
  health: SecretProviderHealthResponse | null;
  companyId: string;
  secretKeySource: string;
}) {
  if (input.provider?.id !== "aws_secrets_manager") return null;
  const healthEntry = healthEntryForProvider(input.health, "aws_secrets_manager");
  const prefix = detailString(healthEntry?.details, "prefix") ?? "paperclip";
  const deploymentId = detailString(healthEntry?.details, "deploymentId") ?? "{deploymentId}";
  const secretKey = normalizeSecretKeyForPreview(input.secretKeySource) || "{secretKey}";
  return `${prefix}/${deploymentId}/${input.companyId}/${secretKey}`;
}
