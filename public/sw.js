const C = 'an-idea-v1';
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(['/', '/manifest.json', '/icons/icon-192.png']))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { caches.open(C).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
