// Service Worker v3 - Network-first + auto-actualización agresiva
// VERSION: 20260719-agresivo
const SW_VERSION = 'v3-2026-07-19';

self.addEventListener('install', function(event) {
  console.log('[SW] Instalando ' + SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activando ' + SW_VERSION);
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Borrar TODOS los caches viejos
      caches.keys().then(function(cacheNames) {
        return Promise.all(cacheNames.map(function(name) {
          console.log('[SW] Borrando cache:', name);
          return caches.delete(name);
        }));
      })
    ])
  );
});

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);
  
  // Solo interceptar requests del mismo origen
  if (url.origin !== self.location.origin) return;
  
  // No cachear NADA - siempre red directa
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(function() {
      return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
