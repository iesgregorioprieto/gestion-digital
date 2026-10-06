'use client';
export const dynamic = 'force-dynamic';

/**
 * CALENDARIO DE EVENTOS — /eventos
 *
 * Todo el profesorado: vista mensual, el detalle de cada día (hora,
 * lugar, enlace de Teams, descripción) y la lista de próximos eventos.
 * Equipo directivo: además crea, edita y borra, eligiendo a quién afecta
 * y con cuánta antelación sale en el banner «Hoy».
 *
 * No toca /calendario, que es el cartel oficial de la Consejería.
 * Las convocatorias oficiales salen aquí solo para verlas; se gestionan
 * en su propio módulo.
 */

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { tipoEvento, fechaLarga, fechaCorta, textoHora } from '@/lib/eventos';

const AZUL = '#1e3a5f';
const ROJO = '#991b1b';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// ─── Fechas como texto AAAA-MM-DD, sin husos ───
function iso(a, m, d) {
  return new Date(Date.UTC(a, m, d)).toISOString().slice(0, 10);
}
function sumar(f, n) {
  const [a, m, d] = f.split('-').map(Number);
  return iso(a, m - 1, d + n);
}
/** Las semanas (lunes a domingo) que cubren el mes */
function rejillaMes(anio, mes) {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const desplaza = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = iso(anio, mes, 1 - desplaza);
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const total = Math.ceil((desplaza + ultimoDia) / 7) * 7;
  return Array.from({ length: total }, (_, i) => sumar(inicio, i));
}
function eventosDelDia(eventos, f) {
  return eventos.filter(ev => ev.fecha === f || (ev.fecha_fin && ev.fecha < f && ev.fecha_fin >= f));
}

/** Texto con los enlaces clicables */
function ConEnlaces({ texto }) {
  const partes = (texto || '').split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {partes.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', wordBreak: 'break-all' }}>{p}</a>
        : <span key={i}>{p}</span>)}
    </>
  );
}

