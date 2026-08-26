// Pixel Community Radar — Service Worker
// PixelProTech Solutions
//
// Cache strategy notes (fixed to stop stale deployments from sticking):
//  - App shell (HTML/JS/CSS, same-origin) is now NETWORK-FIRST. The browser
//    always tries to fetch the latest file first and only falls back to the
//    cached copy when offline. This means a new deployment is picked up on
//    the very next successful request, instead of silently serving whatever
//    was cached on first install (the old cache-first behaviour).
//  - Map tiles and third-party CDN assets stay cache-first / stale-while-
//    revalidate, since they're large, rarely change, and are needed for
//    offline map use.
//  - Bump CACHE_VERSION on each deploy as a belt-and-suspenders measure —
//    old caches are deleted on activate — but correctness no longer depends
//    on remembering to do this.

const CACHE_VERSION = "pcr-v1.1.0";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TILE_CACHE = `${CACHE_VERSION}-tiles`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./map.js",
  "./charts.js",
  "./storage.js",
  "./location.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("pcr-") && key !== STATIC_CACHE && key !== TILE_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isMapTile(url) {
  return url.hostname.includes("tile.openstreetmap.org") || url.hostname.includes("unpkg.com");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Map tiles + CDN libs: cache-first, long-lived, stale-while-revalidate
  if (isMapTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell + same-origin: NETWORK-FIRST so a new deployment is served as
  // soon as it's reachable, falling back to the cached copy only when the
  // network request fails (offline). This replaces the old cache-first
  // strategy, which was the root cause of new code never reaching returning
  // users unless CACHE_VERSION happened to be bumped.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // Everything else (other CDNs): network falling back to cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(TILE_CACHE).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
