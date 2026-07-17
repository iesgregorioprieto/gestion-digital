// Service Worker con auto-actualización
// - Versión por timestamp: cada deploy genera un nuevo cache
// - HTML/rutas: network-first (siempre datos frescos)
// - Assets estáticos con hash: cache-first (son inmutables)
// - Supabase: nunca cachear (datos dinámicos)
// - Envía mensaje al cliente cuando hay nueva versión

const VERSION = 'v2026-07-17-r1';
const CACHE_NAME = `ies-prieto-${VERSION}`;

// Assets que siempre queremos cachear al instalar
const CORE_ASSETS = [
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ═════════════════════════════════════════════════════════════
// INSTALL — descarga los core assets
// ═════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())  // Activar nueva versión inmediatamente
  );
});

// ═════════════════════════════════════════════════════════════
// ACTIVATE — borra caches viejos y toma control
// ═════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())  // Tomar control de las páginas abiertas
      .then(() => {
        // Avisar a todas las páginas de que hay nueva versión
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: VERSION });
          });
        });
      })
  );
});

// ═════════════════════════════════════════════════════════════
// FETCH — estrategia según el tipo de recurso
// ═════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo GET
  if (request.method !== 'GET') return;

  // Nunca interceptar Supabase (datos dinámicos, auth, etc.)
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) return;

  // Solo interceptar peticiones del mismo origen
  if (url.origin !== self.location.origin) return;

  // Assets estáticos de Next.js (nombres con hash → inmutables) → cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Imágenes y fuentes → cache-first
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML, rutas de app, y todo lo demás → network-first
  // Así siempre tenemos datos frescos, y solo usamos cache si estamos offline
  event.respondWith(networkFirst(request));
});

// Estrategia network-first: intenta red, si falla usa cache
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    // Guardar en cache para uso offline (solo respuestas OK)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Como último recurso, devolver la home cacheada
    return caches.match('/') || new Response('Sin conexión', { status: 503 });
  }
}

// Estrategia cache-first: usa cache si existe, si no va a red
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 404 });
  }
}

// ═════════════════════════════════════════════════════════════
// MESSAGE — permite al cliente forzar skipWaiting
// ═════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
