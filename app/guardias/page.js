'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { departamentoASector, SECTORES_FP, esSectorFP } from '@/lib/sectores';

const azul = '#1e3a5f';
const marron = '#7c2d12';
const verde = '#1e6b2e';
const rojo = '#b91c1c';
const naranja = '#c2410c';

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
function horaCoincide(horaGuardada, horaId) {
  if (!horaGuardada) return false;
  const s = horaGuardada.toString().toLowerCase().trim();
  const m = s.match(/^(\d)/);
  if (m) return m[1] === horaId;
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
function emojiSector(n) {
  const u = (n||'').toUpperCase();
  if (u.includes('TMV')) return '🚗';
  if (u.includes('COMERC')) return '🛍️';
  if (u.includes('ELECTR')) return '⚡';
  if (u.includes('INFORM')) return '💻';
  if (u.includes('HOSTEL')) return '🍽️';
  if (u.includes('INDUSTR') || u.includes('ALIMENT')) return '🥖';
  if (u.includes('ADMIN')) return '🏢';
  if (u.includes('FOL')) return '📚';
  if (u.includes('GENERAL')) return '🌐';
  if (u.includes('BIBLIOTECA')) return '📖';
  if (u.includes('ACOMPAÑ')) return '🤝';
  return '📌';
}

// Helpers para mapear abreviaturas Delphos → nombre completo
function abreviarApellido(apellidos) {
  if (!apellidos) return '';
  const partes = apellidos.trim().split(/\s+/);
  const primero = partes[0].slice(0, 3);
  const iniciales = partes.slice(1).map(p => p[0]).join('');
  return iniciales ? `${primero}. ${iniciales}` : `${primero}.`;
}
function inicialesNombre(nombre) {
  if (!nombre) return '';
  return nombre.trim().split(/\s+/).map(p => p[0]).join('');
}
function claveAbreviatura(apellidos, nombre) {
  const ap = abreviarApellido(apellidos);
  const nom = inicialesNombre(nombre);
  return `${ap}, ${nom}`.toLowerCase().replace(/\s/g, '');
}
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
  const [profesorId, setProfId]         = useState('');
  const [miEspecialidad, setMiEsp]      = useState('');
  const [esDirectivo, setEsDir]         = useState(false);
  const [mapaProfesores, setMapaProf]   = useState({});
  const [profesoresList, setProfsList]  = useState([]);
  const [contadorApoyos, setContApoyos] = useState({});
  const [apoyosAsignados, setApAsig]    = useState([]);
  const [modalCambiar, setModalCambiar] = useState(null); // apoyo a cambiar

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href='/login'; return; }
    setProfId(id);
    setPN(sessionStorage.getItem('profesor_nombre')||'');
    const rol = sessionStorage.getItem('profesor_rol_gestion')||'';
    setEsDir(['secretario','director','jefe_estudios'].includes(rol));

    const referer = document.referrer || '';
    const vieneDeGestion = referer.includes('/gestion');
    sessionStorage.setItem('guardias_origen', vieneDeGestion ? 'gestion' : 'profesor');

    cargarBase(id);
  }, []);

  useEffect(() => {
    if (!cargando) cargarAusencias(fecha);
  }, [fecha, cargando]);

  async function cargarBase(id) {
    setCargando(true);

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
    setHC(horarios);

    const { data: profes } = await getSupabase()
      .from('profesores')
      .select('id,nombre,apellidos,departamento,especialidad');

    const mapa = {};
    (profes || []).forEach(p => {
      const clave = claveAbreviatura(p.apellidos, p.nombre);
      mapa[clave] = `${p.apellidos}, ${p.nombre}`;
    });
    setMapaProf(mapa);
    setProfsList(profes || []);

    // Mi especialidad
    const yo = (profes||[]).find(p => p.id === id);
    setMiEsp(yo?.especialidad || '');

    // Contador de apoyos por sector
    const { data: apoyos } = await getSupabase()
      .from('apoyos_asignados')
      .select('sector_apoyo,estado')
      .eq('curso_academico', '2025-2026');
    const cont = {};
    (apoyos || []).forEach(a => {
      if (a.estado === 'confirmado' || a.estado === 'realizado') {
        cont[a.sector_apoyo] = (cont[a.sector_apoyo] || 0) + 1;
      }
    });
    setContApoyos(cont);

    // Sectores del cuadrante
    const guardias = horarios.filter(h => h.tipo === 'guardia');
    const porSector = {};
    guardias.forEach(g => {
      const sector = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
      const hora = normHora(g.hora_id);
      const dia = (g.dia||'').toLowerCase();
      if (!porSector[sector]) porSector[sector] = {};
      if (!porSector[sector][dia]) porSector[sector][dia] = {};
      if (!porSector[sector][dia][hora]) porSector[sector][dia][hora] = [];
      porSector[sector][dia][hora].push(g.profesor_nombre_pdf);
    });

    const nombres = Object.keys(porSector).sort();
    setSectores(nombres);
    setHG(porSector);
    setCargando(false);
  }

  async function cargarAusencias(f) {
    setCargandoDia(true);
    setAusDia([]);
    setApAsig([]);

    const diaSem = diaSemanaEs(f);
    if (diaSem === 'sabado' || diaSem === 'domingo') { setCargandoDia(false); return; }

    let aus = [], dlds = [];
    try {
      const r = await getSupabase().from('ausencias').select('profesor_id,profesor_nombre,horas').lte('fecha_inicio', f).gte('fecha_fin', f);
      aus = r.data || [];
    } catch(e) { console.warn('Error ausencias:', e); }
    try {
      const r = await getSupabase().from('dld').select('profesor_id,profesor_nombre,horas').eq('fecha_solicitada', f).eq('estado','aprobada');
      dlds = r.data || [];
    } catch(e) { console.warn('Error dld:', e); }

    const todas = [
      ...aus.map(a => ({...a, tipo_falta:'ausencia'})),
      ...dlds.map(d => ({...d, tipo_falta:'dld'})),
    ];

    // Cargar apoyos para esta fecha
    try {
      const r = await getSupabase()
        .from('apoyos_asignados')
        .select('*')
        .eq('fecha', f)
        .eq('curso_academico', '2025-2026');
      setApAsig(r.data || []);
    } catch(e) { console.warn('Error apoyos:', e); }

    // Enriquecer cada ausencia con info del profesor + sector
    const resultado = [];
    for (const falta of todas) {
      const prof = profesoresList.find(p => p.id === falta.profesor_id);
      if (!prof) continue;
      const nombrePdf = `${prof.apellidos}, ${prof.nombre}`;
      const abrev = claveAbreviatura(prof.apellidos, prof.nombre);
      // Derivar sector automáticamente del departamento (fallback: especialidad legacy)
      let sector = departamentoASector(prof.departamento);
      // Si no hay departamento pero sí especialidad (legacy), usar esa
      if (sector === 'GENERAL' && prof.especialidad && prof.especialidad !== 'ESO/BACHILLERATO' && prof.especialidad !== 'GENERAL') {
        sector = prof.especialidad;
      }

      resultado.push({
        id: falta.profesor_id + '-' + f,
        profesorId: falta.profesor_id,
        profesor: nombrePdf,
        nombrePdf,
        abrev,
        sector,
        tipo: falta.tipo_falta,
        horas: falta.horas || [],
      });
    }
    setAusDia(resultado);
    setCargandoDia(false);
  }

  const diaSem = diaSemanaEs(fecha);
  const esFinde = diaSem === 'sabado' || diaSem === 'domingo';
  const horaInfo = HORAS.find(h => h.id === horaActiva);

  // === LÓGICA CENTRAL POR HORA ===

  // Profesores ausentes esta hora concreta
  function ausentesEstaHora() {
    return ausenciasDia.filter(a =>
      a.horas.some(h => horaCoincide(h.hora, horaActiva))
    );
  }

  // Profesores de guardia en un sector esta hora
  function guardiasDeSector(sector) {
    return horarioGuardias[sector]?.[diaSem]?.[horaActiva] || [];
  }

  // Ausencias por sector esta hora (agrupadas)
  function ausenciasPorSector() {
    const grupos = {};
    ausentesEstaHora().forEach(a => {
      const s = a.sector.toUpperCase();
      if (!grupos[s]) grupos[s] = [];
      grupos[s].push(a);
    });
    return grupos;
  }

  // Todos los sectores con actividad hoy (con ausencia o con guardia)
  function sectoresConActividad() {
    const set = new Set();
    ausentesEstaHora().forEach(a => set.add(a.sector.toUpperCase()));
    sectores.forEach(s => {
      const sup = s.toUpperCase();
      if (guardiasDeSector(s).length > 0) set.add(sup);
    });
    return Array.from(set).sort((a, b) => {
      // GENERAL al final
      if (a === 'GENERAL' && b !== 'GENERAL') return 1;
      if (b === 'GENERAL' && a !== 'GENERAL') return -1;
      return a.localeCompare(b);
    });
  }

  // Encontrar el sector real (case-sensitive) para acceder a horarioGuardias
  function sectorReal(nombreSector) {
    return sectores.find(s => s.toUpperCase() === nombreSector.toUpperCase()) || nombreSector;
  }

  // Auto-asignación: para cada clase huérfana de esta hora, decidir quién cubre
  // Devuelve: { ausenciaId, hora, tipo:'guardia_sector'|'apoyo_cruzado', profesorCubre: {nombre,abrev,sectorOriginal}, alternativas: [] }
  function asignacionAutomatica() {
    const asignaciones = [];
    const porSector = ausenciasPorSector();

    // Trackear profesores ya asignados esta hora para no doblarles
    const asignadosAbrev = new Set();

    // Trackear cuántas asignaciones lleva cada sector (para reparto interno)
    const usadosDelSector = {};

    for (const sectorSup of Object.keys(porSector)) {
      const sReal = sectorReal(sectorSup);
      const ausentes = porSector[sectorSup];
      const guardiasDisp = guardiasDeSector(sReal);

      for (const aus of ausentes) {
        const clasesHora = aus.horas.filter(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'clase');

        for (const clase of clasesHora) {
          // 1) Intentar cubrir con guardia del mismo sector
          let cubre = null;
          for (const p of guardiasDisp) {
            const key = normAbrev(p);
            if (!asignadosAbrev.has(key)) {
              cubre = { nombre: mapaProfesores[key] || p, abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
              asignadosAbrev.add(key);
              usadosDelSector[sectorSup] = (usadosDelSector[sectorSup] || 0) + 1;
              break;
            }
          }

          // 2) Si no hay guardia del sector, buscar apoyo FP libre
          if (!cubre) {
            const libres = profesoresLibresParaApoyo(asignadosAbrev, porSector);
            if (libres.length > 0) {
              const primero = libres[0];
              asignadosAbrev.add(normAbrev(primero.abrev));
              cubre = { ...primero, tipo: 'apoyo_cruzado', alternativas: libres.slice(1, 5) };
            }
          }

          asignaciones.push({
            ausencia: aus,
            clase,
            cubre,
          });
        }
      }
    }
    return asignaciones;
  }

  // Profesores FP libres esta hora (no dan clase, no ausentes, no ya asignados)
  // Ordenados por menos apoyos previos
  // SOLO cuentan sectores FP reales (no BIBLIOTECA, no ACOMPAÑAMIENTO, no GENERAL)
  function profesoresLibresParaApoyo(asignadosAbrev = new Set(), porSector = null) {
    if (porSector === null) porSector = ausenciasPorSector();

    const ocupadosEnClase = new Set(
      horariosClase
        .filter(h => h.tipo === 'clase' && (h.dia||'').toLowerCase() === diaSem && normHora(h.hora_id) === horaActiva)
        .map(h => normAbrev(h.profesor_nombre_pdf))
    );
    const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));

    // Sectores FP que NO tienen ausencia esta hora (no pueden apoyar si están ocupados con los suyos)
    const sectoresFPLibres = sectores.filter(s => {
      if (!esSectorFP(s)) return false;
      const sup = s.toUpperCase();
      return !porSector[sup];
    });

    const libres = [];
    for (const sector of sectoresFPLibres) {
      const guardiasFP = guardiasDeSector(sector);
      guardiasFP.forEach(p => {
        const key = normAbrev(p);
        if (!ocupadosEnClase.has(key) && !ausentesAbrev.has(key) && !asignadosAbrev.has(key)) {
          const profCompleto = profesoresList.find(pf =>
            claveAbreviatura(pf.apellidos, pf.nombre) === key
          );
          libres.push({
            abrev: p,
            sectorOriginal: sector.toUpperCase(),
            nombre: mapaProfesores[key] || p,
            profesorId: profCompleto?.id || null,
            apoyosPrevios: contadorApoyos[sector.toUpperCase()] || 0,
          });
        }
      });
    }
    libres.sort((a, b) => {
      if (a.apoyosPrevios !== b.apoyosPrevios) return a.apoyosPrevios - b.apoyosPrevios;
      return a.nombre.localeCompare(b.nombre);
    });
    return libres;
  }

  // === Registro automático DESACTIVADO en /guardias ===
  // El registro de apoyos solo ocurre en /gestion/guardias donde los jefes de estudio 
  // pueden revisar y modificar antes de que se cuente en el contador

  // Cambiar el profesor asignado a un apoyo (solo directivos)
  async function cambiarApoyo(apoyoId, nuevoProfesor) {
    const { error } = await getSupabase()
      .from('apoyos_asignados')
      .update({
        profesor_id: nuevoProfesor.profesorId,
        sector_apoyo: nuevoProfesor.sectorOriginal,
        asignado_por: profesorId,
      })
      .eq('id', apoyoId);
    if (error) { alert('Error: ' + error.message); return; }
    const r = await getSupabase()
      .from('apoyos_asignados')
      .select('*')
      .eq('fecha', fecha)
      .eq('curso_academico', '2025-2026');
    setApAsig(r.data || []);
    setModalCambiar(null);
  }

  // === RENDER ===
  const btnNav = {
    padding:'8px 14px', borderRadius:10, cursor:'pointer', fontSize:13,
    backgroundColor:'white', border:'1.5px solid #d1d5db',
  };

  if (cargando) return <div style={{ padding:40, textAlign:'center', fontFamily:'system-ui' }}>Cargando cuadrante…</div>;

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f9fafb', fontFamily:'system-ui,sans-serif', paddingBottom:60 }}>

      {/* HEADER */}
      <div style={{ backgroundColor:marron, color:'white', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => {
            const origen = sessionStorage.getItem('guardias_origen') || 'profesor';
            window.location.href = origen === 'gestion' ? '/gestion' : '/profesor';
          }} style={{ backgroundColor:'transparent', border:'none', color:'white', cursor:'pointer', fontSize:20 }}>←</button>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>🛡️ Guardias</div>
            <div style={{ fontSize:11, opacity:0.85 }}>Curso 2025-2026</div>
          </div>
        </div>
      </div>

      {/* NAV FECHA */}
      <div style={{ padding:'14px 16px', backgroundColor:'white', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setFecha(sumarDias(fecha, -1))} style={btnNav}>←</button>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:azul, textTransform:'capitalize' }}>{fechaCorta(fecha)}</div>
          <div style={{ fontSize:12, color:'#666', marginTop:2 }}>
            {esFinde ? '🏖️ Fin de semana' : `${ausentesEstaHora().length === 0 ? '✅ Sin ausencias' : `🚨 ${ausenciasDia.length} profesor${ausenciasDia.length!==1?'es':''} ausente${ausenciasDia.length!==1?'s':''}`}`}
          </div>
        </div>
        <button onClick={() => setFecha(sumarDias(fecha, 1))} style={btnNav}>→</button>
        <button onClick={() => setFecha(new Date().toISOString().split('T')[0])}
          style={{ ...btnNav, backgroundColor:marron, color:'white', border:'none', fontSize:11 }}>Hoy</button>
      </div>

      {/* SELECTOR DE HORAS */}
      {!esFinde && (
        <div style={{ padding:'10px 16px 0', backgroundColor:'white', borderBottom:'1px solid #e5e7eb' }}>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
            {HORAS.map(h => {
              const activa = h.id === horaActiva;
              const ausentesH = ausenciasDia.filter(a => a.horas.some(hh => horaCoincide(hh.hora, h.id)));
              const cnt = ausentesH.length;

              return (
                <button key={h.id} onClick={() => setHoraActiva(h.id)} style={{
                  flexShrink:0, padding:'8px 14px', borderRadius:10, cursor:'pointer', border:'none',
                  backgroundColor: activa ? marron : (cnt > 0 ? '#fef2f2' : 'white'),
                  color: activa ? 'white' : (cnt > 0 ? rojo : '#555'),
                  border: activa ? 'none' : '1.5px solid ' + (cnt > 0 ? '#fca5a5' : '#d1d5db'),
                  fontWeight:700, fontSize:13, position:'relative',
                }}>
                  {h.label}
                  {cnt > 0 && (
                    <span style={{
                      position:'absolute', top:-6, right:-6, backgroundColor:rojo, color:'white',
                      borderRadius:'50%', width:18, height:18, fontSize:10, fontWeight:800,
                      display:'flex', alignItems:'center', justifyContent:'center'
                    }}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* HORARIO ACTIVO */}
      {!esFinde && horaInfo && (
        <div style={{ textAlign:'center', padding:'8px 16px', backgroundColor:'#f3f4f6', fontSize:12, color:'#666' }}>
          ⏰ {horaInfo.horario}
        </div>
      )}

      {/* CONTENIDO */}
      <div style={{ padding:'16px' }}>
        {cargandoDia ? (
          <div style={{ textAlign:'center', padding:40, color:'#888' }}>Cargando…</div>
        ) : esFinde ? (
          <div style={{ backgroundColor:'white', borderRadius:12, padding:30, textAlign:'center', color:'#666' }}>
            🏖️ Fin de semana. No hay guardias programadas.
          </div>
        ) : (
          <>
            {/* SECCIÓN 1: PROFESORES QUE FALTAN (PROTAGONISTA) */}
            {ausentesEstaHora().length === 0 ? (
              <div style={{
                backgroundColor:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12,
                padding:20, textAlign:'center', color:verde, fontSize:14,
              }}>
                ✅ No hay profesores ausentes esta hora
              </div>
            ) : (
              <>
                <div style={{ fontWeight:800, fontSize:14, color:rojo, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                  🚨 PROFESORES QUE FALTAN ({ausentesEstaHora().length})
                </div>

                {/* AGRUPAR POR SECTOR */}
                {Object.entries(ausenciasPorSector()).map(([sectorSup, ausentes]) => {
                  const asignaciones = asignacionAutomatica().filter(a =>
                    a.ausencia.sector.toUpperCase() === sectorSup
                  );

                  return (
                    <div key={sectorSup} style={{ marginBottom:16 }}>
                      {/* Cabecera del sector */}
                      <div style={{
                        backgroundColor:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:'10px 10px 0 0',
                        padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                      }}>
                        <span style={{ fontSize:16 }}>{emojiSector(sectorSup)}</span>
                        <span style={{ fontWeight:800, fontSize:13, color:rojo }}>{sectorSup}</span>
                        <span style={{ fontSize:11, color:'#7f1d1d', marginLeft:'auto' }}>
                          {ausentes.length} ausente{ausentes.length !== 1 ? 's' : ''} · {asignaciones.length} clase{asignaciones.length !== 1 ? 's' : ''} a cubrir
                        </span>
                      </div>

                      {/* Cada asignación */}
                      <div style={{ backgroundColor:'white', border:'1.5px solid #fca5a5', borderTop:'none', borderRadius:'0 0 10px 10px', padding:12 }}>
                        {asignaciones.length === 0 ? (
                          <div style={{ fontSize:12, color:'#999', textAlign:'center', padding:'8px 0' }}>
                            Sin clases esta hora (complementaria u hora libre del profesor)
                          </div>
                        ) : asignaciones.map((asig, idx) => {
                          const cubre = asig.cubre;
                          const yoCubro = cubre && normAbrev(cubre.abrev) === normAbrev(claveAbreviatura(
                            profesoresList.find(p=>p.id===profesorId)?.apellidos || '',
                            profesoresList.find(p=>p.id===profesorId)?.nombre || ''
                          ));

                          // Buscar apoyo registrado para poder cambiarlo si es apoyo_cruzado
                          const apoyoRegistrado = cubre?.tipo === 'apoyo_cruzado'
                            ? apoyosAsignados.find(ap =>
                                ap.hora === horaActiva &&
                                ap.profesor_id === cubre.profesorId &&
                                ap.grupo === asig.clase.grupo
                              )
                            : null;

                          return (
                            <div key={idx} style={{
                              padding:'10px 12px', marginBottom:8,
                              backgroundColor: yoCubro ? '#f0fdf4' : '#fafafa',
                              borderRadius:8, border: yoCubro ? '2px solid ' + verde : '1px solid #e5e7eb',
                            }}>
                              {/* Datos del profesor ausente */}
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                <span style={{ fontSize:13, fontWeight:700, color:'#333' }}>
                                  {asig.ausencia.profesor}
                                </span>
                                {asig.ausencia.tipo === 'dld' && (
                                  <span style={{ fontSize:10, padding:'2px 6px', backgroundColor:'#dbeafe', color:'#1e40af', borderRadius:8, fontWeight:700 }}>DLD</span>
                                )}
                              </div>

                              {/* Datos de la clase huérfana */}
                              <div style={{ fontSize:12, color:'#555', marginBottom:6, display:'flex', gap:12, flexWrap:'wrap' }}>
                                {asig.clase.grupo && <span>👥 <strong>{asig.clase.grupo}</strong></span>}
                                {asig.clase.aula && <span>📍 {asig.clase.aula}</span>}
                                {asig.clase.materia && <span>📚 {asig.clase.materia}</span>}
                              </div>

                              {/* Tarea */}
                              {asig.clase.instrucciones && (
                                <div style={{
                                  padding:'8px 10px', backgroundColor:'#fffbeb', borderRadius:6,
                                  fontSize:12, color:'#78350f', marginBottom:8, border:'1px solid #fde68a',
                                }}>
                                  📝 <strong>Tarea:</strong> {asig.clase.instrucciones}
                                </div>
                              )}

                              {/* Quien cubre */}
                              {!cubre ? (
                                <div style={{
                                  padding:'8px 10px', backgroundColor:'#fef2f2', borderRadius:6,
                                  fontSize:12, color:rojo, fontWeight:700,
                                }}>
                                  ⚠️ NO HAY QUIEN CUBRA — sin profesores disponibles
                                </div>
                              ) : cubre.tipo === 'apoyo_cruzado' && !apoyoRegistrado ? (
                                // En vista de profesor, si es un apoyo cruzado sin registrar aún, mostrar aviso neutral
                                <div style={{
                                  padding:'8px 10px', borderRadius:6,
                                  backgroundColor:'#f3f4f6',
                                  border:'1px solid #d1d5db',
                                  fontSize:12, color:'#666', fontStyle:'italic',
                                }}>
                                  ⏳ Pendiente de asignar apoyo — jefatura decidirá
                                </div>
                              ) : (
                                <div style={{
                                  padding:'8px 10px', borderRadius:6,
                                  backgroundColor: yoCubro ? '#dcfce7' : (cubre.tipo === 'apoyo_cruzado' ? '#fef3c7' : '#f3f4f6'),
                                  border:'1px solid ' + (yoCubro ? '#86efac' : (cubre.tipo === 'apoyo_cruzado' ? '#fbbf24' : '#e5e7eb')),
                                  display:'flex', alignItems:'center', gap:8, fontSize:12,
                                }}>
                                  <span style={{ fontWeight:700, color: yoCubro ? verde : (cubre.tipo === 'apoyo_cruzado' ? '#78350f' : '#333') }}>
                                    {yoCubro ? '✅ TE CUBRE:' : cubre.tipo === 'apoyo_cruzado' ? '🚨 APOYO ASIGNADO:' : '✅ CUBRE:'}
                                  </span>
                                  <span style={{ fontWeight:800, color: yoCubro ? verde : '#333' }}>
                                    {yoCubro ? 'TÚ' : cubre.nombre}
                                  </span>
                                  <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                    {cubre.tipo === 'apoyo_cruzado'
                                      ? `${cubre.sectorOriginal} (${cubre.apoyosPrevios} apoyos)`
                                      : `guardia ${cubre.sectorOriginal}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* SECCIÓN 2: PROFESORES DE GUARDIA (COLAPSABLE, SECUNDARIO) */}
            <details style={{ marginTop:20, backgroundColor:'white', border:'1px solid #e5e7eb', borderRadius:10 }}>
              <summary style={{
                cursor:'pointer', padding:'12px 16px', fontSize:13, fontWeight:700, color:'#555',
                display:'flex', alignItems:'center', gap:8,
              }}>
                📊 Profesores de guardia esta hora (todos los sectores)
              </summary>
              <div style={{ padding:'0 16px 16px' }}>
                {sectores.filter(s => guardiasDeSector(s).length > 0).map(s => {
                  const guardias = guardiasDeSector(s);
                  return (
                    <div key={s} style={{ padding:'10px 0', borderTop:'1px solid #f3f4f6' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:azul, marginBottom:6 }}>
                        {emojiSector(s)} {s.toUpperCase()}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                        {guardias.map((p, i) => {
                          const key = normAbrev(p);
                          const nombre = mapaProfesores[key] || p;
                          const esYo = p && profesorNombre && p.toLowerCase().includes(profesorNombre.toLowerCase().split(' ')[0]);
                          return (
                            <span key={i} style={{
                              padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                              backgroundColor: esYo ? '#fef3c7' : '#f0fdf4',
                              color: esYo ? '#78350f' : verde,
                              border:'1.5px solid ' + (esYo ? '#fbbf24' : '#bbf7d0'),
                            }}>
                              {esYo && '⭐ '}{nombre}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          </>
        )}
      </div>

      {/* MODAL CAMBIAR APOYO */}
      {modalCambiar && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setModalCambiar(null)}>
          <div style={{ backgroundColor:'white', borderRadius:16, padding:24, maxWidth:500, width:'100%', maxHeight:'80vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:16, color:azul, marginBottom:6 }}>Cambiar profesor de apoyo</div>
            <div style={{ fontSize:12, color:'#666', marginBottom:14 }}>
              Grupo: <strong>{modalCambiar.asig.clase.grupo}</strong> · Actual: <strong>{modalCambiar.actual.nombre}</strong>
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:8 }}>
              Selecciona otro profesor (ordenados por menos apoyos previos):
            </div>
            {modalCambiar.alternativas.length === 0 ? (
              <div style={{ padding:16, textAlign:'center', color:'#999', fontSize:12 }}>
                No hay más profesores disponibles esta hora
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {modalCambiar.alternativas.map((p, i) => (
                  <button key={i} onClick={() => cambiarApoyo(modalCambiar.apoyoId, p)} style={{
                    padding:'10px 12px', borderRadius:10, cursor:'pointer', textAlign:'left',
                    backgroundColor: i === 0 ? '#fef3c7' : 'white',
                    border: i === 0 ? '2px solid #f59e0b' : '1.5px solid #e5e7eb',
                    display:'flex', alignItems:'center', gap:10,
                  }}>
                    <span style={{ fontSize:14 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{p.nombre}</div>
                      <div style={{ fontSize:11, color:'#666' }}>{p.sectorOriginal} · {p.apoyosPrevios} apoyo{p.apoyosPrevios!==1?'s':''}</div>
                    </div>
                    <span style={{ fontSize:11, color:verde, fontWeight:700 }}>ASIGNAR</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setModalCambiar(null)} style={{
              marginTop:14, padding:'8px 16px', width:'100%', borderRadius:8, border:'1px solid #ddd',
              backgroundColor:'white', color:'#666', cursor:'pointer', fontSize:13,
            }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
