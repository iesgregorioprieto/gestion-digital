'use client';
export const dynamic = 'force-dynamic';

/**
 * GESTIÓN DE ACTIVIDADES COMPLEMENTARIAS
 *
 * Donde dirección revisa lo que propone el profesorado y lo aprueba o
 * lo rechaza. Hasta ahora las propuestas se quedaban pendientes sin que
 * nadie pudiera resolverlas.
 *
 * Las que no figuran en la PGA se destacan: esas necesitan autorización
 * expresa del director, porque el Consejo Escolar no las aprobó.
 */

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { hoyLocal } from '@/lib/fechas';
import EscenarioDia from '@/components/EscenarioDia';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';
const AMBAR = '#b45309';
const ROJO  = '#991b1b';

const ESTADOS = {
  pendiente: { emoji: '⏳', label: 'Pendiente', color: AMBAR, bg: '#fffbeb', borde: '#fcd34d' },
  aprobada:  { emoji: '✅', label: 'Aprobada',  color: VERDE, bg: '#f0fdf4', borde: '#bbf7d0' },
  rechazada: { emoji: '❌', label: 'Rechazada', color: ROJO,  bg: '#fef2f2', borde: '#fecaca' },
};

function fechaTexto(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export default function GestionActividades() {
  const [vista, setVista] = useState('pendientes');
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [fechaEscenario, setFechaEscenario] = useState(hoyLocal());
  const [alumnosDe, setAlumnosDe] = useState({});   // id de actividad -> alumnado por grupo
  const [ausenciasPorFecha, setAusenciasPorFecha] = useState(null);

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/profesor';
      return;
    }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await getSupabase()
      .from('actividades')
      .select('*')
      .order('fecha_inicio', { ascending: true });
    setActividades(data || []);

    // Ausencias registradas, para saber qué actividades aprobadas
    // todavía no tienen la suya. Sin ella, el cuadrante de guardias
    // no sabe que ese profesor falta y sus grupos quedan sin cubrir.
    try {
      const { data: aus } = await getSupabase()
        .from('ausencias')
        .select('profesor_id, fecha_inicio, fecha_fin')
        .gte('fecha_fin', hoyLocal());
      setAusenciasPorFecha(aus || []);
    } catch (e) {
      setAusenciasPorFecha([]);
    }

    setCargando(false);
  }

  function aviso(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  // De la actividad solo vienen los identificadores del alumnado, no los
  // nombres. Se piden al desplegar, no antes, para no cargar listados
  // enteros cada vez que se abre la pantalla.
  async function cargarAlumnos(a) {
    if (alumnosDe[a.id] || !a.alumnos_asistentes) return;
    const porGrupo = {};
    for (const g of Object.keys(a.alumnos_asistentes)) {
      const seleccion = a.alumnos_asistentes[g];
      try {
        const r = await fetch(`/api/alumnos?grupo=${encodeURIComponent(g)}`);
        const d = await r.json();
        const todos = d.alumnos || [];
        porGrupo[g] = seleccion === 'todos'
          ? { todos: true, total: todos.length, nombres: [] }
          : {
              todos: false, total: todos.length,
              nombres: todos.filter(al => (seleccion || []).includes(al.id))
                            .map(al => `${al.apellidos || ''}, ${al.nombre || ''}`.trim()),
            };
      } catch (e) {
        porGrupo[g] = { todos: seleccion === 'todos', total: 0, nombres: [] };
      }
    }
    setAlumnosDe(prev => ({ ...prev, [a.id]: porGrupo }));
  }

  async function resolver(id, nuevoEstado) {
    setProcesando(id);
    const r = await fetch('/api/centro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tabla: 'actividades',
        accion: 'actualizar',
        id,
        datos: { estado: nuevoEstado },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso('No se ha podido guardar: ' + (e.error || 'error'), 'error');
    } else {
      setActividades(prev => prev.map(a => (a.id === id ? { ...a, estado: nuevoEstado } : a)));
      setAbierta(null);
      aviso(nuevoEstado === 'aprobada' ? '✅ Actividad aprobada' : '❌ Actividad rechazada', 'ok');
    }
    setProcesando(null);
  }

  // ¿Ha registrado su ausencia quien va a esta actividad?
  function faltaAusencia(a) {
    if (a.estado !== 'aprobada' || !ausenciasPorFecha) return false;
    if (a.fecha_inicio < hoyLocal()) return false;
    const gente = [a.profesor_id, ...(Array.isArray(a.acompanantes) ? a.acompanantes : [])].filter(Boolean);
    if (gente.length === 0) return false;
    return gente.some(id => !ausenciasPorFecha.some(au =>
      au.profesor_id === id &&
      au.fecha_inicio <= a.fecha_inicio &&
      (au.fecha_fin || au.fecha_inicio) >= a.fecha_inicio
    ));
  }

  const pendientes = actividades.filter(a => (a.estado || 'pendiente') === 'pendiente');
  const resueltas  = actividades.filter(a => (a.estado || 'pendiente') !== 'pendiente');
  const sinPga     = pendientes.filter(a => a.en_pga === false);

  const lista = vista === 'pendientes' ? pendientes
              : vista === 'resueltas'  ? resueltas
              : [];

  const btnVista = (activo) => ({
    padding: '9px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${activo ? AZUL : '#ddd'}`,
    backgroundColor: activo ? AZUL : 'white',
    color: activo ? 'white' : '#555',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>🎒 Actividades Complementarias</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>IES Gregorio Prieto · {usuario}</div>
        </div>
        <a href="/gestion" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>
          ← Inicio
        </a>
      </div>

      <div style={{ maxWidth: 950, margin: '0 auto', padding: 16 }}>

        {mensaje && (
          <div style={{
            padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: mensaje.tipo === 'ok' ? VERDE : ROJO,
          }}>{mensaje.texto}</div>
        )}

        {/* SIN AUSENCIA REGISTRADA */}
        {(() => {
          const flojas = actividades.filter(faltaAusencia);
          if (flojas.length === 0) return null;
          return (
            <div style={{ padding: '13px 16px', borderRadius: 10, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', marginBottom: 14, fontSize: 13.5, color: ROJO, lineHeight: 1.6 }}>
              <div style={{ fontWeight: 800, marginBottom: 5 }}>
                🚨 {flojas.length === 1 ? 'Una actividad aprobada sin ausencia registrada' : `${flojas.length} actividades aprobadas sin ausencia registrada`}
              </div>
              El cuadrante de guardias no sabe que ese profesorado falta, así que sus
              grupos se quedarán sin cubrir. Recuérdales que registren la ausencia con
              las tareas para el alumnado.
              <div style={{ marginTop: 8 }}>
                {flojas.map(a => (
                  <div key={a.id} style={{ fontSize: 12.5, marginTop: 3 }}>
                    · <strong>{a.titulo}</strong> — {fechaTexto(a.fecha_inicio)} — {a.profesor_nombre}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* AVISO DE LO QUE REQUIERE AUTORIZACIÓN EXPRESA */}
        {sinPga.length > 0 && vista === 'pendientes' && (
          <div style={{ padding: '12px 15px', borderRadius: 10, backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', marginBottom: 14, fontSize: 13.5, color: '#78350f', lineHeight: 1.55 }}>
            <strong>⚠️ {sinPga.length} {sinPga.length === 1 ? 'actividad no figura' : 'actividades no figuran'} en la PGA.</strong>{' '}
            El Consejo Escolar no {sinPga.length === 1 ? 'la' : 'las'} aprobó, así que {sinPga.length === 1 ? 'necesita' : 'necesitan'} autorización expresa de dirección.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setVista('pendientes')} style={btnVista(vista === 'pendientes')}>
            ⏳ Por revisar {pendientes.length > 0 && `(${pendientes.length})`}
          </button>
          <button onClick={() => setVista('resueltas')} style={btnVista(vista === 'resueltas')}>
            📋 Resueltas
          </button>
          <button onClick={() => setVista('escenario')} style={btnVista(vista === 'escenario')}>
            📅 Escenario del día
          </button>
        </div>

        {/* ESCENARIO */}
        {vista === 'escenario' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 8 }}>
                📅 ¿Qué día quieres consultar?
              </label>
              <input type="date" value={fechaEscenario} onChange={e => setFechaEscenario(e.target.value)}
                style={{ padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, width: '100%', maxWidth: 260, boxSizing: 'border-box' }} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                Todo lo previsto ese día por orden de prioridad: ausencias, extraescolares, formación y DLD.
                Útil para valorar cómo afecta una salida a la atención del alumnado.
              </div>
            </div>
            <EscenarioDia fecha={fechaEscenario} />
          </div>
        )}

        {/* LISTADOS */}
        {vista !== 'escenario' && (
          cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🎒</div>
              {vista === 'pendientes' ? 'No hay propuestas por revisar' : 'Todavía no hay actividades resueltas'}
            </div>
          ) : (
            lista.map(a => {
              const est = ESTADOS[a.estado || 'pendiente'];
              const enPga = a.en_pga === true;
              const nAcomp = Array.isArray(a.acompanantes) ? a.acompanantes.length : 0;
              const grupos = Array.isArray(a.grupos) ? a.grupos.join(', ') : '';
              const abiertaEsta = abierta === a.id;

              return (
                <div key={a.id} style={{
                  backgroundColor: 'white', borderRadius: 12, marginBottom: 12,
                  border: '1px solid #e5e7eb', borderLeft: `5px solid ${est.borde}`,
                  overflow: 'hidden',
                }}>
                  <div onClick={() => { setAbierta(abiertaEsta ? null : a.id); if (!abiertaEsta) cargarAlumnos(a); }}
                    style={{ padding: '13px 16px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: 800, fontSize: 15.5, color: '#222', marginBottom: 3 }}>
                          {a.titulo || 'Actividad'}
                        </div>
                        <div style={{ fontSize: 13, color: '#555', textTransform: 'capitalize' }}>
                          📅 {fechaTexto(a.fecha_inicio)}
                          {a.fecha_fin && a.fecha_fin !== a.fecha_inicio ? ` — ${fechaTexto(a.fecha_fin)}` : ''}
                        </div>
                        <div style={{ fontSize: 12.5, color: '#777', marginTop: 3 }}>
                          {a.profesor_nombre}
                          {nAcomp > 0 ? ` +${nAcomp}` : ''}
                          {grupos ? ` · ${grupos}` : ''}
                          {a.departamento ? ` · ${a.departamento}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: est.color, backgroundColor: est.bg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                          {est.emoji} {est.label}
                        </span>
                        {faltaAusencia(a) && (
                          <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 9px', borderRadius: 20,
                            color: ROJO, backgroundColor: '#fef2f2', border: `1px solid #fecaca`, whiteSpace: 'nowrap' }}
                            title="El cuadrante de guardias no sabe que falta">
                            🚨 Sin ausencia
                          </span>
                        )}
                        <span style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, whiteSpace: 'nowrap',
                          color: enPga ? VERDE : AMBAR,
                          backgroundColor: enPga ? '#f0fdf4' : '#fffbeb',
                          border: `1px solid ${enPga ? '#bbf7d0' : '#fcd34d'}`,
                        }}>
                          {enPga ? '✅ En la PGA' : '⚠️ Fuera de la PGA'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {abiertaEsta && (
                    <div style={{ padding: '0 16px 14px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ paddingTop: 12, fontSize: 13, lineHeight: 1.8, color: '#444' }}>
                        {a.relacion_curricular && (
                          <div style={{ marginBottom: 8, padding: '9px 12px', borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <strong>Relación con el currículo</strong><br />{a.relacion_curricular}
                          </div>
                        )}
                        {a.descripcion && (
                          <div style={{ marginBottom: 8, padding: '9px 12px', borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <strong>Descripción</strong><br />{a.descripcion}
                          </div>
                        )}
                        {/* Datos de un vistazo */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 9, marginBottom: 12 }}>
                          {[
                            a.hora_salida  && { i: '🕗', et: 'Salida',      v: String(a.hora_salida).slice(0, 5) },
                            a.hora_regreso && { i: '🕘', et: 'Regreso',     v: String(a.hora_regreso).slice(0, 5) },
                            a.lugar        && { i: '📍', et: 'Lugar',       v: a.lugar },
                            a.transporte   && { i: '🚌', et: 'Transporte',  v: a.transporte },
                            a.financiacion && { i: '💶', et: 'Financia',    v: {
                              gratuita: 'Gratuita', alumnado: 'El alumnado',
                              centro: 'El centro', mixta: 'Mixta' }[a.financiacion] || a.financiacion },
                            a.coste_alumno && { i: '🎟️', et: 'Por alumno',  v: `${a.coste_alumno} €` },
                          ].filter(Boolean).map((d, k) => (
                            <div key={k} style={{ padding: '9px 12px', borderRadius: 9, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                {d.i} {d.et}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginTop: 2 }}>{d.v}</div>
                            </div>
                          ))}
                        </div>

                        {/* Alumnado que asiste */}
                        {a.alumnos_asistentes && (
                          <div style={{ marginBottom: 12, padding: '11px 13px', borderRadius: 9, backgroundColor: '#f0f9ff', border: '1px solid #bae6fd' }}>
                            <div style={{ fontWeight: 800, color: '#075985', marginBottom: 7, fontSize: 13 }}>
                              👥 Alumnado que asiste
                            </div>
                            {!alumnosDe[a.id] ? (
                              <div style={{ fontSize: 12.5, color: '#64748b' }}>Cargando...</div>
                            ) : (
                              Object.entries(alumnosDe[a.id]).map(([g, info]) => (
                                <div key={g} style={{ marginBottom: 7 }}>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155' }}>
                                    {g} — {info.todos ? `va el grupo entero (${info.total})` : `${info.nombres.length} de ${info.total}`}
                                  </div>
                                  {!info.todos && info.nombres.length > 0 && (
                                    <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, marginTop: 2 }}>
                                      {info.nombres.join(' · ')}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        {/* Documentación */}
                        <div style={{ marginBottom: 10 }}>
                          {a.comision_servicio ? (
                            <a href={`/api/documento?url=${encodeURIComponent(a.comision_servicio)}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
                                borderRadius: 9, textDecoration: 'none', backgroundColor: '#eff6ff',
                                border: '1.5px solid #bfdbfe', color: '#1e40af', fontWeight: 700, fontSize: 13.5 }}>
                              📎 Ver comisiones de servicio
                            </a>
                          ) : (
                            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>📎 Sin documento de comisiones de servicio</div>
                          )}
                        </div>

                        {a.necesita_guardia && (
                          <div style={{ padding: '10px 13px', borderRadius: 9, backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', color: '#78350f', fontSize: 13, lineHeight: 1.55 }}>
                            <strong>⚠️ No va el grupo entero.</strong> Se queda alumnado en el centro.
                            <br />Profesor de guardia: <strong>{a.profesor_guardia || 'sin asignar'}</strong>
                          </div>
                        )}
                      </div>

                      {(a.estado || 'pendiente') === 'pendiente' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                          <button onClick={() => resolver(a.id, 'aprobada')} disabled={procesando === a.id}
                            style={{ padding: '9px 18px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                            {procesando === a.id ? '...' : '✅ Aprobar'}
                          </button>
                          <button onClick={() => resolver(a.id, 'rechazada')} disabled={procesando === a.id}
                            style={{ padding: '9px 18px', borderRadius: 9, border: `1.5px solid ${ROJO}`, backgroundColor: 'white', color: ROJO, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                            ❌ Rechazar
                          </button>
                        </div>
                      )}

                      {(a.estado || 'pendiente') !== 'pendiente' && (
                        <button onClick={() => resolver(a.id, 'pendiente')} disabled={procesando === a.id}
                          style={{ marginTop: 12, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                          ↩️ Volver a dejarla pendiente
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
