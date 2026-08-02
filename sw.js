// CLOSD Service Worker — PWA offline support
// Auto-versioning based on build date to avoid manual bump
const CACHE_VERSION = 'closd-' + new Date().toISOString().split('T')[0];
const FILES = ['index.html', 'manifest.json', 'admin.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(FILES).catch(err => {
        console.warn('[SW] cache addAll failed:', err.message);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('closd-') && k !== CACHE_VERSION).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Skip non-GET requests and chrome-extension requests
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('chrome-extension://')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(err => {
        console.warn('[SW] fetch failed, serving cache:', err.message);
        return cached;
      });
      return cached || fetched;
    })
  );
});
