"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewMode = "auto" | "smartphone" | "desktop";

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isSmartphoneView: boolean;
  isDesktopView: boolean;
}

const ViewModeContext = createContext<ViewModeContextType | null>(null);

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("euskalsoinua-view-mode") as ViewMode;
        if (saved && (saved === "auto" || saved === "smartphone" || saved === "desktop")) {
          return saved;
        }
      } catch (e) {}
    }
    return "auto";
  });
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem("euskalsoinua-view-mode", mode);
    } catch (e) {}
  };

  const isSmartphoneView = viewMode === "smartphone" || (viewMode === "auto" && isMobileScreen);
  const isDesktopView = viewMode === "desktop" || (viewMode === "auto" && !isMobileScreen);

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, isSmartphoneView, isDesktopView }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    return {
      viewMode: "auto" as ViewMode,
      setViewMode: () => {},
      isSmartphoneView: false,
      isDesktopView: true,
    };
  }
  return context;
}
