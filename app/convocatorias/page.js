'use client';
export const dynamic = 'force-dynamic';

/**
 * CONVOCATORIAS — donde el profesorado responde si asistirá, ficha su
 * presencia y vota en las votaciones que se lanzan durante la reunión.
 *
 * Se refresca sola cada 20 segundos y, mientras una votación suya está
 * abierta, cada 3: el cierre lo decide el reloj del servidor, no el
 * móvil, pero conviene que el contador y el botón de votar reaccionen
 * rápido durante los pocos minutos que dura.
 */

import { useState, useEffect } from 'react';

const AZUL  = '#1e3a5f';
const VERDE = '#166534';
const MORADO = '#7e22ce';
const ROJO  = '#991b1b';

function fechaLarga(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES',
    { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Convocatorias() {
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ahora, setAhora] = useState(Date.now());
  const [votando, setVotando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    cargar();
    // Solo con la pestaña a la vista; al volver a ella, al momento
    const alVolver = () => { if (!document.hidden) cargar(); };
    const t = setInterval(alVolver, hayVotacionAbierta() ? 3000 : 20000);
    document.addEventListener('visibilitychange', alVolver);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lista.length]);

  function hayVotacionAbierta() {
    return lista.some(c => c.votacion);
  }

  async function cargar() {
    try {
      const r = await fetch('/api/convocatorias?modo=mias');
      const d = await r.json();
      setLista(d.convocatorias || []);
    } catch (e) { /* se queda con lo último visto */ }
    setCargando(false);
  }

  function aviso(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  // Para que «Tareas pendientes» (arriba del panel) se actualice en el
  // acto, sin esperar a la próxima vez que se abra la aplicación.
  function avisarResuelto() {
    window.dispatchEvent(new Event('pendientes:actualizar'));
  }

  async function responder(c, asistira) {
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'responder', datos: { id: c.id, asistira } }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); aviso(e.error || 'No se ha podido guardar', 'error'); return; }
    avisarResuelto();
    cargar();
  }

  async function fichar(c) {
    setEnviando(true);
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'fichar', datos: { id: c.id } }),
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); aviso(e.error || 'No se ha podido fichar', 'error'); }
    else { aviso('✋ Asistencia registrada', 'ok'); avisarResuelto(); }
    cargar();
    setEnviando(false);
  }

  async function votar(c) {
    const opcion = votando;
    if (!opcion) return;
    setEnviando(true);
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'votar', datos: { votacion_id: c.votacion.id, opcion } }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido votar', 'error');
    } else {
      aviso('🗳️ Voto registrado', 'ok');
      setVotando(null);
      avisarResuelto();
    }
    cargar();
    setEnviando(false);
  }

  const campoBtn = (color) => ({
    padding: '13px 18px', borderRadius: 11, border: 'none', backgroundColor: color,
    color: 'white', fontWeight: 800, fontSize: 15, cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>
      <div style={{ backgroundColor: AZUL, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>📅 Convocatorias</div>
        <a href="/profesor" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>← Inicio</a>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
        {mensaje && (
          <div style={{ padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'error' ? '#fef2f2' : '#f0fdf4',
            color: mensaje.tipo === 'error' ? ROJO : VERDE,
            border: `1.5px solid ${mensaje.tipo === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
            {mensaje.texto}
          </div>
        )}

        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando…</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
            No tienes ninguna convocatoria pendiente
          </div>
        ) : lista.map(c => {
          const enCurso = c.estado === 'en_curso';
          let restanteFichaje = null;
          if (enCurso && c.fichajeAbierto && c.fichaje_fin) {
            const falta = new Date(c.fichaje_fin).getTime() - ahora;
            const m = Math.max(0, Math.floor(falta / 60000)), s = Math.max(0, Math.floor((falta % 60000) / 1000));
            restanteFichaje = `${m}:${String(s).padStart(2, '0')}`;
          }
          let restanteVoto = null;
          if (c.votacion?.cierre_at) {
            const falta = new Date(c.votacion.cierre_at).getTime() - ahora;
            const m = Math.max(0, Math.floor(falta / 60000)), s = Math.max(0, Math.floor((falta % 60000) / 1000));
            restanteVoto = { texto: `${m}:${String(s).padStart(2, '0')}`, apurado: falta < 60000 };
          }

          return (
            <div key={c.id} style={{ backgroundColor: 'white', borderRadius: 14, marginBottom: 16, overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `1.5px solid ${enCurso ? '#fcd34d' : '#e2e8f0'}` }}>

              <div style={{ padding: '16px 18px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: enCurso ? '#b45309' : AZUL, letterSpacing: 0.5, marginBottom: 4 }}>
                  {enCurso ? '🔴 REUNIÓN EN CURSO' : '📅 CONVOCATORIA'}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>{c.titulo}</div>
                <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.8 }}>
                  {c.fecha && <div style={{ textTransform: 'capitalize' }}>📅 {fechaLarga(c.fecha)}{c.hora ? ` · ${c.hora}` : ''}</div>}
                  {c.lugar && <div>📍 {c.lugar}</div>}
                </div>
                {Array.isArray(c.orden_dia) && c.orden_dia.length > 0 && (
                  <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, backgroundColor: '#f8fafc', fontSize: 13 }}>
                    <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 4 }}>Orden del día</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: '#334155', lineHeight: 1.6 }}>
                      {c.orden_dia.map((p, i) => <li key={i}>{p.texto}</li>)}
                    </ol>
                  </div>
                )}
              </div>

              {/* Votación abierta: lo primero, sin competencia */}
              {c.votacion && !c.votacion.yaVote && (
                <div style={{ padding: 18, backgroundColor: '#faf5ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: MORADO, letterSpacing: 0.5 }}>🗳️ VOTACIÓN EN MARCHA</div>
                    {restanteVoto && (
                      <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                        color: restanteVoto.apurado ? ROJO : MORADO }}>{restanteVoto.texto}</div>
                    )}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#333', marginBottom: 12 }}>{c.votacion.pregunta}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(c.votacion.opciones || []).map(o => (
                      <button key={o} onClick={() => setVotando(o)} disabled={enviando}
                        style={{ padding: '13px 16px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', fontSize: 15, fontWeight: 700,
                          border: `2px solid ${votando === o ? MORADO : '#e9d5ff'}`,
                          backgroundColor: votando === o ? '#f3e8ff' : 'white', color: '#333' }}>
                        {votando === o ? '◉ ' : '○ '}{o}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => votar(c)} disabled={!votando || enviando}
                    style={{ ...campoBtn(MORADO), width: '100%', marginTop: 12, opacity: votando ? 1 : 0.5 }}>
                    {enviando ? 'Enviando...' : 'Votar'}
                  </button>
                </div>
              )}
              {c.votacion?.yaVote && (
                <div style={{ padding: '12px 18px', backgroundColor: '#faf5ff', fontSize: 13.5, color: MORADO, fontWeight: 700 }}>
                  🗳️ Ya has votado. Esperando a que se cierre la votación…
                </div>
              )}

              {/* Resultados de lo ya votado en esta reunión */}
              {c.resultados && c.resultados.length > 0 && (
                <div style={{ padding: '12px 18px', borderTop: '1px solid #f1f5f9' }}>
                  {c.resultados.map(v => {
                    const total = v.totalVotos || 0;
                    return (
                      <div key={v.id} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 5 }}>{v.pregunta}</div>
                        {Object.entries(v.recuento || {}).map(([o, n]) => {
                          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                          return (
                            <div key={o} style={{ marginBottom: 3 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                                <span>{o}</span><span><strong>{n}</strong> · {pct}%</span>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: MORADO, borderRadius: 3 }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Fichaje en la entrada (QR o NFC): aquí no hay botón */}
              {c.modo_fichaje === 'fisico' && c.fichajeAbierto && !c.fichado && (
                <div style={{ padding: 18, backgroundColor: '#f0fdf4', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: VERDE, letterSpacing: 0.5, marginBottom: 8 }}>✋ CONTROL DE ASISTENCIA ABIERTO</div>
                  <div style={{ fontSize: 14, color: '#333', lineHeight: 1.5 }}>
                    Ficha al entrar: escanea el <strong>QR</strong> de la puerta o acerca el móvil a la <strong>etiqueta NFC</strong>.
                  </div>
                </div>
              )}
              {c.modo_fichaje === 'fisico' && !enCurso && c.fichado && (
                <div style={{ padding: '10px 18px', backgroundColor: '#f0fdf4', fontSize: 13, color: VERDE, fontWeight: 700 }}>
                  ✅ Asistencia registrada
                </div>
              )}

              {/* Fichar asistencia */}
              {enCurso && c.fichajeAbierto && !c.fichado && c.modo_fichaje !== 'fisico' && (
                <div style={{ padding: 18, backgroundColor: '#f0fdf4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: VERDE, letterSpacing: 0.5 }}>✋ CONTROL DE ASISTENCIA</div>
                    {restanteFichaje && <div style={{ fontSize: 15, fontWeight: 800, color: VERDE, fontVariantNumeric: 'tabular-nums' }}>{restanteFichaje}</div>}
                  </div>
                  <button onClick={() => fichar(c)} disabled={enviando} style={{ ...campoBtn(VERDE), width: '100%' }}>
                    {enviando ? 'Registrando…' : '✋ Estoy aquí'}
                  </button>
                </div>
              )}
              {enCurso && c.fichado && !c.votacion && (
                <div style={{ padding: '10px 18px', backgroundColor: '#f0fdf4', fontSize: 13, color: VERDE, fontWeight: 700 }}>
                  ✅ Asistencia registrada
                </div>
              )}

              {/* Responder si asistirá, mientras no ha empezado la reunión */}
              {!enCurso && (
                <div style={{ padding: 16, borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: AZUL, marginBottom: 9, textAlign: 'center' }}>¿Vas a asistir?</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => responder(c, true)}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: c.asistira === true ? 'none' : `2px solid ${VERDE}`,
                        backgroundColor: c.asistira === true ? VERDE : 'white', color: c.asistira === true ? 'white' : VERDE,
                        fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                      ✅ Sí, asistiré
                    </button>
                    <button onClick={() => responder(c, false)}
                      style={{ flex: 1, padding: 12, borderRadius: 10, border: c.asistira === false ? 'none' : `2px solid ${ROJO}`,
                        backgroundColor: c.asistira === false ? ROJO : 'white', color: c.asistira === false ? 'white' : ROJO,
                        fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                      No podré
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
