const CACHE = "ate-v6";
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
  // Only handle GET requests — let POST/PUT/DELETE pass through untouched
  // (Supabase API calls are non-GET and must never be intercepted)
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);

  // Only handle same-origin requests (don't intercept Supabase API)
  if (url.origin !== self.location.origin) return;

  // Never cache HTML or JS/CSS — always network-first so Vite asset hashes stay fresh
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

  // Cache-first for icons/images only
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
