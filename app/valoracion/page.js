'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { MODULOS_VALORACION, tieneModulo } from '@/lib/modulosValoracion';

/**
 * ENCUESTA DE VALORACIÓN — la contesta cada profesor una vez por ronda.
 * Le llega desde Tareas pendientes. Todos los módulos en una sola
 * pantalla: un toque por módulo y se envía de una vez.
 */

const AZUL = '#1e3a5f';
const TEXTO_ESTRELLAS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien'];

function fechaLarga(f) {
  return new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function Valoracion() {
  const [cargando, setCargando] = useState(true);
  const [ronda, setRonda] = useState(null);
  const [contestada, setContestada] = useState(false);
  const [resp, setResp] = useState({});          // { modulo: { estrellas, no_usa, sugerencia, comentar } }
  const [contacto, setContacto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(false);
  const [roles, setRoles] = useState([]);
  const [rolGestion, setRolGestion] = useState('');

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    try { setRoles(JSON.parse(sessionStorage.getItem('profesor_roles') || '[]')); } catch (e) { setRoles([]); }
    setRolGestion(sessionStorage.getItem('profesor_rol_gestion') || '');
    fetch('/api/valoraciones/rondas?vista=mia')
      .then(r => r.json())
      .then(d => { setRonda(d.ronda || null); setContestada(!!d.contestada); })
      .catch(() => setError('No se pudo cargar la encuesta.'))
      .finally(() => setCargando(false));
  }, []);

  // Solo los módulos que esta persona tiene en su panel
  const modulos = ronda
    ? MODULOS_VALORACION.filter(m => ronda.modulos.includes(m.id) && tieneModulo(m.id, roles, rolGestion))
    : [];
  const valorados = modulos.filter(m => resp[m.id]?.estrellas || resp[m.id]?.no_usa).length;
  const completa = modulos.length > 0 && valorados === modulos.length;

  function poner(id, cambios) {
    setResp(prev => ({ ...prev, [id]: { ...prev[id], ...cambios } }));
  }

  async function enviar() {
    if (!completa) return;
    setEnviando(true); setError('');
    try {
      const r = await fetch('/api/valoraciones/rondas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'responder', ronda_id: ronda.id, quiereContacto: contacto,
          respuestas: modulos.map(m => ({
            modulo: m.id,
            estrellas: resp[m.id]?.no_usa ? null : resp[m.id]?.estrellas,
            no_usa: !!resp[m.id]?.no_usa,
            sugerencia: resp[m.id]?.sugerencia || '',
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'No se pudo enviar.'); if (r.status === 409) setContestada(true); }
      else setHecho(true);
    } catch (e) { setError('No se pudo enviar. Revisa la conexión y vuelve a intentarlo.'); }
    setEnviando(false);
  }

  const caja = { backgroundColor: 'white', borderRadius: 14, padding: '16px 18px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: AZUL, color: 'white', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => window.location.href = '/profesor'}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>⭐ Valora APrieto</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, opacity: 0.85 }}>{ronda?.titulo || 'Encuesta de valoración'}</p>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 680, margin: '0 auto' }}>
        {cargando && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>}

        {!cargando && !ronda && (
          <div style={{ ...caja, textAlign: 'center', padding: 30, color: '#666' }}>
            Ahora mismo no hay ninguna encuesta abierta.
          </div>
        )}

        {!cargando && ronda && (contestada || hecho) && (
          <div style={{ ...caja, textAlign: 'center', padding: 30, backgroundColor: '#f0fdf4', color: '#166534' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>✅</div>
            <strong>{hecho ? '¡Gracias!' : 'Ya contestaste esta encuesta.'}</strong>
            <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.6 }}>
              Las respuestas llegan al equipo directivo y de ahí salen las mejoras del portal.
            </div>
            <button onClick={() => window.location.href = '/profesor'}
              style={{ marginTop: 16, padding: '11px 22px', borderRadius: 10, border: 'none', backgroundColor: AZUL, color: 'white', fontWeight: 700, cursor: 'pointer' }}>
              Volver al panel
            </button>
          </div>
        )}

        {!cargando && ronda && !contestada && !hecho && (
          <>
            <div style={{ ...caja, fontSize: 14, color: '#444', lineHeight: 1.6 }}>
              Puntúa cada módulo de 1 a 5 estrellas, o marca <strong>No lo uso</strong>.
              Es anónima: tu nombre no aparece salvo que marques al final que te puedan contactar.
              <div style={{ fontSize: 12.5, color: '#888', marginTop: 6 }}>
                Abierta hasta el {fechaLarga(ronda.cierra)}.
              </div>
            </div>

            {modulos.map(m => {
              const r = resp[m.id] || {};
              const verComentario = r.comentar || (r.estrellas && r.estrellas <= 3);
              return (
                <div key={m.id} style={{ ...caja, borderLeft: `5px solid ${r.estrellas || r.no_usa ? '#16a34a' : '#e2e8f0'}` }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, color: AZUL, marginBottom: 10 }}>
                    {m.emoji} {m.texto}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} aria-label={`${n} estrellas`}
                        onClick={() => poner(m.id, { estrellas: n, no_usa: false })}
                        style={{
                          fontSize: 32, lineHeight: 1, padding: '2px 3px', background: 'none', border: 'none', cursor: 'pointer',
                          color: !r.no_usa && r.estrellas >= n ? '#f59e0b' : '#d1d5db',
                        }}>★</button>
                    ))}
                    <button onClick={() => poner(m.id, { no_usa: !r.no_usa, estrellas: null })}
                      style={{
                        marginLeft: 'auto', padding: '8px 12px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${r.no_usa ? '#64748b' : '#e2e8f0'}`,
                        backgroundColor: r.no_usa ? '#f1f5f9' : 'white', color: r.no_usa ? '#334155' : '#94a3b8',
                      }}>
                      No lo uso
                    </button>
                  </div>

                  {r.estrellas && !r.no_usa && (
                    <div style={{ fontSize: 12.5, color: '#888', marginTop: 4 }}>{TEXTO_ESTRELLAS[r.estrellas]}</div>
                  )}

                  {verComentario ? (
                    <textarea value={r.sugerencia || ''} rows={2}
                      onChange={e => poner(m.id, { sugerencia: e.target.value })}
                      placeholder={r.estrellas && r.estrellas <= 3 ? '¿Qué mejorarías? (opcional, cuanto más concreto mejor)' : 'Comentario (opcional)'}
                      style={{ width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10, fontSize: 14, border: '1.5px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
                  ) : (
                    <button onClick={() => poner(m.id, { comentar: true })}
                      style={{ marginTop: 8, background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', padding: 0 }}>
                      ＋ Añadir comentario
                    </button>
                  )}
                </div>
              );
            })}

            <div style={caja}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: '#555', cursor: 'pointer', lineHeight: 1.5 }}>
                <input type="checkbox" checked={contacto} onChange={e => setContacto(e.target.checked)}
                  style={{ marginTop: 2, width: 17, height: 17, cursor: 'pointer' }} />
                <span>
                  Quiero que puedan contactar conmigo para aclarar mis comentarios.
                  <br /><span style={{ color: '#999' }}>Si no lo marcas, tus respuestas llegan sin tu nombre.</span>
                </span>
              </label>
            </div>

            {error && <div style={{ ...caja, backgroundColor: '#fef2f2', color: '#991b1b', fontSize: 14 }}>⚠️ {error}</div>}

            <div style={{ position: 'sticky', bottom: 0, padding: '12px 0 calc(12px + env(safe-area-inset-bottom, 0px))', backgroundColor: '#f0f4f0' }}>
              <button onClick={enviar} disabled={!completa || enviando}
                style={{
                  width: '100%', padding: '15px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 16,
                  backgroundColor: !completa || enviando ? '#cbd5e1' : AZUL, color: 'white',
                  cursor: !completa || enviando ? 'default' : 'pointer',
                }}>
                {enviando ? 'Enviando...' : completa ? 'Enviar valoración' : `Llevas ${valorados} de ${modulos.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
