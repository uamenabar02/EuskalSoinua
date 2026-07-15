/**
 * EuskalSoinua Service Worker (v5 — NAVIGATION-SAFE)
 * ----------------------------------------------------------------------------
 * This SW is deliberately MINIMAL. It exists only so the app is installable
 * as a PWA. It NEVER calls event.respondWith() — meaning it NEVER intercepts
 * or modifies ANY request. Navigation, RSC payloads, API calls, and audio
 * streams all pass through the browser's normal handling as if no SW existed.
 *
 * Previous versions (v1-v4) had fetch handlers that cached stale RSC route
 * data, which broke Next.js client-side <Link> navigation and forced full page
 * reloads. This version eliminates that class of bug entirely.
 *
 * The activate handler also DESTROYS all old caches + old SWs so that a
 * previously-registered interfering SW is purged from the browser.
 */

self.addEventListener("install", (event) => {
  // Take over immediately — don't wait for old SWs to die.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1) Delete ALL old caches (v1-v4) so stale data can never resurface.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      // 2) Claim all open clients so this SW controls them right now.
      await self.clients.claim();
    })(),
  );
});

/**
 * Empty fetch handler. We register the listener (required for PWA
 * installability in some browsers) but NEVER call event.respondWith().
 * When respondWith is not called, the browser handles the request normally
 * through its default networking stack. This is the safest possible SW.
 */
self.addEventListener("fetch", () => {
  /* intentionally empty — never interfere */
});
