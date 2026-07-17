import "./globals.css";

export const metadata = {
  title: "Portal IES Gregorio Prieto",
  description: "Portal digital de gestión del IES Gregorio Prieto - Valdepeñas",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IES Prieto",
  },
};

export const viewport = {
  themeColor: "#1e3a5f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" className="h-full antialiased">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="IES Prieto" />
        <meta name="theme-color" content="#1e3a5f" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}

        {/* Banner de nueva versión */}
        <div id="sw-update-banner" style={{
          position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, backgroundColor: '#1e3a5f', color: 'white',
          padding: '12px 20px', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'none', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: 600,
          maxWidth: '90vw',
        }}>
          <span>🔄 Nueva versión disponible</span>
          <button id="sw-update-btn" style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            backgroundColor: '#22c55e', color: 'white', fontWeight: 700,
            cursor: 'pointer', fontSize: 13,
          }}>Actualizar</button>
        </div>

        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              if (!('serviceWorker' in navigator)) return;
              let refreshing = false;
              navigator.serviceWorker.addEventListener('controllerchange', function() {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
              });
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(reg) {
                  function checkForUpdate() { reg.update().catch(function(){}); }
                  setInterval(checkForUpdate, 60000);
                  window.addEventListener('focus', checkForUpdate);
                  reg.addEventListener('updatefound', function() {
                    var newWorker = reg.installing;
                    if (!newWorker) return;
                    newWorker.addEventListener('statechange', function() {
                      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        var banner = document.getElementById('sw-update-banner');
                        var btn = document.getElementById('sw-update-btn');
                        if (banner) banner.style.display = 'flex';
                        if (btn) btn.onclick = function() {
                          newWorker.postMessage({ type: 'SKIP_WAITING' });
                        };
                      }
                    });
                  });
                }).catch(function(err) { console.log('SW error:', err); });
              });
            })();
          `
        }} />
      </body>
    </html>
  );
}
