'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
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

// Compara una hora guardada (puede ser "1", "1ª", "1ª hora"...) con horaId ("1")
function horaCoincide(horaGuardada, horaId) {
  if (!horaGuardada) return false;
  const s = horaGuardada.toString().toLowerCase().trim();
  // Buscar el primer dígito
  const m = s.match(/^(\d)/);
  if (m) return m[1] === horaId;
  // También aceptar "recreo"
  if (s.includes('recreo') && horaId === 'recreo') return true;
  return false;
}

function diaSemanaEs(fecha) {
  const dias = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
  return dias[new Date(fecha+'T12:00:00').getDay()];
}

function sumarDias(fecha, n) {
  const d = new Date(fecha+'T12:00:00');
  d.setDate(d.getDate()+n);
  return d.toISOString().split('T')[0];
}

function fechaCorta(fecha) {
  const d = new Date(fecha+'T12:00:00');
  return d.toLocaleDateString('es-ES',{ weekday:'long', day:'numeric', month:'long' });
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

// Convierte "Cárdenas Calcerrada" en "Cár. C" al estilo Delphos abreviado
function abreviarApellido(apellidos) {
  if (!apellidos) return '';
  const partes = apellidos.trim().split(/\s+/);
  const primero = partes[0].slice(0, 3);
  const iniciales = partes.slice(1).map(p => p[0]).join('');
  return iniciales ? `${primero}. ${iniciales}` : `${primero}.`;
}

// Convierte "Luis Javier" en "LJ"
function inicialesNombre(nombre) {
  if (!nombre) return '';
  return nombre.trim().split(/\s+/).map(p => p[0]).join('');
}

// Genera clave de abreviatura tipo "Cár. C, LJ" desde profesor completo
function claveAbreviatura(apellidos, nombre) {
  const ap = abreviarApellido(apellidos);
  const nom = inicialesNombre(nombre);
  return `${ap}, ${nom}`.toLowerCase().replace(/\s/g, '');
}

// Normaliza una abreviatura del cuadrante para poder buscarla
function normAbrev(str) {
  return (str || '').toLowerCase().replace(/\s/g, '');
}

export default function Guardias() {
  const [cargando, setCargando]         = useState(true);
  const [fecha, setFecha]               = useState(new Date().toISOString().split('T')[0]);
  const [horaActiva, setHoraActiva]     = useState('1');
  const [sectores, setSectores]         = useState([]);
  const [horarioGuardias, setHG]        = useState({});
  const [horariosClase, setHC]          = useState([]);
  const [ausenciasDia, setAusDia]       = useState([]);
  const [cargandoDia, setCargandoDia]   = useState(false);
  const [popupAbierto, setPopupAbierto] = useState(null);
  const [profesorNombre, setPN]         = useState('');
  const [esDirectivo, setEsDir]         = useState(false);
  const [mapaProfesores, setMapaProf]   = useState({});

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href='/login'; return; }
    setPN(sessionStorage.getItem('profesor_nombre')||'');
    const rol = sessionStorage.getItem('profesor_rol_gestion')||'';
    setEsDir(['secretario','director','jefe_estudios'].includes(rol));
    
    // Detectar de dónde viene el usuario para saber a dónde volver
    const referer = document.referrer || '';
    const vieneDeGestion = referer.includes('/gestion');
    sessionStorage.setItem('guardias_origen', vieneDeGestion ? 'gestion' : 'profesor');
    
    cargarBase();
  }, []);

  useEffect(() => {
    if (!cargando) cargarAusencias(fecha);
  }, [fecha, cargando]);

  async function cargarBase() {
    setCargando(true);
    
    // 1. Cargar TODOS los horarios (con paginación por si son >1000)
    let horarios = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data } = await getSupabase()
        .from('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
        .eq('curso_academico','2025-2026')
        .range(offset, offset + limit - 1);
      
      if (!data || data.length === 0) break;
      horarios = horarios.concat(data);
      if (data.length < limit) break;
      offset += limit;
    }

    console.log('📊 Total horarios cargados:', horarios.length);
    setHC(horarios);

    // 2. Cargar TODOS los profesores para poder mapear abreviaturas a nombres completos
    const { data: profes } = await getSupabase()
      .from('profesores')
      .select('nombre,apellidos');
    
    const mapa = {};
    (profes || []).forEach(p => {
      const clave = claveAbreviatura(p.apellidos, p.nombre);
      mapa[clave] = `${p.apellidos}, ${p.nombre}`;
    });
    console.log('👥 Profesores mapeados:', Object.keys(mapa).length);
    setMapaProf(mapa);

    const guardias = horarios.filter(h=>h.tipo==='guardia');
    console.log('🛡️ Guardias filtradas:', guardias.length);
    
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
    
    console.log('✅ Sectores:', nombres.length, nombres);

    setSectores(nombres);
    setHG(porSector);
    setCargando(false);
  }

  async function cargarAusencias(f) {
    setCargandoDia(true);
    setAusDia([]);
    setPopupAbierto(null);

    const diaSem = diaSemanaEs(f);
    if (diaSem==='sabado'||diaSem==='domingo') { setCargandoDia(false); return; }

    // Cargar cada query por separado para que una no rompa la otra
    let aus = [], dlds = [];
    try {
      const r = await getSupabase().from('ausencias').select('profesor_id,profesor_nombre,horas').lte('fecha_inicio',f).gte('fecha_fin',f);
      aus = r.data || [];
    } catch(e) { console.warn('Error ausencias:', e); }
    
    try {
      const r = await getSupabase().from('dld').select('profesor_id,profesor_nombre,horas').eq('fecha_solicitada',f).eq('estado','aprobada');
      dlds = r.data || [];
    } catch(e) { console.warn('Error dld:', e); }

    const todas = [
      ...(aus||[]).map(a=>({...a,tipo_falta:'ausencia'})),
      ...(dlds||[]).map(d=>({...d,tipo_falta:'dld'})),
    ];

    const resultado = [];
    for (const falta of todas) {
      const { data: prof } = await getSupabase().from('profesores').select('nombre,apellidos').eq('id',falta.profesor_id);
      if (!prof||prof.length===0) continue;
      const nombrePdf = `${prof[0].apellidos}, ${prof[0].nombre}`;
      const abrev = claveAbreviatura(prof[0].apellidos, prof[0].nombre); // "cár.c,lj"

      // Buscar su sector en horarios de guardia (buscar por abreviatura Delphos)
      let cuadrante = null;
      for (const s of sectores) {
        const datos = horarioGuardias[s]||{};
        for (const d of Object.keys(datos)) {
          for (const h of Object.keys(datos[d])) {
            const encontrado = (datos[d][h]||[]).some(p => normAbrev(p) === abrev);
            if (encontrado) { cuadrante = s; break; }
          }
          if (cuadrante) break;
        }
        if (cuadrante) break;
      }
      
      // Si no encuentra sector, asignar "GENERAL" como fallback
      if (!cuadrante && sectores.length > 0) {
        cuadrante = sectores.find(s => s.toUpperCase().includes('GENERAL')) || sectores[0];
      }

      // Sus clases ese día (buscar también por abreviatura)
      const clases = horariosClase.filter(h=>
        h.tipo==='clase' &&
        (h.dia||'').toLowerCase()===diaSem &&
        normAbrev(h.profesor_nombre_pdf) === abrev
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
          hora: horaN,
          grupo: c.grupo,
          materia: c.materia,
          aula: c.aula,
          instrucciones: tarea?.instrucciones||null,
          archivo_url: tarea?.archivo_url||null,
          archivo_nombre: tarea?.archivo_nombre||null,
        };
      });

      resultado.push({ profesor: falta.profesor_nombre, nombrePdf, tipo: falta.tipo_falta, cuadrante, horas: horasEnriq });
    }

    setAusDia(resultado);
    setCargandoDia(false);
  }

  const diaSem  = diaSemanaEs(fecha);
  const esFinde = diaSem==='sabado'||diaSem==='domingo';
  const horaInfo = HORAS.find(h=>h.id===horaActiva);

  // Para la hora activa: guardias y ausentes por sector
  function guardiasDeSector(sector) {
    return horarioGuardias[sector]?.[diaSem]?.[horaActiva] || [];
  }

  function ausentesDeSector(sector) {
    return ausenciasDia.filter(a =>
      a.cuadrante === sector &&
      a.horas.some(h => horaCoincide(h.hora, horaActiva))
    );
  }

  // ── POPUP TAREA ──────────────────────────────
  function TareaPopup({ datos, onClose }) {
    return (
      <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        onClick={onClose}>
        <div style={{ backgroundColor:'white', borderRadius:16, padding:24, maxWidth:460, width:'100%', boxShadow:'0 8px 32px rgba(0,0,0,0.25)' }}
          onClick={e=>e.stopPropagation()}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:44, height:44, borderRadius:12, backgroundColor:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>👥</div>
              <div>
                <div style={{ fontWeight:800, fontSize:16, color:azul }}>{datos.grupo||'—'}</div>
                <div style={{ fontSize:12, color:'#888', marginTop:2, display:'flex', alignItems:'center', gap:6 }}>
                  {datos.materia && <span>{datos.materia}</span>}
                  {datos.aula && <span style={{ padding:'2px 8px', backgroundColor:'#e0e7ff', color:'#3730a3', borderRadius:20, fontSize:11, fontWeight:700 }}>📍 {datos.aula}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:'#bbb' }}>✕</button>
          </div>

          {(datos.instrucciones||datos.archivo_url) ? (
            <div style={{ backgroundColor:'#fffbeb', border:'2px solid #fcd34d', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:12, fontWeight:800, color:'#78350f', marginBottom:10 }}>📝 Tarea para los alumnos</div>
              {datos.instrucciones && (
                <div style={{ fontSize:14, color:'#78350f', lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:datos.archivo_url?12:0 }}>
                  {datos.instrucciones}
                </div>
              )}
              {datos.archivo_url && (
                <a href={datos.archivo_url} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:8, fontSize:13, padding:'10px 18px', backgroundColor:'white', color:'#78350f', border:'1.5px solid #fcd34d', borderRadius:10, textDecoration:'none', fontWeight:700 }}>
                  📎 {datos.archivo_nombre||'Descargar archivo'}
                </a>
              )}
            </div>
          ) : (
            <div style={{ backgroundColor:'#f5f5f5', borderRadius:12, padding:24, textAlign:'center' }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:14, color:'#888', fontWeight:600 }}>Sin tarea asignada</div>
              <div style={{ fontSize:12, color:'#bbb', marginTop:4 }}>Mantén el orden en el aula</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f0f4f0', fontFamily:'system-ui, sans-serif' }}>

      {popupAbierto && <TareaPopup datos={popupAbierto} onClose={()=>setPopupAbierto(null)} />}

      {/* HEADER */}
      <div style={{ backgroundColor:marron, color:'white', padding:'14px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>{
          const origen = sessionStorage.getItem('guardias_origen') || 'profesor';
          window.location.href = origen === 'gestion' ? '/gestion' : '/profesor';
        }}
          style={{ background:'none', border:'none', color:'white', fontSize:22, cursor:'pointer' }}>←</button>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:800, fontSize:17 }}>🛡️ Guardias</div>
          <div style={{ fontSize:12, opacity:0.85 }}>Curso 2025-2026</div>
        </div>
      </div>

      {/* NAVEGACIÓN FECHA */}
      <div style={{ padding:'12px 16px 0' }}>
        <div style={{ backgroundColor:'white', borderRadius:12, padding:'10px 12px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={()=>setFecha(sumarDias(fecha,-1))} style={btnNav}>←</button>
          <div style={{ flex:1, textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:15, color:azul, textTransform:'capitalize' }}>
              {fechaCorta(fecha)}
            </div>
            {esFinde && <div style={{ fontSize:11, color:'#aaa' }}>Fin de semana</div>}
            {!esFinde && cargandoDia && <div style={{ fontSize:11, color:'#aaa' }}>⏳ Cargando...</div>}
            {!esFinde && !cargandoDia && (
              <div style={{ fontSize:11, color:'#888' }}>
                {ausenciasDia.length > 0
                  ? `${ausenciasDia.length} profesor${ausenciasDia.length!==1?'es':''} ausente${ausenciasDia.length!==1?'s':''}`
                  : '✅ Sin ausencias'}
              </div>
            )}
          </div>
          <button onClick={()=>setFecha(sumarDias(fecha,1))} style={btnNav}>→</button>
          <button onClick={()=>setFecha(new Date().toISOString().split('T')[0])}
            style={{ ...btnNav, backgroundColor:marron, color:'white', border:'none', fontSize:11 }}>Hoy</button>
        </div>
      </div>

      {/* SELECTOR DE HORAS */}
      {!esFinde && (
        <div style={{ padding:'10px 16px 0' }}>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
            {HORAS.map(h => {
              const activa = h.id === horaActiva;
              // ¿Tengo yo guardia esta hora?
              const tengoGuardia = sectores.some(s =>
                (horarioGuardias[s]?.[diaSem]?.[h.id]||[])
                  .some(p => p && profesorNombre && p.toLowerCase().includes(profesorNombre.toLowerCase().split(' ')[0]))
              );
              // ¿Hay ausencias esta hora?
              const hayAusencias = ausenciasDia.some(a => a.horas.some(hh=>horaCoincide(hh.hora, h.id)));

              return (
                <button key={h.id} onClick={()=>setHoraActiva(h.id)} style={{
                  flexShrink:0, padding:'8px 14px', borderRadius:10, cursor:'pointer', border:'none',
                  backgroundColor: activa ? marron : 'white',
                  color: activa ? 'white' : '#555',
                  fontWeight: activa ? 800 : 600,
                  fontSize:13,
                  boxShadow: activa ? `0 3px 10px ${marron}50` : '0 1px 4px rgba(0,0,0,0.08)',
                  position:'relative',
                }}>
                  {h.label}
                  {/* Indicadores */}
                  {tengoGuardia && !activa && (
                    <span style={{ position:'absolute', top:3, right:3, width:7, height:7, borderRadius:'50%', backgroundColor:'#22c55e' }} />
                  )}
                  {hayAusencias && !activa && (
                    <span style={{ position:'absolute', top:3, left:3, width:7, height:7, borderRadius:'50%', backgroundColor:'#ef4444' }} />
                  )}
                </button>
              );
            })}
          </div>
          {/* Horario de la hora activa */}
          <div style={{ textAlign:'center', fontSize:12, color:'#888', marginTop:6 }}>
            🕐 {horaInfo?.horario}
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      {cargando ? (
        <div style={{ padding:60, textAlign:'center', color:'#888' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>Cargando datos...
        </div>
      ) : esFinde ? (
        <div style={{ padding:16 }}>
          <div style={{ backgroundColor:'white', borderRadius:12, padding:40, textAlign:'center', color:'#888' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🏖️</div>
            <div>Fin de semana — selecciona un día laborable</div>
          </div>
        </div>
      ) : (
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>

          {/* LEYENDA */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', fontSize:11, color:'#888' }}>
            <span>🟢 Tú de guardia</span>
            <span>🔴 Grupo sin profesor (pulsa)</span>
            <span>🔵 DLD (pulsa)</span>
          </div>

          {/* TARJETA POR SECTOR */}
          {sectores.map(s => {
            const guardias = guardiasDeSector(s);
            const ausentes = ausentesDeSector(s);
            if (guardias.length === 0 && ausentes.length === 0) return null;

            return (
              <div key={s} style={{ backgroundColor:'white', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
                {/* Cabecera sector */}
                <div style={{ backgroundColor: ausentes.length>0 ? '#fff7ed' : '#f8fffe', padding:'10px 16px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:18 }}>{emojiSector(s)}</span>
                  <span style={{ fontWeight:800, fontSize:14, color:azul }}>{s}</span>
                  {ausentes.length>0 && (
                    <span style={{ marginLeft:'auto', padding:'2px 10px', backgroundColor:'#fee2e2', color:'#991b1b', borderRadius:20, fontSize:11, fontWeight:700 }}>
                      ⚠️ {ausentes.length} ausente{ausentes.length!==1?'s':''}
                    </span>
                  )}
                </div>

                <div style={{ padding:'10px 14px' }}>
                  {/* FILA GUARDIAS */}
                  {guardias.length>0 && (
                    <div style={{ marginBottom: ausentes.length>0 ? 10 : 0 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'#888', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>🛡️ De guardia</div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                        {guardias.map((p,i) => {
                          const nombreCompleto = mapaProfesores[normAbrev(p)] || p;
                          const esYo = p && profesorNombre && p.toLowerCase().includes(profesorNombre.toLowerCase().split(' ')[0]);
                          return (
                            <span key={i} style={{
                              padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:700,
                              backgroundColor: esYo ? '#fef3c7' : '#f0fdf4',
                              color: esYo ? '#78350f' : '#065f46',
                              border: `1.5px solid ${esYo ? '#fbbf24' : '#bbf7d0'}`,
                              display:'flex', alignItems:'center', gap:4,
                            }}>
                              {esYo && <span>⭐</span>}
                              {nombreCompleto}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SEPARADOR */}
                  {guardias.length>0 && ausentes.length>0 && (
                    <div style={{ height:1, backgroundColor:'#fde68a', margin:'10px 0' }} />
                  )}

                  {/* FILA AUSENTES → GRUPOS CLICKABLES */}
                  {ausentes.length>0 && (
                    <div>
                      <div style={{ fontSize:10, fontWeight:700, color:'#991b1b', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>👥 Grupos sin profesor</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {ausentes.map((a,i) => {
                          const clasesHora = a.horas.filter(h=>horaCoincide(h.hora, horaActiva));
                          return clasesHora.map((c,j) => (
                            <button key={`${i}-${j}`}
                              onClick={()=>setPopupAbierto(c)}
                              style={{
                                display:'flex', alignItems:'center', gap:10, width:'100%',
                                padding:'10px 14px', borderRadius:10, cursor:'pointer', textAlign:'left',
                                backgroundColor: a.tipo==='dld' ? '#eff6ff' : '#fef2f2',
                                border:`1.5px solid ${a.tipo==='dld'?'#93c5fd':'#fca5a5'}`,
                                color: a.tipo==='dld' ? '#1e40af' : '#991b1b',
                              }}>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:800, fontSize:13 }}>{c.grupo||'Grupo'}</div>
                                {c.materia && <div style={{ fontSize:11, opacity:0.8, marginTop:1 }}>{c.materia}</div>}
                              </div>
                              {c.aula && (
                                <span style={{ padding:'3px 10px', backgroundColor:'white', borderRadius:20, fontSize:11, fontWeight:700, border:'1px solid currentColor', opacity:0.8 }}>
                                  📍 {c.aula}
                                </span>
                              )}
                              <span style={{ fontSize:16, opacity:0.5 }}>›</span>
                            </button>
                          ));
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Si no hay nada esta hora */}
          {sectores.length === 0 ? (
            <div style={{ backgroundColor:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:12, padding:24, textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#92400e', marginBottom:6 }}>Aún no hay cuadrantes de guardia cargados</div>
              <div style={{ fontSize:12, color:'#78350f', lineHeight:1.5 }}>
                El equipo directivo aún no ha subido el cuadrante de guardias del curso 2025-2026.<br/>
                Cuando lo cargue en <strong>/gestion/datos → 🛡️ Guardias</strong>, aquí aparecerán las guardias por día y hora.
              </div>
            </div>
          ) : sectores.every(s => guardiasDeSector(s).length===0 && ausentesDeSector(s).length===0) && (
            <div style={{ backgroundColor:'white', borderRadius:12, padding:32, textAlign:'center', color:'#aaa' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>☕</div>
              <div style={{ fontSize:14 }}>Sin guardias asignadas esta hora</div>
              <div style={{ fontSize:12, color:'#bbb', marginTop:6 }}>Navega con ← → para ver otro día</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const btnNav = { padding:'8px 14px', borderRadius:8, border:'1.5px solid #e0e0e0', backgroundColor:'white', color:'#555', fontSize:16, fontWeight:600, cursor:'pointer' };
