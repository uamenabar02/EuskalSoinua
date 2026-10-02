import { describe, it, expect } from "vitest";
import {
  createTranslator,
  interpolate,
  getNestedTranslation,
  DICTIONARIES,
  SUPPORTED_LOCALES,
} from "@/lib/i18n";

describe("i18n Translation Engine", () => {
  it("supports all 3 requested locales: English, Basque (Euskara), and Spanish", () => {
    const localeCodes = SUPPORTED_LOCALES.map((l) => l.code);
    expect(localeCodes).toContain("en");
    expect(localeCodes).toContain("eu");
    expect(localeCodes).toContain("es");
  });

  it("translates navigation in English, Basque, and Spanish correctly", () => {
    const tEn = createTranslator("en");
    const tEu = createTranslator("eu");
    const tEs = createTranslator("es");

    expect(tEn("nav.home")).toBe("Home");
    expect(tEu("nav.home")).toBe("Hasiera");
    expect(tEs("nav.home")).toBe("Inicio");

    expect(tEn("nav.search")).toBe("Search");
    expect(tEu("nav.search")).toBe("Bilatu");
    expect(tEs("nav.search")).toBe("Buscar");

    expect(tEn("nav.library")).toBe("Your Library");
    expect(tEu("nav.library")).toBe("Zure Liburutegia");
    expect(tEs("nav.library")).toBe("Tu Biblioteca");

    expect(tEn("nav.settings")).toBe("Settings");
    expect(tEu("nav.settings")).toBe("Ezarpenak");
    expect(tEs("nav.settings")).toBe("Ajustes");
  });

  it("handles variable interpolation correctly", () => {
    const result = interpolate("Playing {count} tracks from {artist}", {
      count: 12,
      artist: "ZETAK",
    });
    expect(result).toBe("Playing 12 tracks from ZETAK");

    const tEu = createTranslator("eu");
    expect(tEu("library.tracksCount", { count: 8 })).toBe("8 abesti");

    const tEs = createTranslator("es");
    expect(tEs("library.tracksCount", { count: 8 })).toBe("8 canciones");
  });

  it("falls back gracefully to English when a key is missing or undefined", () => {
    const customFallback = getNestedTranslation(
      { nav: { home: "Hasiera" } }, // missing 'search'
      { nav: { home: "Home", search: "Search" } },
      "nav.search"
    );
    expect(customFallback).toBe("Search");
  });

  it("verifies dictionary key parity between English, Basque, and Spanish", () => {
    const enKeys = Object.keys(DICTIONARIES.en);
    const euKeys = Object.keys(DICTIONARIES.eu);
    const esKeys = Object.keys(DICTIONARIES.es);

    expect(euKeys).toEqual(enKeys);
    expect(esKeys).toEqual(enKeys);

    for (const section of enKeys) {
      const enSubKeys = Object.keys((DICTIONARIES.en as any)[section]);
      const euSubKeys = Object.keys((DICTIONARIES.eu as any)[section]);
      const esSubKeys = Object.keys((DICTIONARIES.es as any)[section]);

      expect(euSubKeys.sort()).toEqual(enSubKeys.sort());
      expect(esSubKeys.sort()).toEqual(enSubKeys.sort());
    }
  });
});
