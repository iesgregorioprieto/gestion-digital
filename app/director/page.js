'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PanelDirector() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [solicitudes, setSolicitudes] = useState([]);
  const [todasSolicitudes, setTodasSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [mensaje, setMensaje] = useState(null);
  const [solicitudAbierta, setSolicitudAbierta] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) { window.location.href = '/login'; return; }
    if (rol !== 'director') { window.location.href = '/profesor'; return; }
    setNombreUsuario(nombre || '');
    cargarSolicitudes();
  }, []);

  useEffect(() => {
    cargarSolicitudes();
  }, [filtroEstado]);

  async function cargarSolicitudes() {
    setCargando(true);
    // Cargar todas para poder calcular alertas
    const { data: todas } = await supabase
      .from('dld')
      .select('*')
      .order('created_at', { ascending: false });
    setTodasSolicitudes(todas || []);

    const { data, error } = await supabase
      .from('dld')
      .select('*')
      .eq('estado', filtroEstado)
      .order('created_at', { ascending: false });
    if (!error) setSolicitudes(data || []);
    setCargando(false);
  }

  // Calcular alertas para una solicitud
  function calcularAlertas(solicitud) {
    const alertas = [];
    const fecha = solicitud.fecha_solicitada;
    const grupos = solicitud.grupos_afectados || [];

    // Otras solicitudes del mismo día (excluyendo la actual)
    const mismaFecha = todasSolicitudes.filter(s =>
      s.id !== solicitud.id &&
      s.fecha_solicitada === fecha &&
      s.estado !== 'rechazada'
    );

    // Alerta: más de 4 solicitudes ese día
    const totalDia = mismaFecha.length + 1;
    if (totalDia > 4) {
      alertas.push({ tipo: 'rojo', texto: `⚠️ Hay ${totalDia} solicitudes ese día (límite orientativo: 4)` });
    }

    // Alerta: grupos compartidos
    grupos.forEach(grupo => {
      const conflicto = mismaFecha.filter(s =>
        (s.grupos_afectados || []).includes(grupo)
      );
      if (conflicto.length > 0) {
        conflicto.forEach(c => {
          alertas.push({ tipo: 'rojo', texto: `🔴 ${grupo}: también solicitado por ${c.profesor_nombre}` });
        });
      }
    });

    // Alerta: días ya disfrutados
    const diasDisfrutados = todasSolicitudes.filter(s =>
      s.profesor_id === solicitud.profesor_id &&
      s.id !== solicitud.id &&
      s.estado === 'aprobada'
    ).length;

    const diasCorrespondientes =
      solicitud.tipo_contrato === 'Funcionario de carrera' || solicitud.tipo_contrato === 'Interino con vacante' ? 3 :
      solicitud.tipo_contrato === 'Interino sin vacante' ? 2 : 1;

    if (diasDisfrutados >= diasCorrespondientes) {
      alertas.push({ tipo: 'rojo', texto: `🔴 Ya ha disfrutado ${diasDisfrutados} de ${diasCorrespondientes} días correspondientes` });
    } else if (diasDisfrutados > 0) {
      alertas.push({ tipo: 'amarillo', texto: `🟡 Ha disfrutado ${diasDisfrutados} de ${diasCorrespondientes} días` });
    }

    return alertas;
  }

  // Calcular prelación respecto a otras solicitudes del mismo día
  function calcularPrelacion(solicitud) {
    const fecha = solicitud.fecha_solicitada;
    const mismaFecha = todasSolicitudes.filter(s =>
      s.id !== solicitud.id &&
      s.fecha_solicitada === fecha &&
      s.estado === 'pendiente'
    );

    if (mismaFecha.length === 0) return null;

    return mismaFecha.map(s => {
      const diasDisfrutadosS = todasSolicitudes.filter(x => x.profesor_id === s.profesor_id && x.estado === 'aprobada').length;
      const diasDisfrutadosActual = todasSolicitudes.filter(x => x.profesor_id === solicitud.profesor_id && x.estado === 'aprobada').length;
      return {
        nombre: s.profesor_nombre,
        causa_sobrevenida: s.causa_sobrevenida,
        dias_disfrutados: diasDisfrutadosS,
        antiguedad_centro: s.antiguedad_centro || 0,
        antiguedad_cuerpo: s.antiguedad_cuerpo || 0,
      };
    });
  }

  async function aprobar(id) {
    setProcesando(true);
    await supabase.from('dld').update({ estado: 'aprobada', resuelto_at: new Date().toISOString(), resuelto_por: nombreUsuario }).eq('id', id);
    mostrarMensaje('✅ Solicitud aprobada', 'ok');
    setSolicitudAbierta(null);
    cargarSolicitudes();
    setProcesando(false);
  }

  async function rechazar(id) {
    setProcesando(true);
    await supabase.from('dld').update({ estado: 'rechazada', resuelto_at: new Date().toISOString(), resuelto_por: nombreUsuario, motivo_rechazo: motivoRechazo }).eq('id', id);
    mostrarMensaje('❌ Solicitud rechazada', 'error');
    setSolicitudAbierta(null);
    setMotivoRechazo('');
    cargarSolicitudes();
    setProcesando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  function etiquetaTipoDLD(tipo) {
    if (tipo === 'no_lectivo') return '🌙 No lectivo';
    if (tipo === '1_lectivo') return '📚 1º Lectivo';
    if (tipo === '2_lectivo') return '📖 2º Lectivo';
    return tipo;
  }

  function etiquetaGuardia(tipo) {
    if (tipo === 'cuadrante_general') return '📋 Cuadrante general';
    if (tipo === 'familias_profesionales') return '🏭 Familias profesionales';
    return '📝 Otras situaciones';
  }

  const contadores = {
    pendiente: todasSolicitudes.filter(s => s.estado === 'pendiente').length,
    aprobada: todasSolicitudes.filter(s => s.estado === 'aprobada').length,
    rechazada: todasSolicitudes.filter(s => s.estado === 'rechazada').length,
  };

  const verde = '#1e6b2e';
  const verdeClaro = '#e8f5e9';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: '#1a3a6b', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👔 Panel del Director</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {nombreUsuario}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
          <button onClick={cerrarSesion} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.4)', backgroundColor: 'transparent', color: 'white', cursor: 'pointer', fontSize: 13 }}>🚪 Salir</button>
        </div>
      </div>

      {/* TOAST */}
      {mensaje && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, backgroundColor: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', color: 'white', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: 15 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* CONTADORES */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { estado: 'pendiente', emoji: '⏳', label: 'Pendientes', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
            { estado: 'aprobada', emoji: '✅', label: 'Aprobadas', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
            { estado: 'rechazada', emoji: '❌', label: 'Rechazadas', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
          ].map(c => (
            <div key={c.estado} onClick={() => setFiltroEstado(c.estado)} style={{
              backgroundColor: filtroEstado === c.estado ? c.bg : 'white',
              border: `2px solid ${filtroEstado === c.estado ? c.border : '#e5e7eb'}`,
              borderRadius: 12, padding: '16px 12px', textAlign: 'center',
              cursor: 'pointer', transition: 'all 0.15s'
            }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{c.emoji}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: c.color }}>{contadores[c.estado]}</div>
              <div style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* LISTA SOLICITUDES */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando solicitudes...</div>
        ) : solicitudes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#aaa', backgroundColor: 'white', borderRadius: 12 }}>
            No hay solicitudes {filtroEstado === 'pendiente' ? 'pendientes' : filtroEstado === 'aprobada' ? 'aprobadas' : 'rechazadas'}
          </div>
        ) : (
          solicitudes.map(s => {
            const alertas = calcularAlertas(s);
            const tieneAlertas = alertas.length > 0;
            return (
              <div key={s.id} style={{
                backgroundColor: 'white', borderRadius: 12, padding: 18,
                marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                borderLeft: `4px solid ${tieneAlertas ? '#ef4444' : filtroEstado === 'aprobada' ? '#10b981' : filtroEstado === 'rechazada' ? '#6b7280' : '#f59e0b'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#1a3a6b', marginBottom: 4 }}>
                      {s.profesor_nombre}
                    </div>
                    <div style={{ fontSize: 13, color: '#555' }}>
                      📅 {new Date(s.fecha_solicitada + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    <div style={{ fontSize: 13, color: '#555' }}>
                      {etiquetaTipoDLD(s.tipo_dld)} · {s.tipo_contrato}
                    </div>
                    {s.grupos_afectados?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                        {s.grupos_afectados.map(g => (
                          <span key={g} style={{ fontSize: 12, backgroundColor: '#e8f0fe', color: '#1a56db', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{g}</span>
                        ))}
                      </div>
                    )}
                    {s.causa_sobrevenida && (
                      <div style={{ marginTop: 6, fontSize: 12, backgroundColor: '#fffbeb', color: '#92400e', padding: '3px 10px', borderRadius: 10, display: 'inline-block', fontWeight: 600 }}>
                        ⚠️ Causa sobrevenida
                      </div>
                    )}
                    {/* Alertas */}
                    {tieneAlertas && (
                      <div style={{ marginTop: 8 }}>
                        {alertas.map((a, i) => (
                          <div key={i} style={{ fontSize: 12, color: a.tipo === 'rojo' ? '#b91c1c' : '#92400e', marginTop: 2 }}>
                            {a.texto}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      Solicitado: {new Date(s.created_at).toLocaleDateString('es-ES')}
                    </div>
                    {filtroEstado === 'pendiente' && (
                      <button onClick={() => { setSolicitudAbierta(s); setMotivoRechazo(''); }} style={{
                        padding: '8px 16px', borderRadius: 8, border: 'none',
                        backgroundColor: '#1a3a6b', color: 'white',
                        cursor: 'pointer', fontWeight: 600, fontSize: 13
                      }}>📋 Revisar</button>
                    )}
                    {filtroEstado === 'aprobada' && <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✅ Aprobada</span>}
                    {filtroEstado === 'rechazada' && (
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>❌ Rechazada</span>
                        {s.motivo_rechazo && <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.motivo_rechazo}</div>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL REVISIÓN */}
      {solicitudAbierta && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setSolicitudAbierta(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 28, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: '#1a3a6b' }}>📋 Revisión de solicitud</h2>
              <button onClick={() => setSolicitudAbierta(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>

            {/* DATOS SOLICITANTE */}
            <div style={{ backgroundColor: '#f0f4ff', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: '#1a3a6b', marginBottom: 10, fontSize: 15 }}>👤 Datos del solicitante</div>
              <Fila label="Nombre" valor={solicitudAbierta.profesor_nombre} />
              <Fila label="Contrato" valor={solicitudAbierta.tipo_contrato} />
              <Fila label="Tipo DLD" valor={etiquetaTipoDLD(solicitudAbierta.tipo_dld)} />
              <Fila label="Fecha" valor={new Date(solicitudAbierta.fecha_solicitada + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
              <Fila label="Guardias" valor={etiquetaGuardia(solicitudAbierta.tipo_guardia)} />
              <Fila label="Antigüedad centro" valor={`${solicitudAbierta.antiguedad_centro || 0} años`} />
              <Fila label="Antigüedad cuerpo" valor={`${solicitudAbierta.antiguedad_cuerpo || 0} años`} />
              {solicitudAbierta.causa_sobrevenida && (
                <div style={{ marginTop: 8, padding: 10, backgroundColor: '#fffbeb', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                  ⚠️ <strong>Causa sobrevenida:</strong> {solicitudAbierta.descripcion_causa || 'Sin descripción'}
                </div>
              )}
            </div>

            {/* GRUPOS AFECTADOS */}
            {solicitudAbierta.grupos_afectados?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: '#1a3a6b', marginBottom: 8, fontSize: 15 }}>👥 Grupos afectados</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {solicitudAbierta.grupos_afectados.map(g => (
                    <span key={g} style={{ fontSize: 13, backgroundColor: '#e8f0fe', color: '#1a56db', padding: '4px 12px', borderRadius: 10, fontWeight: 600 }}>{g}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ALERTAS */}
            {(() => {
              const alertas = calcularAlertas(solicitudAbierta);
              const prelacion = calcularPrelacion(solicitudAbierta);
              return (
                <>
                  {alertas.length > 0 && (
                    <div style={{ backgroundColor: '#fff5f5', border: '1.5px solid #fca5a5', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 8, fontSize: 15 }}>⚠️ Alertas informativas</div>
                      {alertas.map((a, i) => (
                        <div key={i} style={{ fontSize: 13, color: a.tipo === 'rojo' ? '#b91c1c' : '#92400e', marginBottom: 4 }}>{a.texto}</div>
                      ))}
                    </div>
                  )}

                  {prelacion && prelacion.length > 0 && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8, fontSize: 15 }}>📊 Prelación — otros solicitantes ese día</div>
                      {prelacion.map((p, i) => (
                        <div key={i} style={{ fontSize: 13, color: '#555', marginBottom: 6, padding: '6px 10px', backgroundColor: 'white', borderRadius: 8 }}>
                          <strong>{p.nombre}</strong> ·
                          {p.causa_sobrevenida && <span style={{ color: '#b91c1c' }}> ⚠️ Causa sobrevenida ·</span>}
                          Días disfrutados: {p.dias_disfrutados} ·
                          Centro: {p.antiguedad_centro} años ·
                          Cuerpo: {p.antiguedad_cuerpo} años
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}

            {/* MOTIVO RECHAZO */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                Motivo de rechazo (obligatorio si rechazas)
              </label>
              <textarea
                value={motivoRechazo}
                onChange={e => setMotivoRechazo(e.target.value)}
                placeholder="Indica el motivo del rechazo según la normativa..."
                rows={3}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }}
              />
            </div>

            {/* BOTONES */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => aprobar(solicitudAbierta.id)} disabled={procesando} style={{
                flex: 1, padding: 13, borderRadius: 10, border: 'none',
                backgroundColor: '#065f46', color: 'white', fontWeight: 700,
                cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15
              }}>
                ✅ Aprobar
              </button>
              <button onClick={() => { if (!motivoRechazo.trim()) { alert('Debes indicar el motivo del rechazo'); return; } rechazar(solicitudAbierta.id); }} disabled={procesando} style={{
                flex: 1, padding: 13, borderRadius: 10, border: 'none',
                backgroundColor: '#b91c1c', color: 'white', fontWeight: 700,
                cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15
              }}>
                ❌ Rechazar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({ label, valor }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #e8ecf4' }}>
      <span style={{ width: 150, fontWeight: 600, color: '#555', fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#222' }}>{valor}</span>
    </div>
  );
}