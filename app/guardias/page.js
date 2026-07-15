'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

const azul = '#1e3a5f';
const marron = '#7c2d12';
const verde = '#1e6b2e';

const HORAS = [
  { id: '1',      label: '1ª',     horario: '8:30–9:25'   },
  { id: '2',      label: '2ª',     horario: '9:25–10:20'  },
  { id: '3',      label: '3ª',     horario: '10:20–11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15–11:45' },
  { id: '4',      label: '4ª',     horario: '11:45–12:40' },
  { id: '5',      label: '5ª',     horario: '12:40–13:35' },
  { id: '6',      label: '6ª',     horario: '13:35–14:30' },
];

function normHora(h) { return (h||'').toString().replace(/[aª]$/,'').toLowerCase(); }

function diaSemanaEs(fecha) {
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  return dias[new Date(fecha+'T12:00:00').getDay()];
}

function sumarDias(fecha, n) {
  const d = new Date(fecha+'T12:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().split('T')[0];
}

function fechaLegible(fecha) {
  const d = new Date(fecha+'T12:00:00');
  return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
}

function pesoSector(n) {
  const u = n.toUpperCase();
  if (u.includes('GENERAL')) return 9;
  if (u.includes('JEFATURA')) return 8;
  if (u.includes('ADMINIST')) return 7;
  if (u.includes('RECREO')) return 6;
  return 1;
}

function emojiSector(n) {
  const u = n.toUpperCase();
  if (u.includes('GENERAL')) return '🌐';
  if (u.includes('JEFATURA')) return '📋';
  if (u.includes('ADMINIST')) return '🏢';
  if (u.includes('RECREO')) return '☕';
  if (u.includes('CARROC')) return '🚗';
  if (u.includes('COCIN')||u.includes('HOSTEL')) return '🍽️';
  if (u.includes('ELECTR')) return '⚡';
  if (u.includes('INFORM')) return '💻';
  if (u.includes('COMERC')) return '🛍️';
  if (u.includes('AUTOM')) return '🔧';
  if (u.includes('ALIMENT')) return '🥖';
  if (u.includes('JARDIN')) return '🌳';
  return '📚';
}

function nombreCorto(nombreCompleto) {
  if (!nombreCompleto) return '';
  const partes = nombreCompleto.split(',').map(p=>p.trim());
  if (partes.length < 2) return nombreCompleto;
  return `${partes[0].split(' ')[0]}, ${partes[1].split(' ')[0]}`;
}

export default function Guardias() {
  const [cargando, setCargando]       = useState(true);
  const [fecha, setFecha]             = useState(new Date().toISOString().split('T')[0]);
  const [sectores, setSectores]       = useState([]);
  const [horarioGuardias, setHG]      = useState({});
  const [horariosClase, setHC]        = useState([]);
  const [ausenciasDia, setAusDia]     = useState([]);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [profAbierto, setProfAbierto] = useState(null); // {profesor, hora, sector}
  const [profesorNombre, setPN]       = useState('');
  const [esDirectivo, setEsDir]       = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href='/login'; return; }
    setPN(sessionStorage.getItem('profesor_nombre')||'');
    const rol = sessionStorage.getItem('profesor_rol_gestion')||'';
    setEsDir(['secretario','director','jefe_estudios'].includes(rol));
    cargarBase();
  }, []);

  useEffect(() => {
    if (!cargando) cargarAusencias(fecha);
  }, [fecha, cargando]);

  async function cargarBase() {
    setCargando(true);
    const { data: horarios } = await getSupabase()
      .from('horarios_profesores')
      .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
      .eq('curso_academico','2025-2026');

    if (!horarios) { setCargando(false); return; }
    setHC(horarios);

    const guardias = horarios.filter(h=>h.tipo==='guardia');
    const porSector = {};
    guardias.forEach(g => {
      const sector = g.grupo?.trim()||g.materia?.trim()||'Sin clasificar';
      const hora   = normHora(g.hora_id);
      const dia    = (g.dia||'').toLowerCase();
      if (!porSector[sector]) porSector[sector]={};
      if (!porSector[sector][dia]) porSector[sector][dia]={};
      if (!porSector[sector][dia][hora]) porSector[sector][dia][hora]=[];
      porSector[sector][dia][hora].push(g.profesor_nombre_pdf);
    });

    const nombres = Object.keys(porSector).sort((a,b)=>{
      const p = pesoSector(a)-pesoSector(b);
      return p!==0 ? p : a.localeCompare(b);
    });

    setSectores(nombres);
    setHG(porSector);
    setCargando(false);
  }

  async function cargarAusencias(f) {
    setCargandoDia(true);
    setAusDia([]);
    setProfAbierto(null);

    const diaSem = diaSemanaEs(f);
    if (diaSem==='sábado'||diaSem==='domingo') { setCargandoDia(false); return; }

    const { data: aus } = await getSupabase().from('ausencias')
      .select('profesor_id,profesor_nombre,motivo,horas')
      .lte('fecha_inicio',f).gte('fecha_fin',f);

    const { data: dlds } = await getSupabase().from('dld')
      .select('profesor_id,profesor_nombre,motivo,horas')
      .eq('fecha_solicitada',f).eq('estado','aprobada');

    const todas = [
      ...(aus||[]).map(a=>({...a,tipo_falta:'ausencia'})),
      ...(dlds||[]).map(d=>({...d,tipo_falta:'dld'})),
    ];

    const resultado = [];
    for (const falta of todas) {
      const { data: prof } = await getSupabase().from('profesores')
        .select('nombre,apellidos').eq('id',falta.profesor_id);
      if (!prof||prof.length===0) continue;

      const nombrePdf = `${prof[0].apellidos}, ${prof[0].nombre}`;
      const cuadrante = cuadranteDeProfesor(nombrePdf, sectores, horarioGuardias);

      const clases = horariosClase.filter(h=>
        h.tipo==='clase' &&
        (h.dia||'').toLowerCase()===diaSem &&
        (h.profesor_nombre_pdf||'').toLowerCase()===nombrePdf.toLowerCase()
      );

      const horasFalta = Array.isArray(falta.horas)?falta.horas:[];
      const horasEnriq = clases.map(c=>{
        const horaN = normHora(c.hora_id);
        const tarea = horasFalta.find(h=>{
          if (!h) return false;
          const hn = normHora(h.hora_id)||normHora(h.hora)||'';
          const lb = (h.hora||'').toLowerCase();
          return hn===horaN||lb.includes(`${horaN}ª`)||lb.includes(`${horaN}a`);
        });
        return {
          hora: horaN, grupo: c.grupo, materia: c.materia, aula: c.aula,
          instrucciones: tarea?.instrucciones||null,
          archivo_url: tarea?.archivo_url||null,
          archivo_nombre: tarea?.archivo_nombre||null,
        };
      });

      resultado.push({
        profesor: falta.profesor_nombre,
        nombrePdf,
        tipo: falta.tipo_falta,
        motivo: falta.motivo,
        cuadranteAusente: cuadrante,
        horas: horasEnriq,
      });
    }

    setAusDia(resultado);
    setCargandoDia(false);
  }

  function cuadranteDeProfesor(nombrePdf, listaSectores, horarios) {
    const lc = nombrePdf.toLowerCase();
    for (const s of listaSectores) {
      const datos = horarios[s]||{};
      for (const d of Object.keys(datos)) {
        for (const h of Object.keys(datos[d])) {
          if ((datos[d][h]||[]).some(p=>(p||'').toLowerCase()===lc)) return s;
        }
      }
    }
    return null;
  }

  const diaSem    = diaSemanaEs(fecha);
  const esFinde   = diaSem==='sábado'||diaSem==='domingo';
  const totalAus  = ausenciasDia.filter(a=>a.tipo==='ausencia').length;
  const totalDld  = ausenciasDia.filter(a=>a.tipo==='dld').length;

  // Para una hora y sector, devuelve los ausentes que tenían clase en ese sector esa hora
  function ausentesEnCelda(sector, hora) {
    return ausenciasDia.filter(a =>
      a.cuadranteAusente===sector &&
      a.horas.some(h=>h.hora===hora)
    );
  }

  // Popup con las tareas del ausente para esa hora
  function TareaPopup({ prof, hora, clase, onClose }) {
    const claseDeHora = clase || prof.horas.find(h=>h.hora===hora);
    if (!claseDeHora) return null;
    return (
      <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        onClick={onClose}>
        <div style={{ backgroundColor:'white', borderRadius:16, padding:24, maxWidth:460, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}
          onClick={e=>e.stopPropagation()}>

          {/* CABECERA */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:42, height:42, borderRadius:12, backgroundColor:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>
                👥
              </div>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:azul }}>{claseDeHora.grupo || '—'}</div>
                <div style={{ fontSize:12, color:'#888' }}>
                  {claseDeHora.materia && <span>{claseDeHora.materia}</span>}
                  {claseDeHora.aula && <span style={{ marginLeft:8, padding:'2px 8px', backgroundColor:'#e0e7ff', color:'#3730a3', borderRadius:20, fontSize:11, fontWeight:700 }}>📍 {claseDeHora.aula}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#aaa' }}>✕</button>
          </div>

          {/* TAREA */}
          {(claseDeHora.instrucciones || claseDeHora.archivo_url) ? (
            <div style={{ backgroundColor:'#fffbeb', border:'1.5px solid #fcd34d', borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:12, fontWeight:800, color:'#78350f', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                📝 Tarea para los alumnos
              </div>
              {claseDeHora.instrucciones && (
                <div style={{ fontSize:14, color:'#78350f', lineHeight:1.6, whiteSpace:'pre-wrap', marginBottom: claseDeHora.archivo_url ? 12 : 0 }}>
                  {claseDeHora.instrucciones}
                </div>
              )}
              {claseDeHora.archivo_url && (
                <a href={claseDeHora.archivo_url} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:8, fontSize:13, padding:'9px 16px', backgroundColor:'white', color:'#78350f', border:'1.5px solid #fcd34d', borderRadius:10, textDecoration:'none', fontWeight:700 }}>
                  📎 {claseDeHora.archivo_nombre || 'Descargar archivo'}
                </a>
              )}
            </div>
          ) : (
            <div style={{ backgroundColor:'#f5f5f5', borderRadius:12, padding:'20px 16px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:13, color:'#aaa', fontWeight:600 }}>El profesor no dejó tarea asignada</div>
              <div style={{ fontSize:12, color:'#bbb', marginTop:4 }}>Mantén el orden en el aula</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f0f4f0', fontFamily:'system-ui, sans-serif' }}>

      {/* POPUP */}
      {profAbierto && (
        <TareaPopup
          prof={profAbierto.prof}
          hora={profAbierto.hora}
          clase={profAbierto.clase}
          onClose={()=>setProfAbierto(null)}
        />
      )}

      {/* HEADER */}
      <div style={{ backgroundColor:marron, color:'white', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>{ window.location.href=esDirectivo?'/gestion':'/profesor'; }}
          style={{ background:'none', border:'none', color:'white', fontSize:22, cursor:'pointer' }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:17 }}>🛡️ Guardias</div>
          <div style={{ fontSize:12, opacity:0.85 }}>Curso 2025-2026 · {sectores.length} sectores</div>
        </div>
      </div>

      {/* SELECTOR FECHA */}
      <div style={{ padding:16 }}>
        <div style={{ backgroundColor:'white', borderRadius:12, padding:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={()=>setFecha(sumarDias(fecha,-1))} style={btnNav}>← Anterior</button>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid #e0e0e0', fontSize:14, flex:1, minWidth:140 }} />
          <button onClick={()=>setFecha(sumarDias(fecha,1))} style={btnNav}>Siguiente →</button>
          <button onClick={()=>setFecha(new Date().toISOString().split('T')[0])}
            style={{ ...btnNav, backgroundColor:marron, color:'white', border:'none' }}>📅 Hoy</button>
        </div>

        <div style={{ marginTop:10, padding:'10px 14px', backgroundColor:'white', borderRadius:10, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontWeight:700, color:azul, fontSize:14 }}>📆 {fechaLegible(fecha)}</span>
          {!esFinde && (
            <>
              <span style={{ padding:'3px 10px', backgroundColor:'#fef3c7', color:'#78350f', borderRadius:20, fontSize:12, fontWeight:600 }}>🏥 {totalAus} ausencia{totalAus!==1?'s':''}</span>
              <span style={{ padding:'3px 10px', backgroundColor:'#dbeafe', color:'#1e40af', borderRadius:20, fontSize:12, fontWeight:600 }}>📄 {totalDld} DLD</span>
              {cargandoDia && <span style={{ fontSize:12, color:'#888' }}>⏳ Cargando faltas...</span>}
            </>
          )}
        </div>
      </div>

      {cargando ? (
        <div style={{ padding:60, textAlign:'center', color:'#888' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>Cargando datos...
        </div>
      ) : esFinde ? (
        <div style={{ padding:'0 16px 16px' }}>
          <div style={{ backgroundColor:'white', borderRadius:12, padding:40, textAlign:'center', color:'#888' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🏖️</div>
            <div>Fin de semana — selecciona un día laborable</div>
          </div>
        </div>
      ) : (
        <div style={{ padding:'0 16px 16px' }}>
          <div style={{ backgroundColor:'white', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ borderCollapse:'collapse', fontSize:12, width:'100%', minWidth: Math.max(700, sectores.length*110+80) }}>
                <thead>
                  <tr>
                    <th style={thFijo}>Hora</th>
                    {sectores.map(s=>(
                      <th key={s} style={thSector}>
                        <div style={{ fontSize:18, marginBottom:2 }}>{emojiSector(s)}</div>
                        <div style={{ fontSize:10, fontWeight:700, lineHeight:1.2 }} title={s}>{s.length>16?s.substring(0,14)+'…':s}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HORAS.map(h => (
                    <tr key={h.id}>
                      {/* CELDA HORA */}
                      <td style={tdHora}>
                        <div style={{ fontWeight:700, color:azul }}>{h.label}</div>
                        <div style={{ fontSize:10, color:'#888' }}>{h.horario}</div>
                      </td>

                      {/* CELDAS POR SECTOR */}
                      {sectores.map(s => {
                        const guardias  = horarioGuardias[s]?.[diaSem]?.[h.id] || [];
                        const ausentes  = ausentesEnCelda(s, h.id);
                        const hayAlgo   = guardias.length>0 || ausentes.length>0;

                        return (
                          <td key={s} style={{ ...tdBase, backgroundColor: ausentes.length>0 ? '#fffbeb' : 'white', padding:0 }}>
                            {!hayAlgo ? (
                              <div style={{ padding:'8px 6px', textAlign:'center' }}>
                                <span style={{ color:'#e0e0e0', fontSize:10 }}>—</span>
                              </div>
                            ) : (
                              <div style={{ display:'flex', flexDirection:'column' }}>

                                {/* FILA 1: Profesores de guardia */}
                                {guardias.length>0 && (
                                  <div style={{ padding:'4px 5px', borderBottom: ausentes.length>0 ? '2px solid #fcd34d' : 'none', backgroundColor:'#f0fdf4' }}>
                                    {guardias.map((p,i) => {
                                      const esYo = p && profesorNombre && p.toLowerCase().includes((profesorNombre||'').toLowerCase().split(' ')[0]);
                                      return (
                                        <div key={i} style={{
                                          padding:'3px 6px', borderRadius:5, fontSize:10, fontWeight:700, lineHeight:1.4, marginBottom:2,
                                          backgroundColor: esYo?'#fef3c7':'white',
                                          color: esYo?'#78350f':'#065f46',
                                          border: `1px solid ${esYo?'#fbbf24':'#bbf7d0'}`,
                                          display:'flex', alignItems:'center', gap:3,
                                        }}>
                                          <span style={{ fontSize:8 }}>🛡️</span>
                                          {nombreCorto(p)}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* FILA 2: Grupos sin profesor — clickables */}
                                {ausentes.length>0 && (
                                  <div style={{ padding:'4px 5px', backgroundColor:'#fffbeb' }}>
                                    {ausentes.map((a,i) => {
                                      const clasesHora = a.horas.filter(hh=>hh.hora===h.id);
                                      return clasesHora.map((c,j) => (
                                        <button key={`${i}-${j}`}
                                          onClick={()=>setProfAbierto({ prof:a, hora:h.id, clase:c })}
                                          style={{
                                            display:'block', width:'100%', padding:'4px 6px', borderRadius:6,
                                            fontSize:10, fontWeight:700, lineHeight:1.4, textAlign:'left',
                                            cursor:'pointer', marginBottom:2,
                                            backgroundColor: a.tipo==='dld'?'#dbeafe':'#fee2e2',
                                            color: a.tipo==='dld'?'#1e40af':'#991b1b',
                                            border:`1.5px solid ${a.tipo==='dld'?'#93c5fd':'#fca5a5'}`,
                                          }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                                            <span>👥</span>
                                            <span>{c.grupo||nombreCorto(a.nombrePdf)}</span>
                                            <span style={{ fontSize:9, opacity:0.6, marginLeft:'auto' }}>▼</span>
                                          </div>
                                          {c.aula && <div style={{ fontSize:9, opacity:0.7, marginTop:1 }}>📍 {c.aula}</div>}
                                        </button>
                                      ));
                                    })}
                                  </div>
                                )}
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
          </div>

          {/* LEYENDA */}
          <div style={{ marginTop:10, padding:'8px 14px', backgroundColor:'white', borderRadius:10, fontSize:11, color:'#666', display:'flex', gap:14, flexWrap:'wrap' }}>
            <span><span style={pill('#f0fdf4','#065f46','#bbf7d0')}>🛡️ Verde</span> Profesor de guardia</span>
            <span><span style={pill('#fef3c7','#78350f','#fbbf24')}>🛡️ Amarillo</span> Tú de guardia</span>
            <span><span style={pill('#fee2e2','#991b1b','#fca5a5')}>👥 Rojo ▼</span> Grupo sin profesor (pulsa para ver tarea)</span>
            <span><span style={pill('#dbeafe','#1e40af','#93c5fd')}>👥 Azul ▼</span> Grupo con DLD (pulsa para ver tarea)</span>
          </div>
        </div>
      )}
    </div>
  );
}

const btnNav = { padding:'8px 12px', borderRadius:8, border:'1.5px solid #e0e0e0', backgroundColor:'white', color:'#555', fontSize:12, fontWeight:600, cursor:'pointer' };
const thFijo    = { padding:'10px 8px', backgroundColor:marron, color:'white', fontSize:11, fontWeight:700, textAlign:'center', border:`1px solid #6b2a10`, position:'sticky', left:0, zIndex:2, minWidth:65 };
const thSector  = { padding:'8px 6px', backgroundColor:marron, color:'white', fontSize:11, fontWeight:700, textAlign:'center', border:`1px solid #6b2a10`, minWidth:100, maxWidth:130 };
const tdHora    = { padding:'8px', backgroundColor:'#fafafa', border:'1px solid #eee', textAlign:'center', minWidth:65, whiteSpace:'nowrap', position:'sticky', left:0, zIndex:1, fontSize:12 };
const tdBase    = { padding:'5px', border:'1px solid #eee', verticalAlign:'top', minWidth:100 };
const pill      = (bg,color,border) => ({ display:'inline-block', backgroundColor:bg, color, padding:'1px 6px', borderRadius:4, fontSize:10, fontWeight:700, border:`1px solid ${border}` });
