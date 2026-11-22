// Offline-first service worker v0.8.19.3 CP18 A/B TEST. Avoid waiting for a blocked/throttled CDN.
// App shell and audio must be served from local CacheStorage after first install.
const CACHE_NAME = 'round-timer-shell-v0.8.20.17-final-graphite-ambient';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './styles.css?v=082017',
  './preview-variants-base.css',
  './preview-variants-base.css?v=082017',
  './preview-graphite.css',
  './preview-graphite.css?v=082017',
  './preview-graphite-v2.css',
  './preview-graphite-v2.css?v=082017',
  './preview-graphite-deck.css',
  './preview-graphite-deck.css?v=082017',
  './preview-graphite-main-082014.css',
  './preview-graphite-main-082014.css?v=082017',
  './preview-graphite-musicfix.css',
  './preview-graphite-musicfix.css?v=082017',
  './graphite-polish-082016.css',
  './graphite-polish-082016.css?v=082017',
  './app.mjs',
  './app.mjs?v=082017',
  './preview-variants-clock-fit.mjs',
  './preview-audio-prewarm.mjs',
  './preview-ambient-audio-session.mjs',
  './engine.mjs',
  './cp18-audio-window.mjs',
  './cp19-audio-modes.mjs',
  './cp19-wheel-picker.mjs',
  './cp19-clock-fit.mjs',
  './cp19-haptics.mjs',
  './cp19-keepalive.mjs',
  './cp19-audio-worklet.mjs',
  './cp19-worklet-host.mjs',
  './audio-clock-watchdog.mjs',
  './audio-guard.mjs',
  './html-audio.mjs',
  './web-audio-retire.mjs',
  './audio-duck.mjs',
  './diagnostics/sender.mjs',
  './diagnostics/schema.mjs',
  './manifest.webmanifest',
  './privacy.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './sounds/gong-start.mp3',
  './sounds/gong-end.mp3',
  './sounds/woodclack.mp3',
  './sounds/studio-gong-start.mp3',
  './sounds/studio-gong-end.mp3',
  './sounds/woodclack-single.mp3',
  './sounds/woodclack-double.mp3',
  './sounds/button.mp3',
  './sounds/cp19-wav/button.wav',
  './sounds/cp19-wav/studio-gong-start.wav',
  './sounds/cp19-wav/studio-gong-end.wav',
  './sounds/cp19-wav/woodclack-single.wav',
  './sounds/cp19-wav/woodclack-double.wav'
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
  // Navigations are network-first to avoid an old root page masquerading as /test-f.html.
  // Audio/modules remain cache-first for reliable offline sports timing.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (event.request.mode === 'navigate') {
      try {
        const fresh = await fetch(event.request, {cache:'no-store'});
        if (fresh.ok) {
          try { await cache.put(event.request, fresh.clone()); } catch (_) {}
          return fresh;
        }
      } catch (_) {}
      const exact = await cache.match(event.request, {ignoreSearch:true});
      if (exact) return exact;
      // Only a genuine root URL may use the root offline fallback.
      if (/\/(?:index\.html)?$/.test(url.pathname)) {
        const root = await cache.match('./');
        if (root) return root;
      }
      return new Response('Раунд таймер недоступен офлайн', {
        status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}
      });
    }
    const local = await cache.match(event.request);
    if (local) return local;
    try {
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});
