import type { Resource } from "i18next";

import en from "./locales/en.json";
import { assertValidLocaleMessages } from "./locale-validation";

export const DEFAULT_LOCALE = "en" as const;

const localeModules = import.meta.glob("./locales/*.json", {
  import: "default",
}) as Record<string, () => Promise<unknown>>;

function localeFromPath(path: string): string {
  const locale = path.match(/\/([A-Za-z0-9_-]+)\.json$/)?.[1];
  if (!locale) {
    throw new Error(`Invalid locale file path: ${path}`);
  }
  return locale;
}

export const localeMessages = {
  [DEFAULT_LOCALE]: en,
};

const localeLoaders = Object.fromEntries(
  Object.entries(localeModules).map(([path, loader]) => [localeFromPath(path), loader]),
) as Record<string, () => Promise<unknown>>;

if (!(DEFAULT_LOCALE in localeLoaders)) {
  throw new Error(`Missing default locale messages for ${DEFAULT_LOCALE}`);
}

for (const [locale, messages] of Object.entries(localeMessages)) {
  try {
    assertValidLocaleMessages(messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid ${locale} locale messages: ${message}`);
  }
}

export const supportedLocales = Object.keys(localeLoaders);

export const i18nextResources: Resource = Object.fromEntries(
  Object.entries(localeMessages).map(([locale, messages]) => [locale, { translation: messages }]),
) as Resource;

export type SupportedLocale = string;

export function isSupportedLocale(locale: string): boolean {
  return locale in localeLoaders;
}

export async function loadLocaleMessages(locale: string): Promise<unknown> {
  if (locale === DEFAULT_LOCALE) return en;

  const loader = localeLoaders[locale];
  if (!loader) {
    throw new Error(`Unsupported locale: ${locale}`);
  }

  const messages = await loader();
  assertValidLocaleMessages(messages);
  return messages;
}

export async function loadAllLocaleMessages(): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    supportedLocales.map(async (locale) => [locale, await loadLocaleMessages(locale)] as const),
  );
  return Object.fromEntries(entries);
}
