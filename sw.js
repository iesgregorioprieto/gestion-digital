// Service Worker con auto-actualización
// Estrategia: Network-first para HTML/JS, cache-first para assets estáticos
const CACHE_VERSION = 'ies-prieto-' + Date.now();

self.addEventListener('install', function(event) {
  // Instalar y activar inmediatamente sin esperar
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    Promise.all([
      // Tomar control de todas las pestañas abiertas inmediatamente
      self.clients.claim(),
      // Borrar caches antiguos
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.map(function(name) {
            return caches.delete(name);
          })
        );
      })
    ])
  );
});

self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);
  
  // Solo interceptar requests del mismo origen
  if (url.origin !== self.location.origin) return;
  
  // Estrategia network-first: siempre intentar red primero
  event.respondWith(
    fetch(event.request).then(function(response) {
      return response;
    }).catch(function() {
      // Solo si NO hay red, servir desde caché
      return caches.match(event.request).then(function(cached) {
        return cached || caches.match('./index.html');
      });
    })
  );
});

// Escuchar mensajes para forzar update desde el cliente
self.addEventListener('message', function(event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
