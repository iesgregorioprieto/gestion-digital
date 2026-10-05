'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { MODULOS_VALORACION, nombreModulo } from '@/lib/modulosValoracion';
import { hoyLocal, sumarDias } from '@/lib/fechas';
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

  async function lanzar() {
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/valoraciones/rondas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'lanzar', titulo, cierra, modulos: marcados }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'No se pudo lanzar.'); }
      else { setCreando(false); await cargarLista(false); elegir(d.id); }
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

  const abierta = rondas.find(r => r.abre <= hoy && r.cierra >= hoy);
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
        {!abierta && !creando && !cargando && (
          <button onClick={() => setCreando(true)}
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

            <div style={{ fontSize: 12.5, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
              Al lanzarla, a todo el profesorado le aparece en <strong>Tareas pendientes</strong> hasta que conteste o cierre la ronda.
            </div>

            {error && <div style={{ color: '#991b1b', fontSize: 13.5, marginBottom: 10 }}>⚠️ {error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={lanzar} disabled={guardando || !marcados.length || !titulo.trim()}
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
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#7e22ce' }}>{actual.contestados}{activos ? ` / ${activos}` : ''}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  han contestado{activos ? ` (${Math.round((actual.contestados / activos) * 100)} %)` : ''}
                </div>
              </div>
            </div>
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
