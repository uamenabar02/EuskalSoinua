"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  type Locale,
  type LocaleInfo,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from "./types";
import {
  createTranslator,
  type TranslationKey,
} from "./translator";

const STORAGE_KEY = "euskalsoinua-locale";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string, params?: Record<string, string | number>) => string;
  locales: LocaleInfo[];
  currentLocaleInfo: LocaleInfo;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
        if (saved && (saved === "en" || saved === "eu" || saved === "es")) {
          return saved;
        }
        const browserLang = navigator.language?.toLowerCase() || "";
        if (browserLang.startsWith("eu")) return "eu";
        if (browserLang.startsWith("es")) return "es";
        return DEFAULT_LOCALE;
      } catch (e) {
        return DEFAULT_LOCALE;
      }
    }
    return DEFAULT_LOCALE;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    if (!SUPPORTED_LOCALES.some((l) => l.code === newLocale)) return;
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.cookie = `locale=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (e) {}

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", newLocale);
    }
    window.dispatchEvent(new CustomEvent("language-changed", { detail: { locale: newLocale } }));
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("lang", locale);
    }
  }, [locale]);

  const t = useMemo(() => createTranslator(locale), [locale]);

  const currentLocaleInfo = useMemo(() => {
    return SUPPORTED_LOCALES.find((l) => l.code === locale) || SUPPORTED_LOCALES[0];
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      locales: SUPPORTED_LOCALES,
      currentLocaleInfo,
    }),
    [locale, setLocale, t, currentLocaleInfo]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    const fallbackT = createTranslator(DEFAULT_LOCALE);
    return {
      locale: DEFAULT_LOCALE as Locale,
      setLocale: () => {},
      t: fallbackT,
      locales: SUPPORTED_LOCALES,
      currentLocaleInfo: SUPPORTED_LOCALES[0],
    };
  }
  return ctx;
}

export const useLanguage = useTranslation;
