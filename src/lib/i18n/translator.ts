import { en, type TranslationSchema } from "./locales/en";
import { eu } from "./locales/eu";
import { es } from "./locales/es";
import { type Locale, DEFAULT_LOCALE } from "./types";

// Translation dictionaries registry
export const DICTIONARIES: Record<Locale, TranslationSchema> = {
  en,
  eu,
  es,
};

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<TranslationSchema>;

/**
 * Resolves a nested key in dot notation (e.g. "nav.home" or "settings.language")
 * against a target dictionary, falling back to English if missing or undefined.
 */
export function getNestedTranslation(
  dict: any,
  fallbackDict: any,
  path: string
): any {
  const parts = path.split(".");
  let current = dict;
  let fallbackCurrent = fallbackDict;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      current = undefined;
    }

    if (fallbackCurrent && typeof fallbackCurrent === "object" && part in fallbackCurrent) {
      fallbackCurrent = fallbackCurrent[part];
    } else {
      fallbackCurrent = undefined;
    }
  }

  return current !== undefined ? current : fallbackCurrent !== undefined ? fallbackCurrent : path;
}

/**
 * Format a translation string with named parameters: e.g. "Hello {name}" -> "Hello Jon"
 */
export function interpolate(
  template: string,
  params?: Record<string, string | number>
): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_-]+)\}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Global translator function for a specific locale.
 */
export function createTranslator(locale: Locale) {
  const targetDict = DICTIONARIES[locale] || DICTIONARIES[DEFAULT_LOCALE];
  const fallbackDict = DICTIONARIES[DEFAULT_LOCALE];

  return function t(
    key: TranslationKey | string,
    params?: Record<string, string | number>
  ): string {
    const raw = getNestedTranslation(targetDict, fallbackDict, key);
    if (typeof raw === "string") {
      return interpolate(raw, params);
    }
    if (Array.isArray(raw)) {
      return raw.join(", ");
    }
    return String(raw ?? key);
  };
}
