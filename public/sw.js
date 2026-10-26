/* Only static branding and the offline screen are cached. Payment and sign-in
   requests always go to the network; receipt claims are never queued. */
const CACHE = "lipa-verify-static-v1";
const STATIC_ASSETS = [
  ["/offline.html", "text/html"],
  ["/favicon.svg", "image/svg+xml"],
  ["/icons/icon-192.png", "image/png"],
  ["/icons/icon-512.png", "image/png"],
  ["/icons/icon-maskable-512.png", "image/png"],
  ["/icons/apple-touch-icon.png", "image/png"],
];
const STATIC_PATHS = new Set(STATIC_ASSETS.map(([path]) => path));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const [path, contentType] of STATIC_ASSETS) {
      const response = await fetch(new Request(path, { cache: "reload", credentials: "same-origin" }));
      // Never store a login page returned instead of an asset by the private gate.
      if (!response.ok || response.redirected || !response.headers.get("Content-Type")?.includes(contentType)) {
        throw new Error("The static app assets are not available.");
      }
      await cache.put(path, response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("lipa-verify-static-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || ["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch {
        const cache = await caches.open(CACHE);
        return await cache.match("/offline.html") || new Response("You’re offline. Reconnect to open LipaVerify.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    })());
  } else if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return await cache.match(url.pathname) || fetch(request);
    })());
  }
});
