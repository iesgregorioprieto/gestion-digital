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
    "self.addEventListener('fetch',function(e){",
    "  var u=new URL(e.request.url);",
    "  if(u.origin!==self.location.origin)return;",
    "  e.respondWith(fetch(e.request,{cache:'no-store'}).catch(function(){",
    "    return new Response('Sin conexion',{status:503});",
    "  }));",
    "});",
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
