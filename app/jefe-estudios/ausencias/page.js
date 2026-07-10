'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const verde = '#1e6b2e';
const azul = '#1e3a5f';
const rojo = '#991b1b';
const naranja = '#7c2d12';

const HORAS = [
  { id: 'h1', label: '1ª hora' },
  { id: 'h2', label: '2ª hora' },
  { id: 'h3', label: '3ª hora' },
  { id: 'recreo', label: 'Recreo', soloGuardia: true },
  { id: 'h4', label: '4ª hora' },
  { id: 'h5', label: '5ª hora' },
  { id: 'h6', label: '6ª hora' },
];

const ETAPAS = {
  'ESO':    ['ESO-1AM','ESO-1AZ','ESO-1NA','ESO-1VE','ESO-2AM','ESO-2AZ','ESO-2VE','ESO-3AM','ESO-3AZ','ESO-3DIV','ESO-3NA','ESO-3VE','ESO-4AM','ESO-4AZ','ESO-4VE'],
  'BTO':    ['BTO-1CT','BTO-1HCS','BTO-2A','BTO-2B'],
  'GB':     ['GB-1CR','GB-1EE','GB-1MV','GB-1SC','GB-2CR','GB-2EE','GB-2MV','GB-2SC'],
  'GM':     ['GM-1ACC','GM-1AOV','GM-1CAR','GM-1COC','GM-1EVA.A','GM-1EVA.B','GM-1GAD','GM-1IEA','GM-1ITE','GM-1SMR.A','GM-1SMR.B','GM-2ACC','GM-2AOV','GM-2CAR','GM-2COC','GM-2EVA','GM-2GAD','GM-2IEA','GM-2ITE','GM-2SMR.A','GM-2SMR.B'],
  'GS':     ['GS-1AAD','GS-1AFI','GS-1ASIR','GS-1AUT','GS-1DAM','GS-1DAW','GS-1DDC','GS-1GVEC','GS-1SEA','GS-1STI','GS-1TLO','GS-1VIT','GS-2AFI','GS-2ASIR','GS-2AUT','GS-2DAM','GS-2DAW','GS-2DDC','GS-2GVEC','GS-2SEA','GS-2STI','GS-2TLO','GS-2VITI'],
  'CA':     ['CA-CFGS-A','CA-CFGS-B','CA-CFGS-C'],
  'FPPE':   ['FPPE-1JAR','FPPE-2JAR'],
  'GUARDIA':['Cuadrante general','Familias profesionales','Guardia de recreo','Otras situaciones'],
};

const ESTADOS = {
  pendiente:      { label: 'Pendiente',     bg: '#fef3c7', color: '#92400e', emoji: '⏳' },
  justificada:    { label: 'Justificada',   bg: '#d1fae5', color: '#065f46', emoji: '✅' },
  sin_justificar: { label: 'Sin justif.',   bg: '#fee2e2', color: '#991b1b', emoji: '❌' },
};

