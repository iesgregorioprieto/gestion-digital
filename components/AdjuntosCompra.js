'use client';

import { useState } from 'react';

/**
 * ALBARÁN Y FACTURA DE UNA COMPRA (#216, parte 3)
 *
 * Dos documentos distintos, cada uno en su sitio: el albarán (lo que se
 * entregó) y la factura (lo que hay que pagar). Se puede tener uno, otro
 * o los dos. Si `puedeAdjuntar`, se pueden añadir o cambiar después de
 * enviar la petición, por ejemplo cuando la factura llega más tarde.
 */

const DOCS = [
  { campo: 'albaran_url', carpeta: 'albaranes', emoji: '🧾', nombre: 'Albarán', bg: '#fffbeb', borde: '#fcd34d', color: '#92400e' },
  { campo: 'factura_url', carpeta: 'facturas',  emoji: '📄', nombre: 'Factura', bg: '#eff6ff', borde: '#93c5fd', color: '#1e40af' },
];

export default function AdjuntosCompra({ compra, puedeAdjuntar = false, onCambio }) {
  const [subiendo, setSubiendo] = useState('');
  const [error, setError] = useState('');

  async function adjuntar(doc, archivo) {
    if (!archivo) return;
    setSubiendo(doc.campo);
    setError('');
    try {
      const fd = new FormData();
      fd.append('archivo', archivo);
      fd.append('carpeta', doc.carpeta);
      fd.append('bucket', 'compras-docs');
      const r = await fetch('/api/documento', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'no se pudo subir el archivo');

      const r2 = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: 'compras', accion: 'adjuntar', id: compra.id, datos: { campo: doc.campo, url: d.url } }),
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(d2.error || 'no se pudo guardar');
      onCambio && onCambio(doc.campo, d.url);
    } catch (e) {
      setError(`❌ ${doc.nombre}: ${e.message}`);
    }
    setSubiendo('');
  }

  const visibles = DOCS.filter(doc => compra[doc.campo] || puedeAdjuntar);
  if (!visibles.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visibles.map(doc => {
          const url = compra[doc.campo];
          return (
            <div key={doc.campo} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', backgroundColor: doc.bg, border: `1.5px solid ${doc.borde}`, borderRadius: 7, color: doc.color, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                  {doc.emoji} Ver {doc.nombre.toLowerCase()}
                </a>
              ) : null}
              {puedeAdjuntar && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: `1.5px dashed ${doc.borde}`, backgroundColor: 'white', color: doc.color, fontSize: 12, fontWeight: 600, cursor: subiendo ? 'wait' : 'pointer', opacity: subiendo && subiendo !== doc.campo ? 0.5 : 1 }}>
                  {subiendo === doc.campo ? '⏳ Subiendo...' : url ? `📎 Cambiar ${doc.nombre.toLowerCase()}` : `📎 Añadir ${doc.nombre.toLowerCase()}`}
                  <input type="file" accept="image/*,application/pdf" disabled={!!subiendo}
                    onChange={e => { const f = e.target.files[0]; e.target.value = ''; adjuntar(doc, f); }}
                    style={{ display: 'none' }} />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {error && <div style={{ marginTop: 6, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>{error}</div>}
    </div>
  );
}

/** ¿Le falta la factura? Solo importa cuando ya se ha comprado. */
export function faltaFactura(c) {
  return !c.factura_url && (c.tipo === 'ya_comprado' || c.estado === 'comprado') && c.estado !== 'rechazada';
}
