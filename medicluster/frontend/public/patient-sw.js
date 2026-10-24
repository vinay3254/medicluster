/* Only public application shell/static assets. Authenticated requests never enter caches. */
const CACHE = 'medicluster-patient-shell-v1';
const SHELL = '/app';
const isAsset = url => url.origin === self.location.origin && /^\/assets\/[^?]+\.(?:js|css|woff2?|png|svg|webp|jpg|jpeg|ico)$/.test(url.pathname);

async function cacheShell() {
  const response = await fetch(SHELL, { credentials: 'omit', cache: 'reload' });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
  const cache = await caches.open(CACHE);
  await cache.put(SHELL, response.clone());
  const html = await response.text();
  const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(match => new URL(match[1], self.location.origin)).filter(isAsset);
  await Promise.all(assets.map(async url => {
    try {
      const asset = await fetch(url, { credentials: 'omit' });
      if (asset.ok) await cache.put(url.href, asset);
    } catch { /* Shell remains usable if an optional asset cannot be warmed. */ }
  }));
}
// Initial lazy bundles may load before this worker controls the page.
self.addEventListener('message', event => {
  if (event.data?.type !== 'PATIENT_CACHE_ASSETS' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(event.data.urls.slice(0, 64).map(async value => {
      try {
        const url = new URL(value, self.location.origin);
        if (!isAsset(url) || url.search || url.hash) return;
        const response = await fetch(url, { credentials: 'omit' });
        if (response.ok) await cache.put(url.href, response);
      } catch { /* Cached metadata remains available even if an asset cannot be warmed. */ }
    }));
  })());
});
self.addEventListener('install', event => { event.waitUntil(cacheShell().then(() => self.skipWaiting())); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('medicluster-patient-shell-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization') || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) {
    // Callback credentials in query strings must never be cached.
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && !url.search && response.headers.get('content-type')?.includes('text/html')) {
          const cache = await caches.open(CACHE);
          await cache.put(SHELL, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(SHELL)) || new Response('Connect to the internet to load MediCluster for the first time.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
  } else if (isAsset(url) && !url.search) {
    event.respondWith((async () => {
      // Public immutable assets do not vary by credentials or caller Origin.
      const cached = await caches.match(request, { ignoreVary: true });
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) { const cache = await caches.open(CACHE); await cache.put(request, response.clone()); }
      return response;
    })());
  }
});
