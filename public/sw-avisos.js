/*
 * AVISOS AL MÓVIL. ESTE COMPONENTE SOLO HACE ESO.
 *
 * Las notificaciones push necesitan un service worker: sin él no hay
 * dónde recibirlas. El del 22/09 (/sw.js) se desinstala solo, porque el
 * anterior interceptaba las peticiones y con la wifi del centro dejaba la
 * aplicación sin cargar. Pero al quitarlo se fueron también los avisos:
 * desde entonces «Activar ahora» se quedaba esperando para siempre y no
 * llegaba ninguna notificación de guardias, DLD ni convocatorias.
 *
 * Este no intercepta NINGUNA petición ni guarda nada en caché: no tiene
 * manejador de 'fetch'. La aplicación sigue funcionando como una web
 * normal, y aquí solo se reciben los avisos y se abre la pantalla que
 * toca al pulsarlos. Va con otro nombre para que el /sw.js que se
 * desinstala solo no se lo lleve por delante.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('push', event => {
  let datos = { titulo: 'IES Gregorio Prieto', cuerpo: 'Tienes un aviso nuevo', url: '/profesor' };

  if (event.data) {
    try {
      datos = { ...datos, ...event.data.json() };
    } catch (e) {
      datos.cuerpo = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body:  datos.cuerpo,
      icon:  '/icon-192x192.png',
      badge: '/icon-96x96.png',
      tag:   datos.tag || 'aviso-ies',
      renotify: true,
      vibrate: [200, 100, 200],
      data:  { url: datos.url || '/profesor' },
    })
  );
});

// Al pulsar el aviso: se abre la aplicación en la pantalla que toca, o se
// trae al frente la que ya estuviera abierta.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/profesor';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
      for (const cliente of lista) {
        if ('focus' in cliente) {
          if ('navigate' in cliente) cliente.navigate(destino).catch(() => {});
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(destino);
    })
  );
});
