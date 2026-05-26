import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import {
  DEFAULT_LOCALE,
  i18nextResources,
  isSupportedLocale,
  loadLocaleMessages,
  supportedLocales,
} from "./locales";

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

async function ensureLocaleResource(locale: string) {
  if (i18n.hasResourceBundle(locale, "translation")) return;
  if (!isSupportedLocale(locale)) return;

  const messages = await loadLocaleMessages(locale);
  i18n.addResourceBundle(locale, "translation", messages, true, true);
}

export async function changeLanguage(locale: string) {
  await ensureLocaleResource(locale);
  return i18n.changeLanguage(locale);
}

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
