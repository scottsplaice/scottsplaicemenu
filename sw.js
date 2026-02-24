/* Offline cache */
const CACHE = "scotts-menu-" + self.__CACHE_VERSION__;
const CORE = [
  "./",
  "./index.html",
  "./screen.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./utils.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith("scotts-menu-") && k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    try {
      const fresh = await fetch(req);
      if (req.method === "GET" && fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
