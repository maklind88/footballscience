const cacheName = "fs-desktop-hosted-shell-v3";
const shellAssets = ["/", "/index.html", "/styles.css", "/app.js", "/shared/desktop-bridge-contract.mjs", "/payload.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shellAssets)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(cacheName);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true }) || (request.mode === "navigate" ? await caches.match("/index.html") : null);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("X-FS-Spike-Source", "cache");
        return new Response(await cached.arrayBuffer(), {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});