export default function GestionAusencias() {
  const [nombre, setNombre] = useState('');
  const [vista, setVista] = useState('lista');
  const [ausencias, setAusencias] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroProfesor, setFiltroProfesor] = useState('');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');

  // Modal justificación
  const [ausenciaGestion, setAusenciaGestion] = useState(null);
  const [comentarioJust, setComentarioJust] = useState('');
  const [procesando, setProcesando] = useState(false);

  // Formulario manual
  const [profesorSeleccionado, setProfesorSeleccionado] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState('imprevista');
  const [horario, setHorario] = useState({});
  const [horaEditando, setHoraEditando] = useState(null);
  const [etapaSeleccionada, setEtapaSeleccionada] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || (rol !== 'jefe_estudios' && rol !== 'secretario' && rol !== 'director')) {
      window.location.href = '/login'; return;
    }
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
    cargarTodo();
  }, []);

  async function cargarTodo() {
    setCargando(true);
    const [{ data: aus }, { data: profs }] = await Promise.all([
      getSupabase().from('ausencias').select('*').order('created_at', { ascending: false }),
      getSupabase().from('profesores').select('id, nombre, apellidos, departamento').eq('estado', 'activo').order('apellidos'),
    ]);
    setAusencias(aus || []);
    setProfesores(profs || []);
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  // ===== FILTROS =====
  const ausenciasFiltradas = ausencias.filter(a => {
    if (filtroEstado !== 'todos' && a.estado !== filtroEstado) return false;
    if (filtroProfesor && !a.profesor_nombre?.toLowerCase().includes(filtroProfesor.toLowerCase())) return false;
    if (filtroFechaDesde && a.fecha_inicio < filtroFechaDesde) return false;
    if (filtroFechaHasta && a.fecha_inicio > filtroFechaHasta) return false;
    return true;
  });

  const contadores = {
    pendiente:      ausencias.filter(a => a.estado === 'pendiente').length,
    justificada:    ausencias.filter(a => a.estado === 'justificada').length,
    sin_justificar: ausencias.filter(a => a.estado === 'sin_justificar').length,
  };

  // ===== GESTIÓN JUSTIFICACIÓN =====
  async function aprobarJustificacion(id) {
    setProcesando(true);
    await getSupabase().from('ausencias').update({ estado: 'justificada', comentario_secretario: comentarioJust || null }).eq('id', id);
    setProcesando(false);
    setAusenciaGestion(null);
    setComentarioJust('');
    mostrarMensaje('✅ Justificación aprobada', 'ok');
    cargarTodo();
  }

  async function rechazarJustificacion(id) {
    if (!comentarioJust.trim()) { mostrarMensaje('Indica el motivo del rechazo.', 'error'); return; }
    setProcesando(true);
    await getSupabase().from('ausencias').update({ estado: 'sin_justificar', comentario_secretario: comentarioJust }).eq('id', id);
    setProcesando(false);
    setAusenciaGestion(null);
    setComentarioJust('');
    mostrarMensaje('❌ Justificación rechazada', 'ok');
    cargarTodo();
  }

  async function eliminarAusencia(id) {
    if (!confirm('¿Eliminar esta ausencia? No se puede deshacer.')) return;
    await getSupabase().from('ausencias').delete().eq('id', id);
    mostrarMensaje('🗑️ Ausencia eliminada', 'ok');
    cargarTodo();
  }

  // ===== FORMULARIO MANUAL =====
  function setHoraTipo(horaId, tipoH) {
    setHorario(h => ({ ...h, [horaId]: { tipo: tipoH, grupo: '', instrucciones: '' } }));
    setHoraEditando(horaId);
    setEtapaSeleccionada(tipoH === 'guardia' ? 'GUARDIA' : '');
  }

  function limpiarHora(horaId) {
    setHorario(h => { const n = { ...h }; delete n[horaId]; return n; });
    if (horaEditando === horaId) setHoraEditando(null);
  }

  function setGrupo(horaId, grupo) {
    setHorario(h => ({ ...h, [horaId]: { ...h[horaId], grupo } }));
    setHoraEditando(null);
    setEtapaSeleccionada('');
  }

  async function enviarManual() {
    if (!profesorSeleccionado) { mostrarMensaje('Selecciona el profesor.', 'error'); return; }
    if (!fechaInicio) { mostrarMensaje('Indica la fecha.', 'error'); return; }
    if (!motivo.trim()) { mostrarMensaje('Indica el motivo.', 'error'); return; }

    const prof = profesores.find(p => p.id === profesorSeleccionado);
    setEnviando(true);

    const horasConDatos = Object.entries(horario).map(([horaId, val]) => ({
      hora: HORAS.find(h => h.id === horaId)?.label || horaId,
      tipo: val.tipo,
      grupo: val.grupo || null,
      instrucciones: val.instrucciones?.trim() || null,
    }));

    const { error } = await getSupabase().from('ausencias').insert([{
      profesor_id: prof.id,
      profesor_nombre: `${prof.nombre} ${prof.apellidos}`,
      departamento: prof.departamento || '',
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin || fechaInicio,
      motivo: motivo.trim(),
      tipo,
      horas: horasConDatos,
      estado: 'pendiente',
    }]);

    setEnviando(false);
    if (error) { mostrarMensaje('Error: ' + error.message, 'error'); return; }

    mostrarMensaje(`✅ Ausencia de ${prof.nombre} ${prof.apellidos} registrada correctamente`, 'ok');
    setProfesorSeleccionado(''); setFechaInicio(''); setFechaFin('');
    setMotivo(''); setTipo('imprevista'); setHorario({});
    setVista('lista');
    cargarTodo();
  }

  function diasParaJustificar(createdAt) {
    const limite = new Date(createdAt);
    limite.setDate(limite.getDate() + 3);
    return Math.ceil((limite - new Date()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: naranja, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/jefe-estudios'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🏥</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Gestión de Ausencias</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre}</div>
        </div>
      </div>

      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : rojo, fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      {/* TABS */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0' }}>
        {[
          { id: 'lista', label: `📋 Todas las ausencias (${ausencias.length})` },
          { id: 'manual', label: '✍️ Registrar ausencia' },
        ].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)} style={{ padding: '9px 18px', borderRadius: 10, border: `2px solid ${vista === t.id ? naranja : '#ddd'}`, backgroundColor: vista === t.id ? naranja : 'white', color: vista === t.id ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {/* ===== LISTA ===== */}
        {vista === 'lista' && (
          <div>
            {/* CONTADORES */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {Object.entries(contadores).map(([est, num]) => {
                const e = ESTADOS[est];
                return (
                  <div key={est} onClick={() => setFiltroEstado(filtroEstado === est ? 'todos' : est)}
                    style={{ backgroundColor: e.bg, borderRadius: 10, padding: '12px 14px', textAlign: 'center', cursor: 'pointer', border: `2px solid ${filtroEstado === est ? e.color : 'transparent'}` }}>
                    <div style={{ fontSize: 20 }}>{e.emoji}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: e.color }}>{num}</div>
                    <div style={{ fontSize: 11, color: e.color, fontWeight: 600 }}>{e.label}</div>
                  </div>
                );
              })}
            </div>

            {/* FILTROS */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Estado</label>
                  <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13 }}>
                    <option value="todos">Todos</option>
                    {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Profesor</label>
                  <input value={filtroProfesor} onChange={e => setFiltroProfesor(e.target.value)} placeholder="Buscar..." style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Desde</label>
                  <input type="date" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Hasta</label>
                  <input type="date" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={() => { setFiltroEstado('todos'); setFiltroProfesor(''); setFiltroFechaDesde(''); setFiltroFechaHasta(''); }} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🔄 Borrar filtros</button>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}><strong style={{ color: azul }}>{ausenciasFiltradas.length}</strong> ausencias</div>
            </div>

            {/* LISTA */}
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
            ) : ausenciasFiltradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}><div style={{ fontSize: 36, marginBottom: 8 }}>🏥</div>No hay ausencias con esos filtros</div>
            ) : ausenciasFiltradas.map(a => {
              const est = ESTADOS[a.estado] || ESTADOS.pendiente;
              const horas = Array.isArray(a.horas) ? a.horas : [];
              const dias = diasParaJustificar(a.created_at);
              return (
                <div key={a.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${est.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>{a.profesor_nombre}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {a.tipo === 'prevista' ? '📆' : '🚨'} {a.tipo} ·
                        {a.fecha_inicio === a.fecha_fin
                          ? ` ${new Date(a.fecha_inicio + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}`
                          : ` ${new Date(a.fecha_inicio + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${new Date(a.fecha_fin + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}
                      </div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{a.motivo}</div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 20, backgroundColor: est.bg, color: est.color, fontWeight: 700, fontSize: 12 }}>{est.emoji} {est.label}</span>
                  </div>

                  {/* Horas */}
                  {horas.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {horas.map((h, i) => (
                        <div key={i} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, backgroundColor: h.tipo === 'clase' ? '#fef3c7' : h.tipo === 'guardia' ? '#dbeafe' : '#ede9fe', color: h.tipo === 'clase' ? '#92400e' : h.tipo === 'guardia' ? '#1e40af' : '#6d28d9', fontWeight: 600 }}>
                          {h.hora} · {h.grupo || h.tipo}
                          {h.instrucciones && <span style={{ marginLeft: 4, opacity: 0.7 }}>📝</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tarea detalle */}
                  {horas.filter(h => h.instrucciones || h.archivo_url).length > 0 && (
                    <div style={{ marginTop: 8, backgroundColor: '#fffbeb', borderRadius: 8, padding: '8px 12px' }}>
                      {horas.filter(h => h.instrucciones || h.archivo_url).map((h, i) => (
                        <div key={i} style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>
                          <strong>{h.hora} — {h.grupo}{h.materia ? ` (${h.materia})` : ''}:</strong>
                          {h.instrucciones && <span> {h.instrucciones}</span>}
                          {h.archivo_url && (
                            <a href={h.archivo_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: '#1e40af', fontWeight: 600 }}>📎 Ver archivo</a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Justificación pendiente */}
                  {a.estado === 'pendiente' && a.justificacion_texto && (
                    <div style={{ marginTop: 10, padding: '8px 12px', backgroundColor: '#eff6ff', borderRadius: 8, fontSize: 13, border: '1px solid #93c5fd' }}>
                      <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>📄 Justificación presentada:</div>
                      <div style={{ color: '#1e40af' }}>{a.justificacion_texto}</div>
                      {a.justificacion_url && <a href={a.justificacion_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 600, fontSize: 12 }}>📎 Ver documento</a>}
                    </div>
                  )}

                  {/* Aviso plazo */}
                  {a.estado === 'pendiente' && !a.justificacion_texto && (
                    <div style={{ marginTop: 8, fontSize: 12, color: dias <= 0 ? rojo : dias <= 1 ? '#92400e' : '#888' }}>
                      {dias <= 0 ? '❌ Plazo de justificación vencido' : `⏰ ${dias} día${dias !== 1 ? 's' : ''} para justificar`}
                    </div>
                  )}

                  {/* BOTONES */}
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {a.estado === 'pendiente' && a.justificacion_texto && (
                      <button onClick={() => { setAusenciaGestion(a); setComentarioJust(''); }} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>📋 Gestionar justificación</button>
                    )}
                    {a.estado === 'justificada' && (
                      <button onClick={() => eliminarAusencia(a.id)} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #fca5a5', backgroundColor: '#fee2e2', color: rojo, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🗑️ Eliminar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== FORMULARIO MANUAL ===== */}
        {vista === 'manual' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <div style={{ backgroundColor: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
              ✍️ Estás registrando una ausencia <strong>en nombre de un profesor</strong>. Las tareas son opcionales.
            </div>

            {/* PROFESOR */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>👨‍🏫 Profesor *</label>
              <select value={profesorSeleccionado} onChange={e => setProfesorSeleccionado(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">-- Selecciona el profesor --</option>
                {profesores.map(p => <option key={p.id} value={p.id}>{p.apellidos}, {p.nombre} {p.departamento ? `· ${p.departamento}` : ''}</option>)}
              </select>
            </div>

            {/* FECHAS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>📅 Fecha inicio *</label>
                <input type="date" value={fechaInicio} onChange={e => { setFechaInicio(e.target.value); if (!fechaFin) setFechaFin(e.target.value); }} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>📅 Fecha fin</label>
                <input type="date" value={fechaFin} min={fechaInicio} onChange={e => setFechaFin(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* TIPO */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 8 }}>⚠️ Tipo</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[{ valor: 'prevista', emoji: '📆', label: 'Prevista' }, { valor: 'imprevista', emoji: '🚨', label: 'Imprevista' }].map(t => (
                  <div key={t.valor} onClick={() => setTipo(t.valor)} style={{ padding: 12, borderRadius: 10, border: `2px solid ${tipo === t.valor ? naranja : '#e0e0e0'}`, backgroundColor: tipo === t.valor ? '#fff7ed' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: 20 }}>{t.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: tipo === t.valor ? naranja : '#333' }}>{t.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* MOTIVO */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>📝 Motivo *</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Enfermedad, visita médica, asunto personal..." rows={2} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {/* HORARIO */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 4 }}>🕐 Horario afectado</label>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Marca las horas. Las tareas son opcionales — ponlas solo si el profesor las dictó por teléfono.</div>

              {HORAS.map(hora => {
                const val = horario[hora.id];
                const esRecreo = hora.id === 'recreo';
                const esEditando = horaEditando === hora.id;
                return (
                  <div key={hora.id} style={{ borderRadius: 10, border: `1.5px solid ${val ? (val.tipo === 'clase' ? '#fbbf24' : '#93c5fd') : '#e0e0e0'}`, marginBottom: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: val ? (val.tipo === 'clase' ? '#fffbeb' : '#eff6ff') : 'white' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: azul, minWidth: 60 }}>{hora.label}</span>
                      <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                        {!esRecreo && (
                          <button onClick={() => val?.tipo === 'clase' ? limpiarHora(hora.id) : setHoraTipo(hora.id, 'clase')}
                            style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${val?.tipo === 'clase' ? '#fbbf24' : '#e0e0e0'}`, backgroundColor: val?.tipo === 'clase' ? '#fef3c7' : 'white', color: val?.tipo === 'clase' ? '#92400e' : '#555', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            📚 Clase
                          </button>
                        )}
                        <button onClick={() => val?.tipo === 'guardia' ? limpiarHora(hora.id) : setHoraTipo(hora.id, 'guardia')}
                          style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${val?.tipo === 'guardia' ? '#93c5fd' : '#e0e0e0'}`, backgroundColor: val?.tipo === 'guardia' ? '#dbeafe' : 'white', color: val?.tipo === 'guardia' ? '#1e40af' : '#555', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          🛡️ Guardia
                        </button>
                        {!esRecreo && (
                          <button onClick={() => val?.tipo === 'complementaria' ? limpiarHora(hora.id) : setHoraTipo(hora.id, 'complementaria')}
                            style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${val?.tipo === 'complementaria' ? '#a78bfa' : '#e0e0e0'}`, backgroundColor: val?.tipo === 'complementaria' ? '#ede9fe' : 'white', color: val?.tipo === 'complementaria' ? '#6d28d9' : '#555', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            📋 Complementaria
                          </button>
                        )}
                      </div>
                      {val && <button onClick={() => limpiarHora(hora.id)} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}>✕</button>}
                    </div>

                    {/* SELECTOR DE GRUPO */}
                    {esEditando && val && (
                      <div style={{ padding: '12px 14px', backgroundColor: '#f8f8f8', borderTop: '1px solid #eee' }}>
                        {!etapaSeleccionada ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8 }}>Selecciona la etapa:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {Object.keys(ETAPAS).filter(e => val.tipo === 'guardia' ? e === 'GUARDIA' : e !== 'GUARDIA').map(etapa => (
                                <button key={etapa} onClick={() => setEtapaSeleccionada(etapa)} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: azul }}>
                                  {etapa}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <button onClick={() => setEtapaSeleccionada('')} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8 }}>← Cambiar etapa</button>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {ETAPAS[etapaSeleccionada].map(g => (
                                <button key={g} onClick={() => setGrupo(hora.id, g)} style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 12, color: '#333' }}>
                                  {g}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* GRUPO + TAREA OPCIONAL */}
                    {val && val.grupo && !esEditando && (
                      <div style={{ padding: '10px 14px', borderTop: '1px solid #eee', backgroundColor: '#fafafa' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: val.tipo === 'clase' ? 8 : 0 }}>
                          <span style={{ fontSize: 12, backgroundColor: '#e0e7ff', color: '#3730a3', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>{val.grupo}</span>
                          <button onClick={() => { setHoraEditando(hora.id); setEtapaSeleccionada(''); }} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>Cambiar</button>
                        </div>
                        {val.tipo === 'clase' && (
                          <textarea value={val.instrucciones || ''} onChange={e => setHorario(h => ({ ...h, [hora.id]: { ...h[hora.id], instrucciones: e.target.value } }))}
                            placeholder="📝 Tarea para el alumnado (opcional — si la dictó por teléfono)" rows={2}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }} />
                        )}
                      </div>
                    )}

                    {val && !val.grupo && !esEditando && (
                      <div style={{ padding: '8px 14px', borderTop: '1px solid #eee' }}>
                        <button onClick={() => { setHoraEditando(hora.id); setEtapaSeleccionada(val.tipo === 'guardia' ? 'GUARDIA' : ''); }} style={{ color: '#1e40af', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                          + Seleccionar grupo →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={enviarManual} disabled={enviando} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', backgroundColor: naranja, color: 'white', fontWeight: 800, fontSize: 15, cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
              {enviando ? '⏳ Registrando...' : '✍️ Registrar ausencia'}
            </button>
          </div>
        )}
      </div>

      {/* MODAL GESTIÓN JUSTIFICACIÓN */}
      {ausenciaGestion && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={e => e.target === e.currentTarget && setAusenciaGestion(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: azul }}>📋 Gestionar justificación</div>
              <button onClick={() => setAusenciaGestion(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}><strong>{ausenciaGestion.profesor_nombre}</strong></div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>{ausenciaGestion.motivo}</div>
            <div style={{ padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
              <strong style={{ color: '#1e40af' }}>Justificación del profesor:</strong>
              <div style={{ color: '#1e40af', marginTop: 4 }}>{ausenciaGestion.justificacion_texto}</div>
              {ausenciaGestion.justificacion_url && <a href={ausenciaGestion.justificacion_url} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 600, fontSize: 12 }}>📎 Ver documento</a>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: azul, display: 'block', marginBottom: 6 }}>💬 Comentario (obligatorio si rechazas)</label>
              <textarea value={comentarioJust} onChange={e => setComentarioJust(e.target.value)} placeholder="Motivo de aprobación o rechazo..." rows={3} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => aprobarJustificacion(ausenciaGestion.id)} disabled={procesando} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✅ Aprobar</button>
              <button onClick={() => rechazarJustificacion(ausenciaGestion.id)} disabled={procesando} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', backgroundColor: '#fee2e2', color: rojo, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>❌ Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
