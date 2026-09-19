"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ViewMode = "auto" | "smartphone" | "desktop";

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  isSmartphoneView: boolean;
  isDesktopView: boolean;
  showDetails: boolean;
  setShowDetails: (show: boolean) => void;
  toggleDetails: () => void;
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

  // Detail display toggle (default to false on smartphone view so it's clean and compact)
  const [showDetails, setShowDetailsState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("euskalsoinua-show-details");
        if (saved !== null) {
          return saved === "true";
        }
      } catch (e) {}
    }
    return true; // Default true on desktop, but we handle smartphone view dynamically
  });

  const setShowDetails = (val: boolean) => {
    setShowDetailsState(val);
    try {
      localStorage.setItem("euskalsoinua-show-details", String(val));
    } catch (e) {}
  };

  const toggleDetails = () => {
    setShowDetailsState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("euskalsoinua-show-details", String(next));
      } catch (e) {}
      return next;
    });
  };

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(
        "data-view-mode",
        isSmartphoneView ? "smartphone" : "desktop"
      );
      document.documentElement.setAttribute(
        "data-hide-details",
        !showDetails ? "true" : "false"
      );
    }
  }, [isSmartphoneView, showDetails]);

  return (
    <ViewModeContext.Provider
      value={{
        viewMode,
        setViewMode,
        isSmartphoneView,
        isDesktopView,
        showDetails,
        setShowDetails,
        toggleDetails,
      }}
    >
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
      showDetails: true,
      setShowDetails: () => {},
      toggleDetails: () => {},
    };
  }
  return context;
}

