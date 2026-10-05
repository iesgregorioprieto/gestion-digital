'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { MODULOS_VALORACION, nombreModulo, textoModulo } from '@/lib/modulosValoracion';
import { hoyLocal, sumarDias } from '@/lib/fechas';
import { DEPARTAMENTOS } from '@/lib/sectores';
import RondaAntigua from './RondaAntigua';

/**
 * VALORACIÓN DE MÓDULOS — panel del equipo directivo
 *
 * Lanzar una ronda (módulos + fecha de cierre), seguir la participación
 * y ver los resultados de cada ronda comparados con la anterior.
 * «Ronda 0» son las valoraciones antiguas, que se conservan tal cual.
 */

const AZUL = '#1e3a5f';
const ANTIGUA = 'antigua';

function fechaCorta(f) {
  return new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Estrellas({ media }) {
  const llenas = Math.round(media || 0);
  return (
    <span style={{ color: '#f59e0b', fontSize: 18, letterSpacing: 1 }}>
      {'★'.repeat(llenas)}<span style={{ color: '#e5e7eb' }}>{'★'.repeat(5 - llenas)}</span>
    </span>
  );
}

export default function PanelValoraciones() {
  const [rondas, setRondas] = useState([]);
  const [activos, setActivos] = useState(0);
  const [hoy, setHoy] = useState(hoyLocal());
  const [elegida, setElegida] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [abiertoComentarios, setAbiertoComentarios] = useState(null);

  // Formulario de nueva ronda
  const [creando, setCreando] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [cierra, setCierra] = useState(sumarDias(hoyLocal(), 14));
  const [marcados, setMarcados] = useState(MODULOS_VALORACION.map(m => m.id));
  const [guardando, setGuardando] = useState(false);
  // A quién va dirigida (mismo censo y grupos que Convocatorias)
  const [censo, setCenso] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [destinatarios, setDestinatarios] = useState([]);
  const [dirigidaA, setDirigidaA] = useState('');
  const [dptoElegido, setDptoElegido] = useState(DEPARTAMENTOS[0]);
  const [equipoElegido, setEquipoElegido] = useState('');
  const [buscar, setBuscar] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) { window.location.href = '/login'; return; }
    const mes = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    setTitulo(`Valoración de ${mes}`);
    cargarLista(true);
  }, []);

  async function cargarLista(elegirPrimera) {
    setCargando(true);
    try {
      const d = await (await fetch('/api/valoraciones/rondas')).json();
      setRondas(d.rondas || []); setActivos(d.activos || 0); if (d.hoy) setHoy(d.hoy);
      if (elegirPrimera) elegir(d.rondas?.[0]?.id || ANTIGUA);
    } catch (e) { setError('No se pudieron cargar las rondas.'); }
    setCargando(false);
  }

  async function elegir(id) {
    setElegida(id); setDatos(null); setAbiertoComentarios(null);
    if (id === ANTIGUA) return;
    try {
      const d = await (await fetch(`/api/valoraciones/rondas?ronda=${id}`)).json();
      setDatos(d);
    } catch (e) { setError('No se pudieron cargar los resultados.'); }
  }

  async function abrirFormulario() {
    setCreando(true); setError('');
    if (censo.length) return;
    try {
      const d = await (await fetch('/api/convocatorias?modo=censo')).json();
      setCenso(d.profesores || []); setEquipos(d.equipos || []);
    } catch (e) { setError('No se pudo cargar la lista del profesorado.'); }
  }

  function anadir(ids, etiqueta) {
    setDestinatarios(prev => [...new Set([...prev, ...ids])]);
    setDirigidaA(prev => prev ? `${prev} + ${etiqueta}` : etiqueta);
  }
  function quitar(ids) { setDestinatarios(prev => prev.filter(x => !ids.includes(x))); }

  async function lanzar() {
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/valoraciones/rondas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'lanzar', titulo, cierra, modulos: marcados, destinatarios, destinatarios_texto: dirigidaA }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'No se pudo lanzar.'); }
      else { setCreando(false); setDestinatarios([]); setDirigidaA(''); await cargarLista(false); elegir(d.id); }
    } catch (e) { setError('No se pudo lanzar.'); }
    setGuardando(false);
  }

  async function cerrarYa(id) {
    if (!confirm('¿Cerrar la ronda ahora? Ya nadie más podrá contestar.')) return;
    await fetch('/api/valoraciones/rondas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'cerrar', id }),
    });
    await cargarLista(false); elegir(id);
  }

  // ── Informe en PDF para el claustro ──
  // Sin nombres: aunque alguien pidiera contacto, el informe se reparte
  // o se proyecta, y eso es solo para el equipo directivo.
  async function descargarPDF() {
    if (!actual || !datos) return;
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const coma = n => n == null ? '-' : n.toFixed(1).replace('.', ',');

    doc.setFillColor(30, 58, 95); doc.rect(0, 0, ancho, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('IES Gregorio Prieto - Valoración de APrieto', 14, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(actual.titulo, 14, 20);

    doc.setTextColor(40, 40, 40); doc.setFontSize(10.5);
    const pct = actual.total ? ` (${Math.round((actual.contestados / actual.total) * 100)} %)` : '';
    doc.text(`Periodo: del ${fechaCorta(actual.abre)} al ${fechaCorta(actual.cierra)}`, 14, 34);
    doc.text(`Dirigida a: ${actual.destinatarios_texto || 'Claustro de profesores'}`, 14, 40);
    doc.text(`Participación: ${actual.contestados}${actual.total ? ` de ${actual.total}` : ''} personas${pct}`, 14, 46);
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    doc.text('Escala de 1 a 5 estrellas. Encuesta anónima.', 14, 51);

    const hayAnterior = !!datos.anterior;
    const cabecera = ['Módulo', 'Media', '5', '4', '3', '2', '1', 'No lo usan'];
    if (hayAnterior) cabecera.push('Cambio');
    const filas = actual.modulos.map(mod => {
      const r = datos.resumen?.[mod] || { usan: 0, no_usa: 0, media: null, reparto: [0, 0, 0, 0, 0] };
      const fila = [textoModulo(mod), coma(r.media), ...[5, 4, 3, 2, 1].map(n => r.reparto[n - 1]), r.no_usa];
      if (hayAnterior) {
        const ant = datos.anterior.resumen?.[mod]?.media;
        const dif = r.media != null && ant != null ? Math.round((r.media - ant) * 10) / 10 : null;
        fila.push(dif == null ? '-' : `${dif > 0 ? '+' : ''}${coma(dif)}`);
      }
      return fila;
    });

    autoTable(doc, {
      startY: 56, head: [cabecera], body: filas,
      styles: { fontSize: 9.5, cellPadding: 2.2 },
      headStyles: { fillColor: [126, 34, 206] },
      columnStyles: { 0: { cellWidth: 62 }, 1: { fontStyle: 'bold', halign: 'center' } },
      didParseCell: d => {
        if (d.section === 'body' && d.column.index >= 2) d.cell.styles.halign = 'center';
        if (d.section === 'body' && d.column.index === 1) {
          const v = parseFloat(String(d.cell.raw).replace(',', '.'));
          if (!isNaN(v)) d.cell.styles.textColor = v >= 4 ? [22, 128, 61] : v >= 3 ? [180, 110, 0] : [185, 28, 28];
        }
      },
    });
    if (hayAnterior) {
      doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text(`Cambio: diferencia de media respecto a «${datos.anterior.titulo}».`, 14, doc.lastAutoTable.finalY + 5);
    }

    const coms = datos.comentarios || [];
    if (coms.length) {
      const cuerpo = [];
      for (const mod of actual.modulos) {
        for (const c of coms.filter(x => x.modulo === mod)) {
          cuerpo.push([textoModulo(mod), c.no_usa ? 'No lo usa' : `${c.estrellas}`, c.sugerencia]);
        }
      }
      doc.addPage();
      doc.setTextColor(30, 58, 95); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('Comentarios del profesorado', 14, 18);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.text('Transcritos tal cual y sin nombres.', 14, 24);
      autoTable(doc, {
        startY: 29, head: [['Módulo', 'Estrellas', 'Comentario']], body: cuerpo,
        styles: { fontSize: 9, cellPadding: 2.2, valign: 'top' },
        headStyles: { fillColor: [30, 58, 95] },
        columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 20, halign: 'center' } },
      });
    }

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150, 150, 150);
      doc.text(`APrieto · generado el ${new Date().toLocaleDateString('es-ES')} · página ${i} de ${paginas}`,
        ancho / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
    }

    const nombre = actual.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').toLowerCase();
    doc.save(`${nombre}.pdf`);
  }

  const actual = rondas.find(r => r.id === elegida);
  const caja = { backgroundColor: 'white', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: AZUL, color: 'white', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => window.location.href = '/gestion'}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>📊 Valoración de módulos</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, opacity: 0.85 }}>Encuestas al claustro por rondas</p>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>

        {/* ── Lanzar ronda ── */}
        {!creando && !cargando && (
          <button onClick={abrirFormulario}
            style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', backgroundColor: '#7e22ce', color: 'white', fontWeight: 800, fontSize: 15.5, cursor: 'pointer', marginBottom: 14 }}>
            ＋ Lanzar nueva ronda
          </button>
        )}

        {creando && (
          <div style={caja}>
            <div style={{ fontWeight: 800, color: AZUL, fontSize: 16, marginBottom: 12 }}>Nueva ronda</div>

            <label style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>Título</label>
            <input value={titulo} onChange={e => setTitulo(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #ddd', fontSize: 15, margin: '5px 0 12px', boxSizing: 'border-box' }} />

            <label style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>Se puede contestar hasta el</label>
            <input type="date" value={cierra} min={hoy} max={sumarDias(hoy, 60)} onChange={e => setCierra(e.target.value)}
              style={{ display: 'block', padding: '10px 12px', borderRadius: 9, border: '1.5px solid #ddd', fontSize: 15, margin: '5px 0 12px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#444' }}>Módulos ({marcados.length})</span>
              <button onClick={() => setMarcados(MODULOS_VALORACION.map(m => m.id))} style={enlace}>Todos</button>
              <button onClick={() => setMarcados([])} style={enlace}>Ninguno</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6, marginBottom: 14 }}>
              {MODULOS_VALORACION.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '7px 9px', borderRadius: 8, backgroundColor: marcados.includes(m.id) ? '#faf5ff' : '#f8fafc', cursor: 'pointer' }}>
                  <input type="checkbox" checked={marcados.includes(m.id)}
                    onChange={e => setMarcados(prev => e.target.checked ? [...prev, m.id] : prev.filter(x => x !== m.id))} />
                  {m.emoji} {m.texto}
                </label>
              ))}
            </div>

            {/* ── Dirigida a ── */}
            <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 10 }}>👥 Dirigida a — {destinatarios.length}</div>
              {(() => {
                const par = (ids, etiqueta) => (
                  <div style={{ display: 'inline-flex', border: '1.5px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
                    <button onClick={() => anadir(ids, etiqueta)} style={{ padding: '7px 12px', fontSize: 12.5, border: 'none', background: 'white', cursor: 'pointer', color: '#333' }}>+ {etiqueta}</button>
                    <button onClick={() => quitar(ids)} title={`Quitar ${etiqueta}`} style={{ padding: '7px 10px', fontSize: 12.5, border: 'none', borderLeft: '1.5px solid #ddd', background: '#fef2f2', color: '#991b1b', cursor: 'pointer', fontWeight: 700 }}>−</button>
                  </div>
                );
                const eq = equipos.find(x => String(x.id) === equipoElegido);
                return (
                  <>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                      {par(censo.map(p => p.id), 'Todo el claustro')}
                      {par(censo.filter(p => p.jefeDpto || p.directivo).map(p => p.id), 'CCP')}
                      {par(censo.filter(p => p.tutor).map(p => p.id), 'Tutores')}
                      {par(censo.filter(p => p.directivo).map(p => p.id), 'Equipo directivo')}
                      <button onClick={() => { setDestinatarios([]); setDirigidaA(''); }} style={{ ...enlace, color: '#991b1b', padding: '7px 8px' }}>Vaciar</button>
                    </div>
                    <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                      <select value={dptoElegido} onChange={e => setDptoElegido(e.target.value)} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 12.5 }}>
                        {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      {par(censo.filter(p => p.departamento === dptoElegido).map(p => p.id), dptoElegido)}
                    </div>
                    {equipos.length > 0 && (
                      <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                        <select value={equipoElegido} onChange={e => setEquipoElegido(e.target.value)} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 12.5 }}>
                          <option value="">— elige un equipo —</option>
                          {equipos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                        </select>
                        {par(eq?.miembros || [], eq?.nombre || 'equipo')}
                      </div>
                    )}
                  </>
                );
              })()}
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white' }}>
                {censo.filter(p => !buscar.trim() || p.nombre.toLowerCase().includes(buscar.trim().toLowerCase())).map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: destinatarios.includes(p.id) ? '#faf5ff' : 'white' }}>
                    <input type="checkbox" checked={destinatarios.includes(p.id)}
                      onChange={() => setDestinatarios(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])} />
                    <span style={{ flex: 1 }}>{p.nombre}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.departamento}</span>
                  </label>
                ))}
                {!censo.length && <div style={{ padding: 14, textAlign: 'center', color: '#aaa', fontSize: 13 }}>⏳ Cargando profesorado…</div>}
              </div>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#444', marginTop: 10 }}>Cómo aparece en el informe</label>
              <input value={dirigidaA} onChange={e => setDirigidaA(e.target.value)} placeholder="Claustro de profesores"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, marginTop: 4, boxSizing: 'border-box' }} />
            </div>

            <div style={{ fontSize: 12.5, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
              Al lanzarla, a las personas elegidas les aparece en <strong>Tareas pendientes</strong> hasta que contesten o cierre la ronda.
            </div>

            {error && <div style={{ color: '#991b1b', fontSize: 13.5, marginBottom: 10 }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={lanzar} disabled={guardando || !marcados.length || !titulo.trim() || !destinatarios.length}
                style={{ padding: '11px 22px', borderRadius: 10, border: 'none', backgroundColor: guardando ? '#cbd5e1' : '#7e22ce', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
                {guardando ? 'Lanzando...' : '🚀 Lanzar'}
              </button>
              <button onClick={() => { setCreando(false); setError(''); }} style={{ ...enlace, padding: '11px 14px' }}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ── Selector de ronda ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {rondas.map(r => {
            const viva = r.abre <= hoy && r.cierra >= hoy;
            return (
              <button key={r.id} onClick={() => elegir(r.id)} style={pastilla(elegida === r.id)}>
                {viva ? '🟢 ' : ''}{r.titulo}
              </button>
            );
          })}
          <button onClick={() => elegir(ANTIGUA)} style={pastilla(elegida === ANTIGUA)}>Ronda 0 (antigua)</button>
        </div>

        {cargando && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>}

        {elegida === ANTIGUA && <RondaAntigua />}

        {/* ── Resultados de una ronda ── */}
        {actual && (
          <div style={caja}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ flex: '1 1 260px' }}>
                <div style={{ fontWeight: 800, fontSize: 16.5, color: AZUL }}>{actual.titulo}</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
                  Del {fechaCorta(actual.abre)} al {fechaCorta(actual.cierra)}
                  {actual.abre <= hoy && actual.cierra >= hoy ? ' · abierta' : ' · cerrada'}
                </div>
                {actual.destinatarios_texto && (
                  <div style={{ fontSize: 13, color: '#7e22ce', marginTop: 3, fontWeight: 600 }}>👥 {actual.destinatarios_texto}</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#7e22ce' }}>{actual.contestados}{actual.total ? ` / ${actual.total}` : ''}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  han contestado{actual.total ? ` (${Math.round((actual.contestados / actual.total) * 100)} %)` : ''}
                </div>
              </div>
            </div>
            <button onClick={descargarPDF} disabled={!datos}
              style={{ marginTop: 12, marginRight: 8, padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: datos ? AZUL : '#cbd5e1', color: 'white', fontWeight: 700, fontSize: 13, cursor: datos ? 'pointer' : 'default' }}>
              📄 Descargar informe en PDF
            </button>
            {actual.abre <= hoy && actual.cierra >= hoy && (
              <button onClick={() => cerrarYa(actual.id)}
                style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', backgroundColor: 'white', color: '#991b1b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Cerrar la ronda ya
              </button>
            )}
          </div>
        )}

        {actual && !datos && <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>⏳ Cargando resultados...</div>}

        {actual && datos && actual.modulos.map(mod => {
          const r = datos.resumen?.[mod] || { usan: 0, no_usa: 0, media: null, reparto: [0, 0, 0, 0, 0] };
          const ant = datos.anterior?.resumen?.[mod]?.media;
          const dif = r.media != null && ant != null ? Math.round((r.media - ant) * 10) / 10 : null;
          const coms = (datos.comentarios || []).filter(c => c.modulo === mod);
          const max = Math.max(1, ...r.reparto);
          const abierto = abiertoComentarios === mod;

          return (
            <div key={mod} style={caja}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                <div style={{ flex: '1 1 240px' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: AZUL, marginBottom: 6 }}>{nombreModulo(mod)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: AZUL }}>{r.media != null ? r.media.toFixed(1).replace('.', ',') : '—'}</span>
                    <Estrellas media={r.media} />
                    {dif != null && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: dif > 0 ? '#16a34a' : dif < 0 ? '#dc2626' : '#888' }}
                        title={`Respecto a «${datos.anterior.titulo}»`}>
                        {dif > 0 ? '▲' : dif < 0 ? '▼' : '='} {Math.abs(dif).toFixed(1).replace('.', ',')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>
                    {r.usan} lo puntúan · {r.no_usa} no lo usan
                  </div>
                </div>

                <div style={{ flex: '1 1 220px' }}>
                  {[5, 4, 3, 2, 1].map(n => (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, color: '#666', width: 24 }}>{n}★</span>
                      <div style={{ flex: 1, height: 10, backgroundColor: '#f1f5f9', borderRadius: 5 }}>
                        <div style={{ width: `${(r.reparto[n - 1] / max) * 100}%`, height: '100%', borderRadius: 5, backgroundColor: n >= 4 ? '#16a34a' : n === 3 ? '#f59e0b' : '#dc2626' }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#444', width: 22, textAlign: 'right' }}>{r.reparto[n - 1]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {coms.length > 0 && (
                <div style={{ marginTop: 14, borderTop: '1px solid #eee', paddingTop: 12 }}>
                  <button onClick={() => setAbiertoComentarios(abierto ? null : mod)}
                    style={{ background: 'none', border: 'none', color: AZUL, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0 }}>
                    {abierto ? '▼' : '▶'} 💬 {coms.length} comentario{coms.length === 1 ? '' : 's'}
                  </button>
                  {abierto && coms.map(c => (
                    <div key={c.id} style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: '11px 13px', marginTop: 8, borderLeft: `4px solid ${c.no_usa ? '#94a3b8' : c.estrellas >= 4 ? '#16a34a' : c.estrellas === 3 ? '#f59e0b' : '#dc2626'}` }}>
                      <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6, marginBottom: 5 }}>{c.sugerencia}</div>
                      <div style={{ fontSize: 11.5, color: '#888' }}>
                        {c.no_usa ? 'No lo usa' : `${c.estrellas}★`} ·{' '}
                        {c.persona ? <span style={{ color: '#166534', fontWeight: 700 }}>{c.persona.nombre}</span> : 'Sin identificar'}
                      </div>
                      {c.persona?.email && (
                        <a href={`mailto:${c.persona.email}?subject=${encodeURIComponent('Sobre tu comentario en APrieto')}&body=${encodeURIComponent(`Hola ${c.persona.nombre.split(' ')[0]},\n\nSobre «${nombreModulo(mod)}» nos escribiste:\n\n"${c.sugerencia}"\n\nQueríamos preguntarte...\n\nUn saludo.`)}`}
                          style={{ display: 'inline-block', marginTop: 7, padding: '6px 14px', borderRadius: 7, backgroundColor: '#166534', color: 'white', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                          ✉️ Escribirle
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {actual && datos && (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
            Quién contesta y qué contesta se guardan por separado: solo aparece el nombre de quien pidió que le contacten.
          </div>
        )}
      </div>
    </div>
  );
}

const enlace = { background: 'none', border: 'none', color: '#7e22ce', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 };

function pastilla(activa) {
  return {
    padding: '8px 14px', borderRadius: 20, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
    border: `1.5px solid ${activa ? '#7e22ce' : '#e2e8f0'}`,
    backgroundColor: activa ? '#faf5ff' : 'white', color: activa ? '#7e22ce' : '#555',
  };
}
