const CACHE = "ate-v5";
const STATIC = [
  "/ate/icons/icon-192.png",
  "/ate/icons/icon-512.png",
  "/ate/icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Never cache HTML or JS/CSS assets — always fetch fresh
  // This prevents stale Vite asset hashes causing white pages
  if (
    url.pathname === "/ate/" ||
    url.pathname === "/ate/index.html" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css")
  ) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first only for icons/images
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
