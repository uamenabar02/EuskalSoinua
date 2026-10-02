export type Locale = "en" | "eu" | "es";

export interface LocaleInfo {
  code: Locale;
  nativeName: string;
  englishName: string;
  flag: string;
  badge: string;
  description: string;
}

export const SUPPORTED_LOCALES: LocaleInfo[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    flag: "🇬🇧",
    badge: "EN",
    description: "Standard English (International)",
  },
  {
    code: "eu",
    nativeName: "Euskara",
    englishName: "Basque",
    flag: "🟢",
    badge: "EU",
    description: "Euskal Herriko musika eta interfazea",
  },
  {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    flag: "🇪🇸",
    badge: "ES",
    description: "Español estándar para interfaz y recomendaciones",
  },
];

export const DEFAULT_LOCALE: Locale = "en";
