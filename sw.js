const CACHE = "ate-v4";
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

  // Never cache index.html — always fetch fresh so asset hashes stay in sync
  if (url.pathname === "/ate/" || url.pathname === "/ate/index.html") {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for static assets (icons, fonts)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
