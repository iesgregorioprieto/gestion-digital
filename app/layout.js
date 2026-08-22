import "./globals.css";

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

        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              if (!('serviceWorker' in navigator)) return;
              
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(reg) {
                  function check() { reg.update().catch(function(){}); }
                  setInterval(check, 30000);
                  window.addEventListener('focus', check);
                  document.addEventListener('visibilitychange', function() {
                    if (!document.hidden) check();
                  });
                }).catch(function() {});
              });
              
              let reloaded = false;
              navigator.serviceWorker.addEventListener('controllerchange', function() {
                if (reloaded) return;
                reloaded = true;
                window.location.reload();
              });
            })();
          `
        }} />
      </body>
    </html>
  );
}
