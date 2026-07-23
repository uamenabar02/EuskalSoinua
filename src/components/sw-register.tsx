"use client";

import { useEffect } from "react";

/**
 * PWA Service Worker registration — with AGGRESSIVE cleanup.
 *
 * Previous versions registered a service worker with a fetch handler that
 * cached stale Next.js RSC payloads. That broke client-side <Link> navigation
 * and forced full page reloads (killing the <audio> element).
 *
 * On every page load this component:
 *   1. Unregisters ALL existing service workers (destroys any old buggy SW).
 *   2. Clears all caches.
 *   3. Registers the new navigation-safe SW (empty fetch handler).
 *
 * The new SW can never interfere with navigation, so this fix is permanent.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    (async () => {
      try {
        const swV = localStorage.getItem("euskalsoinua-sw-version");
        if (swV !== "7") {
          // Clean up old service workers and caches once
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));
          if ("caches" in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map((k) => caches.delete(k)));
          }
          localStorage.setItem("euskalsoinua-sw-version", "7");
        }
        await navigator.serviceWorker.register("/sw.js?v=7");
      } catch {
        /* registration failures are non-fatal */
      }
    })();
  }, []);

  return null;
}
