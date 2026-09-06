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

// Paleta de reserva, para opciones que no son sí/no/abstención
const PALETA = ['#2563eb', '#7c3aed', '#c2410c', '#0891b2', '#be123c', '#4d7c0f'];

/**
 * Color de cada opción. Las respuestas habituales llevan el color que
 * la gente ya espera; el resto tira de paleta por orden.
 */
function colorOpcion(opcion, indice) {
  const t = (opcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (t === 'si' || t.startsWith('si,') || t.startsWith('a favor') || t.startsWith('aprob')) return '#16a34a';
  if (t === 'no' || t.startsWith('no,') || t.startsWith('en contra') || t.startsWith('rechaz')) return '#dc2626';
  if (t.startsWith('absten') || t.startsWith('ns') || t.startsWith('no sabe') || t.startsWith('blanco')) return '#94a3b8';
  return PALETA[indice % PALETA.length];
}

/** Punto del borde del círculo para un ángulo dado */
function punto(cx, cy, r, grados) {
  const rad = (grados - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/**
 * Porción de la corona. Si una opción se lleva todos los votos no se
 * puede dibujar como arco (el principio y el final coinciden y no se
 * ve nada), así que en ese caso se pinta el círculo entero.
 */
function porcion(cx, cy, rExt, rInt, desde, hasta) {
  if (hasta - desde >= 359.999) {
    return `M ${cx} ${cy - rExt} A ${rExt} ${rExt} 0 1 1 ${cx - 0.01} ${cy - rExt} Z`
         + `M ${cx} ${cy - rInt} A ${rInt} ${rInt} 0 1 0 ${cx - 0.01} ${cy - rInt} Z`;
  }
  const [x1, y1] = punto(cx, cy, rExt, desde);
  const [x2, y2] = punto(cx, cy, rExt, hasta);
  const [x3, y3] = punto(cx, cy, rInt, hasta);
  const [x4, y4] = punto(cx, cy, rInt, desde);
  const grande = hasta - desde > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rExt} ${rExt} 0 ${grande} 1 ${x2} ${y2} `
       + `L ${x3} ${y3} A ${rInt} ${rInt} 0 ${grande} 0 ${x4} ${y4} Z`;
}

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

  const { personas, votados, total, pregunta, abierta, recuento, opciones } = datos;

  // Al cerrarse, los resultados. El total del gráfico son los votos
  // emitidos, que puede no coincidir con el censo si alguien no votó.
  const hayResultados = !abierta && recuento;
  const emitidos = hayResultados
    ? Object.values(recuento).reduce((a, b) => a + b, 0) : 0;
  let angulo = 0;
  const porciones = hayResultados ? (opciones || []).map((o, i) => {
    const n = recuento[o] || 0;
    const grados = emitidos > 0 ? (n / emitidos) * 360 : 0;
    const trozo = { opcion: o, n, desde: angulo, hasta: angulo + grados, color: colorOpcion(o, i),
      pct: emitidos > 0 ? Math.round((n / emitidos) * 100) : 0 };
    angulo += grados;
    return trozo;
  }) : [];
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

      {/* Resultados: solo con la votación cerrada */}
      {hayResultados && (
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: '22px 26px', marginBottom: 18,
          boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', letterSpacing: 0.4, marginBottom: 14 }}>
            RESULTADO · han participado {emitidos} {emitidos === 1 ? 'profesor' : 'profesores'}
          </div>

          <div style={{ display: 'flex', gap: 34, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            <svg viewBox="0 0 240 240" style={{ width: 240, height: 240, flexShrink: 0 }}>
              {porciones.filter(t => t.n > 0).map(t => (
                <path key={t.opcion} d={porcion(120, 120, 108, 58, t.desde, t.hasta)}
                  fill={t.color} stroke="white" strokeWidth="2.5" />
              ))}
              <text x="120" y="114" textAnchor="middle" style={{ fontSize: 40, fontWeight: 800, fill: AZUL }}>{emitidos}</text>
              <text x="120" y="138" textAnchor="middle" style={{ fontSize: 14, fill: '#64748b' }}>votos</text>
            </svg>

            <div style={{ flex: '1 1 280px', minWidth: 260 }}>
              {porciones.map(t => (
                <div key={t.opcion} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, backgroundColor: t.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 19, fontWeight: 700, color: AZUL, flex: 1 }}>{t.opcion}</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: AZUL }}>{t.n}</span>
                  <span style={{ fontSize: 15, color: '#64748b', width: 52, textAlign: 'right' }}>{t.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {emitidos < total && (
            <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14, color: '#64748b' }}>
              {total - emitidos} {total - emitidos === 1 ? 'persona del censo no votó' : 'personas del censo no votaron'} ({total} en total).
            </div>
          )}
        </div>
      )}

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

      {!hayResultados && (
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
          El recuento aparecerá aquí en cuanto se cierre la votación.
        </div>
      )}
    </div>
  );
}
