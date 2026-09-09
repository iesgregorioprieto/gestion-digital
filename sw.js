// Service Worker - Network-first + auto-actualización automática en cada deploy
// Este timestamp cambia con cada build, forzando al navegador a reinstalar
const SW_VERSION = '20260909-0905';

self.addEventListener('install', function(event) {
  console.log('[SW] Instalando ' + SW_VERSION);
  // skipWaiting: activa el nuevo SW inmediatamente sin esperar
  // a que se cierren las pestañas con la versión anterior
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activado ' + SW_VERSION);
  event.waitUntil(
    Promise.all([
      // Tomar el control de todas las pestañas abiertas
      self.clients.claim(),
      // Vaciar todos los caches — no cacheamos nada, pero por si acaso
      caches.keys().then(function(cacheNames) {
        return Promise.all(cacheNames.map(function(name) {
          console.log('[SW] Borrando cache:', name);
          return caches.delete(name);
        }));
      }),
    ])
  );
  // Avisar a todas las pestañas abiertas para que recarguen
  self.clients.matchAll({ type: 'window' }).then(function(clients) {
    clients.forEach(function(client) {
      client.postMessage({ tipo: 'sw_actualizado', version: SW_VERSION });
    });
  });
});

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Sin caché: siempre red. La app necesita datos en tiempo real.
  event.respondWith(
    fetch(event.request, { cache: 'no-store' }).catch(function() {
      return new Response('Sin conexión', { status: 503 });
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
