'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
  if (!_supabase) _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return _supabase;
}

const azul = '#1e3a5f';
const verde = '#1e6b2e';

const HORAS = [
  { id: '1', label: '1ª hora', horario: '8:30–9:25' },
  { id: '2', label: '2ª hora', horario: '9:25–10:20' },
  { id: '3', label: '3ª hora', horario: '10:20–11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15–11:45' },
  { id: '4', label: '4ª hora', horario: '11:45–12:40' },
  { id: '5', label: '5ª hora', horario: '12:40–13:35' },
  { id: '6', label: '6ª hora', horario: '13:35–14:30' },
];

const DIAS = ['lunes','martes','miercoles','jueves','viernes'];

function diaSemanaEs(fecha) {
  const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  return dias[new Date(fecha+'T12:00:00').getDay()];
}

function normHora(h) { return (h||'').toString().replace(/[aª]$/,''); }

export default function GestionGuardias() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [sectores, setSectores] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [guardiasManuales, setGuardiasManuales] = useState([]);
  const [guardiasHorario, setGuardiasHorario] = useState({});
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);

  // Modal añadir guardia
  const [modalAbierto, setModalAbierto] = useState(false);
  const [horaSeleccionada, setHoraSeleccionada] = useState('1');
  const [sectorSeleccionado, setSectorSeleccionado] = useState('');
  const [profesorSeleccionado, setProfesorSeleccionado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id) { window.location.href = '/login'; return; }
    if (!['director','secretario','jefe_estudios'].includes(rol)) {
      window.location.href = '/profesor';
      return;
    }
    setNombreUsuario(nombre || '');
    cargarBase();
  }, []);

  useEffect(() => {
    if (!cargando) cargarGuardiasManuales();
  }, [fecha, cargando]);

  async function cargarBase() {
    setCargando(true);

    // Cargar sectores desde horarios de Delphos
    const { data: horarios } = await getSupabase()
      .from('horarios_profesores')
      .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia')
      .eq('curso_academico','2025-2026')
      .eq('tipo','guardia');

    const porSector = {};
    (horarios || []).forEach(g => {
      const sector = g.grupo?.trim() || g.materia?.trim() || 'General';
      const hora = normHora(g.hora_id);
      const dia = (g.dia || '').toLowerCase();
      if (!porSector[sector]) porSector[sector] = {};
      if (!porSector[sector][dia]) porSector[sector][dia] = {};
      if (!porSector[sector][dia][hora]) porSector[sector][dia][hora] = [];
      porSector[sector][dia][hora].push(g.profesor_nombre_pdf);
    });

    setSectores(Object.keys(porSector).sort());
    setGuardiasHorario(porSector);

    // Cargar lista de profesores activos
    const { data: profs } = await getSupabase()
      .from('profesores')
      .select('id, nombre, apellidos')
      .eq('estado','activo')
      .order('apellidos');
    setProfesores(profs || []);

    setCargando(false);
  }

  async function cargarGuardiasManuales() {
    const { data } = await getSupabase()
      .from('guardias_manuales')
      .select('*')
      .eq('fecha', fecha)
      .order('hora_id');
    setGuardiasManuales(data || []);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  async function añadirGuardia() {
    if (!sectorSeleccionado || !profesorSeleccionado) {
      mostrarMensaje('⚠️ Selecciona sector y profesor', 'error');
      return;
    }
    setGuardando(true);
    const prof = profesores.find(p => p.id === profesorSeleccionado);
    const { error } = await getSupabase().from('guardias_manuales').insert({
      fecha,
      hora_id: horaSeleccionada,
      sector: sectorSeleccionado,
      profesor_nombre: `${prof.apellidos}, ${prof.nombre}`,
      profesor_id: profesorSeleccionado,
      motivo,
      creado_por: nombreUsuario,
    });
    setGuardando(false);
    if (error) { mostrarMensaje('❌ Error al guardar: ' + error.message, 'error'); return; }
    mostrarMensaje('✅ Guardia añadida correctamente', 'ok');
    setModalAbierto(false);
    setMotivo('');
    setProfesorSeleccionado('');
    cargarGuardiasManuales();
  }

  async function eliminarGuardia(id) {
    if (!confirm('¿Eliminar esta guardia?')) return;
    await getSupabase().from('guardias_manuales').delete().eq('id', id);
    mostrarMensaje('🗑️ Guardia eliminada', 'ok');
    cargarGuardiasManuales();
  }

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  const diaSem = diaSemanaEs(fecha);
  const esFinde = diaSem === 'sabado' || diaSem === 'domingo';

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f0f4f0', fontFamily:'system-ui,sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor:azul, color:'white', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>🛡️ Gestión de Guardias</div>
          <div style={{ fontSize:12, opacity:0.8 }}>{nombreUsuario}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href="/gestion" style={{ color:'white', textDecoration:'none', fontSize:14, padding:'6px 12px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6 }}>← Volver</a>
          <button onClick={cerrarSesion} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,0.3)', backgroundColor:'transparent', color:'white', cursor:'pointer', fontSize:13 }}>🚪 Salir</button>
        </div>
      </div>

      {/* MENSAJE */}
      {mensaje && (
        <div style={{ position:'fixed', top:20, right:20, zIndex:9999, backgroundColor: mensaje.tipo==='ok'?'#065f46':'#991b1b', color:'white', padding:'12px 20px', borderRadius:8, fontSize:14, fontWeight:600 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ maxWidth:1000, margin:'0 auto', padding:'24px 16px' }}>

        {/* SELECTOR FECHA */}
        <div style={{ backgroundColor:'white', borderRadius:12, padding:16, marginBottom:20, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:13, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>📅 Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ padding:'10px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14, width:'100%', boxSizing:'border-box' }} />
          </div>
          <div style={{ paddingTop:22 }}>
            <button onClick={() => { setModalAbierto(true); }} disabled={esFinde}
              style={{ padding:'10px 20px', borderRadius:8, border:'none', backgroundColor: esFinde?'#e5e7eb':verde, color:'white', fontWeight:700, fontSize:14, cursor: esFinde?'not-allowed':'pointer' }}>
              ➕ Añadir guardia
            </button>
          </div>
        </div>

        {esFinde ? (
          <div style={{ textAlign:'center', padding:40, color:'#888', backgroundColor:'white', borderRadius:12 }}>
            🏖️ Fin de semana — no hay guardias
          </div>
        ) : cargando ? (
          <div style={{ textAlign:'center', padding:40, color:'#888' }}>Cargando...</div>
        ) : (
          <>
            {/* GUARDIAS MANUALES DEL DÍA */}
            <div style={{ backgroundColor:'white', borderRadius:12, padding:20, marginBottom:20, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight:800, fontSize:15, color:azul, marginBottom:16 }}>
                📋 Guardias asignadas — {diaSem.charAt(0).toUpperCase()+diaSem.slice(1)} {new Date(fecha+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long'})}
              </div>

              {guardiasManuales.length === 0 ? (
                <div style={{ textAlign:'center', padding:24, color:'#aaa', fontSize:14 }}>
                  No hay guardias manuales para este día.<br/>
                  <span style={{ fontSize:12 }}>Las guardias del cuadrante de Delphos se muestran abajo.</span>
                </div>
              ) : (
                <div style={{ display:'grid', gap:10 }}>
                  {guardiasManuales.map(g => {
                    const hora = HORAS.find(h => h.id === g.hora_id);
                    return (
                      <div key={g.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', backgroundColor:'#f0fdf4', borderRadius:10, border:'1.5px solid #86efac' }}>
                        <div>
                          <div style={{ fontWeight:700, color:verde, fontSize:14 }}>
                            {hora?.label} ({hora?.horario}) — {g.sector}
                          </div>
                          <div style={{ fontSize:13, color:'#555', marginTop:2 }}>👤 {g.profesor_nombre}</div>
                          {g.motivo && <div style={{ fontSize:12, color:'#888', marginTop:2 }}>💬 {g.motivo}</div>}
                          <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>Añadido por {g.creado_por}</div>
                        </div>
                        <button onClick={() => eliminarGuardia(g.id)}
                          style={{ padding:'6px 12px', borderRadius:6, border:'none', backgroundColor:'#fee2e2', color:'#991b1b', fontWeight:600, fontSize:12, cursor:'pointer' }}>
                          🗑️ Eliminar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* CUADRANTE DELPHOS */}
            <div style={{ backgroundColor:'white', borderRadius:12, padding:20, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight:800, fontSize:15, color:azul, marginBottom:16 }}>
                📊 Cuadrante de guardias (Delphos) — {diaSem}
              </div>

              {sectores.length === 0 ? (
                <div style={{ textAlign:'center', padding:24, color:'#aaa', fontSize:14 }}>
                  No hay cuadrante de guardias cargado para este día.
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ backgroundColor:'#f8f9fa' }}>
                        <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:azul, borderBottom:'2px solid #e5e7eb' }}>Sector</th>
                        {HORAS.map(h => (
                          <th key={h.id} style={{ padding:'10px 8px', textAlign:'center', fontWeight:700, color:azul, borderBottom:'2px solid #e5e7eb', whiteSpace:'nowrap' }}>
                            {h.label}<br/><span style={{ fontSize:10, fontWeight:400, color:'#888' }}>{h.horario}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectores.map((sector, i) => (
                        <tr key={sector} style={{ backgroundColor: i%2===0?'white':'#fafafa' }}>
                          <td style={{ padding:'10px 12px', fontWeight:600, color:'#333', borderBottom:'1px solid #e5e7eb' }}>
                            {sector}
                          </td>
                          {HORAS.map(h => {
                            const profs = guardiasHorario[sector]?.[diaSem]?.[h.id] || [];
                            return (
                              <td key={h.id} style={{ padding:'8px', textAlign:'center', borderBottom:'1px solid #e5e7eb', verticalAlign:'top' }}>
                                {profs.map((p, j) => (
                                  <div key={j} style={{ fontSize:11, color:'#333', padding:'2px 6px', backgroundColor:'#e0e7ff', borderRadius:4, marginBottom:2, whiteSpace:'nowrap' }}>
                                    {p.split(',')[0]?.trim() || p}
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* MODAL AÑADIR GUARDIA */}
      {modalAbierto && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div style={{ backgroundColor:'white', borderRadius:16, padding:24, maxWidth:480, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight:800, fontSize:16, color:azul, marginBottom:20 }}>➕ Añadir guardia manual</div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>⏰ Hora</label>
              <select value={horaSeleccionada} onChange={e => setHoraSeleccionada(e.target.value)}
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14 }}>
                {HORAS.map(h => (
                  <option key={h.id} value={h.id}>{h.label} ({h.horario})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>🏢 Sector / Cuadrante</label>
              <select value={sectorSeleccionado} onChange={e => setSectorSeleccionado(e.target.value)}
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14 }}>
                <option value="">-- Selecciona sector --</option>
                {sectores.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="General">General</option>
                <option value="Recreo activos">Recreo activos</option>
                <option value="Jefatura">Jefatura</option>
              </select>
            </div>

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>👤 Profesor</label>
              <select value={profesorSeleccionado} onChange={e => setProfesorSeleccionado(e.target.value)}
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14 }}>
                <option value="">-- Selecciona profesor --</option>
                {profesores.map(p => (
                  <option key={p.id} value={p.id}>{p.apellidos}, {p.nombre}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>💬 Motivo (opcional)</label>
              <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder="Ej: sustitución por enfermedad"
                style={{ width:'100%', padding:'10px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14, boxSizing:'border-box' }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={añadirGuardia} disabled={guardando}
                style={{ flex:1, padding:'12px', borderRadius:9, border:'none', backgroundColor:verde, color:'white', fontWeight:700, fontSize:14, cursor: guardando?'not-allowed':'pointer' }}>
                {guardando ? '⏳ Guardando...' : '✅ Añadir guardia'}
              </button>
              <button onClick={() => { setModalAbierto(false); setMotivo(''); setProfesorSeleccionado(''); }}
                style={{ padding:'12px 18px', borderRadius:9, border:'1.5px solid #ddd', backgroundColor:'#f5f5f5', color:'#555', fontWeight:600, cursor:'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
