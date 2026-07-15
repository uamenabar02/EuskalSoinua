"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type ThemeId =
  | "midnight"
  | "aurora"
  | "basque"
  | "forest"
  | "oled"
  | "light";

export interface Theme {
  id: ThemeId;
  name: string;
  emoji: string;
  /** swatches shown in the picker: [bg, panel, accent, basque] */
  swatch: [string, string, string, string];
}

export const THEMES: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    emoji: "🌙",
    swatch: ["#0a0a0f", "#181820", "#1ed760", "#ee5a3a"],
  },
  {
    id: "aurora",
    name: "Aurora",
    emoji: "🌌",
    swatch: ["#0a0e1f", "#161e42", "#8b9cff", "#f472b6"],
  },
  {
    id: "basque",
    name: "Basque Sunset",
    emoji: "🌅",
    swatch: ["#140a08", "#271510", "#f59e0b", "#ee5a3a"],
  },
  {
    id: "forest",
    name: "Forest",
    emoji: "🌲",
    swatch: ["#07120c", "#11251a", "#34d399", "#fbbf24"],
  },
  {
    id: "oled",
    name: "OLED Black",
    emoji: "⚫",
    swatch: ["#000000", "#0a0a0a", "#1ed760", "#ee5a3a"],
  },
  {
    id: "light",
    name: "Light",
    emoji: "☀️",
    swatch: ["#f4f4f7", "#ffffff", "#0f9d4f", "#d8431c"],
  },
];

const STORAGE_KEY = "euskalsoinua-theme";
const DEFAULT_THEME: ThemeId = "midnight";

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);

  // hydrate from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
      if (saved && THEMES.some((t) => t.id === saved)) {
        applyTheme(saved);
        setTimeout(() => {
          setThemeState(saved);
        }, 0);
      } else {
        applyTheme(DEFAULT_THEME);
      }
    } catch {
      applyTheme(DEFAULT_THEME);
    }
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    applyTheme(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
    // keep the address-bar / status-bar color in sync
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", themeBg(id));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
}

function themeBg(id: ThemeId): string {
  return THEMES.find((t) => t.id === id)?.swatch[0] ?? "#0a0a0f";
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
