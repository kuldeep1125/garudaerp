// BizHub service worker: enables PWA install. Network-first for everything;
// offline fallback ONLY for hashed static assets + icons — HTML is never
// served from cache so a stale/broken shell can never mask a live app.
// v2: purge pre-v1 caches (which may hold stale HTML from interrupted builds).
const CACHE = "bizhub-static-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(["/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"])
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const isCacheableAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  url.pathname === "/manifest.webmanifest" ||
  url.pathname === "/logo.svg";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  // HTML navigations always go to the network — no cache fallback for them.
  if (!isCacheableAsset(url)) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || Response.error()))
  );
});
