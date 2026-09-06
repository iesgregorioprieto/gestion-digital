'use client';
export const dynamic = 'force-dynamic';

/**
 * TABLERO DE PARTICIPACIÓN
 *
 * Para proyectar en la sala mientras se vota. Los nombres se van
 * poniendo en verde según cada uno vota, para que nadie se quede sin
 * hacerlo por despiste.
 *
 * Lo que NO se ve aquí, y es a propósito: el recuento. Si se viera a la
 * vez que alguien cambia de color, se podría atar el nombre con el voto
 * y el secreto se acabaría. Los resultados salen al cerrar la votación,
 * en la pantalla de gestión.
 *
 * Quien no ha votado aparece en gris, igual que empezaron todos. No se
 * le marca en rojo ni se le saca en una lista aparte: se ve quién falta
 * si se mira, pero no se señala a nadie.
 */

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';
const AZUL = '#1e3a5f';

export default function TableroVotacion() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [id, setId] = useState(null);

  useEffect(() => {
    const p = new URL(window.location.href).searchParams.get('id');
    if (!p) { setError('Falta la votación'); return; }
    setId(p);
  }, []);

  useEffect(() => {
    if (!id) return;
    let vivo = true;

    async function cargar() {
      try {
        const r = await fetch(`/api/votaciones?modo=tablero&id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (!vivo) return;
        if (d.error) { setError(d.error); return; }
        setDatos(d);
      } catch {
        // Un fallo de red puntual no debe vaciar la pantalla proyectada:
        // se queda lo último que se vio y se reintenta.
      }
    }

    cargar();
    const t = setInterval(cargar, 4000);
    return () => { vivo = false; clearInterval(t); };
  }, [id]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f0f4f0', color: '#991b1b', fontSize: 20, fontWeight: 700 }}>
        {error === 'sin_permisos' ? 'Esta pantalla es solo para el equipo directivo.' : error}
      </div>
    );
  }

  if (!datos) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f0f4f0', color: '#64748b', fontSize: 20 }}>
        Cargando…
      </div>
    );
  }

  const { personas, votados, total, pregunta, abierta } = datos;
  const faltan = total - votados;
  const porcentaje = total > 0 ? Math.round((votados / total) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', padding: '22px 26px' }}>

      {/* Cabecera: la pregunta y cuánto falta */}
      <div style={{ backgroundColor: 'white', borderRadius: 14, padding: '18px 24px', marginBottom: 18,
        boxShadow: '0 2px 10px rgba(0,0,0,0.07)', borderLeft: `6px solid ${VERDE}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: 0.4, marginBottom: 4 }}>
          {abierta ? '🗳️ VOTACIÓN ABIERTA' : '🔒 VOTACIÓN CERRADA'}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: AZUL, lineHeight: 1.25 }}>{pregunta}</div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: VERDE }}>{votados}<span style={{ fontSize: 20, color: '#94a3b8' }}> / {total}</span></div>
          <div style={{ fontSize: 17, color: '#475569' }}>
            {faltan === 0 ? 'Han votado todos' : `faltan ${faltan}`}
          </div>
        </div>

        <div style={{ marginTop: 10, height: 12, borderRadius: 6, backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ width: `${porcentaje}%`, height: '100%', backgroundColor: VERDE, transition: 'width .6s ease' }} />
        </div>
      </div>

      {/* Los nombres */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 9 }}>
        {personas.map(p => (
          <div key={p.id} style={{
            padding: '13px 15px', borderRadius: 10, fontSize: 16.5,
            fontWeight: p.votado ? 800 : 500,
            backgroundColor: p.votado ? '#dcfce7' : 'white',
            color: p.votado ? '#14532d' : '#94a3b8',
            border: `2px solid ${p.votado ? '#86efac' : '#e2e8f0'}`,
            transition: 'background-color .5s ease, color .5s ease, border-color .5s ease',
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <span style={{ fontSize: 15 }}>{p.votado ? '✅' : '⬜'}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</span>
          </div>
        ))}
      </div>

      {personas.length === 0 && (
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 26, textAlign: 'center', color: '#64748b', fontSize: 16 }}>
          Todavía no ha pasado lista nadie en esta reunión.
        </div>
      )}

      <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
        El recuento no se muestra aquí. Aparece al cerrarse la votación, en la pantalla de gestión.
      </div>
    </div>
  );
}
