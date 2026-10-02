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

  // =========================================================================
  // DYNAMIC META VIEWPORT REWRITE (Chrome Android "Desktop Site" Compensation)
  // -------------------------------------------------------------------------
  // When users enable "Desktop site" in mobile browsers (e.g. Chrome on Android)
  // to allow background audio playback without tab suspension, the browser
  // overrides device-width with a wide virtual viewport (~980px) and zooms out.
  // When Smartphone View is active, rewriting the meta viewport's width attribute
  // directly to window.screen.width forces the browser to render the viewport at
  // the device's real physical width, making fonts, cards, and icons legible.
  // =========================================================================
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const applyViewportScaling = () => {
      try {
        let metaViewport = document.querySelector('meta[name="viewport"]');
        if (!metaViewport) {
          metaViewport = document.createElement("meta");
          metaViewport.setAttribute("name", "viewport");
          document.head.appendChild(metaViewport);
        }

        const isOrientationLandscape =
          typeof window.orientation !== "undefined"
            ? Math.abs(Number(window.orientation)) === 90
            : window.innerWidth > window.innerHeight && typeof window.screen !== "undefined" && window.screen.width > window.screen.height;

        // Determine real physical width
        const screenDim = typeof window.screen !== "undefined" ? window.screen : null;
        let physicalWidth = 390;
        if (screenDim) {
          physicalWidth = isOrientationLandscape
            ? Math.max(screenDim.width, screenDim.height)
            : Math.min(screenDim.width, screenDim.height);
          // If screen dimensions are unavailable or zero, fallback to window.screen.width
          if (!physicalWidth || physicalWidth <= 0) {
            physicalWidth = screenDim.width || 390;
          }
        }

        // Apply real physical screen width when smartphone view is forced
        const isForcedMobile =
          viewMode === "smartphone" ||
          (isSmartphoneView && screenDim && screenDim.width < 768 && window.innerWidth >= 768);

        if (isForcedMobile) {
          metaViewport.setAttribute(
            "content",
            `width=${physicalWidth}, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover`
          );
        } else {
          // Restore default responsive viewport for desktop / standard auto mode
          metaViewport.setAttribute(
            "content",
            "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover"
          );
        }
      } catch (err) {
        console.warn("[ViewMode] Could not adjust meta viewport:", err);
      }
    };

    const handleResizeOrOrientation = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyViewportScaling, 150);
    };

    applyViewportScaling();

    window.addEventListener("resize", handleResizeOrOrientation);
    window.addEventListener("orientationchange", handleResizeOrOrientation);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("resize", handleResizeOrOrientation);
      window.removeEventListener("orientationchange", handleResizeOrOrientation);
    };
  }, [isSmartphoneView, viewMode]);

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

