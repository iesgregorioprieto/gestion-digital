export const dynamic = 'force-dynamic';

export async function GET() {
  // La versión cambia en cada deploy de Vercel gracias al SHA del commit.
  // Esto hace que el navegador detecte el nuevo SW, lo instale y recargue
  // automáticamente todas las pestañas abiertas sin que el usuario haga nada.
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || '20260910-0647';

  const sw = [
    // ESTE COMPONENTE SE DESINSTALA A SÍ MISMO.
    //
    // La versión anterior interceptaba todas las peticiones del móvil y, si
    // la red fallaba un instante, devolvía el texto «Sin conexion» en lugar
    // de una pieza de la aplicación: la página no cargaba. Con la wifi del
    // centro le pasaba a la mitad de los teléfonos, y los profesores no
    // podían fichar.
    //
    // No basta con dejar de interceptar: cada móvil se quedaría con la
    // versión vieja instalada hasta vaya a saber cuándo. Así que en cuanto
    // este archivo llega al teléfono, borra las copias guardadas, se
    // desinstala y recarga las pantallas abiertas. A partir de ahí la
    // aplicación funciona como una web normal, sin nada intermedio que
    // pueda fallar, y esto no vuelve a instalarse.
    "self.addEventListener('install',function(){ self.skipWaiting(); });",
    "self.addEventListener('activate',function(e){",
    "  e.waitUntil((async function(){",
    "    try {",
    "      var ns = await caches.keys();",
    "      await Promise.all(ns.map(function(n){ return caches.delete(n); }));",
    "    } catch (err) {}",
    "    try { await self.registration.unregister(); } catch (err) {}",
    "    try {",
    "      var cs = await self.clients.matchAll({type:'window'});",
    "      cs.forEach(function(c){ c.navigate(c.url); });",
    "    } catch (err) {}",
    "  })());",
    "});",
].join('\n');

  return new Response(sw, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
