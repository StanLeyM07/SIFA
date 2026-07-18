// App-shell service worker for Sifa.
//
// Bump CACHE_VERSION on any release that changes cached behaviour — the
// activate handler deletes every cache that doesn't match, which is what lets
// a deploy actually reach people who already have the app open.
const CACHE_VERSION = "v2";
const CACHE = `sifa-shell-${CACHE_VERSION}`;

// Only genuinely static things belong here. Routes are server-rendered and
// handled network-first below, so precaching them just risks serving a stale
// shell after a deploy.
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

/**
 * Built assets are content-hashed, so a given URL's contents never change and
 * cache-first is safe. Anything else — dev modules, HTML, API calls — must go
 * to the network first, or a release silently never lands.
 */
function isImmutableAsset(url) {
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(url.pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Never cache API traffic — the coach and health endpoints must be live.
  if (url.pathname.startsWith("/api/")) return;

  // Vite dev serves unhashed module URLs; caching those pins the app to an old
  // build until storage is manually cleared.
  if (url.search.includes("v=") || url.search.includes("t=") || url.pathname.startsWith("/@")) {
    return;
  }

  // Network-first for HTML navigations, cache as a offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches
            .open(CACHE)
            .then((c) => c.put(req, clone))
            .catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(req, clone))
              .catch(() => {});
          }
          return res;
        });
      }),
    );
    return;
  }

  // Everything else: network, falling back to cache only when offline.
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
