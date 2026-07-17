'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
const azul = '#1e3a5f';
const verde = '#1e6b2e';

const HORAS = [
  { id: '1', label: '1ª', horario: '8:30–9:25' },
  { id: '2', label: '2ª', horario: '9:25–10:20' },
  { id: '3', label: '3ª', horario: '10:20–11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15–11:45' },
  { id: '4', label: '4ª', horario: '11:45–12:40' },
  { id: '5', label: '5ª', horario: '12:40–13:35' },
  { id: '6', label: '6ª', horario: '13:35–14:30' },
];

function diaSemanaEs(fecha) {
  const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  return dias[new Date(fecha+'T12:00:00').getDay()];
}

function normHora(h) { return (h||'').toString().replace(/[aª]$/,''); }

export default function GestionGuardias() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [sectores, setSectores] = useState([]);
  const [guardiasHorario, setGuardiasHorario] = useState({});
  const [ausenciasDia, setAusenciasDia] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargandoDia, setCargandoDia] = useState(false);

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
    if (!cargando) cargarDia();
  }, [fecha, cargando]);

  async function cargarBase() {
    setCargando(true);
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
    setCargando(false);
  }

  async function cargarDia() {
    setCargandoDia(true);
    const diaSem = diaSemanaEs(fecha);
    if (diaSem === 'sabado' || diaSem === 'domingo') { setCargandoDia(false); return; }

    // Cargar ausencias del día
    const { data: aus } = await getSupabase()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, horas, fecha_inicio, fecha_fin, motivo')
      .lte('fecha_inicio', fecha)
      .gte('fecha_fin', fecha);

    // Cargar DLD aprobados
    const { data: dlds } = await getSupabase()
      .from('dld')
      .select('profesor_id, profesor_nombre, guardias_horario')
      .eq('fecha_solicitada', fecha)
      .eq('estado', 'aprobada');

    setAusenciasDia([
      ...(aus || []).map(a => ({ ...a, tipo_falta: 'ausencia' })),
      ...(dlds || []).map(d => ({ ...d, tipo_falta: 'dld', horas: d.guardias_horario || [] })),
    ]);
    setCargandoDia(false);
  }

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  const diaSem = diaSemanaEs(fecha);
  const esFinde = diaSem === 'sabado' || diaSem === 'domingo';

  // Profesores ausentes en una hora concreta
  function ausentesEnHora(horaId) {
    return ausenciasDia.filter(a => {
      const horas = Array.isArray(a.horas) ? a.horas : [];
      return horas.some(h => normHora(h.hora_id || h.hora || '') === horaId || (h.hora||'').includes(horaId));
    });
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f0f4f0', fontFamily:'system-ui,sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor:azul, color:'white', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>🛡️ Cuadrante de Guardias</div>
          <div style={{ fontSize:12, opacity:0.8 }}>{nombreUsuario}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <a href="/gestion/ausencias" style={{ color:'white', textDecoration:'none', fontSize:13, padding:'6px 12px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6 }}>
            ✍️ Registrar ausencia
          </a>
          <a href="/gestion" style={{ color:'white', textDecoration:'none', fontSize:13, padding:'6px 12px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6 }}>← Volver</a>
          <button onClick={cerrarSesion} style={{ padding:'6px 12px', borderRadius:6, border:'1px solid rgba(255,255,255,0.3)', backgroundColor:'transparent', color:'white', cursor:'pointer', fontSize:13 }}>🚪 Salir</button>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px 16px' }}>

        {/* SELECTOR FECHA */}
        <div style={{ backgroundColor:'white', borderRadius:12, padding:16, marginBottom:20, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <label style={{ fontSize:13, fontWeight:600, color:'#555', display:'block', marginBottom:6 }}>📅 Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ padding:'10px 12px', borderRadius:8, border:'1.5px solid #ddd', fontSize:14, width:'100%', boxSizing:'border-box' }} />
          </div>
          {!esFinde && ausenciasDia.length > 0 && (
            <div style={{ padding:'10px 16px', backgroundColor:'#fee2e2', borderRadius:10, border:'1.5px solid #fca5a5', fontSize:13, color:'#991b1b', fontWeight:600 }}>
              ⚠️ {ausenciasDia.length} profesor{ausenciasDia.length>1?'es':''} ausente{ausenciasDia.length>1?'s':''} hoy
            </div>
          )}
        </div>

        {esFinde ? (
          <div style={{ textAlign:'center', padding:40, color:'#888', backgroundColor:'white', borderRadius:12 }}>
            🏖️ Fin de semana — no hay guardias
          </div>
        ) : cargando ? (
          <div style={{ textAlign:'center', padding:40, color:'#888' }}>Cargando cuadrante...</div>
        ) : (
          <>
            {/* AUSENCIAS DEL DÍA */}
            {ausenciasDia.length > 0 && (
              <div style={{ backgroundColor:'white', borderRadius:12, padding:20, marginBottom:20, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight:800, fontSize:15, color:'#991b1b', marginBottom:12 }}>
                  🚨 Profesores ausentes hoy
                </div>
                {ausenciasDia.map((a, i) => (
                  <div key={i} style={{ padding:'10px 14px', backgroundColor:'#fff5f5', borderRadius:8, marginBottom:8, borderLeft:'4px solid #fca5a5' }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#991b1b' }}>
                      {a.profesor_nombre}
                      <span style={{ marginLeft:8, fontSize:11, fontWeight:400, backgroundColor:'#fee2e2', padding:'2px 8px', borderRadius:10 }}>
                        {a.tipo_falta === 'dld' ? '📄 DLD' : '🏥 Ausencia'}
                      </span>
                    </div>
                    {a.motivo && <div style={{ fontSize:12, color:'#666', marginTop:2 }}>💬 {a.motivo}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* CUADRANTE */}
            <div style={{ backgroundColor:'white', borderRadius:12, padding:20, boxShadow:'0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight:800, fontSize:15, color:azul, marginBottom:16 }}>
                📊 Cuadrante — {diaSem.charAt(0).toUpperCase()+diaSem.slice(1)} {new Date(fecha+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long'})}
              </div>

              {sectores.length === 0 ? (
                <div style={{ textAlign:'center', padding:24, color:'#aaa', fontSize:14 }}>
                  No hay cuadrante cargado. Importa los horarios desde Datos del Centro.
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ backgroundColor:'#f8f9fa' }}>
                        <th style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:azul, borderBottom:'2px solid #e5e7eb', minWidth:140 }}>Sector</th>
                        {HORAS.map(h => (
                          <th key={h.id} style={{ padding:'10px 8px', textAlign:'center', fontWeight:700, color:azul, borderBottom:'2px solid #e5e7eb', whiteSpace:'nowrap', minWidth:80 }}>
                            {h.label}<br/>
                            <span style={{ fontSize:10, fontWeight:400, color:'#888' }}>{h.horario}</span>
                            {ausentesEnHora(h.id).length > 0 && (
                              <div style={{ fontSize:10, color:'#991b1b', fontWeight:700 }}>
                                ⚠️ {ausentesEnHora(h.id).length} ausente{ausentesEnHora(h.id).length>1?'s':''}
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectores.map((sector, i) => (
                        <tr key={sector} style={{ backgroundColor: i%2===0?'white':'#fafafa' }}>
                          <td style={{ padding:'10px 12px', fontWeight:600, color:'#333', borderBottom:'1px solid #e5e7eb', fontSize:12 }}>
                            {sector}
                          </td>
                          {HORAS.map(h => {
                            const profs = guardiasHorario[sector]?.[diaSem]?.[h.id] || [];
                            const ausentes = ausentesEnHora(h.id);
                            return (
                              <td key={h.id} style={{ padding:'8px', textAlign:'center', borderBottom:'1px solid #e5e7eb', verticalAlign:'top', backgroundColor: ausentes.length>0 ? '#fff5f5' : 'transparent' }}>
                                {profs.map((p, j) => (
                                  <div key={j} style={{ fontSize:11, color:'#1e3a5f', padding:'3px 6px', backgroundColor:'#e0e7ff', borderRadius:4, marginBottom:3, whiteSpace:'nowrap' }}>
                                    {p.split(',')[0]?.trim()}
                                  </div>
                                ))}
                                {ausentes.length > 0 && profs.length > 0 && (
                                  <div style={{ marginTop:4, borderTop:'1px dashed #fca5a5', paddingTop:4 }}>
                                    {ausentes.map((a, j) => {
                                      const horasAusente = Array.isArray(a.horas) ? a.horas : [];
                                      const horaAusente = horasAusente.find(hh => normHora(hh.hora_id || hh.hora || '') === h.id || (hh.hora||'').includes(h.id));
                                      if (!horaAusente) return null;
                                      return (
                                        <div key={j} style={{ fontSize:10, color:'#991b1b', padding:'2px 5px', backgroundColor:'#fee2e2', borderRadius:4, marginBottom:2, whiteSpace:'nowrap' }}>
                                          📚 {horaAusente.grupo || a.profesor_nombre?.split(' ')[0] || 'Grupo'}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
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
    </div>
  );
}
