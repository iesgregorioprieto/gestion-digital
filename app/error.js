'use client';

/**
 * PANTALLA DE ERROR
 *
 * Sustituye al «This page couldn't load» en inglés que veían los
 * profesores en el móvil.
 *
 * El caso más frecuente no es un fallo de verdad: el móvil tenía
 * guardada una versión anterior de la aplicación y se ha subido una
 * nueva, así que pide una pieza que ya no existe. Se nota en el mensaje
 * del error, y en ese caso la página se recarga sola una vez, que trae la
 * versión nueva, sin que el profesor tenga que hacer nada.
 *
 * Si no es eso, o si al recargar sigue fallando, se enseña un aviso claro
 * en castellano con un botón para reintentar, en vez de dejar a nadie
 * mirando un error sin saber qué hacer.
 */

import { useEffect } from 'react';

function esVersionVieja(error) {
  const t = `${error?.name || ''} ${error?.message || ''}`;
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Failed to fetch dynamically/i.test(t);
}

export default function Error({ error, reset }) {
  useEffect(() => {
    if (!esVersionVieja(error)) return;
    try {
      if (sessionStorage.getItem('recargada_por_version')) return;
      sessionStorage.setItem('recargada_por_version', '1');
    } catch {}
    window.location.reload();
  }, [error]);

  const recargar = () => {
    try { sessionStorage.removeItem('recargada_por_version'); } catch {}
    window.location.reload();
  };

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔄</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f', marginBottom: 8 }}>
          Hay una versión nueva de la aplicación
        </div>
        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
          Pulsa el botón para cargarla. Si vuelve a aparecer este aviso,
          cierra la aplicación del todo y ábrela otra vez.
        </div>
        <button onClick={recargar}
          style={{ padding: '12px 26px', borderRadius: 10, border: 'none',
            backgroundColor: '#166534', color: 'white', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
          Cargar de nuevo
        </button>
        <div style={{ marginTop: 14 }}>
          <button onClick={() => reset()}
            style={{ background: 'none', border: 'none', color: '#888', fontSize: 13,
              textDecoration: 'underline', cursor: 'pointer' }}>
            Reintentar sin recargar
          </button>
        </div>
      </div>
    </div>
  );
}
