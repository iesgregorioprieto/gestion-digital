'use client';
export const dynamic = 'force-dynamic';
// v3.0 - GESTIÓN COMPLETA CON CONTADOR Y APOYOS MANUALES

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { getSupabase } from '@/lib/supabase';
import { departamentoASector, SECTORES_FP, esSectorFP } from '@/lib/sectores';
import { getCursoActual } from '@/lib/curso';

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

// La lista viene de lib/sectores para que gestión y el módulo del
// profesorado usen exactamente la misma. La copia que había aquí se
// había quedado sin FOL, y por eso FOL contaba como guardia general.
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
  const [fecha, setFecha] = useState(hoyLocal());
  const [horaActiva, setHoraActiva] = useState('1');
  const [horariosClase, setHC] = useState([]);
  const [sectores, setSectores] = useState([]);
  const [horarioGuardias, setHG] = useState({});
  const [profesoresList, setProfsList] = useState([]);
  const [mapaProfesores, setMapaProf] = useState({});
  const [ausenciasDia, setAusDia] = useState([]);
  const [apoyosAsignados, setApAsig] = useState([]);
  const [contadorApoyos, setContApoyos] = useState({});
  const [apoyosPorProfesor, setApoyosPorProfesor] = useState({});
  const [cargando, setCargando] = useState(true);
  const [cargandoDia, setCargandoDia] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  // Evita que un doble clic cree dos apoyos para el mismo profesor y hora.
  // En una mañana de guardias, con prisa, el doble clic pasa.
  const [procesandoApoyo, setProcesandoApoyo] = useState(false);
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
        .eq('curso_academico',await getCursoActual())
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
      .select('id,nombre,apellidos,departamento,especialidad');
    const mapa = {};
    (profes || []).forEach(p => {
      mapa[claveAbreviatura(p.apellidos, p.nombre)] = `${p.apellidos}, ${p.nombre}`;
    });
    setMapaProf(mapa);
    setProfsList(profes || []);

    // Contador de apoyos por sector del curso
    const { data: apoyos } = await getSupabase()
      .from('apoyos_asignados')
      .select('sector_apoyo,profesor_id,estado')
      .eq('curso_academico', await getCursoActual());
    const cont = {};
    const contProf = {};
    (apoyos || []).forEach(a => {
      if (a.estado === 'confirmado' || a.estado === 'realizado') {
        cont[a.sector_apoyo] = (cont[a.sector_apoyo] || 0) + 1;
        if (a.profesor_id) contProf[a.profesor_id] = (contProf[a.profesor_id] || 0) + 1;
      }
    });
    setContApoyos(cont);
    setApoyosPorProfesor(contProf);

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
    setErrorCarga('');
    setAusDia([]);
    setApAsig([]);

    const diaSem = diaSemanaEs(f);
    if (diaSem === 'sabado' || diaSem === 'domingo') { setCargandoDia(false); return; }

    let aus = [], dlds = [];
    try {
      const r = await fetch(`/api/ausencias?cuadrante=${f}`).then(x => x.json());
      if (r.error) throw new Error(r.error);
      aus = r.ausencias || [];
    } catch(e) {
      // Antes este fallo se tragaba en silencio y el cuadrante salía
      // vacío como si no faltara nadie, que es lo peor que puede pasar
      // en una mañana de guardias.
      console.error('No se pudieron cargar las ausencias del día:', e);
      setErrorCarga('No se han podido cargar las ausencias: ' + (e.message || e));
    }
    try {
      const r = await fetch(`/api/dld?modo=cuadrante&fecha=${f}`).then(x => x.json());
      dlds = (r.solicitudes || []).map(d => {
        // Si el DLD ya trae 'horas' (formato nuevo) se usa tal cual.
        if (Array.isArray(d.horas) && d.horas.length > 0) return d;
        // Compatibilidad con DLD antiguos: reconstruir 'horas' desde los campos separados
        const reconstruidas = [];
        (Array.isArray(d.grupos_afectados) ? d.grupos_afectados : []).forEach(g => {
          const horasGrupo = Array.isArray(g.horas) ? g.horas : (g.hora ? [g.hora] : []);
          horasGrupo.forEach(h => {
            reconstruidas.push({
              hora: typeof h === 'object' ? h.hora : h,
              tipo: 'clase',
              grupo: g.grupo || null,
              materia: g.materia || null,
              aula: g.aula || null,
              instrucciones: g.instrucciones || (typeof h === 'object' ? h.instrucciones : null) || null,
            });
          });
        });
        (Array.isArray(d.guardias_horario) ? d.guardias_horario : []).forEach(g => {
          reconstruidas.push({
            hora: g.hora,
            tipo: 'guardia',
            grupo: g.tipo_guardia || null,
            materia: null,
            aula: null,
            instrucciones: null,
          });
        });
        return { ...d, horas: reconstruidas };
      });
    } catch(e) {
      // Si fallan los DLD, el cuadrante mostraría menos ausentes de los
      // que hay y se repartirían mal las guardias. Hay que avisar.
      console.error('No se pudieron cargar los DLD del día:', e);
      setErrorCarga('No se han podido cargar los permisos de libre disposición: ' + (e.message || e));
    }

    const todas = [
      ...aus.map(a => ({...a, tipo_falta:'ausencia'})),
      ...dlds.map(d => ({...d, tipo_falta:'dld'})),
    ];

    try {
      const r = await getSupabase()
        .from('apoyos_asignados')
        .select('*')
        .eq('fecha', f)
        .eq('curso_academico', await getCursoActual());
      setApAsig(r.data || []);
    } catch(e) {
      // Sin los apoyos ya asignados se podría asignar dos veces a la
      // misma persona sin darse cuenta.
      console.error('No se pudieron cargar los apoyos del día:', e);
      setErrorCarga('No se han podido cargar los apoyos ya asignados: ' + (e.message || e));
    }

    const resultado = [];
    for (const falta of todas) {
      const prof = profesoresList.find(p => p.id === falta.profesor_id);
      if (!prof) continue;
      const nombrePdf = `${prof.apellidos}, ${prof.nombre}`;
      // Derivar sector automáticamente del departamento (fallback: especialidad legacy)
      let sectorProf = departamentoASector(prof.departamento);
      if (sectorProf === 'GENERAL' && prof.especialidad && prof.especialidad !== 'ESO/BACHILLERATO' && prof.especialidad !== 'GENERAL') {
        sectorProf = prof.especialidad;
      }
      resultado.push({
        profesorId: falta.profesor_id,
        profesor: nombrePdf,
        nombrePdf,
        abrev: claveAbreviatura(prof.apellidos, prof.nombre),
        sector: sectorProf,
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
  function profesoresLibresParaApoyo(asignadosAbrev = new Set(), porSector = null, sectorSolicitante = null) {
    if (porSector === null) porSector = ausenciasPorSector();

    const ocupadosEnClase = new Set(
      horariosClase
        .filter(h => h.tipo === 'clase' && (h.dia||'').toLowerCase() === diaSem && normHora(h.hora_id) === horaActiva)
        .map(h => normAbrev(h.profesor_nombre_pdf))
    );
    const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));

    // Sectores que pueden prestar apoyo: los que no tienen ausencias
    // propias esa hora. Se incluyen TODOS, familias y generales.
    //
    // Antes solo entraban las familias profesionales, así que una guardia
    // de Automoción sin nadie libre en su familia se quedaba sin ninguna
    // sugerencia, aunque hubiera profesorado de guardia general
    // disponible. El apoyo es recíproco en los dos sentidos.
    const sectoresLibres = sectores.filter(s => !porSector[s.toUpperCase()]);

    const libres = [];
    for (const sector of sectoresLibres) {
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
            apoyosPrevios: profCompleto?.id ? (apoyosPorProfesor[profCompleto.id] || 0) : 0,
            apoyosSector: contadorApoyos[sector.toUpperCase()] || 0,
          });
        }
      });
    }
    // Orden acordado con jefatura de estudios:
    //   1º  la propia familia del profesor ausente
    //   2º  guardias generales
    //   3º  otras familias, por rotación
    //
    // Dentro de cada grupo manda la rotación: quien menos apoyos ha
    // prestado, después el sector con menos apoyos acumulados.
    // Orden de preferencia fijado por dirección (agosto 2026):
    //
    //   Si falta alguien de FP (p. ej. Hostelería):
    //     1º su propio departamento  2º otro departamento de FP  3º generales
    //
    //   Si falta alguien de guardias generales (p. ej. Matemáticas):
    //     1º su propio departamento  2º generales  3º departamentos de FP
    //
    // Es decir: primero los suyos, después los de su mismo mundo, y
    // en último lugar el otro bloque.
    const sectorAusente = (sectorSolicitante || '').toUpperCase();
    const ausenteEsFP = esSectorFP(sectorAusente);
    const prioridadDe = p => {
      if (sectorAusente && p.sectorOriginal === sectorAusente) return 0;
      const candidatoEsFP = esSectorFP(p.sectorOriginal);
      if (ausenteEsFP) return candidatoEsFP ? 1 : 2;
      return candidatoEsFP ? 2 : 1;
    };

    libres.sort((a, b) => {
      const pa = prioridadDe(a), pb = prioridadDe(b);
      if (pa !== pb) return pa - pb;
      if (a.apoyosPrevios !== b.apoyosPrevios) return a.apoyosPrevios - b.apoyosPrevios;
      if (a.apoyosSector !== b.apoyosSector) return a.apoyosSector - b.apoyosSector;
      return a.nombre.localeCompare(b.nombre);
    });
    return libres;
  }

  // Auto-asignación para esta hora
  function asignacionAutomatica() {
    const asignaciones = [];
    const porSector = ausenciasPorSector();
    const asignadosAbrev = new Set();
    
    // Set con las abreviaturas de los profesores ausentes esta hora
    // (para no poder asignarles cubrir a otros - ellos también faltan)
    const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));

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
            // Excluir: ya asignado a otra cosa, o él mismo está ausente
            if (asignadosAbrev.has(key) || ausentesAbrev.has(key)) continue;
            cubre = { nombre: mapaProfesores[key] || p, abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
            asignadosAbrev.add(key);
            break;
          }

          if (!cubre) {
            const libres = profesoresLibresParaApoyo(asignadosAbrev, porSector, sectorSup);
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
        curso_academico: await getCursoActual(),
      });
    }

    if (apoyosNuevos.length > 0) {
      const _rm = await fetch('/api/apoyos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'asignar', lista: apoyosNuevos }),
      });
      const data = _rm.ok ? (await _rm.json()).apoyos : null;
      if (data) {
        setApAsig(prev => [...prev, ...data]);
        // Push a cada profesor asignado
        const HORAS_LABEL = { '1': '1ª (8:30–9:25)', '2': '2ª (9:25–10:20)', '3': '3ª (10:20–11:15)', 'recreo': 'Recreo (11:15–11:45)', '4': '4ª (11:45–12:40)', '5': '5ª (12:40–13:35)', '6': '6ª (13:35–14:30)' };
        for (const ap of data) {
          if (!ap.profesor_id) continue;
          try {
            await fetch('/api/push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                accion: 'enviar',
                profesor_id: ap.profesor_id,
                titulo: '🛡️ Apoyo de guardia asignado',
                cuerpo: `Tienes un apoyo el ${fecha} a las ${HORAS_LABEL[horaActiva] || horaActiva}${ap.grupo ? ' — ' + ap.grupo : ''}`,
                url: '/guardias',
              }),
            });
          } catch(e) { console.error('Push apoyo automático:', e); }
        }
      }
    }
  }

  // Activar apoyo (jefe pulsa botón cuando no era obligatorio)
  async function activarApoyoUrgente(asig, profesorSeleccionado) {
    if (procesandoApoyo) return;   // ya hay uno en marcha
    setProcesandoApoyo(true);
    try {
    const _ru = await fetch('/api/apoyos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'asignar',
        datos: {
          fecha,
          hora: horaActiva,
          sector_apoyo: profesorSeleccionado.sectorOriginal,
          sector_destino: asig.ausencia.sector.toUpperCase(),
          profesor_id: profesorSeleccionado.profesorId,
          grupo: asig.clase.grupo || null,
          aula: asig.clase.aula || null,
          materia: asig.clase.materia || null,
          tarea: asig.clase.instrucciones || null,
          estado: 'confirmado', // urgente: cuenta desde el momento de asignarlo
          tipo_apoyo: 'urgente',
          curso_academico: await getCursoActual(),
        },
      }),
    });
    const data = _ru.ok ? (await _ru.json()).apoyos : null;
    if (!_ru.ok) { alert('No se pudo asignar el apoyo'); return; }
    if (data) {
      setApAsig(prev => [...prev, ...data]);
      // Actualizar contadores locales para que la lista se reordene
      setContApoyos(prev => ({
        ...prev,
        [profesorSeleccionado.sectorOriginal]: (prev[profesorSeleccionado.sectorOriginal] || 0) + 1
      }));
      if (profesorSeleccionado.profesorId) {
        setApoyosPorProfesor(prev => ({
          ...prev,
          [profesorSeleccionado.profesorId]: (prev[profesorSeleccionado.profesorId] || 0) + 1
        }));
      }
    }
    // Email al profesor avisando de la guardia asignada
    if (data && data[0] && profesorSeleccionado.profesorId) {
      try {
        const pRows = await getSupabase().from('profesores').select('nombre,apellidos,email').eq('id', profesorSeleccionado.profesorId);
        const prof = (pRows.data || [])[0];
        if (prof?.email) {
          const HORAS_LABEL = { '1': '1ª (8:30–9:25)', '2': '2ª (9:25–10:20)', '3': '3ª (10:20–11:15)', 'recreo': 'Recreo (11:15–11:45)', '4': '4ª (11:45–12:40)', '5': '5ª (12:40–13:35)', '6': '6ª (13:35–14:30)' };
          await fetch('/api/enviar-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'guardia_asignada', datos: {
              nombre: prof.nombre + ' ' + prof.apellidos,
              email: prof.email,
              fecha,
              hora: HORAS_LABEL[horaActiva] || horaActiva,
              grupo: data[0].grupo || null,
              aula: data[0].aula || null,
            }})
          });
        }
      } catch(e) { console.error('Email guardia asignada:', e); }
      // Push al profesor
      try {
        const HORAS_LABEL = { '1': '1ª (8:30–9:25)', '2': '2ª (9:25–10:20)', '3': '3ª (10:20–11:15)', 'recreo': 'Recreo (11:15–11:45)', '4': '4ª (11:45–12:40)', '5': '5ª (12:40–13:35)', '6': '6ª (13:35–14:30)' };
        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'enviar',
            profesor_id: profesorSeleccionado.profesorId,
            titulo: '🛡️ Apoyo de guardia asignado',
            cuerpo: `Tienes un apoyo el ${fecha} a las ${HORAS_LABEL[horaActiva] || horaActiva}${data[0]?.grupo ? ' — ' + data[0].grupo : ''}`,
            url: '/guardias',
          }),
        });
      } catch(e) { console.error('Push guardia urgente:', e); }
    }
    setModalActivar(null);
    } finally {
      setProcesandoApoyo(false);   // se suelta pase lo que pase
    }
  }

  // Cambiar profesor de un apoyo ya registrado
  async function cambiarProfesor(apoyoId, nuevoProfesor) {
    const _rc = await fetch('/api/apoyos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'cambiar',
        id: apoyoId,
        datos: { profesor_id: nuevoProfesor.profesorId, sector_apoyo: nuevoProfesor.sectorOriginal },
      }),
    });
    if (!_rc.ok) { alert('No se pudo cambiar el apoyo'); return; }
    const r = await getSupabase().from('apoyos_asignados').select('*').eq('fecha', fecha).eq('curso_academico',await getCursoActual());
    setApAsig(r.data || []);
    setModalActivar(null);
  }

  // Eliminar apoyo urgente activado por error
  async function desactivarApoyo(apoyoId) {
    if (procesandoApoyo) return;
    if (!confirm('¿Desactivar este apoyo? El profesor dejará de estar asignado y no contará en la rotación.')) return;
    setProcesandoApoyo(true);
    try {
    const apoyo = apoyosAsignados.find(a => a.id === apoyoId);
    const _rd = await fetch('/api/apoyos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'desactivar', id: apoyoId }),
    });
    if (!_rd.ok) { alert('No se pudo desactivar el apoyo'); return; }
    setApAsig(prev => prev.filter(a => a.id !== apoyoId));
    // Decrementar contador local si era confirmado o realizado
    if (apoyo && (apoyo.estado === 'confirmado' || apoyo.estado === 'realizado')) {
      if (apoyo.profesor_id) {
        setApoyosPorProfesor(prev => ({
          ...prev,
          [apoyo.profesor_id]: Math.max(0, (prev[apoyo.profesor_id] || 0) - 1)
        }));
      }
      setContApoyos(prev => ({
        ...prev,
        [apoyo.sector_apoyo]: Math.max(0, (prev[apoyo.sector_apoyo] || 0) - 1)
      }));
    }
    } finally {
      setProcesandoApoyo(false);
    }
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

      {/* CONTADOR ROTATORIO DE APOYOS DEL CURSO */}
      <details open style={{ backgroundColor:'#f3f4f6', borderBottom:'1px solid #e5e7eb' }}>
        <summary style={{ padding:'12px 16px', cursor:'pointer', fontSize:11, fontWeight:800, color:'#555', textTransform:'uppercase', letterSpacing:0.5, userSelect:'none' }}>
          🔄 Rotación de apoyos al cuadrante general — curso 2025/26
        </summary>
        <div style={{ padding:'0 16px 14px' }}>
          <div style={{ fontSize:11, color:'#6b7280', marginBottom:10 }}>
            Ordenados de menos a más apoyos prestados. El primero de la lista es el siguiente al que le toca.
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {SECTORES_FP
              .map(s => ({ sector: s, cnt: contadorApoyos[s] || 0 }))
              .sort((a, b) => a.cnt - b.cnt || a.sector.localeCompare(b.sector))
              .map((item, i, arr) => {
                const esSiguiente = i === 0 || item.cnt === arr[0].cnt;
                return (
                  <span key={item.sector} style={{
                    padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:700,
                    backgroundColor: esSiguiente ? '#dcfce7' : 'white',
                    color: esSiguiente ? verde : '#64748b',
                    border:'1.5px solid ' + (esSiguiente ? verde : '#d1d5db'),
                    display:'inline-flex', alignItems:'center', gap:5,
                  }}>
                    {esSiguiente && <span title="Le toca antes">⭐</span>}
                    {emojiSector(item.sector)} {item.sector}
                    <strong style={{
                      backgroundColor: esSiguiente ? verde : '#e5e7eb',
                      color: esSiguiente ? 'white' : '#475569',
                      borderRadius:10, padding:'1px 7px', fontSize:10,
                    }}>{item.cnt}</strong>
                  </span>
                );
              })}
          </div>
          {(() => {
            const total = SECTORES_FP.reduce((s, sec) => s + (contadorApoyos[sec] || 0), 0);
            // Desglose por profesor: quién ha apoyado y cuántas veces
            const porProfesor = Object.entries(apoyosPorProfesor)
              .map(([id, n]) => {
                const p = profesoresList.find(x => x.id === id);
                return p ? { nombre: `${p.apellidos}, ${p.nombre}`, n } : null;
              })
              .filter(Boolean)
              .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));

            return (
              <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid #e5e7eb' }}>
                <div style={{ fontSize:11, color:'#6b7280', marginBottom: porProfesor.length ? 8 : 0 }}>
                  Total de apoyos prestados al cuadrante general este curso: <strong style={{ color:azul }}>{total}</strong>
                </div>
                {porProfesor.length > 0 && (
                  <details>
                    <summary style={{ fontSize:11, color:'#64748b', cursor:'pointer', fontWeight:700, userSelect:'none' }}>
                      Ver desglose por profesor ({porProfesor.length})
                    </summary>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:8 }}>
                      {porProfesor.map((p, i) => (
                        <span key={i} style={{
                          padding:'3px 9px', borderRadius:20, fontSize:10, fontWeight:600,
                          backgroundColor:'white', color:'#475569', border:'1px solid #d1d5db',
                        }}>
                          {p.nombre} <strong style={{ color:azul }}>{p.n}</strong>
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      </details>

      {/* AVISO GLOBAL: GUARDIAS PERDIDAS HOY */}
      {(() => {
        const perdidas = [];
        ausenciasDia.forEach(a => {
          (a.horas || []).forEach(h => {
            if (h.tipo === 'guardia') {
              perdidas.push({ profesor: a.profesor, hora: h.hora, sector: a.sector, tipo: a.tipo });
            }
          });
        });
        if (perdidas.length === 0) return null;
        return (
          <div style={{ padding:'12px 16px', backgroundColor:'#fef2f2', borderBottom:'2px solid #fca5a5' }}>
            <div style={{ fontSize:13, fontWeight:800, color:rojo, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
              🛡️ Guardias sin cubrir hoy ({perdidas.length})
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
              {perdidas.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    const idH = HORAS.find(h => horaCoincide(p.hora, h.id))?.id;
                    if (idH) setHoraActiva(idH);
                  }}
                  style={{
                    padding:'5px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                    backgroundColor:'white', color:'#7f1d1d', border:'1.5px solid #fca5a5', cursor:'pointer',
                  }}
                  title="Ir a esa hora"
                >
                  {p.tipo === 'dld' ? '📄' : '🏥'} {p.profesor.split(',')[0]} · {p.hora} · {p.sector}
                </button>
              ))}
            </div>
            <div style={{ fontSize:11, color:'#991b1b', marginTop:6, fontStyle:'italic' }}>
              Pulsa cualquiera para ir a esa hora y asignar un apoyo de la rotación.
            </div>
          </div>
        );
      })()}

      {/* NAV FECHA */}
      <div style={{ padding:'14px 16px', backgroundColor:'white', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => setFecha(sumarDias(fecha, -1))} style={btnNav}>←</button>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:azul, textTransform:'capitalize' }}>{fechaCorta(fecha)}</div>
          <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={{ padding:'2px 6px', borderRadius:6, border:'1px solid #ddd', fontSize:11, marginTop:4 }} />
        </div>
        <button onClick={() => setFecha(sumarDias(fecha, 1))} style={btnNav}>→</button>
        <button onClick={() => setFecha(hoyLocal())} style={{ ...btnNav, backgroundColor:azul, color:'white', border:'none' }}>Hoy</button>
      </div>

      {/* ACCESO RÁPIDO: registrar ausencia que falta */}
      <div style={{ padding:'10px 16px', backgroundColor:'#f8fafc', borderBottom:'1px solid #e5e7eb', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <span style={{ fontSize:12, color:'#64748b' }}>
          ¿Falta alguien que no aparece aquí?
        </span>
        <a
          href="/gestion/ausencias"
          style={{
            padding:'6px 14px', borderRadius:7, fontSize:12, fontWeight:700,
            backgroundColor:'white', color:azul, border:'1.5px solid ' + azul,
            textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6,
          }}
        >
          🏥 Registrar ausencia
        </a>
        <span style={{ fontSize:11, color:'#94a3b8' }}>
          El profesor podrá luego añadir tareas y justificarla desde su panel.
        </span>
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
          errorCarga ? (
            <div style={{
              backgroundColor:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:12,
              padding:20, textAlign:'center', color:'#991b1b', fontSize:14,
            }}>
              ⚠️ <strong>No se han podido cargar las ausencias.</strong>
              <div style={{ fontSize:12, marginTop:6, color:'#7f1d1d' }}>{errorCarga}</div>
              <div style={{ fontSize:12, marginTop:6 }}>
                El cuadrante puede estar incompleto. Avisa antes de repartir guardias.
              </div>
            </div>
          ) : (
          <div style={{
            backgroundColor:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12,
            padding:20, textAlign:'center', color:verde, fontSize:14,
          }}>
            ✅ No hay profesores ausentes esta hora
          </div>
          )
        ) : (
          <>
            {(() => {
              const todasAsig = asignacionAutomatica();
              const totalSinCubrir = todasAsig.filter(a => !a.cubre).length;
              const totalClases = todasAsig.length;
              const cubiertasPorApoyo = todasAsig.filter(a => a.cubre?.tipo === 'apoyo_obligatorio').length;
              
              if (totalSinCubrir > 0) {
                return (
                  <div style={{ fontWeight:800, fontSize:14, color:rojo, marginBottom:12 }}>
                    🚨 {totalSinCubrir} CLASE{totalSinCubrir !== 1 ? 'S' : ''} SIN CUBRIR — {ausentesEstaHora().length} ausente{ausentesEstaHora().length !== 1 ? 's' : ''}
                  </div>
                );
              } else if (cubiertasPorApoyo > 0) {
                return (
                  <div style={{ fontWeight:800, fontSize:14, color:'#78350f', marginBottom:12 }}>
                    ⚠️ TODAS CUBIERTAS ({cubiertasPorApoyo} con apoyo externo) — {ausentesEstaHora().length} ausente{ausentesEstaHora().length !== 1 ? 's' : ''}
                  </div>
                );
              } else {
                return (
                  <div style={{ fontWeight:800, fontSize:14, color:verde, marginBottom:12 }}>
                    ✅ TODAS LAS CLASES CUBIERTAS — {ausentesEstaHora().length} ausente{ausentesEstaHora().length !== 1 ? 's' : ''}
                  </div>
                );
              }
            })()}

            {Object.entries(ausenciasPorSector()).map(([sectorSup, ausentes]) => {
              const asignaciones = asignacionAutomatica().filter(a => a.ausencia.sector.toUpperCase() === sectorSup);
              
              // Estado global del sector
              const totalClases = asignaciones.length;
              const cubiertasPorGuardia = asignaciones.filter(a => a.cubre?.tipo === 'guardia_sector').length;
              const cubiertasPorApoyo = asignaciones.filter(a => a.cubre?.tipo === 'apoyo_obligatorio').length;
              const sinCubrir = asignaciones.filter(a => !a.cubre).length;
              
              // Detectar si algún ausente TENÍA guardia esa hora (pérdida de capacidad del sector)
              const perdidaGuardia = ausentes.some(a => 
                a.horas.some(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'guardia')
              );
              
              // Colores: verde si todo cubierto por guardia, ámbar si hay apoyo o guardia perdida, rojo si falta alguna
              let bgCabecera, borderCabecera, colorTexto, colorSub;
              if (sinCubrir > 0) {
                // Hay clases sin cubrir → ROJO real
                bgCabecera = '#fef2f2';
                borderCabecera = '#fca5a5';
                colorTexto = rojo;
                colorSub = '#7f1d1d';
              } else if (cubiertasPorApoyo > 0 || perdidaGuardia) {
                // Cubiertas pero con apoyo, o guardia perdida → ÁMBAR
                bgCabecera = '#fffbeb';
                borderCabecera = '#fbbf24';
                colorTexto = '#78350f';
                colorSub = '#92400e';
              } else {
                // Todo cubierto por guardias del sector → VERDE
                bgCabecera = '#f0fdf4';
                borderCabecera = '#86efac';
                colorTexto = verde;
                colorSub = '#166534';
              }
              
              // Texto resumen
              let resumen;
              if (totalClases === 0) {
                if (perdidaGuardia) {
                  resumen = `${ausentes.length} ausente${ausentes.length !== 1 ? 's' : ''} · tenía(n) guardia`;
                } else {
                  resumen = `${ausentes.length} ausente${ausentes.length !== 1 ? 's' : ''} · sin clases esta hora`;
                }
              } else if (sinCubrir > 0) {
                resumen = `${sinCubrir} sin cubrir · ${cubiertasPorGuardia + cubiertasPorApoyo}/${totalClases} cubiertas`;
              } else if (cubiertasPorApoyo > 0) {
                resumen = `✓ Cubiertas ${totalClases}/${totalClases} (${cubiertasPorApoyo} con apoyo externo)`;
              } else {
                resumen = `✓ Cubiertas ${totalClases}/${totalClases}`;
              }
              
              return (
                <div key={sectorSup} style={{ marginBottom:16 }}>
                  <div style={{
                    backgroundColor: bgCabecera, border:'1.5px solid ' + borderCabecera, borderRadius:'10px 10px 0 0',
                    padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                  }}>
                    <span style={{ fontSize:16 }}>{emojiSector(sectorSup)}</span>
                    <span style={{ fontWeight:800, fontSize:13, color: colorTexto }}>{sectorSup}</span>
                    <span style={{ fontSize:11, color: colorSub, marginLeft:'auto' }}>
                      {resumen}
                    </span>
                  </div>

                  <div style={{ backgroundColor:'white', border:'1.5px solid ' + borderCabecera, borderTop:'none', borderRadius:'0 0 10px 10px', padding:12 }}>
                    {/* AVISO DE GUARDIA PERDIDA — siempre visible, tenga o no clases huérfanas */}
                    {ausentes.some(a => a.horas.some(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'guardia')) && asignaciones.length > 0 && (
                      <div style={{ backgroundColor:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:8, padding:'10px 12px', marginBottom:12 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:rojo, marginBottom:4 }}>
                          ⚠️ Además, este sector pierde profesorado de guardia esta hora
                        </div>
                        {ausentes.filter(a => a.horas.some(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'guardia')).map((a, i) => (
                          <div key={i} style={{ fontSize:12, color:'#7f1d1d' }}>
                            · <strong>{a.profesor}</strong> tenía guardia en {sectorSup}
                          </div>
                        ))}
                        <div style={{ fontSize:11, color:'#991b1b', marginTop:6, fontStyle:'italic' }}>
                          Revisa si hace falta asignar apoyo adicional para cubrir esa guardia.
                        </div>
                      </div>
                    )}

                    {asignaciones.length === 0 ? (
                      <>
                        {/* Mostrar profesores ausentes con guardia (aunque no dejen clases huérfanas) */}
                        {ausentes.map((aus, i) => {
                          const horasAusente = aus.horas.filter(h => horaCoincide(h.hora, horaActiva));
                          const teniaGuardia = horasAusente.some(h => h.tipo === 'guardia');
                          const teniaComp = horasAusente.some(h => h.tipo === 'complementaria');
                          const grupoGuardia = horasAusente.find(h => h.tipo === 'guardia')?.grupo;
                          
                          // Existe ya un apoyo asignado para este caso?
                          const apoyoParaGuardia = apoyosAsignados.find(ap =>
                            ap.hora === horaActiva &&
                            ap.sector_destino === sectorSup &&
                            ap.materia === 'GUARDIA_SUSTITUTO'
                          );
                          const nombreApoyo = apoyoParaGuardia 
                            ? (() => {
                                const pf = profesoresList.find(p => p.id === apoyoParaGuardia.profesor_id);
                                return pf ? `${pf.apellidos}, ${pf.nombre}` : 'Profesor';
                              })()
                            : null;

                          return (
                            <div key={i} style={{
                              padding:'10px 12px', marginBottom:8,
                              backgroundColor: teniaGuardia ? '#fef2f2' : '#fafafa',
                              borderRadius:8, border: teniaGuardia ? '1.5px solid #fca5a5' : '1px solid #e5e7eb',
                            }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                                <span style={{ fontSize:13, fontWeight:700 }}>{aus.profesor}</span>
                                {aus.tipo === 'dld' && (
                                  <span style={{ fontSize:10, padding:'2px 6px', backgroundColor:'#dbeafe', color:'#1e40af', borderRadius:8, fontWeight:700 }}>DLD</span>
                                )}
                              </div>
                              
                              {teniaGuardia && (
                                <>
                                  <div style={{ fontSize:12, color:rojo, fontWeight:700, marginTop:4, padding:'8px 10px', backgroundColor:'#fee2e2', borderRadius:6 }}>
                                    ⚠️ Faltaba y tenía <strong>GUARDIA en {sectorSup}</strong>{grupoGuardia ? ` (${grupoGuardia})` : ''}
                                    <div style={{ fontSize:11, fontWeight:400, marginTop:4 }}>
                                      El sector pierde 1 profesor de guardia. Puede necesitar un sustituto si otros profesores del sector también faltan.
                                    </div>
                                  </div>
                                  
                                  {nombreApoyo ? (
                                    <div style={{
                                      marginTop:6, padding:'8px 10px', borderRadius:6, backgroundColor:'#dcfce7',
                                      border:'1.5px solid ' + verde, display:'flex', alignItems:'center', gap:8, fontSize:12,
                                    }}>
                                      <span style={{ fontWeight:800, color:verde }}>✅ SUSTITUTO ASIGNADO:</span>
                                      <span style={{ fontWeight:800, color:verde }}>{nombreApoyo}</span>
                                      <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                        {apoyoParaGuardia.sector_apoyo} · contado
                                      </span>
                                      <button
                                        onClick={() => desactivarApoyo(apoyoParaGuardia.id)}
                                        disabled={procesandoApoyo}
                                        style={{ padding:'4px 8px', borderRadius:6, border:'none', backgroundColor:'#6b7280', color:'white', fontSize:10, fontWeight:700, cursor:'pointer' }}
                                      >✕</button>
                                    </div>
                                  ) : (
                                    (() => {
                                      // Sugerencias para sustituir esta guardia
                                      const sugerencias = profesoresLibresParaApoyo(new Set(), ausenciasPorSector(), sectorSup);
                                      if (sugerencias.length === 0) return null;
                                      return (
                                        <details open style={{ marginTop:6, backgroundColor:'#fffbeb', borderRadius:8, border:'1px dashed #fbbf24' }}>
                                          <summary style={{ cursor:'pointer', padding:'8px 12px', fontSize:11, fontWeight:700, color:'#78350f', userSelect:'none', display:'flex', alignItems:'center', gap:6 }}>
                                            💡 Asignar sustituto de guardia ({sugerencias.length} disponibles)
                                            <span style={{ fontSize:10, fontWeight:400, opacity:0.75, marginLeft:'auto' }}>pulsa para ver</span>
                                          </summary>
                                          <div style={{ padding:'4px 12px 10px 12px' }}>
                                            <div style={{ fontSize:10, color:'#92400e', marginBottom:8 }}>
                                              Ordenados por menos apoyos previos. Al activar contará en el contador.
                                            </div>
                                            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                                              {sugerencias.slice(0, 6).map((p, si) => (
                                                <div key={si} style={{
                                                  display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:6,
                                                  backgroundColor: si === 0 ? '#fef3c7' : 'white',
                                                  border: si === 0 ? '1.5px solid #f59e0b' : '1px solid #fde68a',
                                                }}>
                                                  <span style={{ fontSize:12, fontWeight:800 }}>
                                                    {si === 0 ? '🥇' : si === 1 ? '🥈' : si === 2 ? '🥉' : `#${si+1}`}
                                                  </span>
                                                  <div style={{ flex:1 }}>
                                                    <div style={{ fontSize:11, fontWeight:700, color:'#78350f' }}>{p.nombre}</div>
                                                    <div style={{ fontSize:10, color:'#92400e' }}>{p.sectorOriginal} · {p.apoyosPrevios} apoyo{p.apoyosPrevios !== 1 ? 's' : ''}</div>
                                                  </div>
                                                  <button
                                                    disabled={procesandoApoyo}
                                                    onClick={() => activarApoyoUrgente({
                                                      ausencia: aus,
                                                      clase: { grupo: grupoGuardia || 'GUARDIA', aula: null, materia: 'GUARDIA_SUSTITUTO', instrucciones: 'Sustituir en la guardia de ' + sectorSup },
                                                    }, p)}
                                                    style={{
                                                      padding:'4px 10px', borderRadius:6, border:'none',
                                                      backgroundColor: si === 0 ? '#059669' : '#f59e0b',
                                                      color:'white', fontSize:10, fontWeight:700, cursor:'pointer',
                                                    }}
                                                  >✅ Activar</button>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </details>
                                      );
                                    })()
                                  )}
                                </>
                              )}
                              {teniaComp && !teniaGuardia && (
                                <div style={{ fontSize:12, color:'#666' }}>
                                  Complementaria — sin clase que cubrir
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </>
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
                        ? profesoresLibresParaApoyo(new Set([normAbrev(cubre.abrev)]), ausenciasPorSector(), asig.ausencia.sector?.toUpperCase())
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
                              marginBottom: apoyoUrgenteExistente ? 6 : 0,
                            }}>
                              <span style={{ fontWeight:700, color:verde }}>✅ CUBRE:</span>
                              <span style={{ fontWeight:800 }}>{cubre.nombre}</span>
                              <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>guardia {cubre.sectorOriginal}</span>
                            </div>
                          )}

                          {/* APOYO URGENTE YA ACTIVADO — TAMBIÉN EN VERDE (como cover activo) */}
                          {apoyoUrgenteExistente && (() => {
                            const prof = profesoresList.find(p => p.id === apoyoUrgenteExistente.profesor_id);
                            const nombreAp = prof ? `${prof.apellidos}, ${prof.nombre}` : 'Profesor';
                            const confirmado = apoyoUrgenteExistente.estado === 'confirmado' || apoyoUrgenteExistente.estado === 'realizado';
                            return (
                              <div style={{
                                padding:'8px 10px', borderRadius:6,
                                backgroundColor: '#dcfce7',
                                border:'1.5px solid ' + verde,
                                display:'flex', alignItems:'center', gap:8, fontSize:12,
                              }}>
                                <span style={{ fontWeight:800, color:verde }}>
                                  {confirmado ? '✅' : '⏳'} APOYO ACTIVO:
                                </span>
                                <span style={{ fontWeight:800, color:verde }}>{nombreAp}</span>
                                <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                  {apoyoUrgenteExistente.sector_apoyo} · contado
                                </span>
                                <button
                                  onClick={() => desactivarApoyo(apoyoUrgenteExistente.id)}
                                        disabled={procesandoApoyo}
                                  style={{
                                    padding:'4px 8px', borderRadius:6, border:'none',
                                    backgroundColor:'#6b7280', color:'white', fontSize:10, fontWeight:700, cursor:'pointer',
                                  }}
                                  title="Desactivar y restar del contador"
                                >✕</button>
                              </div>
                            );
                          })()}

                          {/* APOYO OBLIGATORIO (NARANJA) */}
                          {cubre?.tipo === 'apoyo_obligatorio' && (
                            <div style={{
                              padding:'8px 10px', borderRadius:6, backgroundColor:'#fef3c7',
                              border:'2px solid #f59e0b', display:'flex', alignItems:'center', gap:8, fontSize:12, flexWrap:'wrap',
                            }}>
                              <span style={{ fontWeight:800, color:'#78350f' }}>🚨 APOYO OBLIGATORIO:</span>
                              <span style={{ fontWeight:800, color:'#78350f' }}>{cubre.nombre}</span>
                              <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                {cubre.sectorOriginal} ({cubre.apoyosPrevios} apoyos)
                              </span>
                              {cubre.alternativas && cubre.alternativas.length > 0 && (
                                <button
                                  onClick={() => {
                                    // Buscar el apoyo registrado o el más reciente que coincida
                                    let apoyoParaCambiar = apoyoReg;
                                    if (!apoyoParaCambiar) {
                                      apoyoParaCambiar = apoyosAsignados.find(ap =>
                                        ap.hora === horaActiva &&
                                        ap.grupo === (asig.clase.grupo || null) &&
                                        ap.sector_destino === asig.ausencia.sector.toUpperCase()
                                      );
                                    }
                                    if (!apoyoParaCambiar) {
                                      alert('El apoyo todavía se está registrando. Espera 2 segundos y vuelve a intentar.');
                                      return;
                                    }
                                    setModalActivar({
                                      modo: 'cambiar',
                                      apoyoId: apoyoParaCambiar.id,
                                      asig,
                                      sugeridos: cubre.alternativas,
                                      actual: cubre,
                                    });
                                  }}
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

                          {/* PANEL DE SUGERENCIAS BACKUP (colapsable) */}
                          {sectorEstaCubierto && sugerenciasBackup.length > 0 && !apoyoUrgenteExistente && (
                            <details style={{ marginTop:10, backgroundColor:'#fffbeb', borderRadius:8, border:'1px dashed #fbbf24' }}>
                              <summary style={{
                                cursor:'pointer', padding:'8px 12px', fontSize:11, fontWeight:700,
                                color:'#78350f', display:'flex', alignItems:'center', gap:6,
                                userSelect:'none',
                              }}>
                                💡 Ver sugerencias de apoyo extra ({sugerenciasBackup.length})
                                <span style={{ fontSize:10, fontWeight:400, opacity:0.75, marginLeft:'auto' }}>
                                  rotación · pulsa para ver
                                </span>
                              </summary>
                              <div style={{ padding:'4px 12px 10px 12px' }}>
                                <div style={{ fontSize:10, color:'#92400e', marginBottom:8 }}>
                                  Si activas alguno subirá arriba en verde y contará en el contador.
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
                                        disabled={procesandoApoyo}
                                        style={{
                                          padding:'4px 10px', borderRadius:6, border:'none',
                                          backgroundColor: i === 0 ? '#059669' : '#f59e0b',
                                          color:'white', fontSize:10, fontWeight:700, cursor:'pointer',
                                        }}
                                      >✅ Activar</button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* PROFESORES DE GUARDIA ESTA HORA (colapsable, con nombres completos) */}
            <details style={{ marginTop:20, backgroundColor:'white', border:'1px solid #e5e7eb', borderRadius:10 }}>
              <summary style={{
                cursor:'pointer', padding:'12px 16px', fontSize:13, fontWeight:700, color:'#555',
                display:'flex', alignItems:'center', gap:8, userSelect:'none',
              }}>
                📊 Profesores de guardia esta hora (todos los sectores)
              </summary>
              <div style={{ padding:'0 16px 16px' }}>
                {sectores.filter(s => guardiasDeSector(s).length > 0).map(s => {
                  const guardias = guardiasDeSector(s);
                  const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));
                  return (
                    <div key={s} style={{ padding:'10px 0', borderTop:'1px solid #f3f4f6' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:azul, marginBottom:6 }}>
                        {emojiSector(s)} {s.toUpperCase()}
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                        {guardias.map((p, i) => {
                          const key = normAbrev(p);
                          const nombre = mapaProfesores[key] || p;
                          const estaAusente = ausentesAbrev.has(key);
                          return (
                            <span key={i} style={{
                              padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                              backgroundColor: estaAusente ? '#fee2e2' : '#f0fdf4',
                              color: estaAusente ? rojo : verde,
                              border:'1.5px solid ' + (estaAusente ? '#fca5a5' : '#bbf7d0'),
                              textDecoration: estaAusente ? 'line-through' : 'none',
                            }}>
                              {estaAusente && '🚫 '}{nombre}
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
