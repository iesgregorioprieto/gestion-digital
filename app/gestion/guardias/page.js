'use client';
export const dynamic = 'force-dynamic';
// v3.0 - GESTIÓN COMPLETA CON CONTADOR Y APOYOS MANUALES

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

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

const SECTORES_FP = ['TMV', 'COMERCIO', 'ELECTRICIDAD', 'INFORMÁTICA', 'HOSTELERÍA', 'INDUSTRIAS ALIMENTARIAS', 'ADMINISTRACIÓN'];

function esSectorFP(sector) {
  const sup = (sector || '').toUpperCase();
  return SECTORES_FP.includes(sup);
}
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
function normAbrev(str) { return (str || '').toLowerCase().replace(/\s/g, ''); }

export default function GestionGuardias() {
  const [usuario, setUsuario] = useState(null);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [horaActiva, setHoraActiva] = useState('1');
  const [horariosClase, setHC] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [horarioGuardias, setHG] = useState({});
  const [profesoresList, setProfsList] = useState([]);
  const [mapaProfesores, setMapaProf] = useState({});
  const [ausenciasDia, setAusDia] = useState([]);
  const [apoyosAsignados, setApAsig] = useState([]);
  const [contadorApoyos, setContApoyos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [modalActivar, setModalActivar] = useState(null);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || !['director','secretario','jefe_estudios'].includes(rol)) {
      window.location.href = '/login';
      return;
    }
    setUsuario({ id, nombre: sessionStorage.getItem('profesor_nombre') || 'Usuario' });
  }, []);

  useEffect(() => {
    if (usuario) cargarBase();
  }, [usuario]);

  useEffect(() => {
    if (!cargando && usuario) cargarDia(fecha);
  }, [fecha, cargando]);

  async function cargarBase() {
    setCargando(true);
    // Todos los horarios (con paginación)
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

    // Profesores
    const { data: profes } = await getSupabase()
      .from('profesores')
      .select('id,nombre,apellidos,especialidad');
    const mapa = {};
    (profes || []).forEach(p => {
      mapa[claveAbreviatura(p.apellidos, p.nombre)] = `${p.apellidos}, ${p.nombre}`;
    });
    setMapaProf(mapa);
    setProfsList(profes || []);

    // Contador de apoyos por sector del curso
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
    setSectores(Object.keys(porSector).sort());
    setHG(porSector);
    setCargando(false);
  }

  async function cargarDia(f) {
    setCargandoDia(true);
    setAusDia([]);
    setApAsig([]);

    const diaSem = diaSemanaEs(f);
    if (diaSem === 'sabado' || diaSem === 'domingo') { setCargandoDia(false); return; }

    let aus = [], dlds = [];
    try {
      const r = await getSupabase().from('ausencias').select('profesor_id,profesor_nombre,horas').lte('fecha_inicio', f).gte('fecha_fin', f);
      aus = r.data || [];
    } catch(e) {}
    try {
      const r = await getSupabase().from('dld').select('profesor_id,profesor_nombre,horas').eq('fecha_solicitada', f).eq('estado','aprobada');
      dlds = r.data || [];
    } catch(e) {}

    const todas = [
      ...aus.map(a => ({...a, tipo_falta:'ausencia'})),
      ...dlds.map(d => ({...d, tipo_falta:'dld'})),
    ];

    try {
      const r = await getSupabase()
        .from('apoyos_asignados')
        .select('*')
        .eq('fecha', f)
        .eq('curso_academico', '2025-2026');
      setApAsig(r.data || []);
    } catch(e) {}

    const resultado = [];
    for (const falta of todas) {
      const prof = profesoresList.find(p => p.id === falta.profesor_id);
      if (!prof) continue;
      const nombrePdf = `${prof.apellidos}, ${prof.nombre}`;
      resultado.push({
        profesorId: falta.profesor_id,
        profesor: nombrePdf,
        nombrePdf,
        abrev: claveAbreviatura(prof.apellidos, prof.nombre),
        sector: prof.especialidad || 'GENERAL',
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

  function ausentesEstaHora() {
    return ausenciasDia.filter(a => a.horas.some(h => horaCoincide(h.hora, horaActiva)));
  }

  function ausenciasPorSector() {
    const grupos = {};
    ausentesEstaHora().forEach(a => {
      const s = a.sector.toUpperCase();
      if (!grupos[s]) grupos[s] = [];
      grupos[s].push(a);
    });
    return grupos;
  }

  function guardiasDeSector(sector) {
    return horarioGuardias[sector]?.[diaSem]?.[horaActiva] || [];
  }

  function sectorReal(nombreSector) {
    return sectores.find(s => s.toUpperCase() === nombreSector.toUpperCase()) || nombreSector;
  }

  // Profesores FP libres esta hora (para sugerir apoyos)
  function profesoresLibresParaApoyo(asignadosAbrev = new Set(), porSector = null) {
    if (porSector === null) porSector = ausenciasPorSector();

    const ocupadosEnClase = new Set(
      horariosClase
        .filter(h => h.tipo === 'clase' && (h.dia||'').toLowerCase() === diaSem && normHora(h.hora_id) === horaActiva)
        .map(h => normAbrev(h.profesor_nombre_pdf))
    );
    const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));

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

  // Auto-asignación para esta hora
  function asignacionAutomatica() {
    const asignaciones = [];
    const porSector = ausenciasPorSector();
    const asignadosAbrev = new Set();

    for (const sectorSup of Object.keys(porSector)) {
      const sReal = sectorReal(sectorSup);
      const ausentes = porSector[sectorSup];
      const guardiasDisp = guardiasDeSector(sReal);

      for (const aus of ausentes) {
        const clasesHora = aus.horas.filter(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'clase');

        for (const clase of clasesHora) {
          let cubre = null;
          for (const p of guardiasDisp) {
            const key = normAbrev(p);
            if (!asignadosAbrev.has(key)) {
              cubre = { nombre: mapaProfesores[key] || p, abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
              asignadosAbrev.add(key);
              break;
            }
          }

          if (!cubre) {
            const libres = profesoresLibresParaApoyo(asignadosAbrev, porSector);
            if (libres.length > 0) {
              const primero = libres[0];
              asignadosAbrev.add(normAbrev(primero.abrev));
              cubre = { ...primero, tipo: 'apoyo_obligatorio', alternativas: libres.slice(1) };
            }
          }

          asignaciones.push({ ausencia: aus, clase, cubre });
        }
      }
    }
    return asignaciones;
  }

  // Auto-registro de apoyos OBLIGATORIOS (no los sugeridos)
  useEffect(() => {
    if (cargandoDia || cargando) return;
    autoRegistrarApoyosObligatorios();
  }, [ausenciasDia, horaActiva, cargandoDia, cargando]);

  async function autoRegistrarApoyosObligatorios() {
    const asignaciones = asignacionAutomatica();
    const apoyosNuevos = [];

    for (const asig of asignaciones) {
      // Solo registrar los OBLIGATORIOS (cuando no hay guardias del sector)
      if (asig.cubre?.tipo !== 'apoyo_obligatorio') continue;
      if (!asig.cubre.profesorId) continue;

      const yaExiste = apoyosAsignados.some(ap =>
        ap.fecha === fecha &&
        ap.hora === horaActiva &&
        ap.profesor_id === asig.cubre.profesorId &&
        ap.grupo === (asig.clase.grupo || null)
      );
      if (yaExiste) continue;

      apoyosNuevos.push({
        fecha,
        hora: horaActiva,
        sector_apoyo: asig.cubre.sectorOriginal,
        sector_destino: asig.ausencia.sector.toUpperCase(),
        profesor_id: asig.cubre.profesorId,
        grupo: asig.clase.grupo || null,
        aula: asig.clase.aula || null,
        materia: asig.clase.materia || null,
        tarea: asig.clase.instrucciones || null,
        asignado_por: usuario?.id,
        estado: 'pendiente',
        tipo_apoyo: 'obligatorio',
        curso_academico: '2025-2026',
      });
    }

    if (apoyosNuevos.length > 0) {
      const { data } = await getSupabase().from('apoyos_asignados').insert(apoyosNuevos).select();
      if (data) setApAsig(prev => [...prev, ...data]);
    }
  }

  // Activar apoyo (jefe pulsa botón cuando no era obligatorio)
  async function activarApoyoUrgente(asig, profesorSeleccionado) {
    const { data, error } = await getSupabase().from('apoyos_asignados').insert([{
      fecha,
      hora: horaActiva,
      sector_apoyo: profesorSeleccionado.sectorOriginal,
      sector_destino: asig.ausencia.sector.toUpperCase(),
      profesor_id: profesorSeleccionado.profesorId,
      grupo: asig.clase.grupo || null,
      aula: asig.clase.aula || null,
      materia: asig.clase.materia || null,
      tarea: asig.clase.instrucciones || null,
      asignado_por: usuario?.id,
      estado: 'pendiente',
      tipo_apoyo: 'urgente',
      curso_academico: '2025-2026',
    }]).select();
    if (error) { alert('Error: ' + error.message); return; }
    if (data) setApAsig(prev => [...prev, ...data]);
    setModalActivar(null);
  }

  // Cambiar profesor de un apoyo ya registrado
  async function cambiarProfesor(apoyoId, nuevoProfesor) {
    const { error } = await getSupabase()
      .from('apoyos_asignados')
      .update({
        profesor_id: nuevoProfesor.profesorId,
        sector_apoyo: nuevoProfesor.sectorOriginal,
        asignado_por: usuario?.id,
      })
      .eq('id', apoyoId);
    if (error) { alert('Error: ' + error.message); return; }
    const r = await getSupabase().from('apoyos_asignados').select('*').eq('fecha', fecha).eq('curso_academico','2025-2026');
    setApAsig(r.data || []);
    setModalActivar(null);
  }

  // Eliminar apoyo urgente activado por error
  async function desactivarApoyo(apoyoId) {
    if (!confirm('¿Desactivar este apoyo? El profesor dejará de estar asignado.')) return;
    const { error } = await getSupabase().from('apoyos_asignados').delete().eq('id', apoyoId);
    if (error) { alert('Error: ' + error.message); return; }
    setApAsig(prev => prev.filter(a => a.id !== apoyoId));
  }

  const btnNav = {
    padding:'8px 14px', borderRadius:10, cursor:'pointer', fontSize:13,
    backgroundColor:'white', border:'1.5px solid #d1d5db',
  };

  if (!usuario) return <div style={{ padding:40 }}>Cargando…</div>;
  if (cargando) return <div style={{ padding:40, textAlign:'center' }}>Cargando cuadrante…</div>;

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f9fafb', fontFamily:'system-ui,sans-serif', paddingBottom:60 }}>
      {/* HEADER */}
      <div style={{ backgroundColor:azul, color:'white', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800 }}>🛡️ Gestión de Guardias</div>
          <div style={{ fontSize:11, opacity:0.85 }}>{usuario.nombre}</div>
        </div>
        <a href="/gestion" style={{ color:'white', padding:'6px 12px', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, fontSize:13, textDecoration:'none' }}>← Volver</a>
      </div>

      {/* CONTADOR DE APOYOS DEL CURSO */}
      <div style={{ backgroundColor:'#f3f4f6', padding:'12px 16px', borderBottom:'1px solid #e5e7eb' }}>
        <div style={{ fontSize:11, fontWeight:800, color:'#555', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>
          📊 Contador de apoyos del curso
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {SECTORES_FP.map((s, i) => {
            const cnt = contadorApoyos[s] || 0;
            // Ordenar visualmente: mostrar menos apoyos con estrella
            return (
              <span key={s} style={{
                padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                backgroundColor: cnt === 0 ? '#dcfce7' : (cnt <= 2 ? '#fef3c7' : '#fee2e2'),
                color: cnt === 0 ? verde : (cnt <= 2 ? '#78350f' : rojo),
                border:'1px solid ' + (cnt === 0 ? '#86efac' : (cnt <= 2 ? '#fbbf24' : '#fca5a5')),
              }}>
                {emojiSector(s)} {s}: <strong>{cnt}</strong>
              </span>
            );
          })}
        </div>
      </div>

      {/* NAV FECHA */}
      <div style={{ padding:'14px 16px', backgroundColor:'white', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setFecha(sumarDias(fecha, -1))} style={btnNav}>←</button>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:azul, textTransform:'capitalize' }}>{fechaCorta(fecha)}</div>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{ padding:'2px 6px', borderRadius:6, border:'1px solid #ddd', fontSize:11, marginTop:4 }} />
        </div>
        <button onClick={() => setFecha(sumarDias(fecha, 1))} style={btnNav}>→</button>
        <button onClick={() => setFecha(new Date().toISOString().split('T')[0])} style={{ ...btnNav, backgroundColor:azul, color:'white', border:'none' }}>Hoy</button>
      </div>

      {/* HORAS */}
      {!esFinde && (
        <div style={{ padding:'10px 16px 0', backgroundColor:'white', borderBottom:'1px solid #e5e7eb' }}>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
            {HORAS.map(h => {
              const activa = h.id === horaActiva;
              const ausentesH = ausenciasDia.filter(a => a.horas.some(hh => horaCoincide(hh.hora, h.id)));
              const cnt = ausentesH.length;
              return (
                <button key={h.id} onClick={() => setHoraActiva(h.id)} style={{
                  flexShrink:0, padding:'8px 14px', borderRadius:10, cursor:'pointer',
                  backgroundColor: activa ? azul : (cnt > 0 ? '#fef2f2' : 'white'),
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

      {!esFinde && horaInfo && (
        <div style={{ textAlign:'center', padding:'8px 16px', backgroundColor:'#f3f4f6', fontSize:12, color:'#666' }}>
          ⏰ {horaInfo.horario}
        </div>
      )}

      {/* CONTENIDO */}
      <div style={{ padding:16 }}>
        {cargandoDia ? (
          <div style={{ textAlign:'center', padding:40, color:'#888' }}>Cargando…</div>
        ) : esFinde ? (
          <div style={{ backgroundColor:'white', borderRadius:12, padding:30, textAlign:'center', color:'#666' }}>
            🏖️ Fin de semana
          </div>
        ) : ausentesEstaHora().length === 0 ? (
          <div style={{
            backgroundColor:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12,
            padding:20, textAlign:'center', color:verde, fontSize:14,
          }}>
            ✅ No hay profesores ausentes esta hora
          </div>
        ) : (
          <>
            <div style={{ fontWeight:800, fontSize:14, color:rojo, marginBottom:12 }}>
              🚨 PROFESORES QUE FALTAN ({ausentesEstaHora().length})
            </div>

            {Object.entries(ausenciasPorSector()).map(([sectorSup, ausentes]) => {
              const asignaciones = asignacionAutomatica().filter(a => a.ausencia.sector.toUpperCase() === sectorSup);
              return (
                <div key={sectorSup} style={{ marginBottom:16 }}>
                  <div style={{
                    backgroundColor:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:'10px 10px 0 0',
                    padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                  }}>
                    <span style={{ fontSize:16 }}>{emojiSector(sectorSup)}</span>
                    <span style={{ fontWeight:800, fontSize:13, color:rojo }}>{sectorSup}</span>
                    <span style={{ fontSize:11, color:'#7f1d1d', marginLeft:'auto' }}>
                      {ausentes.length} ausente{ausentes.length !== 1 ? 's' : ''} · {asignaciones.length} clase{asignaciones.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ backgroundColor:'white', border:'1.5px solid #fca5a5', borderTop:'none', borderRadius:'0 0 10px 10px', padding:12 }}>
                    {asignaciones.length === 0 ? (
                      <div style={{ fontSize:12, color:'#999', padding:8, textAlign:'center' }}>
                        Sin clases esta hora (complementaria u hora libre)
                      </div>
                    ) : asignaciones.map((asig, idx) => {
                      const cubre = asig.cubre;

                      // Buscar apoyo registrado si es obligatorio
                      const apoyoReg = cubre?.tipo === 'apoyo_obligatorio'
                        ? apoyosAsignados.find(ap =>
                            ap.hora === horaActiva &&
                            ap.grupo === (asig.clase.grupo || null) &&
                            ap.sector_destino === asig.ausencia.sector.toUpperCase()
                          )
                        : null;

                      // Sugerencias para "apoyo urgente" cuando el sector YA está cubierto
                      const sectorEstaCubierto = cubre?.tipo === 'guardia_sector';
                      const sugerenciasBackup = sectorEstaCubierto
                        ? profesoresLibresParaApoyo(new Set([normAbrev(cubre.abrev)]), ausenciasPorSector())
                        : [];

                      // Ya hay un apoyo urgente activado para esta clase específica?
                      const apoyoUrgenteExistente = apoyosAsignados.find(ap =>
                        ap.hora === horaActiva &&
                        ap.grupo === (asig.clase.grupo || null) &&
                        ap.sector_destino === asig.ausencia.sector.toUpperCase() &&
                        ap.tipo_apoyo === 'urgente'
                      );

                      return (
                        <div key={idx} style={{
                          padding:'10px 12px', marginBottom:10,
                          backgroundColor:'#fafafa', borderRadius:8, border:'1px solid #e5e7eb',
                        }}>
                          {/* Profesor ausente */}
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <span style={{ fontSize:13, fontWeight:700 }}>{asig.ausencia.profesor}</span>
                            {asig.ausencia.tipo === 'dld' && (
                              <span style={{ fontSize:10, padding:'2px 6px', backgroundColor:'#dbeafe', color:'#1e40af', borderRadius:8, fontWeight:700 }}>DLD</span>
                            )}
                          </div>

                          {/* Clase huérfana */}
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

                          {/* CUBIERTO POR GUARDIA DEL SECTOR (VERDE) */}
                          {cubre?.tipo === 'guardia_sector' && (
                            <div style={{
                              padding:'8px 10px', borderRadius:6, backgroundColor:'#dcfce7',
                              border:'1px solid #86efac', display:'flex', alignItems:'center', gap:8, fontSize:12,
                            }}>
                              <span style={{ fontWeight:700, color:verde }}>✅ CUBRE:</span>
                              <span style={{ fontWeight:800 }}>{cubre.nombre}</span>
                              <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>guardia {cubre.sectorOriginal}</span>
                            </div>
                          )}

                          {/* APOYO OBLIGATORIO (ROJO/NARANJA) */}
                          {cubre?.tipo === 'apoyo_obligatorio' && (
                            <div style={{
                              padding:'8px 10px', borderRadius:6, backgroundColor:'#fef3c7',
                              border:'2px solid #f59e0b', display:'flex', alignItems:'center', gap:8, fontSize:12,
                            }}>
                              <span style={{ fontWeight:800, color:'#78350f' }}>🚨 APOYO OBLIGATORIO:</span>
                              <span style={{ fontWeight:800, color:'#78350f' }}>{cubre.nombre}</span>
                              <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                {cubre.sectorOriginal} ({cubre.apoyosPrevios} apoyos)
                              </span>
                              {apoyoReg && cubre.alternativas.length > 0 && (
                                <button
                                  onClick={() => setModalActivar({
                                    modo: 'cambiar',
                                    apoyoId: apoyoReg.id,
                                    asig,
                                    sugeridos: cubre.alternativas,
                                    actual: cubre,
                                  })}
                                  style={{
                                    padding:'4px 10px', borderRadius:6, border:'none',
                                    backgroundColor:'#f59e0b', color:'white', fontSize:11, fontWeight:700, cursor:'pointer',
                                  }}
                                >Cambiar ▾</button>
                              )}
                            </div>
                          )}

                          {/* SIN COBERTURA POSIBLE */}
                          {!cubre && (
                            <div style={{
                              padding:'8px 10px', backgroundColor:'#fef2f2', borderRadius:6,
                              fontSize:12, color:rojo, fontWeight:700,
                            }}>
                              ⚠️ NO HAY QUIEN CUBRA — sin profesores disponibles
                            </div>
                          )}

                          {/* APOYO URGENTE YA ACTIVADO */}
                          {apoyoUrgenteExistente && (() => {
                            const prof = profesoresList.find(p => p.id === apoyoUrgenteExistente.profesor_id);
                            const nombreAp = prof ? `${prof.apellidos}, ${prof.nombre}` : 'Profesor';
                            return (
                              <div style={{
                                marginTop:8, padding:'8px 10px', borderRadius:6, backgroundColor:'#fee2e2',
                                border:'2px solid #dc2626', display:'flex', alignItems:'center', gap:8, fontSize:12,
                              }}>
                                <span style={{ fontWeight:800, color:rojo }}>🚨 APOYO URGENTE:</span>
                                <span style={{ fontWeight:800, color:rojo }}>{nombreAp}</span>
                                <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                  {apoyoUrgenteExistente.sector_apoyo}
                                </span>
                                <button
                                  onClick={() => desactivarApoyo(apoyoUrgenteExistente.id)}
                                  style={{
                                    padding:'4px 8px', borderRadius:6, border:'none',
                                    backgroundColor:'#dc2626', color:'white', fontSize:10, fontWeight:700, cursor:'pointer',
                                  }}
                                >✕ Desactivar</button>
                              </div>
                            );
                          })()}

                          {/* PANEL DE SUGERENCIAS BACKUP (solo si sector cubierto y no hay apoyo urgente) */}
                          {sectorEstaCubierto && sugerenciasBackup.length > 0 && !apoyoUrgenteExistente && (
                            <div style={{ marginTop:10, padding:'10px 12px', backgroundColor:'#fffbeb', borderRadius:8, border:'1px dashed #fbbf24' }}>
                              <div style={{ fontSize:11, fontWeight:700, color:'#78350f', marginBottom:6 }}>
                                💡 SUGERENCIAS DE APOYO EXTRA (rotación)
                              </div>
                              <div style={{ fontSize:10, color:'#92400e', marginBottom:8 }}>
                                Por si necesitas activar apoyo urgente. No cuenta en el contador salvo que actives.
                              </div>
                              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                                {sugerenciasBackup.slice(0, 6).map((p, i) => (
                                  <div key={i} style={{
                                    display:'flex', alignItems:'center', gap:8,
                                    padding:'6px 10px', borderRadius:6,
                                    backgroundColor: i === 0 ? '#fef3c7' : 'white',
                                    border: i === 0 ? '1.5px solid #f59e0b' : '1px solid #fde68a',
                                  }}>
                                    <span style={{ fontSize:12, fontWeight:800 }}>
                                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                                    </span>
                                    <div style={{ flex:1 }}>
                                      <div style={{ fontSize:11, fontWeight:700, color:'#78350f' }}>{p.nombre}</div>
                                      <div style={{ fontSize:10, color:'#92400e' }}>{p.sectorOriginal} · {p.apoyosPrevios} apoyo{p.apoyosPrevios !== 1 ? 's' : ''}</div>
                                    </div>
                                    <button
                                      onClick={() => activarApoyoUrgente(asig, p)}
                                      style={{
                                        padding:'4px 10px', borderRadius:6, border:'none',
                                        backgroundColor: '#f59e0b', color:'white', fontSize:10, fontWeight:700, cursor:'pointer',
                                      }}
                                    >Activar</button>
                                  </div>
                                ))}
                              </div>
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
      </div>

      {/* MODAL CAMBIAR PROFESOR */}
      {modalActivar && modalActivar.modo === 'cambiar' && (
        <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setModalActivar(null)}>
          <div style={{ backgroundColor:'white', borderRadius:16, padding:24, maxWidth:500, width:'100%', maxHeight:'80vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight:800, fontSize:16, color:azul, marginBottom:6 }}>Cambiar profesor</div>
            <div style={{ fontSize:12, color:'#666', marginBottom:14 }}>
              Grupo <strong>{modalActivar.asig.clase.grupo}</strong> · Actual: <strong>{modalActivar.actual.nombre}</strong>
            </div>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>Selecciona nuevo profesor:</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {modalActivar.sugeridos.map((p, i) => (
                <button key={i} onClick={() => cambiarProfesor(modalActivar.apoyoId, p)} style={{
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
                </button>
              ))}
            </div>
            <button onClick={() => setModalActivar(null)} style={{ marginTop:14, padding:'8px 16px', width:'100%', borderRadius:8, border:'1px solid #ddd', backgroundColor:'white', color:'#666', cursor:'pointer', fontSize:13 }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
