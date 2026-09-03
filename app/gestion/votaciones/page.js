'use client';
export const dynamic = 'force-dynamic';

/**
 * GESTIÓN DE VOTACIONES
 *
 * Aquí se plantean las cuestiones, se lanzan, se ve la participación en
 * directo y se genera el acta en PDF con los resultados.
 *
 * Mientras la votación está abierta NO se ve el recuento, solo cuánta
 * gente ha votado: si se viera cómo va, los últimos votarían con esa
 * información y la votación dejaría de ser limpia.
 */

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';
const ROJO  = '#991b1b';

export default function GestionVotaciones() {
  const [votaciones, setVotaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('lista');
  const [pregunta, setPregunta] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [opciones, setOpciones] = useState(['', '']);
  const [duracion, setDuracion] = useState('5');
  const [guardando, setGuardando] = useState(false);
  const [procesando, setProcesando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/profesor';
      return;
    }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargar();
    const t = setInterval(cargar, 10000);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(reloj); };
  }, []);

  // Cuando a una votación abierta se le acaba el tiempo, se recarga
  // en el acto para que salgan los resultados sin esperar al refresco.
  useEffect(() => {
    const vencida = votaciones.some(v =>
      v.abierta && v.cierre && new Date(v.cierre).getTime() <= ahora
    );
    if (vencida) cargar();
  }, [ahora, votaciones]);

  async function cargar() {
    try {
      const r = await fetch('/api/votaciones');
      const d = await r.json();
      setVotaciones(d.votaciones || []);
    } catch (e) { /* mantiene lo anterior */ }
    setCargando(false);
  }

  function aviso(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  async function accion(nombre, id, confirmar) {
    if (confirmar && !confirm(confirmar)) return;
    setProcesando(id);
    const r = await fetch('/api/votaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: nombre, id }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido completar', 'error');
    } else {
      aviso('✅ Hecho', 'ok');
      cargar();
    }
    setProcesando(null);
  }

  async function crear() {
    const ops = opciones.map(o => o.trim()).filter(Boolean);
    if (!pregunta.trim()) return aviso('Escribe la cuestión que se somete a votación.', 'error');
    if (ops.length < 2)   return aviso('Pon al menos dos opciones.', 'error');

    setGuardando(true);
    const r = await fetch('/api/votaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear',
        datos: { pregunta, descripcion, opciones: ops, duracion_minutos: duracion || null },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido crear', 'error');
    } else {
      aviso('✅ Votación preparada. Lánzala cuando quieras.', 'ok');
      setPregunta(''); setDescripcion(''); setOpciones(['', '']); setDuracion('5');
      setVista('lista');
      cargar();
    }
    setGuardando(false);
  }

  function tiempoRestante(v) {
    if (!v.cierre) return null;
    const falta = new Date(v.cierre).getTime() - ahora;
    if (falta <= 0) return { texto: 'Tiempo agotado', agotado: true };
    const m = Math.floor(falta / 60000);
    const s = Math.floor((falta % 60000) / 1000);
    return { texto: `${m}:${String(s).padStart(2, '0')}`, agotado: false };
  }

  function actaPDF(v) {
    const e = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const total = v.totalVotos || 0;
    const filas = (v.opciones || []).map(o => {
      const n = v.recuento?.[o] || 0;
      const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0,0';
      return `<tr><td>${e(o)}</td><td style="text-align:center">${n}</td><td style="text-align:center">${pct}%</td></tr>`;
    }).join('');

    const fecha = v.abierta_at
      ? new Date(v.abierta_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })
      : '—';

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Acta de votación</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; margin: 34px; }
  h1 { font-size: 17px; color: #1e3a5f; margin: 0 0 4px; }
  .sub { color: #666; margin-bottom: 20px; }
  .pregunta { font-size: 15px; font-weight: bold; margin: 22px 0 6px; }
  .desc { color: #444; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  th { background: #1e3a5f; color: white; padding: 8px; text-align: left; font-size: 11px; }
  td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  .datos { background: #f1f5f9; padding: 11px 15px; border-radius: 6px; margin: 16px 0; }
  .nota { margin-top: 26px; padding: 13px 15px; background: #eff6ff; border-left: 4px solid #1e40af; font-size: 11px; color: #1e3a5f; line-height: 1.65; }
  .pie { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; color: #888; font-size: 10px; }
</style></head><body>
  <h1>Acta de votación</h1>
  <div class="sub">IES Gregorio Prieto · Valdepeñas (Ciudad Real)</div>

  <div class="pregunta">${e(v.pregunta)}</div>
  ${v.descripcion ? `<div class="desc">${e(v.descripcion)}</div>` : ''}

  <div class="datos">
    <strong>Fecha y hora:</strong> ${e(fecha)}<br>
    <strong>Duración:</strong> ${v.duracion_minutos ? `${v.duracion_minutos} minutos` : 'sin límite'}<br>
    <strong>Participantes:</strong> ${v.participantes}<br>
    <strong>Votos emitidos:</strong> ${total}
  </div>

  <table>
    <tr><th>Opción</th><th>Votos</th><th>Porcentaje</th></tr>
    ${filas}
  </table>

  <div class="nota">
    <strong>Sobre el secreto del voto.</strong>
    La aplicación registra por separado, en dos almacenamientos que no pueden
    cruzarse, la opción votada y la identidad de quien participa. Ninguno de los
    dos conserva la hora de emisión, lo que impide emparejarlos por orden de
    llegada. En consecuencia, no es posible determinar el sentido del voto de
    ninguna persona, ni por parte del equipo directivo ni de la administración
    del sistema.
  </div>

  <div class="pie">
    Generada el ${e(new Date().toLocaleString('es-ES'))} por ${e(usuario)} ·
    APrieto, portal de gestión del IES Gregorio Prieto
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { aviso('El navegador ha bloqueado la ventana. Permite las ventanas emergentes.', 'error'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  const btnVista = (activo) => ({
    padding: '9px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${activo ? AZUL : '#ddd'}`,
    backgroundColor: activo ? AZUL : 'white', color: activo ? 'white' : '#555',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>🗳️ Votaciones del claustro</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>IES Gregorio Prieto · {usuario}</div>
        </div>
        <a href="/gestion" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>
          ← Inicio
        </a>
      </div>

      <div style={{ maxWidth: 850, margin: '0 auto', padding: 16 }}>

        {mensaje && (
          <div style={{
            padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: mensaje.tipo === 'ok' ? VERDE : ROJO,
          }}>{mensaje.texto}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setVista('lista')} style={btnVista(vista === 'lista')}>📋 Votaciones</button>
          <button onClick={() => setVista('nueva')} style={btnVista(vista === 'nueva')}>➕ Plantear una cuestión</button>
        </div>

        {/* ─── NUEVA ─── */}
        {vista === 'nueva' && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
            <div style={{ marginBottom: 15 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                Cuestión que se somete a votación *
              </label>
              <input value={pregunta} onChange={e => setPregunta(e.target.value)}
                placeholder="Ej: ¿Se aprueba la propuesta de horario para el próximo curso?"
                style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                Explicación (opcional)
              </label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
                placeholder="Contexto que ayude a decidir."
                style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 15 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                Opciones *
              </label>
              {opciones.map((o, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, marginBottom: 7 }}>
                  <input value={o} onChange={e => setOpciones(ops => ops.map((x, j) => j === i ? e.target.value : x))}
                    placeholder={i === 0 ? 'A favor' : i === 1 ? 'En contra' : 'Otra opción'}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, boxSizing: 'border-box' }} />
                  {opciones.length > 2 && (
                    <button type="button" onClick={() => setOpciones(ops => ops.filter((_, j) => j !== i))}
                      style={{ padding: '0 13px', borderRadius: 8, border: '1.5px solid #fecaca', backgroundColor: 'white', color: ROJO, cursor: 'pointer', fontWeight: 700 }}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setOpciones(ops => [...ops, ''])}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px dashed #cbd5e1', backgroundColor: 'white', color: '#64748b', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
                + Añadir opción
              </button>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 7 }}>
                Si procede, añade &quot;Abstención&quot; o &quot;En blanco&quot; como una opción más.
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                ¿Cuánto tiempo estará abierta?
              </label>
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="number" min="1" max="1440" value={duracion} onChange={e => setDuracion(e.target.value)}
                  style={{ width: 90, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
                <span style={{ fontSize: 13.5, color: '#555' }}>minutos</span>
                {[3, 5, 10, 30].map(m => (
                  <button key={m} type="button" onClick={() => setDuracion(String(m))}
                    style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid #ddd', backgroundColor: duracion === String(m) ? '#eff6ff' : 'white', color: '#475569', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
                    {m}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 7 }}>
                Déjalo vacío para que no se cierre sola y la cierres tú a mano.
                El tiempo empieza a contar cuando la lances.
              </div>
            </div>

            <button onClick={crear} disabled={guardando}
              style={{ padding: '12px 24px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>
              {guardando ? 'Preparando...' : '✅ Preparar votación'}
            </button>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 9 }}>
              Queda preparada pero cerrada. Nadie la ve hasta que la lances.
            </div>
          </div>
        )}

        {/* ─── LISTA ─── */}
        {vista === 'lista' && (
          cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
          ) : votaciones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🗳️</div>
              Todavía no has planteado ninguna cuestión
            </div>
          ) : (
            votaciones.map(v => {
              const t = tiempoRestante(v);
              const enMarcha = v.abierta;
              const esperando = v.estado === 'borrador';
              const total = v.totalVotos || 0;

              return (
                <div key={v.id} style={{
                  backgroundColor: 'white', borderRadius: 12, padding: 18, marginBottom: 13,
                  border: `2px solid ${enMarcha ? '#bbf7d0' : esperando ? '#e2e8f0' : '#cbd5e1'}`,
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 190 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, marginBottom: 4,
                        color: enMarcha ? VERDE : esperando ? '#64748b' : '#475569' }}>
                        {enMarcha ? '🟢 ABIERTA' : esperando ? '⚪ PREPARADA' : '🔒 CERRADA'}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#222', lineHeight: 1.35 }}>
                        {v.pregunta}
                      </div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        {v.creada_por}
                        {v.duracion_minutos ? ` · ${v.duracion_minutos} min` : ' · sin límite'}
                      </div>
                    </div>
                    {enMarcha && t && (
                      <div style={{ padding: '7px 14px', borderRadius: 10, textAlign: 'center', backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: VERDE, fontVariantNumeric: 'tabular-nums' }}>{t.texto}</div>
                        <div style={{ fontSize: 10, color: '#666' }}>restante</div>
                      </div>
                    )}
                  </div>

                  {/* Durante la votación solo la participación, nunca el recuento */}
                  {enMarcha && (
                    <div style={{ padding: '11px 14px', borderRadius: 9, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 12 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: AZUL }}>
                        {v.participantes} {v.participantes === 1 ? 'persona ha votado' : 'personas han votado'}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                        El recuento no se muestra hasta que se cierre: si se viera cómo va,
                        quien vote al final lo haría sabiéndolo.
                      </div>
                    </div>
                  )}

                  {/* Resultados */}
                  {!enMarcha && !esperando && (
                    <div style={{ marginBottom: 12 }}>
                      {(v.opciones || []).map(o => {
                        const n = v.recuento?.[o] || 0;
                        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                        return (
                          <div key={o} style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 3 }}>
                              <span style={{ fontWeight: 600 }}>{o}</span>
                              <span style={{ color: '#666' }}><strong>{n}</strong> · {pct}%</span>
                            </div>
                            <div style={{ height: 9, borderRadius: 5, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: VERDE, borderRadius: 5 }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 9 }}>
                        {total} {total === 1 ? 'voto' : 'votos'} · {v.participantes} {v.participantes === 1 ? 'participante' : 'participantes'}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {esperando && (
                      <button onClick={() => accion('abrir', v.id)} disabled={procesando === v.id}
                        style={{ padding: '10px 20px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                        🚀 Lanzar votación
                      </button>
                    )}
                    {enMarcha && (
                      <button onClick={() => accion('cerrar', v.id, '¿Cerrar la votación ahora? No se admitirán más votos.')} disabled={procesando === v.id}
                        style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: '#b45309', color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                        🔒 Cerrar ahora
                      </button>
                    )}
                    {!enMarcha && !esperando && (
                      <button onClick={() => actaPDF(v)}
                        style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: AZUL, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                        📄 Acta en PDF
                      </button>
                    )}
                    <button onClick={() => accion('eliminar', v.id,
                        `¿Eliminar "${v.pregunta}"?\n\nSe borran también los votos emitidos y no se puede deshacer.\nHazlo solo si vas a repetir la votación.`)}
                      disabled={procesando === v.id}
                      style={{ padding: '10px 16px', borderRadius: 9, border: `1.5px solid ${ROJO}`, backgroundColor: 'white', color: ROJO, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      🗑️ Eliminar
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
