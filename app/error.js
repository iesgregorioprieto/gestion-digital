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
  const esVieja = esVersionVieja(error);

  useEffect(() => {
    if (!esVieja) return;
    try {
      if (sessionStorage.getItem('recargada_por_version')) return;
      sessionStorage.setItem('recargada_por_version', '1');
    } catch {}
    window.location.reload();
  }, [esVieja]);

  const recargar = () => {
    try { sessionStorage.removeItem('recargada_por_version'); } catch {}
    window.location.reload();
  };

  const detalle = `${error?.name || 'Error'}: ${error?.message || 'sin detalle'}`;

  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>{esVieja ? '🔄' : '⚠️'}</div>

        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f', marginBottom: 8 }}>
          {esVieja ? 'Hay una versión nueva de la aplicación' : 'Esta pantalla no ha podido abrirse'}
        </div>

        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 18 }}>
          {esVieja
            ? 'Pulsa el botón para cargarla. Si vuelve a aparecer, cierra la aplicación del todo y ábrela otra vez.'
            : 'Prueba a cargarla de nuevo. Si vuelve a fallar, manda una foto de esta pantalla con el detalle desplegado: así se puede arreglar.'}
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

        {/* El detalle técnico, para poder diagnosticar. Antes esta pantalla
            decía «hay una versión nueva» pasara lo que pasara, y disfrazaba
            los fallos de verdad: no había forma de saber qué estaba
            rompiéndose. */}
        {!esVieja && (
          <details style={{ marginTop: 20, textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#64748b' }}>
              Ver el detalle técnico
            </summary>
            <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 8,
              backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
              fontSize: 11.5, color: '#334155', fontFamily: 'monospace',
              wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
              {detalle}
              {error?.digest ? `\n\nReferencia: ${error.digest}` : ''}
              {`\n\nPágina: ${typeof window !== 'undefined' ? window.location.pathname : ''}`}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
