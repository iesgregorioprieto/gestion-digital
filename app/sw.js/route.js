export const dynamic = 'force-dynamic';

export async function GET() {
  // La versión cambia en cada deploy de Vercel gracias al SHA del commit.
  // Esto hace que el navegador detecte el nuevo SW, lo instale y recargue
  // automáticamente todas las pestañas abiertas sin que el usuario haga nada.
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || '20260910-0647';

  const sw = [
    "const SW_VERSION='" + version + "';",
    "self.addEventListener('install',function(e){",
    "  console.log('[SW] ' + SW_VERSION);",
    "  self.skipWaiting();",
    "});",
    "self.addEventListener('activate',function(e){",
    "  e.waitUntil(Promise.all([",
    "    self.clients.claim(),",
    "    caches.keys().then(function(ns){",
    "      return Promise.all(ns.map(function(n){ return caches.delete(n); }));",
    "    })",
    "  ]));",
    "});",
    // SIN manejador de peticiones, a propósito.
    //
    // Antes interceptaba TODAS las peticiones del móvil y las volvía a pedir
    // prohibiendo usar la copia. Con un corte de red de un instante, en vez
    // de la pieza de la aplicación devolvía el texto «Sin conexion», el
    // móvil intentaba ejecutarlo como código y la página no cargaba: pasaba
    // en la mitad de los teléfonos con la wifi del centro. Además obligaba a
    // descargar la aplicación entera en cada visita, que es gasto de
    // peticiones de Vercel.
    //
    // Sin interceptar, el navegador usa su caché normal: las piezas de la
    // aplicación llevan su versión en el nombre, así que nunca se sirve una
    // vieja por error, y una vez descargadas no se vuelven a pedir.
    "self.addEventListener('message',function(e){",
    "  if(e.data==='skipWaiting')self.skipWaiting();",
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
