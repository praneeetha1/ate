const CACHE = "ate-v8";   // v8: coloured doodles; redrawn ones replace their old files
const STATIC = [
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.png",
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

  // Never cache HTML or JS/CSS — always network-first so Vite asset hashes stay fresh.
  // The root comes from the scope, so this works under /ate/ and under /.
  const root = new URL(self.registration.scope).pathname;
  // The page itself also skips the HTTP cache (GitHub Pages says max-age=600),
  // so a home-screen app picks up a new deploy on its next launch instead of
  // up to ten minutes later. JS/CSS names are hashed, so they can't go stale.
  const isPage = url.pathname === root || url.pathname === root + "index.html";
  if (isPage || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    e.respondWith(
      fetch(e.request, isPage ? { cache: "no-cache" } : undefined).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for icons/images only
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
