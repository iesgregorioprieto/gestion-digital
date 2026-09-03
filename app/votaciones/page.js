'use client';
export const dynamic = 'force-dynamic';

/**
 * VOTACIONES DEL CLAUSTRO
 *
 * Donde el profesorado vota. El contador que se ve aquí es informativo:
 * quien decide si el voto llega a tiempo es el servidor con su propio
 * reloj, no el del móvil.
 */

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';

export default function Votaciones() {
  const [votaciones, setVotaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [votando, setVotando] = useState(null);
  const [elegida, setElegida] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [ahora, setAhora] = useState(Date.now());
  const [verComoFunciona, setVerComoFunciona] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    cargar();
    // Se refresca solo: durante un claustro la votación se abre y se
    // cierra mientras la gente tiene la pantalla delante.
    const t = setInterval(cargar, 15000);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(reloj); };
  }, []);

  async function cargar() {
    try {
      const r = await fetch('/api/votaciones');
      const d = await r.json();
      setVotaciones(d.votaciones || []);
    } catch (e) { /* se queda con lo que hubiera */ }
    setCargando(false);
  }

  function aviso(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4500);
  }

  async function votar(v) {
    const opcion = elegida[v.id];
    if (!opcion) return aviso('Elige una opción antes de votar.', 'error');
    setVotando(v.id);
    const r = await fetch('/api/votaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'votar', id: v.id, datos: { opcion } }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido registrar el voto', 'error');
    } else {
      aviso('✅ Tu voto ha quedado registrado', 'ok');
      cargar();
    }
    setVotando(null);
  }

  function tiempoRestante(v) {
    if (!v.cierre) return null;
    const falta = new Date(v.cierre).getTime() - ahora;
    if (falta <= 0) return { texto: 'Tiempo agotado', agotado: true };
    const m = Math.floor(falta / 60000);
    const s = Math.floor((falta % 60000) / 1000);
    return { texto: `${m}:${String(s).padStart(2, '0')}`, agotado: false, apurado: falta < 60000 };
  }

  const abiertas = votaciones.filter(v => v.abierta);
  const cerradas = votaciones.filter(v => !v.abierta && v.estado !== 'borrador');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>🗳️ Votaciones</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>Claustro · IES Gregorio Prieto</div>
        </div>
        <a href="/profesor" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>
          ← Volver
        </a>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>

        {mensaje && (
          <div style={{
            padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: mensaje.tipo === 'ok' ? VERDE : '#991b1b',
          }}>{mensaje.texto}</div>
        )}

        {/* CÓMO SE GARANTIZA EL SECRETO */}
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setVerComoFunciona(v => !v)}
            style={{ width: '100%', padding: '11px 15px', borderRadius: 10, cursor: 'pointer',
              border: '1.5px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1e40af',
              fontWeight: 700, fontSize: 13.5, textAlign: 'left' }}>
            🔒 ¿Cómo se garantiza que el voto es secreto? {verComoFunciona ? '▲' : '▼'}
          </button>
          {verComoFunciona && (
            <div style={{ padding: '15px 17px', borderRadius: 10, backgroundColor: 'white',
              border: '1.5px solid #bfdbfe', marginTop: 8, fontSize: 13.5, color: '#334155', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 12px' }}>
                Cuando votas, la aplicación guarda <strong>dos cosas por separado, en dos
                sitios distintos que no se pueden cruzar</strong>:
              </p>
              <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                <li style={{ marginBottom: 6 }}>
                  <strong>Tu voto</strong>, sin tu nombre. Solo queda la opción que elegiste.
                </li>
                <li>
                  <strong>Que has votado</strong>, sin la opción. Solo queda tu nombre.
                </li>
              </ul>
              <p style={{ margin: '0 0 12px' }}>
                Así se sabe cuánta gente ha participado y se impide votar dos veces, pero
                no hay forma de saber qué votó nadie. Ni el equipo directivo, ni quien
                administra la aplicación, ni consultando directamente la base de datos.
              </p>
              <p style={{ margin: '0 0 12px' }}>
                <strong>Tampoco se guarda la hora de cada voto</strong>, y esto es
                importante: si se guardara, se podrían emparejar ambos registros por orden
                de llegada y el secreto se rompería. Por eso no consta.
              </p>
              <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
                Lo único que ningún sistema de voto secreto puede evitar, ni este ni las
                papeletas de toda la vida: si en una votación participan dos personas, el
                resultado deja ver quién votó qué.
              </p>
            </div>
          )}
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
        ) : (
          <>
            {abiertas.length === 0 && cerradas.length === 0 && (
              <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🗳️</div>
                No hay ninguna votación en marcha
              </div>
            )}

            {abiertas.map(v => {
              const t = tiempoRestante(v);
              return (
                <div key={v.id} style={{
                  backgroundColor: 'white', borderRadius: 14, padding: 20, marginBottom: 14,
                  border: '2px solid #bbf7d0', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: VERDE, marginBottom: 4 }}>
                        🟢 VOTACIÓN ABIERTA
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: '#222', lineHeight: 1.35 }}>
                        {v.pregunta}
                      </div>
                    </div>
                    {t && (
                      <div style={{
                        padding: '7px 14px', borderRadius: 10, textAlign: 'center',
                        backgroundColor: t.agotado ? '#fef2f2' : t.apurado ? '#fffbeb' : '#f0fdf4',
                        border: `1.5px solid ${t.agotado ? '#fecaca' : t.apurado ? '#fcd34d' : '#bbf7d0'}`,
                      }}>
                        <div style={{ fontSize: 19, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                          color: t.agotado ? '#991b1b' : t.apurado ? '#b45309' : VERDE }}>
                          {t.texto}
                        </div>
                        <div style={{ fontSize: 10, color: '#666' }}>restante</div>
                      </div>
                    )}
                  </div>

                  {v.descripcion && (
                    <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6, marginBottom: 14 }}>
                      {v.descripcion}
                    </div>
                  )}

                  {v.yaVote ? (
                    <div style={{ padding: '14px 16px', borderRadius: 10, backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', fontSize: 14, color: VERDE, fontWeight: 700 }}>
                      ✅ Ya has votado. Tu voto es anónimo y no se puede modificar.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 15 }}>
                        {(v.opciones || []).map(o => (
                          <button key={o} onClick={() => setElegida(e => ({ ...e, [v.id]: o }))}
                            style={{
                              padding: '13px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                              fontSize: 14.5, fontWeight: elegida[v.id] === o ? 800 : 600,
                              border: `2px solid ${elegida[v.id] === o ? VERDE : '#ddd'}`,
                              backgroundColor: elegida[v.id] === o ? '#f0fdf4' : 'white',
                              color: elegida[v.id] === o ? VERDE : '#444',
                            }}>
                            {elegida[v.id] === o ? '🔘' : '⚪'} {o}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => votar(v)} disabled={votando === v.id || (t && t.agotado)}
                        style={{
                          width: '100%', padding: 14, borderRadius: 10, border: 'none',
                          backgroundColor: (t && t.agotado) ? '#94a3b8' : VERDE,
                          color: 'white', fontWeight: 800, fontSize: 15.5,
                          cursor: (t && t.agotado) ? 'not-allowed' : 'pointer',
                        }}>
                        {votando === v.id ? 'Enviando...' : (t && t.agotado) ? 'Tiempo agotado' : '🗳️ Votar'}
                      </button>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>
                        Una vez enviado no se puede cambiar
                      </div>
                    </>
                  )}

                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>
                    {v.participantes} {v.participantes === 1 ? 'persona ha votado' : 'personas han votado'}
                  </div>
                </div>
              );
            })}

            {cerradas.length > 0 && (
              <div style={{ marginTop: abiertas.length > 0 ? 26 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', marginBottom: 10 }}>
                  RESULTADOS
                </div>
                {cerradas.map(v => {
                  const total = v.totalVotos || 0;
                  return (
                    <div key={v.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 17, marginBottom: 12, border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 15.5, fontWeight: 800, color: '#222', marginBottom: 12, lineHeight: 1.35 }}>
                        {v.pregunta}
                      </div>
                      {(v.opciones || []).map(o => {
                        const n = v.recuento?.[o] || 0;
                        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                        return (
                          <div key={o} style={{ marginBottom: 9 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: '#333' }}>{o}</span>
                              <span style={{ color: '#666' }}><strong>{n}</strong> · {pct}%</span>
                            </div>
                            <div style={{ height: 9, borderRadius: 5, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: VERDE, borderRadius: 5 }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 11 }}>
                        {total} {total === 1 ? 'voto' : 'votos'} · {v.participantes} {v.participantes === 1 ? 'participante' : 'participantes'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