export default function CalendarioEventos() {
  const hoy = hoyLocal();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)) - 1);
  const [eventos, setEventos] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [diaSel, setDiaSel] = useState(hoy);
  const [abierto, setAbierto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  const [vista, setVista] = useState('calendario');
  // Pestaña: los eventos del centro o el cartel oficial de la Consejería
  const [pestana, setPestana] = useState('eventos');
  const [oficial, setOficial] = useState(undefined); // undefined = sin cargar, null = no hay
  const [cargandoOficial, setCargandoOficial] = useState(false);

  // Al entrar desde el banner: ?d=AAAA-MM-DD&e=id
  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const q = new URLSearchParams(window.location.search);
    const d = q.get('d');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setAnio(Number(d.slice(0, 4))); setMes(Number(d.slice(5, 7)) - 1); setDiaSel(d);
    }
    if (q.get('e')) setAbierto(q.get('e'));
    if (q.get('vista') === 'oficial') abrirOficial();
    cargarProximos();
  }, []);

  useEffect(() => { cargarMes(); }, [anio, mes]);

  async function cargarMes() {
    const dias = rejillaMes(anio, mes);
    setCargando(true);
    try {
      const r = await fetch(`/api/eventos?desde=${dias[0]}&hasta=${dias[dias.length - 1]}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar');
      setEventos(d.eventos || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function abrirOficial() {
    setPestana('oficial');
    if (oficial !== undefined) return;
    setCargandoOficial(true);
    try {
      const r = await fetch('/api/calendario');
      const d = await r.json();
      setOficial(d.calendario || null);
    } catch (e) {
      setOficial(null);
    } finally {
      setCargandoOficial(false);
    }
  }

  async function cargarProximos() {
    try {
      // Desde mañana: los de hoy ya se ven en el detalle del día de arriba,
      // y repetirlos aquí debajo parecía un evento duplicado.
      const r = await fetch(`/api/eventos?desde=${sumar(hoy, 1)}&hasta=${sumar(hoy, 61)}`);
      const d = await r.json();
      if (r.ok) setProximos(d.eventos || []);
    } catch (e) { /* la lista de próximos es secundaria */ }
  }

  function avisar(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    setTimeout(() => setMensaje(null), 4500);
  }

  function moverMes(n) {
    let m = mes + n, a = anio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m); setAnio(a);
  }

  // ─── Piezas de la pantalla (solo consulta: crear/editar/eliminar vive en /gestion/eventos) ───
  const tarjeta = { backgroundColor: 'white', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 14 };

  function Evento({ ev, compacto = false }) {
    const t = tipoEvento(ev.tipo);
    const id = String(ev.id);
    const desplegado = !compacto || abierto === id;
    const esConv = ev.origen === 'convocatoria';
    return (
      <div style={{ border: `1.5px solid ${ev.esMio ? t.color + '66' : '#e2e8f0'}`, borderLeft: `5px solid ${t.color}`,
        borderRadius: 10, padding: '11px 13px', marginBottom: 10, backgroundColor: ev.esMio ? t.bg : 'white' }}>
        <div onClick={() => compacto && setAbierto(desplegado ? null : id)}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: compacto ? 'pointer' : 'default' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{t.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{ev.titulo}</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 3 }}>
              {compacto ? fechaCorta(ev.fecha) : fechaLarga(ev.fecha)}
              {ev.fecha_fin ? ` al ${fechaCorta(ev.fecha_fin)}` : ''} · {textoHora(ev)}
              {ev.lugar ? ` · ${ev.lugar}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {ev.asistencia_obligatoria && <span style={{ fontSize: 11, fontWeight: 800, color: ROJO, backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: 20 }}>Asistencia obligatoria</span>}
              {ev.esMio && !esConv && <span style={{ fontSize: 11, fontWeight: 800, color: '#166534', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: 20 }}>Te afecta</span>}
              {esConv && <span style={{ fontSize: 11, fontWeight: 800, color: AZUL, backgroundColor: '#dbeafe', padding: '2px 8px', borderRadius: 20 }}>Convocatoria oficial</span>}
            </div>
          </div>
          {compacto && <span style={{ color: '#94a3b8', fontSize: 16 }}>{desplegado ? '▾' : '›'}</span>}
        </div>

        {desplegado && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
            {ev.descripcion && (
              <div style={{ fontSize: 14, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginBottom: 10 }}>
                <ConEnlaces texto={ev.descripcion} />
              </div>
            )}
            {ev.enlace && (
              <a href={ev.enlace} target={esConv ? '_self' : '_blank'} rel="noreferrer"
                style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 9, backgroundColor: AZUL, color: 'white',
                  textDecoration: 'none', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                {esConv ? '📅 Ir a la convocatoria' : '🔗 Abrir enlace'}
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  const dias = rejillaMes(anio, mes);
  const delDia = eventosDelDia(eventos, diaSel);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: AZUL, color: 'white', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => (window.location.href = '/profesor')}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>🗓️ Calendario</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, opacity: 0.85 }}>
            Evaluaciones, reuniones, charlas y plazos del centro
          </p>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 820, margin: '0 auto' }}>
        {mensaje && (
          <div style={{ padding: '11px 14px', borderRadius: 9, marginBottom: 14, fontWeight: 700, fontSize: 14,
            backgroundColor: mensaje.tipo === 'error' ? '#fee2e2' : '#dcfce7', color: mensaje.tipo === 'error' ? ROJO : '#166534' }}>
            {mensaje.texto}
          </div>
        )}

        {/* ═════════ CALENDARIO ═════════ */}
        {vista === 'calendario' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, backgroundColor: 'white', borderRadius: 12, padding: 5, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            {[['eventos', '🗓️ Eventos'], ['oficial', '📆 Calendario escolar']].map(([v, t]) => (
              <button key={v} onClick={() => v === 'oficial' ? abrirOficial() : setPestana('eventos')}
                style={{ flex: 1, padding: '10px 8px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 14, fontWeight: 800, backgroundColor: pestana === v ? AZUL : 'transparent', color: pestana === v ? 'white' : '#475569' }}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* ═════════ CALENDARIO OFICIAL (el cartel de la Consejería) ═════════ */}
        {vista === 'calendario' && pestana === 'oficial' && (
          <>
            {cargandoOficial && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>}
            {!cargandoOficial && oficial === null && (
              <div style={{ ...tarjeta, textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>📆</div>
                <div style={{ fontWeight: 700, color: '#555', marginBottom: 6 }}>Todavía no hay calendario publicado</div>
                <div style={{ fontSize: 13.5, color: '#888', lineHeight: 1.6 }}>Cuando el equipo directivo suba el calendario del curso, aparecerá aquí.</div>
              </div>
            )}
            {!cargandoOficial && oficial && (
              <>
                <div style={{ fontWeight: 800, fontSize: 15, color: AZUL, margin: '0 0 10px 4px' }}>Curso {oficial.curso}</div>
                {oficial.tipo?.startsWith('image/') ? (
                  <div style={{ ...tarjeta, padding: 10 }}>
                    <img src={oficial.archivo_url} alt={`Calendario escolar del curso ${oficial.curso}`}
                      style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                  </div>
                ) : (
                  <div style={{ ...tarjeta, textAlign: 'center', padding: 24 }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>📄</div>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#333' }}>Calendario del curso {oficial.curso}</div>
                    <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>{oficial.nombre}</div>
                    <a href={oficial.archivo_url} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-block', padding: '12px 26px', borderRadius: 10, backgroundColor: AZUL, color: 'white', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
                      📖 Abrir el calendario
                    </a>
                  </div>
                )}
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <a href={oficial.archivo_url} download target="_blank" rel="noreferrer"
                    style={{ fontSize: 13, color: AZUL, textDecoration: 'none', fontWeight: 600 }}>⬇️ Descargar</a>
                </div>
                <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11.5, color: '#aaa' }}>
                  Calendario oficial publicado por la Consejería de Educación de Castilla-La Mancha
                </div>
              </>
            )}
          </>
        )}

        {vista === 'calendario' && pestana === 'eventos' && (
          <>
            {error && (
              <div style={{ ...tarjeta, color: ROJO, fontWeight: 600 }}>No se pudo cargar el calendario: {error}</div>
            )}

            <div style={tarjeta}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={() => moverMes(-1)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 18, cursor: 'pointer' }}>‹</button>
                <div style={{ fontWeight: 800, fontSize: 17, color: AZUL, textTransform: 'capitalize' }}>
                  {MESES[mes]} {anio} {cargando && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>· cargando…</span>}
                </div>
                <button onClick={() => moverMes(1)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 18, cursor: 'pointer' }}>›</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) repeat(2, 0.6fr)', gap: 4 }}>
                {DIAS_SEMANA.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#94a3b8', paddingBottom: 4 }}>{d}</div>
                ))}
                {dias.map((f, i) => {
                  const delMes = Number(f.slice(5, 7)) - 1 === mes;
                  const finde = i % 7 >= 5;
                  const evs = eventosDelDia(eventos, f);
                  const sel = f === diaSel;
                  const esHoy = f === hoy;
                  return (
                    <button key={f} onClick={() => { setDiaSel(f); setAbierto(null); }}
                      style={{
                        minHeight: 54, borderRadius: 8, cursor: 'pointer', padding: '4px 3px', textAlign: 'center',
                        border: sel ? `2px solid ${AZUL}` : esHoy ? '2px solid #93c5fd' : '1px solid #e2e8f0',
                        backgroundColor: sel ? '#eff6ff' : finde ? '#f8fafc' : 'white',
                        opacity: delMes ? 1 : 0.4, fontFamily: 'inherit',
                      }}>
                      <div style={{ fontSize: 13, fontWeight: esHoy ? 800 : 600, color: esHoy ? '#1d4ed8' : '#334155' }}>
                        {Number(f.slice(8, 10))}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.15, marginTop: 2 }}>
                        {evs.slice(0, 3).map(ev => <span key={ev.id}>{tipoEvento(ev.tipo).emoji}</span>)}
                        {evs.length > 3 && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}> +{evs.length - 3}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={tarjeta}>
              <div style={{ fontWeight: 800, fontSize: 15, color: AZUL, marginBottom: 10, textTransform: 'capitalize' }}>
                {fechaLarga(diaSel)}{diaSel === hoy ? ' · hoy' : ''}
              </div>
              {delDia.length === 0
                ? <div style={{ fontSize: 14, color: '#94a3b8' }}>No hay eventos este día.</div>
                : delDia.map(ev => <Evento key={ev.id} ev={ev} />)}
            </div>

            <div style={tarjeta}>
              <div style={{ fontWeight: 800, fontSize: 15, color: AZUL, marginBottom: 10 }}>Próximos eventos</div>
              {proximos.length === 0
                ? <div style={{ fontSize: 14, color: '#94a3b8' }}>No hay eventos en los próximos dos meses.</div>
                : proximos.slice(0, 15).map(ev => <Evento key={`p-${ev.id}`} ev={ev} compacto />)}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
