import "./globals.css";
import AvisoComunicacion from "@/components/AvisoComunicacion";

export const metadata = {
  title: "APrieto · IES Gregorio Prieto",
  description: "Portal digital de gestión del IES Gregorio Prieto - Valdepeñas",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "APrieto",
  },
};

export const viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="APrieto" />
        <meta name="theme-color" content="#1e3a5f" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var z = localStorage.getItem('ies-tamano-letra');
                if (z && z !== '1') document.documentElement.style.zoom = z;
              } catch(e) {
                // Se ignora a propósito: esto corre antes de pintar la
                // página y si falla solo se ve el tamaño de letra normal.
                // Escribir en la consola aquí ensuciaría cada carga.
              }
            })();
          `
        }} />
        {children}
        <AvisoComunicacion />

        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              /*
               * RECUPERARSE SOLA DE UNA VERSIÓN VIEJA.
               *
               * Si el móvil tiene guardada una versión anterior de la
               * aplicación y se ha subido una nueva, al pedir una pieza que
               * ya no existe en el servidor sale «This page couldn't load».
               * Pasó una mañana: los profesores no pudieron entrar en sus
               * guardias ni fichar.
               *
               * Aquí se detecta ese fallo concreto y se recarga la página
               * una vez, que trae la versión nueva. Solo una: si al recargar
               * sigue fallando, no entra en un bucle; se queda en el error
               * para que se vea que hay otro problema.
               */
              function esVersionVieja(msg) {
                msg = String(msg || '');
                return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically/i.test(msg);
              }
              function recargarUnaVez() {
                try {
                  if (sessionStorage.getItem('recargada_por_version')) return;
                  sessionStorage.setItem('recargada_por_version', '1');
                } catch (e) {}
                window.location.reload();
              }
              window.addEventListener('error', function(e) {
                if (esVersionVieja(e && (e.message || (e.error && e.error.message)))) recargarUnaVez();
              }, true);
              window.addEventListener('unhandledrejection', function(e) {
                var r = e && e.reason;
                if (esVersionVieja(r && (r.message || r.name || r))) recargarUnaVez();
              });
              // La marca NO se borra sola: se recarga como mucho una vez en toda
              // la sesión. Si se borrara, un móvil con mala cobertura podría
              // recargar una y otra vez sin llegar a abrir nunca la página.

              if (!('serviceWorker' in navigator)) return;

              // Se desinstala cualquier componente que quede instalado de
              // antes y se borran sus copias. La aplicación pasa a ser una
              // web normal: el navegador gestiona la caché como en cualquier
              // otra página, y ya no hay nada que pueda devolver «Sin
              // conexion» en lugar de una pieza de la aplicación.
              //
              // Se hace en cada carga, sin coste: si no hay ninguno
              // instalado, no hace nada.
              navigator.serviceWorker.getRegistrations().then(function(rs) {
                rs.forEach(function(r) { r.unregister().catch(function(){}); });
              }).catch(function(){});

              if (window.caches && caches.keys) {
                caches.keys().then(function(ns) {
                  ns.forEach(function(n) { caches.delete(n).catch(function(){}); });
                }).catch(function(){});
              }
            })();
          `
        }} />
      </body>
    </html>
  );
}
