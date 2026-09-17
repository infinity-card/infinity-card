const CACHE_NAME = "infinity-card-shell-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(new Request(request, { cache: "no-store" }));
    if (fresh.ok) await cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate" || request.destination === "document";
  const isClientData = /\/clients\/[^/]+\.json$/.test(url.pathname);
  const isClientAsset = /\/assets\/clients\//.test(url.pathname);
  if (isNavigation || isClientData || isClientAsset) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.destination === "script" || request.destination === "style" || request.destination === "image") {
    event.respondWith(cacheFirst(request));
  }
});
