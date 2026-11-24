const CACHE = "investing-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./lessons.js",
  "./manifest.json",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Harga live (CNBC) & API GitHub: jangan disentuh SW, biar selalu segar.
  if (url.hostname === "quote.cnbc.com" || url.hostname === "api.github.com") return;
  const isData = url.pathname.includes("/data/") || url.hostname === "raw.githubusercontent.com";
  if (url.origin !== location.origin && !isData) return;
  event.respondWith(
    (async () => {
      if (isData) {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const copy = res.clone();
            const cache = await caches.open(CACHE);
            cache.put(req, copy);
          }
          return res;
        } catch (err) {
          const cached = await caches.match(req);
          if (cached) return cached;
          throw err;
        }
      }
      const cached = await caches.match(req);
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })()
  );
});
