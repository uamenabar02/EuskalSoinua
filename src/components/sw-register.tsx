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
    if (process.env.NODE_ENV !== "production") return;

    (async () => {
      try {
        // 1) Destroy ALL existing service workers (old versions with
        //    interfering fetch handlers).
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));

        // 2) Clear all caches left by old SWs.
        if ("caches" in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((k) => caches.delete(k)));
        }

        // 3) Register the new safe SW (empty fetch handler — never interferes).
        //    Cache-busting query param forces the browser to fetch the new file.
        await navigator.serviceWorker.register("/sw.js?v=5");
      } catch {
        /* registration failures are non-fatal */
      }
    })();
  }, []);

  return null;
}
