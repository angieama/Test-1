// Cache only this fictional demo's app shell. API/auth traffic is never intercepted.
const CACHE_NAME = 'lipa-demo-shell-__CACHE_VERSION__';
const PRECACHE = __PRECACHE__;
const APP_MARKER = '<meta name="lipa-app" content="demo"';
const ASSETS = new Set(PRECACHE.filter(path => path !== '/'));

async function isDemoShell(response) {
  return response.ok && !response.redirected && (response.headers.get('content-type') || '').includes('text/html') && (await response.clone().text()).includes(APP_MARKER);
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of PRECACHE) {
      const response = await fetch(new Request(path, { cache: 'reload', credentials: 'same-origin', redirect: 'error' }));
      if (!response.ok || (path === '/' && !(await isDemoShell(response)))) throw new Error('Demo shell could not be cached');
      await cache.put(path, response);
    }
    // First install activates automatically; updates wait until open windows close.
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('lipa-demo-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // Return auth failures/redirects as-is. Only a genuine network failure uses the offline shell.
        if (await isDemoShell(response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match('/', { cacheName: CACHE_NAME });
        return cached || new Response('Connect to the internet to open LipaVerify for the first time.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }
  if (ASSETS.has(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(url.pathname, { cacheName: CACHE_NAME });
      return cached || fetch(request);
    })());
  }
});
