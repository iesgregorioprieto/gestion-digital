export const dynamic = 'force-dynamic';

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7) || String(Date.now());
  const sw = `const SW_VERSION='${version}';
self.addEventListener('install',function(e){console.log('[SW] '+SW_VERSION);self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(function(ns){return Promise.all(ns.map(function(n){return caches.delete(n);}));})]));}); 
self.addEventListener('fetch',function(e){const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;e.respondWith(fetch(e.request,{cache:'no-store'}).catch(function(){return new Response('Sin conexion',{status:503});}));});
self.addEventListener('message',function(e){if(e.data==='skipWaiting')self.skipWaiting();});`;
  return new Response(sw, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Service-Worker-Allowed': '/',
    },
  });
}
