"use client";

import { useEffect, useState } from "react";

/**
 * DIAGNOSTIC INDICATOR
 * Shows whether the current page load is a full browser reload (❌) or a
 * continued SPA session (✅). This directly answers "does navigation reload?".
 *
 * Access via the "Debug" link in settings or by adding ?debug=1 to any URL.
 * Remove after diagnosing.
 */
export function NavDiagnostic() {
  const [show, setShow] = useState(false);
  const [info, setInfo] = useState<{
    isReload: boolean;
    sessionAge: number;
    navigations: number;
  } | null>(null);

  useEffect(() => {
    const debug = new URLSearchParams(window.location.search).has("debug");
    
    // Defer the synchronous state update to avoid cascading render warning
    const t = setTimeout(() => {
      setShow(debug);
    }, 0);

    if (!debug) {
      return () => clearTimeout(t);
    }

    const update = () => {
      const nav = performance.getEntriesByType(
        "navigation",
      )[0] as PerformanceNavigationTiming | undefined;
      const navCount = (performance as unknown as { navigation?: { redirectCount?: number } }).navigation;
      // entryType 'reload' or 'navigate' = full page load
      const isReload = nav
        ? nav.type === "reload" || nav.type === "navigate"
        : true;

      // session marker in sessionStorage
      const marker = "euskal-session-start";
      const existing = sessionStorage.getItem(marker);
      const now = Date.now();
      if (!existing) {
        sessionStorage.setItem(marker, String(now));
      }
      const sessionAge = existing ? Math.round((now - Number(existing)) / 1000) : 0;

      setInfo({
        isReload,
        sessionAge,
        navigations: performance.getEntriesByType("navigation").length,
      });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, []);

  if (!show || !info) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        background: info.isReload ? "#dc2626" : "#16a34a",
        color: "white",
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "monospace",
        boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        pointerEvents: "none",
      }}
    >
      {info.isReload ? "🔴 FULL RELOAD" : "🟢 SPA OK"}
      {"  | "}
      session: {info.sessionAge}s
    </div>
  );
}
