/**
 * EuskalSoinua Service Worker (v7 — Dynamic Offline Cache-First/Network-First)
 * ----------------------------------------------------------------------------
 * Tailored for Next.js 15 App Router:
 * - STATIC ASSETS (_next/static, css, js, fonts, icons): Cached with Cache-First.
 * - DOCUMENTS (navigate) & RSC payloads: Cached with Network-First, with offline fallback.
 *   If completely offline, any navigate request falls back to "/" or "/library/downloaded".
 * - MEDIA STREAMS: Never intercepted or cached here (handled via client-side IDB blob URLs).
 */

const CACHE_VERSION = "v7";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

// Pre-cache key pages and manifest to act as the offline shell
const PRECACHE_ASSETS = [
  "/",
  "/library",
  "/library/liked",
  "/library/downloaded",
  "/settings",
  "/search",
  "/radio",
  "/taste",
  "/manifest.json",
  "/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Skip non-GET requests and browser extensions
  if (event.request.method !== "GET" || !url.protocol.startsWith("http")) {
    return;
  }

  // 2. Skip streaming media proxy and WebSockets completely
  if (
    url.pathname.includes("/api/stream") || 
    url.pathname.includes("/api/radio-stream") || 
    url.pathname.includes("/ws") || 
    url.pathname.includes("/socket")
  ) {
    return;
  }

  // 3. Static Assets (Cache-First)
  const isStaticAsset = 
    url.pathname.startsWith("/_next/static/") || 
    url.pathname.endsWith(".js") || 
    url.pathname.endsWith(".css") || 
    url.pathname.endsWith(".svg") || 
    url.pathname.endsWith(".png") || 
    url.pathname.endsWith(".woff2") || 
    url.host.includes("fonts.googleapis.com") || 
    url.host.includes("fonts.gstatic.com");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          return null;
        });
      })
    );
    return;
  }

  // 4. Document Navigations (mode: navigate) and RSC Requests
  const isNavigate = event.request.mode === "navigate";
  const isRsc = url.searchParams.has("_rsc") || event.request.headers.get("RSC") === "1";

  if (isNavigate || isRsc) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Completely offline
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }

          // If it's a page navigation request, return the cached root "/" HTML shell
          if (isNavigate) {
            const rootShell = await caches.match("/");
            if (rootShell) return rootShell;
            const downloadedShell = await caches.match("/library/downloaded");
            if (downloadedShell) return downloadedShell;
          }

          return new Response("Offline", { status: 503, statusText: "Offline" });
        })
    );
    return;
  }

  // 5. Default/APIs (Network-First with dynamic caching for select safe endpoints)
  const isApi = url.pathname.startsWith("/api/");
  const isCacheableApi = isApi && 
    !url.pathname.includes("/api/play") && 
    !url.pathname.includes("/api/feedback");

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && isCacheableApi) {
          const responseToCache = networkResponse.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        });
      })
  );
});
