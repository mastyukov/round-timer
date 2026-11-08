// Offline-first service worker v0.8.3. Avoid waiting for a blocked/throttled CDN.
// App shell and audio must be served from local CacheStorage after first install.
const CACHE_NAME = 'round-timer-shell-v0.8.3';
const SHELL = [
  './', './index.html', './styles.css', './app.mjs', './engine.mjs',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './sounds/gong-start.mp3',
  './sounds/gong-end.mp3', './sounds/woodclack.mp3'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('round-timer-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Cache first even when navigator.onLine is true but the connection is stalled.
  // Never wait for the host for previously installed resources.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const local = await cache.match(event.request);
    if (local) return local;
    // Offline navigation fallback, including URLs with tracking query parameters.
    if (event.request.mode === 'navigate') {
      const offlinePage = await cache.match('./');
      if (offlinePage) return offlinePage;
    }
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});
