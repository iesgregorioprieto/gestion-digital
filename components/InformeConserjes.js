'use client';

/**
 * HOJA DE REVISIÓN PARA CONSERJES
 *
 * Se han ido reparando cosas sin marcarlas en la app. Esta pestaña
 * saca, por cada grupo de avería (persianas, cristales, puertas...),
 * una hoja impresa con una casilla por incidencia para que los
 * conserjes marquen las que ya están hechas. Con la hoja de vuelta,
 * secretaría marca aquí de golpe las resueltas.
 *
 * La numeración de la hoja y la de la lista de abajo es la misma
 * (dentro de cada grupo, por orden de llegada), para poder cotejar.
 */

import { useState } from 'react';
import { SECCIONES, tipoDeIncidencia } from '@/lib/tiposMantenimiento';

const azul = '#1e3a5f';

const ESTADO_TXT = { pendiente: 'Pendiente', en_proceso: 'En proceso', resuelta: 'Resuelta' };

function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fechaCorta(f) {
  return f ? new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
}

export default function InformeConserjes({ incidencias, onActualizado, avisar }) {
  const [grupo, setGrupo] = useState('todos');
  const [alcance, setAlcance] = useState('sin_resolver'); // 'sin_resolver' | 'todas'
  const [marcadas, setMarcadas] = useState({});
  const [guardando, setGuardando] = useState(false);

  const fechaMs = (i) => (i.created_at ? new Date(i.created_at).getTime() : 0);

  // Grupos con su lista numerada, según el alcance elegido
  const todosTipos = SECCIONES;
  const gruposTodos = todosTipos.map(tipo => {
    const items = incidencias
      .filter(i => tipoDeIncidencia(i).id === tipo.id)
      .filter(i => alcance === 'todas' || i.estado !== 'resuelta')
      .sort((a, b) => fechaMs(a) - fechaMs(b));
    const sinResolver = incidencias.filter(i => tipoDeIncidencia(i).id === tipo.id && i.estado !== 'resuelta').length;
    return { tipo, items, sinResolver };
  }).filter(g => g.items.length > 0);

  const gruposVisibles = grupo === 'todos' ? gruposTodos : gruposTodos.filter(g => g.tipo.id === grupo);
  const seleccionables = gruposVisibles.flatMap(g => g.items).filter(i => i.estado !== 'resuelta');
  const nMarcadas = seleccionables.filter(i => marcadas[i.id]).length;

  function cambiarGrupo(id) {
    setGrupo(id);
    setMarcadas({});
  }

  function marcarTodas() {
    setMarcadas(Object.fromEntries(seleccionables.map(i => [i.id, true])));
  }

  async function guardarResueltas() {
    const ids = seleccionables.filter(i => marcadas[i.id]).map(i => i.id);
    if (!ids.length) return;
    if (!confirm(`¿Marcar ${ids.length} incidencia${ids.length === 1 ? '' : 's'} como resuelta${ids.length === 1 ? '' : 's'}?`)) return;
    setGuardando(true);
    try {
      const r = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: 'mantenimiento', accion: 'resolver_varios', datos: { ids } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        avisar?.(`❌ No se han podido marcar: ${j.error || 'error'}`, 'error');
      } else {
        avisar?.(`✅ ${j.n} incidencia${j.n === 1 ? '' : 's'} marcada${j.n === 1 ? '' : 's'} como resuelta${j.n === 1 ? '' : 's'}`, 'ok');
        setMarcadas({});
        onActualizado?.();
      }
    } finally {
      setGuardando(false);
    }
  }

  function imprimir() {
    if (!gruposVisibles.length) return;
    const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    const paginas = gruposVisibles.map((g, gi) => `
      <section class="${gi > 0 ? 'salto' : ''}">
        <div class="cab">
          <div>
            <div class="centro">IES Gregorio Prieto · Mantenimiento</div>
            <h1>${esc(g.tipo.emoji)} ${esc(g.tipo.label)}</h1>
            <div class="sub">Hoja de revisión para conserjería · ${esc(hoy)} · ${alcance === 'todas' ? 'Todas las incidencias' : 'Solo las que faltan por resolver'} · ${g.items.length} incidencia${g.items.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <p class="instr">Marque con una ✔ la casilla <b>Hecho</b> de lo que ya esté reparado y anote lo que haga falta en <b>Observaciones</b>. Devuelva la hoja a Secretaría.</p>
        <table>
          <thead><tr>
            <th class="c-hecho">Hecho</th><th class="c-n">Nº</th><th class="c-f">Entrada</th>
            <th class="c-sitio">Estancia / ubicación</th><th>Avería</th><th class="c-est">Estado en la app</th><th class="c-obs">Observaciones</th>
          </tr></thead>
          <tbody>
            ${g.items.map((i, n) => `
              <tr class="${i.estado === 'resuelta' ? 'res' : ''}">
                <td class="c-hecho"><span class="caja">${i.estado === 'resuelta' ? '✔' : ''}</span></td>
                <td class="c-n">${n + 1}</td>
                <td class="c-f">${esc(fechaCorta(i.created_at))}</td>
                <td class="c-sitio"><b>${esc(i.estancia)}</b>${i.ubicacion_exacta ? `<br>${esc(i.ubicacion_exacta)}` : ''}</td>
                <td>${esc(i.descripcion)}</td>
                <td class="c-est">${esc(ESTADO_TXT[i.estado] || 'Pendiente')}</td>
                <td class="c-obs"></td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="firma"><span>Revisado por: ______________________________</span><span>Fecha: ____ / ____ / ________</span></div>
      </section>`).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>Mantenimiento · Hoja para conserjes</title>
      <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111; margin: 0; font-size: 11pt; }
        .salto { page-break-before: always; break-before: page; }
        .cab { border-bottom: 3px solid ${azul}; padding-bottom: 6px; margin-bottom: 8px; }
        .centro { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: .05em; }
        h1 { font-size: 18pt; margin: 2px 0; color: ${azul}; }
        .sub { font-size: 9.5pt; color: #444; }
        .instr { font-size: 9.5pt; color: #333; margin: 6px 0 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #888; padding: 6px 7px; vertical-align: top; text-align: left; }
        th { background: #e8eef5; font-size: 9.5pt; }
        tr { page-break-inside: avoid; break-inside: avoid; }
        .c-hecho { width: 52px; text-align: center; }
        .caja { display: inline-block; width: 22px; height: 22px; border: 2px solid #111; border-radius: 3px; font-size: 14pt; line-height: 18px; }
        .c-n { width: 34px; text-align: center; font-weight: 700; }
        .c-f { width: 70px; white-space: nowrap; }
        .c-sitio { width: 20%; }
        .c-est { width: 80px; font-size: 9.5pt; }
        .c-obs { width: 24%; }
        tr.res td { color: #777; }
        .firma { display: flex; justify-content: space-between; margin-top: 18px; font-size: 10.5pt; }
      </style></head><body>${paginas}
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 300); };<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { avisar?.('❌ El navegador ha bloqueado la ventana de impresión. Permite las ventanas emergentes.', 'error'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  const chip = (activo) => ({
    padding: '7px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1.5px solid ${activo ? azul : '#d1d5db'}`,
    backgroundColor: activo ? azul : 'white', color: activo ? 'white' : '#374151',
  });

  return (
    <div>
      {/* 1. QUÉ SACAR */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ fontWeight: 700, color: azul, marginBottom: 10 }}>1 · Elige el grupo</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <button onClick={() => cambiarGrupo('todos')} style={chip(grupo === 'todos')}>📋 Todos los grupos</button>
          {gruposTodos.map(g => (
            <button key={g.tipo.id} onClick={() => cambiarGrupo(g.tipo.id)} style={chip(grupo === g.tipo.id)}>
              {g.tipo.emoji} {g.tipo.label} <span style={{ opacity: 0.75 }}>({g.sinResolver})</span>
            </button>
          ))}
        </div>

        <div style={{ fontWeight: 700, color: azul, marginBottom: 8 }}>2 · ¿Qué incidencias?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <button onClick={() => { setAlcance('sin_resolver'); setMarcadas({}); }} style={chip(alcance === 'sin_resolver')}>⏳ Solo las que faltan por resolver</button>
          <button onClick={() => { setAlcance('todas'); setMarcadas({}); }} style={chip(alcance === 'todas')}>📚 Todas (también las resueltas)</button>
        </div>

        <button onClick={imprimir} disabled={!gruposVisibles.length} style={{ padding: '11px 18px', borderRadius: 9, border: 'none', backgroundColor: gruposVisibles.length ? azul : '#9ca3af', color: 'white', fontWeight: 700, fontSize: 14, cursor: gruposVisibles.length ? 'pointer' : 'default' }}>
          🖨️ Imprimir hoja para conserjes
        </button>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
          Sale una página por grupo, con una casilla «Hecho» y espacio para observaciones. También puedes guardarla como PDF desde la ventana de imprimir.
        </div>
      </div>

      {/* 2. PONERSE AL DÍA */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <div style={{ fontWeight: 700, color: azul }}>3 · Con la hoja de vuelta, marca las que ya están hechas</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={marcarTodas} disabled={!seleccionables.length} style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #d1d5db', backgroundColor: '#f8fafc', color: azul, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>☑️ Seleccionar todas</button>
            <button onClick={() => setMarcadas({})} disabled={!nMarcadas} style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #d1d5db', backgroundColor: '#f8fafc', color: '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Quitar selección</button>
          </div>
        </div>

        {!gruposVisibles.length ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>No hay incidencias en este grupo.</div>
        ) : gruposVisibles.map(g => (
          <div key={g.tipo.id} style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: azul, padding: '6px 0', borderBottom: '1.5px solid #e2e8f0', marginBottom: 4 }}>
              {g.tipo.emoji} {g.tipo.label}
            </div>
            {g.items.map((i, n) => {
              const resuelta = i.estado === 'resuelta';
              return (
                <label key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 6px', borderBottom: '1px solid #f1f5f9', cursor: resuelta ? 'default' : 'pointer', opacity: resuelta ? 0.55 : 1, backgroundColor: marcadas[i.id] ? '#ecfdf5' : 'transparent', borderRadius: 6 }}>
                  <input type="checkbox" disabled={resuelta} checked={resuelta || !!marcadas[i.id]} onChange={e => setMarcadas(m => ({ ...m, [i.id]: e.target.checked }))} style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0 }} />
                  <span style={{ width: 26, fontWeight: 800, color: '#64748b', flexShrink: 0 }}>{n + 1}</span>
                  <span style={{ flex: 1, fontSize: 13.5, color: '#333' }}>
                    <b style={{ color: azul }}>{i.estancia}</b>{i.ubicacion_exacta ? ` · ${i.ubicacion_exacta}` : ''} — {i.descripcion}
                    <span style={{ display: 'block', fontSize: 11.5, color: '#888' }}>{fechaCorta(i.created_at)} · {ESTADO_TXT[i.estado] || 'Pendiente'}</span>
                  </span>
                </label>
              );
            })}
          </div>
        ))}

        <button onClick={guardarResueltas} disabled={!nMarcadas || guardando} style={{ width: '100%', marginTop: 6, padding: 13, borderRadius: 9, border: 'none', backgroundColor: nMarcadas ? '#059669' : '#9ca3af', color: 'white', fontWeight: 700, fontSize: 15, cursor: nMarcadas ? 'pointer' : 'default' }}>
          {guardando ? 'Guardando…' : `✅ Marcar ${nMarcadas || ''} como resuelta${nMarcadas === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
