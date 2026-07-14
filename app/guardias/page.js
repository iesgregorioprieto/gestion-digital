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

const verde = '#1e6b2e';
const azul = '#1e3a5f';
const rojo = '#991b1b';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const DIAS_LABEL = { lunes: 'Lunes', martes: 'Martes', miércoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };

const HORAS = [
  { id: '1', label: '1ª', horario: '8:30 – 9:25' },
  { id: '2', label: '2ª', horario: '9:25 – 10:20' },
  { id: '3', label: '3ª', horario: '10:20 – 11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15 – 11:45' },
  { id: '4', label: '4ª', horario: '11:45 – 12:40' },
  { id: '5', label: '5ª', horario: '12:40 – 13:35' },
  { id: '6', label: '6ª', horario: '13:35 – 14:30' },
];

function normHora(h) { return (h || '').toString().replace(/[aª]$/, '').toLowerCase(); }

function diaSemanaEs(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return dias[new Date(fecha + 'T12:00:00').getDay()];
}

function esCuadranteGeneral(cuadrante) {
  const n = (cuadrante || '').toUpperCase();
  return n.includes('GENERAL') || n.includes('ESO') || n.includes('BACHIL') || n.includes('BTO');
}

export default function Guardias() {
  const [vista, setVista] = useState('cuadrantes');
  const [cargando, setCargando] = useState(true);
  const [cuadrantes, setCuadrantes] = useState([]);
  const [cuadranteActivo, setCuadranteActivo] = useState('');
  const [horarioGuardias, setHorarioGuardias] = useState({});
  const [horariosClase, setHorariosClase] = useState([]);
  const [profesorPorNombre, setProfesorPorNombre] = useState({});
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [esDirectivo, setEsDirectivo] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  const [fechaSel, setFechaSel] = useState(new Date().toISOString().split('T')[0]);
  const [faltas, setFaltas] = useState([]);
  const [analisis, setAnalisis] = useState([]);
  const [cargandoAnalisis, setCargandoAnalisis] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // Mi guardia hoy
  const [misGuardias, setMisGuardias] = useState([]);
  const [cargandoMisGuardias, setCargandoMisGuardias] = useState(false);
  const [fechaMiGuardia, setFechaMiGuardia] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setProfesorNombre(sessionStorage.getItem('profesor_nombre') || '');
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    setEsDirectivo(['secretario', 'director', 'jefe_estudios'].includes(rol));
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const { data: horarios } = await getSupabase()
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia')
      .eq('curso_academico', '2025-2026');

    if (!horarios) { setCargando(false); return; }
    setHorariosClase(horarios);

    const { data: profes } = await getSupabase()
      .from('profesores')
      .select('id, nombre, apellidos, departamento, contador_apoyos');

    const mapa = {};
    (profes || []).forEach(p => {
      const clave = `${p.apellidos}, ${p.nombre}`.toLowerCase();
      mapa[clave] = p;
    });
    setProfesorPorNombre(mapa);

    const guardias = horarios.filter(h => h.tipo === 'guardia');
    const porCuadrante = {};
    guardias.forEach(g => {
      const cuadrante = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
      const horaNorm = normHora(g.hora_id);
      const dia = (g.dia || '').toLowerCase();
      if (!porCuadrante[cuadrante]) porCuadrante[cuadrante] = {};
      if (!porCuadrante[cuadrante][dia]) porCuadrante[cuadrante][dia] = {};
      if (!porCuadrante[cuadrante][dia][horaNorm]) porCuadrante[cuadrante][dia][horaNorm] = [];
      porCuadrante[cuadrante][dia][horaNorm].push(g.profesor_nombre_pdf);
    });

    const nombres = Object.keys(porCuadrante).sort((a, b) => {
      const pA = pesoCuadrante(a), pB = pesoCuadrante(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b);
    });

    setCuadrantes(nombres);
    setHorarioGuardias(porCuadrante);
    setCuadranteActivo(nombres[0] || '');
    setCargando(false);
  }

  function pesoCuadrante(nombre) {
    const n = nombre.toUpperCase();
    if (n.includes('GENERAL')) return 9;
    if (n.includes('JEFATURA')) return 8;
    if (n.includes('ADMINIST')) return 7;
    if (n.includes('RECREO')) return 6;
    return 1;
  }

  function emojiCuadrante(nombre) {
    const n = nombre.toUpperCase();
    if (n.includes('GENERAL')) return '🌐';
    if (n.includes('JEFATURA')) return '📋';
    if (n.includes('ADMINIST')) return '🏢';
    if (n.includes('RECREO')) return '☕';
    if (n.includes('CARROC')) return '🚗';
    if (n.includes('COCIN') || n.includes('HOSTEL')) return '🍽️';
    if (n.includes('ELECTR')) return '⚡';
    if (n.includes('INFORM')) return '💻';
    if (n.includes('COMERC')) return '🛍️';
    if (n.includes('AUTOM')) return '🔧';
    if (n.includes('ALIMENT')) return '🥖';
    if (n.includes('JARDIN')) return '🌳';
    return '📚';
  }

  function contarGuardias(cuadrante) {
    const datos = horarioGuardias[cuadrante] || {};
    let total = 0;
    DIAS.forEach(d => { HORAS.forEach(h => { total += (datos[d]?.[h.id] || []).length; }); });
    return total;
  }

  function nombreCorto(n) {
    if (!n) return '';
    const partes = n.split(',').map(p => p.trim());
    if (partes.length < 2) return n;
    return `${partes[0].split(' ')[0]}, ${partes[1].split(' ')[0]}`;
  }

  function cuadranteDeProfesor(nombrePdf) {
    if (!nombrePdf) return null;
    for (const c of cuadrantes) {
      if (esCuadranteGeneral(c)) continue;
      const datos = horarioGuardias[c] || {};
      for (const d of DIAS) {
        for (const h of HORAS) {
          const profs = datos[d]?.[h.id] || [];
          if (profs.some(p => (p || '').toLowerCase() === nombrePdf.toLowerCase())) return c;
        }
      }
    }
    return null;
  }

  async function analizarFecha(fecha) {
    setCargandoAnalisis(true);
    setAnalisis([]);
    setFaltas([]);
    setMensaje(null);

    const diaSem = diaSemanaEs(fecha);
    if (diaSem === 'sábado' || diaSem === 'domingo') {
      setMensaje({ tipo: 'error', texto: '⚠️ La fecha es fin de semana.' });
      setCargandoAnalisis(false);
      return;
    }

    const { data: ausencias } = await getSupabase()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, motivo, fecha_inicio, fecha_fin, horas')
      .lte('fecha_inicio', fecha)
      .gte('fecha_fin', fecha);

    const { data: dlds } = await getSupabase()
      .from('dld')
      .select('profesor_id, profesor_nombre, motivo, fecha_solicitada, horas')
      .eq('fecha_solicitada', fecha)
      .eq('estado', 'aprobada');

    const todas = [
      ...(ausencias || []).map(a => ({ ...a, tipo_falta: 'ausencia' })),
      ...(dlds || []).map(d => ({ ...d, tipo_falta: 'dld' })),
    ];
    setFaltas(todas);

    if (todas.length === 0) {
      setCargandoAnalisis(false);
      return;
    }

    const resultado = [];
    for (const falta of todas) {
      const { data: prof } = await getSupabase()
        .from('profesores')
        .select('nombre, apellidos, departamento')
        .eq('id', falta.profesor_id);

      if (!prof || prof.length === 0) continue;
      const p = prof[0];
      const nombrePdf = `${p.apellidos}, ${p.nombre}`;

      const clasesDelDia = horariosClase.filter(h =>
        h.tipo === 'clase' &&
        (h.dia || '').toLowerCase() === diaSem &&
        (h.profesor_nombre_pdf || '').toLowerCase() === nombrePdf.toLowerCase()
      );

      const cuadranteAusente = cuadranteDeProfesor(nombrePdf);
      const esAusenteFP = cuadranteAusente && !esCuadranteGeneral(cuadranteAusente);

      const horasAnalisis = clasesDelDia.map(clase => {
        const horaNorm = normHora(clase.hora_id);
        // Buscar la tarea que dejó el profesor para esa hora en su ausencia/DLD
        const horasFalta = Array.isArray(falta.horas) ? falta.horas : [];
        const tarea = horasFalta.find(h => {
          if (!h) return false;
          const hn = normHora(h.hora_id) || normHora(h.hora) || '';
          const label = (h.hora || '').toLowerCase();
          return hn === horaNorm || label.includes(`${horaNorm}ª`) || label.includes(`${horaNorm}a`);
        });
        return analizarHora(diaSem, horaNorm, cuadranteAusente, esAusenteFP, nombrePdf, clase, tarea);
      });

      resultado.push({
        profesor: falta.profesor_nombre,
        departamento: p.departamento,
        cuadrante: cuadranteAusente || '(sin familia detectada)',
        motivo: falta.motivo,
        tipo: falta.tipo_falta,
        horas: horasAnalisis,
      });
    }

    setAnalisis(resultado);
    setCargandoAnalisis(false);
  }

  function analizarHora(dia, hora, cuadranteAusente, esAusenteFP, nombreAusente, clase, tarea) {
    let cuadranteBusqueda;
    if (esAusenteFP) cuadranteBusqueda = cuadranteAusente;
    else cuadranteBusqueda = cuadrantes.find(c => (c || '').toUpperCase().includes('GENERAL'));

    const cubridoresNativos = cuadranteBusqueda
      ? (horarioGuardias[cuadranteBusqueda]?.[dia]?.[hora] || [])
          .filter(n => n && n.toLowerCase() !== nombreAusente.toLowerCase())
      : [];

    let apoyo = null, motivoApoyo = '';
    if (cubridoresNativos.length === 0) {
      if (esAusenteFP) {
        const gen = cuadrantes.find(c => (c || '').toUpperCase().includes('GENERAL'));
        const disp = (horarioGuardias[gen]?.[dia]?.[hora] || [])
          .filter(n => n && n.toLowerCase() !== nombreAusente.toLowerCase());
        apoyo = disp[0] || null;
        motivoApoyo = 'Apoyo desde ESO/BTO (no hay cubridores en la familia)';
      } else {
        apoyo = elegirApoyoDesdeFP(dia, hora, nombreAusente);
        motivoApoyo = 'Apoyo rotatorio desde FP (contador equitativo)';
      }
    }

    return {
      hora, grupo: clase.grupo, materia: clase.materia,
      cubridores: cubridoresNativos, cuadranteBusqueda,
      apoyo, motivoApoyo,
      esApoyoRotatorio: !esAusenteFP && apoyo !== null,
      instrucciones: tarea?.instrucciones || null,
      archivo_url: tarea?.archivo_url || null,
      archivo_nombre: tarea?.archivo_nombre || null,
    };
  }

  function elegirApoyoDesdeFP(dia, hora, nombreAusente) {
    const nombresFP = new Set();
    cuadrantes.forEach(c => {
      if (esCuadranteGeneral(c)) return;
      const datos = horarioGuardias[c] || {};
      DIAS.forEach(d => { HORAS.forEach(h => { (datos[d]?.[h.id] || []).forEach(n => nombresFP.add(n)); }); });
    });

    const ocupados = new Set();
    horariosClase.forEach(h => {
      if ((h.dia || '').toLowerCase() === dia && normHora(h.hora_id) === hora) {
        ocupados.add((h.profesor_nombre_pdf || '').toLowerCase());
      }
    });

    const libres = [...nombresFP].filter(n => {
      if (!n) return false;
      if (n.toLowerCase() === nombreAusente.toLowerCase()) return false;
      return !ocupados.has(n.toLowerCase());
    });

    const conContador = libres.map(n => {
      const p = profesorPorNombre[n.toLowerCase()];
      return { nombre: n, contador: p?.contador_apoyos ?? 999 };
    });
    conContador.sort((a, b) => a.contador - b.contador);
    return conContador[0]?.nombre || null;
  }

  async function confirmarApoyos() {
    const rotatorios = [];
    analisis.forEach(a => {
      a.horas.forEach(h => {
        if (h.esApoyoRotatorio && h.apoyo) {
          rotatorios.push({ profesorNombre: h.apoyo, dia: diaSemanaEs(fechaSel), hora: h.hora });
        }
      });
    });

    if (rotatorios.length === 0) {
      setMensaje({ tipo: 'info', texto: 'No hay apoyos rotatorios que registrar.' });
      return;
    }

    if (!confirm(`Se registrarán ${rotatorios.length} apoyo(s) y se incrementarán los contadores. ¿Confirmar?`)) return;

    for (const r of rotatorios) {
      const prof = profesorPorNombre[r.profesorNombre.toLowerCase()];
      if (!prof) continue;
      await getSupabase().from('apoyos_guardia').insert({
        fecha: fechaSel, dia_semana: r.dia, hora_id: r.hora,
        profesor_id: prof.id, profesor_nombre: r.profesorNombre,
        tipo: 'ausencia', estado: 'confirmado',
        confirmado_por: profesorId, confirmado_at: new Date().toISOString(),
      });
      await getSupabase().from('profesores')
        .update({ contador_apoyos: (prof.contador_apoyos || 0) + 1 })
        .eq('id', prof.id);
    }

    setMensaje({ tipo: 'ok', texto: `✅ ${rotatorios.length} apoyo(s) registrado(s). Contadores actualizados.` });
    cargarDatos();
  }

  // ═══════════════════════════════════════════════════
  // MI GUARDIA HOY (vista para cada profesor)
  // ═══════════════════════════════════════════════════
  async function analizarMisGuardias(fecha) {
    setCargandoMisGuardias(true);
    setMisGuardias([]);
    setMensaje(null);

    const diaSem = diaSemanaEs(fecha);
    if (diaSem === 'sábado' || diaSem === 'domingo') {
      setMensaje({ tipo: 'error', texto: '⚠️ La fecha es fin de semana.' });
      setCargandoMisGuardias(false);
      return;
    }

    // 1. Buscar el nombre_pdf del profesor actual
    const { data: prof } = await getSupabase()
      .from('profesores').select('nombre, apellidos').eq('id', profesorId);
    if (!prof || prof.length === 0) { setCargandoMisGuardias(false); return; }
    const nombrePdf = `${prof[0].apellidos}, ${prof[0].nombre}`;
    const nombrePdfLc = nombrePdf.toLowerCase();

    // 2. Encontrar en qué horas del día tengo guardia (y en qué cuadrante)
    const misHoras = [];  // [{hora, cuadrante}]
    cuadrantes.forEach(c => {
      const datos = horarioGuardias[c] || {};
      const enDia = datos[diaSem] || {};
      HORAS.forEach(h => {
        const profs = enDia[h.id] || [];
        if (profs.some(n => (n || '').toLowerCase() === nombrePdfLc)) {
          misHoras.push({ hora: h.id, cuadrante: c });
        }
      });
    });

    // 3. También apoyos_guardia donde yo sea el asignado
    const { data: apoyos } = await getSupabase()
      .from('apoyos_guardia')
      .select('*')
      .eq('profesor_id', profesorId)
      .eq('fecha', fecha)
      .neq('estado', 'descartado');

    // 4. Cargar ausencias y DLDs del día
    const { data: ausencias } = await getSupabase()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, motivo, horas')
      .lte('fecha_inicio', fecha)
      .gte('fecha_fin', fecha);
    const { data: dlds } = await getSupabase()
      .from('dld')
      .select('profesor_id, profesor_nombre, motivo, horas')
      .eq('fecha_solicitada', fecha).eq('estado', 'aprobada');

    const todasFaltas = [
      ...(ausencias || []).map(a => ({ ...a, tipo_falta: 'ausencia' })),
      ...(dlds || []).map(d => ({ ...d, tipo_falta: 'dld' })),
    ];

    // 5. Para cada hora que tengo guardia, ver si hay clases huérfanas del cuadrante
    const guardiasConTareas = [];

    for (const miH of misHoras) {
      const { hora, cuadrante } = miH;
      // Buscar profesores ausentes que darían clase esa hora ese día
      const clasesHuerfanas = [];

      for (const falta of todasFaltas) {
        const { data: profAus } = await getSupabase()
          .from('profesores').select('nombre, apellidos').eq('id', falta.profesor_id);
        if (!profAus || profAus.length === 0) continue;
        const nombrePdfAus = `${profAus[0].apellidos}, ${profAus[0].nombre}`;
        const cuadranteAus = cuadranteDeProfesor(nombrePdfAus);
        const esFP = cuadranteAus && !esCuadranteGeneral(cuadranteAus);

        // Determinar si mi cuadrante coincide con el que debería cubrir este ausente
        const cuadranteDebo = esFP ? cuadranteAus : cuadrantes.find(c => (c || '').toUpperCase().includes('GENERAL'));
        if (cuadranteDebo !== cuadrante) continue;

        // Buscar la clase del ausente esa hora ese día
        const claseHuerfana = horariosClase.find(h =>
          h.tipo === 'clase' &&
          (h.dia || '').toLowerCase() === diaSem &&
          normHora(h.hora_id) === hora &&
          (h.profesor_nombre_pdf || '').toLowerCase() === nombrePdfAus.toLowerCase()
        );
        if (!claseHuerfana) continue;

        // Buscar la tarea que dejó el profesor
        const horasFalta = Array.isArray(falta.horas) ? falta.horas : [];
        const tarea = horasFalta.find(h => {
          if (!h) return false;
          const hn = normHora(h.hora_id) || normHora(h.hora) || '';
          const label = (h.hora || '').toLowerCase();
          return hn === hora || label.includes(`${hora}ª`) || label.includes(`${hora}a`);
        });

        clasesHuerfanas.push({
          profesorAusente: falta.profesor_nombre,
          tipoFalta: falta.tipo_falta,
          motivo: falta.motivo,
          grupo: claseHuerfana.grupo,
          materia: claseHuerfana.materia,
          instrucciones: tarea?.instrucciones || null,
          archivo_url: tarea?.archivo_url || null,
          archivo_nombre: tarea?.archivo_nombre || null,
        });
      }

      guardiasConTareas.push({
        hora,
        cuadrante,
        esApoyoRotatorio: false,
        clasesHuerfanas,
      });
    }

    // 6. Añadir apoyos rotatorios recibidos
    (apoyos || []).forEach(ap => {
      guardiasConTareas.push({
        hora: ap.hora_id,
        cuadrante: '(Apoyo asignado)',
        esApoyoRotatorio: true,
        tipoApoyo: ap.tipo,
        motivo: ap.motivo,
        clasesHuerfanas: [],
      });
    });

    // Ordenar por orden de horas
    guardiasConTareas.sort((a, b) => {
      const orden = ['1', '2', '3', 'recreo', '4', '5', '6'];
      return orden.indexOf(a.hora) - orden.indexOf(b.hora);
    });

    setMisGuardias(guardiasConTareas);
    setCargandoMisGuardias(false);
  }


  const datos = horarioGuardias[cuadranteActivo] || {};
  const cuadrantesFiltrados = busqueda.trim()
    ? cuadrantes.filter(c => c.toLowerCase().includes(busqueda.toLowerCase()))
    : cuadrantes;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: '#7c2d12', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { window.location.href = esDirectivo ? '/gestion' : '/profesor'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🛡️ Guardias</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Curso 2025-2026</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0', flexWrap: 'wrap' }}>
        <button onClick={() => setVista('cuadrantes')} style={tab(vista === 'cuadrantes')}>📋 Cuadrantes</button>
        <button onClick={() => setVista('mia')} style={tab(vista === 'mia')}>🛡️ Mi guardia hoy</button>
        {esDirectivo && <button onClick={() => setVista('hoy')} style={tab(vista === 'hoy')}>🚨 Faltas del día</button>}
      </div>

      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 8, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : mensaje.tipo === 'error' ? '#fee2e2' : '#eff6ff', color: mensaje.tipo === 'ok' ? '#065f46' : mensaje.tipo === 'error' ? '#991b1b' : '#1e40af', fontSize: 13, fontWeight: 600 }}>{mensaje.texto}</div>
      )}

      {cargando ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>Cargando datos...
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          {vista === 'cuadrantes' && (
            <>
              {cuadrantes.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div style={{ color: '#666' }}>No hay datos de guardias.</div>
                </div>
              ) : (
                <>
                  <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <input type="text" placeholder="🔍 Buscar cuadrante..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {cuadrantesFiltrados.map(c => {
                        const activo = c === cuadranteActivo;
                        return (
                          <button key={c} onClick={() => setCuadranteActivo(c)} style={{
                            padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${activo ? '#7c2d12' : '#e0e0e0'}`,
                            backgroundColor: activo ? '#7c2d12' : 'white', color: activo ? 'white' : '#555',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                          }}>
                            <span>{emojiCuadrante(c)}</span><span>{c}</span>
                            <span style={{ backgroundColor: activo ? 'rgba(255,255,255,0.25)' : '#f0f0f0', color: activo ? 'white' : '#888', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{contarGuardias(c)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {cuadranteActivo && (
                    <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '2px solid #f0f0f0' }}>
                        <div style={{ fontSize: 26 }}>{emojiCuadrante(cuadranteActivo)}</div>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: azul }}>{cuadranteActivo}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{contarGuardias(cuadranteActivo)} guardias semanales</div>
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 12 }}>
                          <thead><tr><th style={cabeceraCelda}>Hora</th>{DIAS.map(d => <th key={d} style={cabeceraCelda}>{DIAS_LABEL[d]}</th>)}</tr></thead>
                          <tbody>
                            {HORAS.map(h => (
                              <tr key={h.id}>
                                <td style={celdaHora}>
                                  <div style={{ fontWeight: 700, color: azul }}>{h.label}</div>
                                  <div style={{ fontSize: 10, color: '#888' }}>{h.horario}</div>
                                </td>
                                {DIAS.map(d => {
                                  const profs = datos[d]?.[h.id] || [];
                                  return (
                                    <td key={d} style={celda}>
                                      {profs.length === 0 ? <span style={{ color: '#ccc', fontSize: 11, fontStyle: 'italic' }}>—</span> : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                          {profs.map((p, i) => {
                                            const esYo = p && profesorNombre && p.toLowerCase().includes((profesorNombre || '').toLowerCase().split(' ')[0]);
                                            return (
                                              <span key={i} style={{
                                                display: 'inline-block', backgroundColor: esYo ? '#fef3c7' : '#f0fdf4',
                                                color: esYo ? '#78350f' : '#065f46', padding: '3px 7px', borderRadius: 6,
                                                fontSize: 11, fontWeight: 600, border: esYo ? '1.5px solid #fbbf24' : '1px solid #d1fae5'
                                              }}>{nombreCorto(p)}</span>
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
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {vista === 'mia' && (
            <>
              <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 700, color: azul, fontSize: 14 }}>📅 Fecha:</label>
                  <input type="date" value={fechaMiGuardia} onChange={e => setFechaMiGuardia(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14 }} />
                  <button onClick={() => analizarMisGuardias(fechaMiGuardia)} disabled={cargandoMisGuardias}
                    style={{ padding: '9px 18px', borderRadius: 8, border: 'none', backgroundColor: '#7c2d12', color: 'white', fontWeight: 700, fontSize: 13, cursor: cargandoMisGuardias ? 'not-allowed' : 'pointer' }}>
                    {cargandoMisGuardias ? '⏳ Cargando...' : '🔍 Ver mis guardias'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                  {diaSemanaEs(fechaMiGuardia).charAt(0).toUpperCase() + diaSemanaEs(fechaMiGuardia).slice(1)} · Consulta tus guardias del día con las tareas dejadas por los profesores ausentes.
                </div>
              </div>

              {!cargandoMisGuardias && misGuardias.length === 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🛡️</div>
                  <div>Pulsa <strong>Ver mis guardias</strong> para consultar tus guardias del día.</div>
                </div>
              )}

              {misGuardias.map((g, i) => {
                const horaLabel = HORAS.find(h => h.id === g.hora);
                const conClases = g.clasesHuerfanas.length > 0;
                return (
                  <div key={i} style={{ backgroundColor: 'white', borderRadius: 12, padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${g.esApoyoRotatorio ? '#f59e0b' : conClases ? '#7c2d12' : '#10b981'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ padding: '6px 12px', backgroundColor: azul, color: 'white', borderRadius: 8, fontWeight: 700, fontSize: 14, minWidth: 45, textAlign: 'center' }}>
                          {g.hora === 'recreo' ? 'R' : g.hora + 'ª'}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: azul }}>{horaLabel?.horario || g.hora}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>
                            {g.esApoyoRotatorio ? '🔄 Apoyo rotatorio' : `${emojiCuadrante(g.cuadrante)} ${g.cuadrante}`}
                          </div>
                        </div>
                      </div>
                      <span style={{ padding: '4px 12px', borderRadius: 20, backgroundColor: conClases ? '#fef3c7' : '#d1fae5', color: conClases ? '#78350f' : '#065f46', fontSize: 11, fontWeight: 700 }}>
                        {conClases ? `${g.clasesHuerfanas.length} clase${g.clasesHuerfanas.length !== 1 ? 's' : ''} por cubrir` : '✅ Sin faltas'}
                      </span>
                    </div>

                    {conClases ? (
                      g.clasesHuerfanas.map((c, j) => (
                        <div key={j} style={{ padding: '12px 14px', backgroundColor: '#fafafa', borderRadius: 10, marginBottom: 8 }}>
                          <div style={{ fontSize: 13, marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, color: '#333' }}>👥 {c.grupo}</span>
                            {c.materia && <span style={{ color: '#666' }}> · {c.materia}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                            {c.tipoFalta === 'dld' ? '📄 DLD' : '🏥 Ausencia'} de <strong>{c.profesorAusente}</strong>
                          </div>

                          {(c.instrucciones || c.archivo_url) ? (
                            <div style={{ padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#78350f', marginBottom: 6 }}>📝 Tarea para los alumnos</div>
                              {c.instrucciones && (
                                <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: c.archivo_url ? 8 : 0 }}>
                                  {c.instrucciones}
                                </div>
                              )}
                              {c.archivo_url && (
                                <a href={c.archivo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px', backgroundColor: 'white', color: '#78350f', border: '1px solid #fcd34d', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                                  📎 {c.archivo_nombre || 'Descargar archivo'}
                                </a>
                              )}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#aaa', fontStyle: 'italic', padding: '8px 12px', backgroundColor: '#f5f5f5', borderRadius: 6 }}>
                              ⚠️ El profesor no dejó tarea asignada
                            </div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: '10px 14px', backgroundColor: '#d1fae5', borderRadius: 8, color: '#065f46', fontSize: 13 }}>
                        Tienes guardia esta hora, pero no hay ningún profesor ausente. Puedes atender otras necesidades.
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {vista === 'hoy' && esDirectivo && (
            <>
              <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontWeight: 700, color: azul, fontSize: 14 }}>📅 Fecha:</label>
                  <input type="date" value={fechaSel} onChange={e => setFechaSel(e.target.value)}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14 }} />
                  <button onClick={() => analizarFecha(fechaSel)} disabled={cargandoAnalisis}
                    style={{ padding: '9px 18px', borderRadius: 8, border: 'none', backgroundColor: '#7c2d12', color: 'white', fontWeight: 700, fontSize: 13, cursor: cargandoAnalisis ? 'not-allowed' : 'pointer' }}>
                    {cargandoAnalisis ? '⏳ Analizando...' : '🔍 Analizar faltas'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                  {diaSemanaEs(fechaSel).charAt(0).toUpperCase() + diaSemanaEs(fechaSel).slice(1)} · Cruza ausencias y DLD con horarios y cuadrantes.
                </div>
              </div>

              {!cargandoAnalisis && analisis.length === 0 && faltas.length === 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                  <div>Pulsa <strong>Analizar faltas</strong> para procesar la fecha.</div>
                </div>
              )}

              {analisis.map((a, i) => {
                const cApoyos = a.horas.filter(h => h.esApoyoRotatorio && h.apoyo).length;
                return (
                  <div key={i} style={{ backgroundColor: 'white', borderRadius: 12, padding: 18, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${a.tipo === 'dld' ? '#3b82f6' : '#f59e0b'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: azul }}>{a.profesor}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                          {a.tipo === 'dld' ? '📄 DLD' : '🏥 Ausencia'} · {a.cuadrante}
                          {a.motivo && ` · ${a.motivo}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, backgroundColor: '#f3f4f6', color: '#555', fontSize: 11, fontWeight: 700 }}>{a.horas.length} clase{a.horas.length !== 1 ? 's' : ''}</span>
                        {cApoyos > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, backgroundColor: '#fef3c7', color: '#78350f', fontSize: 11, fontWeight: 700 }}>🔄 {cApoyos} apoyo{cApoyos !== 1 ? 's' : ''} FP</span>}
                      </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      {a.horas.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic' }}>No tenía clases ese día.</div>
                      ) : a.horas.map((h, j) => (
                        <div key={j} style={{ padding: '10px 12px', backgroundColor: '#fafafa', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ padding: '3px 8px', backgroundColor: azul, color: 'white', borderRadius: 5, fontWeight: 700, minWidth: 34, textAlign: 'center' }}>{h.hora === 'recreo' ? 'R' : h.hora + 'ª'}</span>
                            <span style={{ fontWeight: 700, color: '#333' }}>{h.grupo}</span>
                            {h.materia && <span style={{ color: '#888' }}>· {h.materia}</span>}
                          </div>
                          <div style={{ marginTop: 6, paddingLeft: 8 }}>
                            {h.cubridores.length > 0 ? (
                              <div style={{ color: '#065f46' }}>
                                ✅ Cubre: <strong>{h.cubridores.map(nombreCorto).join(', ')}</strong>
                                <span style={{ color: '#888', marginLeft: 6 }}>({h.cuadranteBusqueda})</span>
                              </div>
                            ) : h.apoyo ? (
                              <div style={{ color: h.esApoyoRotatorio ? '#78350f' : '#1e40af' }}>
                                {h.esApoyoRotatorio ? '🔄' : '🆘'} Apoyo sugerido: <strong>{nombreCorto(h.apoyo)}</strong>
                                <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{h.motivoApoyo}</div>
                              </div>
                            ) : (
                              <div style={{ color: rojo, fontWeight: 700 }}>⚠️ SIN CUBRIDORES DISPONIBLES</div>
                            )}
                          </div>

                          {/* TAREA DEJADA POR EL PROFESOR AUSENTE */}
                          {(h.instrucciones || h.archivo_url) && (
                            <div style={{ marginTop: 8, padding: '10px 12px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#78350f', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                📝 Tarea para los alumnos
                              </div>
                              {h.instrucciones && (
                                <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: h.archivo_url ? 6 : 0 }}>
                                  {h.instrucciones}
                                </div>
                              )}
                              {h.archivo_url && (
                                <a href={h.archivo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', backgroundColor: 'white', color: '#78350f', border: '1px solid #fcd34d', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                                  📎 {h.archivo_nombre || 'Descargar archivo'}
                                </a>
                              )}
                            </div>
                          )}
                          {!h.instrucciones && !h.archivo_url && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#aaa', fontStyle: 'italic', paddingLeft: 8 }}>
                              ⚠️ Sin tarea asignada por el profesor
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {analisis.length > 0 && analisis.some(a => a.horas.some(h => h.esApoyoRotatorio && h.apoyo)) && (
                <button onClick={confirmarApoyos} style={{ width: '100%', padding: '14px 20px', borderRadius: 10, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginTop: 12 }}>
                  💾 Confirmar apoyos rotatorios y actualizar contadores
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const tab = (activo) => ({
  padding: '9px 18px', borderRadius: 10,
  border: `2px solid ${activo ? '#7c2d12' : '#ddd'}`,
  backgroundColor: activo ? '#7c2d12' : 'white',
  color: activo ? 'white' : '#555',
  fontWeight: 700, fontSize: 13, cursor: 'pointer'
});

const cabeceraCelda = { padding: '10px 8px', backgroundColor: '#7c2d12', color: 'white', fontSize: 12, fontWeight: 700, textAlign: 'center', border: '1px solid #6b2a10' };
const celdaHora = { padding: '8px 10px', backgroundColor: '#fafafa', border: '1px solid #eee', textAlign: 'center', minWidth: 70, whiteSpace: 'nowrap' };
const celda = { padding: '6px 8px', border: '1px solid #eee', verticalAlign: 'top', minWidth: 110 };
