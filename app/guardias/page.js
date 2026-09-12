'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { consulta, consultaRpc } from '@/lib/consulta';
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

/**
 * La hora en la que estamos ahora mismo.
 *
 * Al abrir el módulo lo que interesa es la guardia de ESTE momento, no la
 * de primera hora. Entre franja y franja (y en el recreo) se devuelve la
 * que viene, que es donde hay que estar. Fuera del horario lectivo, la
 * primera, para poder preparar el día siguiente.
 */
function horaAhora(ahora = new Date()) {
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const aMin = t => {
    const [h, m] = t.split('–')[0].split(':').map(Number);
    return h * 60 + m;
  };
  const fin = t => {
    const [h, m] = t.split('–')[1].split(':').map(Number);
    return h * 60 + m;
  };
  for (const h of HORAS) {
    if (min >= aMin(h.horario) && min <= fin(h.horario)) return h.id;
  }
  const siguiente = HORAS.find(h => min < aMin(h.horario));
  return siguiente ? siguiente.id : '1';
}

function normHora(h) { return (h||'').toString().replace(/[aª]$/,'').toLowerCase(); }

/**
 * El grupo tal como viene del horario importado trae pegados el código
 * del módulo y el aula: "PBPR-2686687GM-1COC(5 E004 COC)". Al compañero
 * que va a cubrir eso no le dice nada. Lo que necesita es "GM-1COC,
 * aula E004".
 */
function limpiarGrupo(txt) {
  const s = String(txt || '').trim();
  if (!s || s.toLowerCase() === 'libre') return { grupo: '', aula: '' };
  const g = s.match(/((?:GM|GS|GB|BTO|ESO|FPPE)-\d[A-Z0-9.]*|CA-CFGS-[A-Z])/i);
  const a = s.match(/\(\s*\d+\s+([A-Za-z]?\d{1,4}[A-Za-z]?)\b/);
  return {
    grupo: g ? g[1].toUpperCase() : s.split('(')[0].trim(),
    aula: a ? a[1].toUpperCase() : '',
  };
}

// Etiqueta de la franja: "10:20–11:15".
function horaDe(horaId) {
  const h = HORAS.find(x => x.id === normHora(horaId));
  return h ? h.horario : '';
}

// ¿Se puede fichar ahora mismo esta guardia? Solo durante su franja.
function dentroDeFranja(horaId, fechaGuardia, ahora = new Date()) {
  const h = HORAS.find(x => x.id === normHora(horaId));
  if (!h || !fechaGuardia) return false;
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`;
  if (hoy !== fechaGuardia) return false;
  const min = ahora.getHours() * 60 + ahora.getMinutes();
  const aMin = t => { const [hh, mm] = t.split(':').map(Number); return hh * 60 + mm; };
  const [ini, fin] = h.horario.split('–');
  return min >= aMin(ini) && min <= aMin(fin);
}
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
  return sinTildes(`${ap}, ${nom}`).toLowerCase().replace(/\s/g, '');
}

// Quita tildes: Delphos y las fichas del profesorado no siempre las
// escriben igual, y por una tilde se dejaba de reconocer a la persona.
function sinTildes(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
// Clave laxa: tres letras del primer apellido e iniciales del nombre,
// ignorando el resto de apellidos. Red de seguridad cuando la ficha y el
// cuadrante no traen el mismo número de apellidos.
function claveLaxa(apellidos, nombre) {
  const raiz = (apellidos || '').trim().split(/\s+/)[0] || '';
  const nom = (nombre || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).join('');
  if (!raiz || !nom) return '';
  return sinTildes(`${raiz.slice(0, 3)}|${nom}`).toLowerCase();
}
function claveLaxaDeAbrev(abrev) {
  const [ap, nom] = (abrev || '').split(',');
  if (!ap || !nom) return '';
  const raiz = ap.trim().replace(/\..*$/, '').trim();
  return sinTildes(`${raiz.slice(0, 3)}|${nom.replace(/\./g, '').trim()}`).toLowerCase();
}
// Nombre completo del compañero a partir de la abreviatura del cuadrante.
// En la aplicación nunca se enseñan siglas: se muestra a la persona.
function nombreLargo(mapa, abrev) {
  if (!abrev) return '';
  const directo = mapa[sinTildes(abrev).toLowerCase().replace(/\s/g, '')];
  if (directo) return directo;
  const laxo = mapa['~' + claveLaxaDeAbrev(abrev)];
  return laxo || abrev;
}
// Nombre corto para las etiquetas apretadas del cuadrante: nombre y
// primer apellido. Se reconoce a la persona igual que con el nombre
// entero, pero cabe en una línea y no rompe la rejilla de horas.
function nombreCorto(mapa, abrev) {
  const largo = nombreLargo(mapa, abrev);
  if (!largo || !largo.includes(',')) return largo;
  const [apellidos, nombre] = largo.split(',');
  const primerApellido = apellidos.trim().split(/\s+/)[0] || '';
  const primerNombre = (nombre || '').trim().split(/\s+/)[0] || '';
  return `${primerNombre} ${primerApellido}`.trim();
}
function normAbrev(str) {
  return (str || '').toLowerCase().replace(/\s/g, '');
}

export default function Guardias() {
  const [cargando, setCargando]         = useState(true);
  const [fecha, setFecha]               = useState(hoyLocal());
  // Arranca en la hora en la que estás, no en la 1ª.
  const [horaActiva, setHoraActiva]     = useState(() => horaAhora());
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
  const [apoyosPorProfesor, setApoyosPorProfesor] = useState({});
  const [apoyosAsignados, setApAsig]    = useState([]);
  const [modalCambiar, setModalCambiar] = useState(null); // apoyo a cambiar
  const [fichandoId, setFichandoId]     = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [fichando, setFichando]         = useState(false);
  const [verAyuda, setVerAyuda]         = useState(false);

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
      const { data } = await consulta('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
        .eq('curso_academico',await getCursoActual())
        .range(offset, offset + limit - 1);
      if (!data || data.length === 0) break;
      horarios = horarios.concat(data);
      if (data.length < limit) break;
      offset += limit;
    }
    setHC(horarios);

    const { data: profes } = await consulta('profesores')
      .select('id,nombre,apellidos,departamento,especialidad');

    const mapa = {};
    (profes || []).forEach(p => {
      const clave = claveAbreviatura(p.apellidos, p.nombre);
      mapa[clave] = `${p.apellidos}, ${p.nombre}`;
      mapa['~' + claveLaxa(p.apellidos, p.nombre)] = `${p.apellidos}, ${p.nombre}`;
    });
    setMapaProf(mapa);
    setProfsList(profes || []);

    // Contador de apoyos por sector del curso (necesario para la rotación)
    const { data: apoyosCurso } = await consulta('apoyos_asignados')
      .select('sector_apoyo,profesor_id,estado')
      .eq('curso_academico', await getCursoActual());
    const contSector = {};
    const contProfesor = {};
    (apoyosCurso || []).forEach(a => {
      if (a.estado === 'confirmado' || a.estado === 'realizado') {
        contSector[a.sector_apoyo] = (contSector[a.sector_apoyo] || 0) + 1;
        if (a.profesor_id) contProfesor[a.profesor_id] = (contProfesor[a.profesor_id] || 0) + 1;
      }
    });
    setContApoyos(contSector);
    setApoyosPorProfesor(contProfesor);

    // Mi especialidad
    const yo = (profes||[]).find(p => p.id === id);
    setMiEsp(yo?.especialidad || '');

    // Contador de apoyos por sector
    const { data: apoyos } = await consulta('apoyos_asignados')
      .select('sector_apoyo,estado')
      .eq('curso_academico', await getCursoActual());
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
      const r = await fetch(`/api/ausencias?cuadrante=${f}`).then(x => x.json());
      aus = r.ausencias || [];
    } catch(e) { console.warn('Error ausencias:', e); }
    try {
      const r = await fetch(`/api/dld?modo=cuadrante&fecha=${f}`).then(x => x.json());
      dlds = (r.solicitudes || []).map(d => {
        if (Array.isArray(d.horas) && d.horas.length > 0) return d;
        // Compatibilidad con DLD antiguos sin campo 'horas'
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
            hora: g.hora, tipo: 'guardia', grupo: g.tipo_guardia || null,
            materia: null, aula: null, instrucciones: null,
          });
        });
        return { ...d, horas: reconstruidas };
      });
    } catch(e) { console.warn('Error dld:', e); }

    const todas = [
      ...aus.map(a => ({...a, tipo_falta:'ausencia'})),
      ...dlds.map(d => ({...d, tipo_falta:'dld'})),
    ];

    // Antes de leer los apoyos se pide al servidor que preasigne los
    // que falten. Así la propuesta le llega al profesorado aunque nadie
    // de jefatura haya abierto el cuadrante. Si falla, se sigue igual:
    // se verán los apoyos que ya hubiera.
    try {
      await fetch('/api/guardias/preasignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: f }),
      });
    } catch (e) {
      console.error('No se pudieron preasignar las guardias:', e);
    }

    // Cargar apoyos para esta fecha
    try {
      const r = await consulta('apoyos_asignados')
        .select('*')
        .eq('fecha', f)
        .eq('curso_academico', await getCursoActual());
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
        departamento: prof.departamento || "",
        tipo: falta.tipo_falta,
        horas: falta.horas || [],
      });
    }
    setAusDia(resultado);
    setCargandoDia(false);
  }

  const diaSem = diaSemanaEs(fecha);
  const esFinde = diaSem === 'sabado' || diaSem === 'domingo';
  // Nombre corto de un profesor por su identificador. Las guardias
  // guardan a quién cubre y quién la hace por id, que es lo fiable.
  const nombrePorId = id => {
    if (!id) return '';
    const p = (profesoresList || []).find(x => String(x.id) === String(id));
    return p ? `${p.nombre?.split(' ')[0] || ''} ${p.apellidos?.split(' ')[0] || ''}`.trim() : '';
  };

  /**
   * Cuántos grupos hay que cubrir a una hora.
   *
   * No se puede contar sobre ausenciasDia: las ausencias de varios días y
   * las bajas se guardan sin horas concretas (la tarea se deja por módulo,
   * no por hora), así que al preguntarles "¿faltas a 4ª?" contestan que no
   * y el contador se quedaba corto. Las guardias sí son fiables, porque el
   * servidor ya sacó las horas del horario de cada día.
   *
   * Se cuentan los profesores distintos a los que hay que cubrir, y se
   * suman las ausencias que aún no tengan guardia creada.
   */
  const gruposACubrir = horaId => {
    const ausentes = new Set();

    apoyosAsignados
      .filter(a => normHora(a.hora) === horaId)
      .forEach(a => ausentes.add(a.profesor_ausente_id || `apoyo:${a.id}`));

    ausenciasDia
      .filter(a => a.horas?.some(hh => horaCoincide(hh.hora, horaId)))
      .forEach(a => { if (!ausentes.has(a.profesorId)) ausentes.add(a.profesorId || `aus:${a.abrev}`); });

    return ausentes.size;
  };

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

    // Set con las abreviaturas de los profesores ausentes esta hora
    // (para no poder asignarles cubrir a otros - ellos también faltan)
    const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));

    // Trackear cuántas asignaciones lleva cada sector (para reparto interno)
    const usadosDelSector = {};

    for (const sectorSup of Object.keys(porSector)) {
      const sReal = sectorReal(sectorSup);
      const ausentes = porSector[sectorSup];
      const guardiasDisp = guardiasDeSector(sReal);

      for (const aus of ausentes) {
        const clasesHora = aus.horas.filter(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'clase');
        const guardiasHora = aus.horas.filter(h => horaCoincide(h.hora, horaActiva) && h.tipo === 'guardia');

        // Procesar clases huérfanas → necesitan sustituto con tarea
        for (const clase of clasesHora) {
          let cubre = null;
          for (const p of guardiasDisp) {
            const key = normAbrev(p);
            if (asignadosAbrev.has(key) || ausentesAbrev.has(key)) continue;
            cubre = { nombre: nombreCorto(mapaProfesores, p), abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
            asignadosAbrev.add(key);
            usadosDelSector[sectorSup] = (usadosDelSector[sectorSup] || 0) + 1;
            break;
          }
          if (!cubre) {
            const libres = profesoresLibresParaApoyo(asignadosAbrev, porSector, sectorSup);
            if (libres.length > 0) {
              const primero = libres[0];
              asignadosAbrev.add(normAbrev(primero.abrev));
              cubre = { ...primero, tipo: 'apoyo_cruzado', alternativas: libres.slice(1, 5) };
            }
          }
          asignaciones.push({ ausencia: aus, clase, tipoHora: 'clase', cubre });
        }

        // Procesar guardias huérfanas → asignar automáticamente al mejor candidato
        for (const guardia of guardiasHora) {
          // Mismo criterio que las clases: primero el propio sector, luego GENERAL, luego FP
          let cubre = null;
          for (const p of guardiasDisp) {
            const key = normAbrev(p);
            if (asignadosAbrev.has(key) || ausentesAbrev.has(key)) continue;
            cubre = { nombre: nombreCorto(mapaProfesores, p), abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
            asignadosAbrev.add(key);
            break;
          }
          if (!cubre) {
            const libres = profesoresLibresParaApoyo(asignadosAbrev, porSector, sectorSup);
            if (libres.length > 0) {
              const primero = libres[0];
              asignadosAbrev.add(normAbrev(primero.abrev));
              cubre = { ...primero, tipo: 'guardia_sector', alternativas: libres.slice(1, 5) };
            }
          }
          asignaciones.push({
            ausencia: aus,
            clase: { ...guardia, grupo: guardia.grupo || sectorSup },
            tipoHora: 'guardia',
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
  function profesoresLibresParaApoyo(asignadosAbrev = new Set(), porSector = null, sectorSolicitante = null) {
    if (porSector === null) porSector = ausenciasPorSector();

    const ocupadosEnClase = new Set(
      horariosClase
        .filter(h => h.tipo === 'clase' && (h.dia||'').toLowerCase() === diaSem && normHora(h.hora_id) === horaActiva)
        .map(h => normAbrev(h.profesor_nombre_pdf))
    );
    const ausentesAbrev = new Set(ausenciasDia.map(a => normAbrev(a.abrev || '')));

    // TODOS los sectores, incluidos los que tienen ausentes.
    // Un sector puede tener 1 ausente y 3 de guardia disponibles:
    // excluir el sector entero dejaba sin candidatos al propio GENERAL.
    const libres = [];
    for (const sector of sectores) {
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
            nombre: nombreCorto(mapaProfesores, p),
            profesorId: profCompleto?.id || null,
            apoyosPrevios: profCompleto?.id ? (apoyosPorProfesor[profCompleto.id] || 0) : 0,
            apoyosSector: contadorApoyos[sector.toUpperCase()] || 0,
          });
        }
      });
    }
    // Mismo orden que en gestión (dirección, agosto 2026):
    //   Falta alguien de FP:        1º su departamento  2º otro de FP   3º generales
    //   Falta alguien de generales: 1º su departamento  2º generales    3º FP
    // Dentro de cada escalón manda la rotación: quien menos apoyos lleva.
    const sectorAusente = (sectorSolicitante || '').toUpperCase();
    const ausenteEsFP = esSectorFP(sectorAusente);
    const prioridadDe = p => {
      if (sectorAusente && p.sectorOriginal === sectorAusente) return 0;
      const candidatoEsFP = esSectorFP(p.sectorOriginal);
      if (ausenteEsFP) return candidatoEsFP ? 1 : 2;
      return candidatoEsFP ? 2 : 1;
    };

    // Afinidad por departamento dentro de cada nivel de sector.
    // Si falta alguien de Matemáticas y hay un profesor de Matemáticas
    // de guardia, ese cubre antes que el de Lengua, aunque los dos
    // estén en el sector GENERAL. Lo mismo para FP: un profesor de
    // TMV cubre antes a otro de TMV que a uno de Hostelería.
    const ausDelSector = porSector
      ? (porSector[sectorSolicitante] || porSector[(sectorSolicitante || '').toUpperCase()] || [])
      : [];
    const dptoAusente = (ausDelSector[0]?.departamento || '').toLowerCase();

    const afinidadDpto = p => {
      const profObj = profesoresList.find(pf => claveAbreviatura(pf.apellidos, pf.nombre) === normAbrev(p.abrev));
      const dpto = (profObj?.departamento || '').toLowerCase();
      return dpto && dpto === dptoAusente ? 0 : 1;
    };

    libres.sort((a, b) => {
      const pa = prioridadDe(a), pb = prioridadDe(b);
      if (pa !== pb) return pa - pb;
      // Mismo nivel de sector: el del mismo departamento primero
      const da = afinidadDpto(a), db = afinidadDpto(b);
      if (da !== db) return da - db;
      if (a.apoyosPrevios !== b.apoyosPrevios) return a.apoyosPrevios - b.apoyosPrevios;
      if (a.apoyosSector !== b.apoyosSector) return a.apoyosSector - b.apoyosSector;
      return a.nombre.localeCompare(b.nombre);
    });
    return libres;
  }

  // === Registro automático ===
  // Si hay un candidato asignado y no está ya registrado en apoyos_asignados,
  // se guarda automáticamente. No espera a que nadie pulse nada.
  // El registro automático de guardias desde el navegador se ha
  // retirado: lo hacía el equipo de cada profesor que abriera la pantalla,
  // creaba filas sin saber a quién cubrían ni en qué aula, y dos personas
  // mirando a la vez generaban duplicados. Ahora las guardias las calcula
  // y las guarda el servidor al registrarse la ausencia, y esta pantalla
  // solo muestra lo que hay.


  /**
   * Fichar la guardia.
   *
   * Un solo gesto, cuando ya estás en el aula: queda la hora real y, si
   * hace falta, las observaciones. Solo se puede durante la franja; el
   * servidor lo vuelve a comprobar, porque el reloj del navegador lo
   * cambia cualquiera.
   */
  async function ficharGuardia() {
    if (!fichandoId) return;
    setFichando(true);
    try {
      const r = await fetch('/api/apoyos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'fichar', id: fichandoId,
          datos: { observaciones: observaciones.trim() } }),
      });
      const d = await r.json().catch(() => ({}));

      if (r.ok) {
        setApAsig(prev => prev.map(a => a.id === fichandoId
          ? { ...a, estado: 'confirmado', confirmado_at: new Date().toISOString(),
              incidencia: observaciones.trim() || null }
          : a));
        setFichandoId(null);
        setObservaciones('');
      } else if (d.error === 'fuera_de_franja') {
        alert('El check solo está activo durante la hora de la guardia.');
      } else {
        alert(d.error || 'No se ha podido fichar.');
      }
    } catch {
      alert('Sin conexión.');
    }
    setFichando(false);
  }


  // El propio profesor se apunta para cubrir una guardia huérfana
  async function activarApoyo(candidato, sector, apoyosFijados) {
    if (!candidato.profesorId && candidato.profesorId !== profesorId) {
      alert('No se puede activar: ficha no encontrada para este compañero.');
      return;
    }
    const r = await fetch('/api/apoyos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'autoasignar',
        datos: {
          fecha,
          hora: horaActiva,
          sector_apoyo: sector,
          profesor_id: candidato.profesorId,
          curso_academico: await getCursoActual(),
        },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert(e.error || 'No se ha podido activar la guardia.');
      return;
    }
    // Recargar apoyos
    const { data } = await consulta('apoyos_asignados')
      .select('*').eq('fecha', fecha).eq('curso_academico', await getCursoActual());
    setApAsig(data || []);
  }

  // Cambiar el profesor asignado a un apoyo (solo directivos)
  async function cambiarApoyo(apoyoId, nuevoProfesor) {
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
    const r = await consulta('apoyos_asignados')
      .select('*')
      .eq('fecha', fecha)
      .eq('curso_academico', await getCursoActual());
    setApAsig(r.data || []);
    setModalCambiar(null);
  }

  // === RENDER ===
  const btnNav = {
    padding:'8px 14px', borderRadius:10, cursor:'pointer', fontSize:13,
    backgroundColor:'white', border:'1.5px solid #d1d5db',
  };

  if (cargando) return <div style={{ padding:40, textAlign:'center', fontFamily:'system-ui' }}>Cargando cuadrante…</div>;

  // ── Modal de incidencia ──
  // Fichaje: el check y las observaciones, en un mismo gesto.
  const modalFichaje = fichandoId ? (() => {
    const g = apoyosAsignados.find(a => a.id === fichandoId) || {};
    return (
      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={() => setFichandoId(null)}>
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 440,
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', marginBottom: 10 }}>
            ✅ Fichar la guardia
          </div>
          <div style={{ fontSize: 13.5, color: '#334155', marginBottom: 14, lineHeight: 1.5 }}>
            {g.grupo ? <strong>{g.grupo}</strong> : 'Tu guardia'}
            {g.aula ? ` · aula ${g.aula}` : ''}
            {g.hora ? ` · ${horaDe(g.hora)}` : ''}
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>
            Observaciones (opcional)
          </label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
            placeholder="Alumnos que faltan, si el grupo no estaba, si no había tarea, cualquier incidencia…"
            rows={3} style={{ width: '100%', padding: '11px 12px', borderRadius: 8,
              border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />

          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
            <button onClick={() => setFichandoId(null)} style={{
              padding: '10px 18px', borderRadius: 9, border: '1.5px solid #cbd5e1',
              backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={ficharGuardia} disabled={fichando} style={{
              padding: '10px 18px', borderRadius: 9, border: 'none',
              backgroundColor: fichando ? '#94a3b8' : '#16a34a',
              color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer',
            }}>{fichando ? 'Fichando…' : 'Fichar'}</button>
          </div>
        </div>
      </div>
    );
  })() : null;

  // La "i": qué es una guardia y qué se espera de ti.
  const modalAyuda = verAyuda ? (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={() => setVerAyuda(false)}>
      <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 470,
        maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8', marginBottom: 14 }}>
          Cómo funciona tu guardia
        </div>

        <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 12px' }}>
            Es horario lectivo obligatorio, igual que tu clase. La asigna el
            sistema automáticamente, por rotación entre los departamentos.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Preséntate</strong> en el aula y con el grupo que te indica la
            ficha. Un profesor por grupo: no se juntan grupos aunque las aulas
            estén al lado.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Ficha</strong> cuando estés en el aula. El check solo está
            activo durante la hora de la guardia; fuera de esa franja no se puede
            fichar. Queda registrada la hora.
          </p>
          <p style={{ margin: '0 0 12px' }}>
            <strong>Observaciones:</strong> al fichar se abre el cuadro. Anota
            alumnos ausentes, si el grupo no estaba, si no había tarea o
            cualquier incidencia. Se puede dejar en blanco.
          </p>
          <p style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 8,
            backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', fontWeight: 600 }}>
            Si no fichas, la guardia consta como no realizada.
          </p>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            Las guardias de recreo son vigilancia de zona: no sustituyen a nadie
            y se fichan igual.
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={() => setVerAyuda(false)} style={{
            padding: '10px 20px', borderRadius: 9, border: 'none',
            backgroundColor: '#1d4ed8', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>Entendido</button>
        </div>
      </div>
    </div>
  ) : null;

    return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f9fafb', fontFamily:'system-ui,sans-serif', paddingBottom:60 }}>
      {modalFichaje}
      {modalAyuda}

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
        <button onClick={() => { setFecha(sumarDias(fecha, -1)); setHoraActiva('1'); }} style={btnNav}>←</button>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:azul, textTransform:'capitalize' }}>{fechaCorta(fecha)}</div>
          <div style={{ fontSize:12, color:'#666', marginTop:2 }}>
            {esFinde ? '🏖️ Fin de semana' : (() => {
              // Igual que arriba: se cuentan los profesores a los que de
              // verdad hay que cubrir hoy, vengan de una ausencia de un día
              // o de una baja larga.
              const hoyAusentes = new Set();
              apoyosAsignados.forEach(a => a.profesor_ausente_id && hoyAusentes.add(a.profesor_ausente_id));
              ausenciasDia.forEach(a => a.profesorId && hoyAusentes.add(a.profesorId));
              const n = hoyAusentes.size;
              return n === 0 ? '✅ Sin ausencias' : `🚨 ${n} profesor${n !== 1 ? 'es' : ''} ausente${n !== 1 ? 's' : ''}`;
            })()}
          </div>
        </div>
        <button onClick={() => { setFecha(sumarDias(fecha, 1)); setHoraActiva('1'); }} style={btnNav}>→</button>
        <button onClick={() => { setFecha(hoyLocal()); setHoraActiva(horaAhora()); }}
          style={{ ...btnNav, backgroundColor:marron, color:'white', border:'none', fontSize:11 }}>Hoy</button>
      </div>

      {/* SELECTOR DE HORAS
          Va arriba y se queda pegado: de un vistazo se ve el día entero,
          con el número de ausencias de cada hora, y se salta de una a otra
          sin desplazarse por una lista larga. */}
      {!esFinde && (
        <div style={{
          padding: '12px 16px 10px', backgroundColor: 'white',
          borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingTop: 6 }}>
            {HORAS.map(h => {
              const activa = h.id === horaActiva;
              const cnt = gruposACubrir(h.id);
              const esRecreo = h.id === 'recreo';

              return (
                <button key={h.id} onClick={() => setHoraActiva(h.id)} title={h.horario} style={{
                  flexShrink: 0, cursor: 'pointer', position: 'relative',
                  width: esRecreo ? 62 : 46, height: 46, borderRadius: esRecreo ? 23 : '50%',
                  backgroundColor: activa ? marron : 'white',
                  color: activa ? 'white' : (cnt > 0 ? rojo : '#64748b'),
                  border: activa ? 'none' : '1.5px solid ' + (cnt > 0 ? '#fca5a5' : '#dfe3e8'),
                  fontWeight: 800, fontSize: esRecreo ? 11.5 : 15, padding: 0,
                  boxShadow: activa ? '0 2px 8px rgba(0,0,0,0.18)' : 'none',
                }}>
                  {esRecreo ? 'Recreo' : h.label}
                  {cnt > 0 && (
                    <span style={{
                      position: 'absolute', top: -3, right: -3, backgroundColor: rojo, color: 'white',
                      borderRadius: '50%', width: 19, height: 19, fontSize: 10.5, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '2px solid white',
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
            {/* SECCIÓN 1: PROFESORES QUE FALTAN
                Se pinta desde las guardias que ya calculó y guardó el
                servidor, no desde un cálculo del navegador. Antes había dos
                bloques enseñando lo mismo con fuentes distintas: este veía
                solo las ausencias del formulario y decía 1 cuando faltaban 3,
                porque las ausencias largas y las bajas no guardan horas
                concretas. */}
            {(() => {
              const guardiasHora = apoyosAsignados
                .filter(a => normHora(a.hora) === horaActiva && !esRecreoSector(a.sector_apoyo));

              if (guardiasHora.length === 0) return (
                <div style={{
                  backgroundColor:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12,
                  padding:20, textAlign:'center', color:verde, fontSize:14,
                }}>
                  No falta nadie a {horaInfo?.label || 'esta hora'}
                </div>
              );

              // Agrupadas por el sector del que falta, como estaban
              const porSector = {};
              guardiasHora.forEach(g => {
                const s = (g.sector_destino || g.sector_apoyo || 'SIN SECTOR').toUpperCase();
                (porSector[s] = porSector[s] || []).push(g);
              });

              const ausentesDistintos = new Set(guardiasHora.map(g => g.profesor_ausente_id || g.id)).size;

              return (
                <>
                  <div style={{ fontWeight:800, fontSize:14, color:rojo, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                    🚨 PROFESORES QUE FALTAN ({ausentesDistintos})
                    <button onClick={() => setVerAyuda(true)} title="Cómo funciona tu guardia"
                      style={{ marginLeft:'auto', width:22, height:22, borderRadius:'50%', cursor:'pointer',
                        border:'1.5px solid #93c5fd', backgroundColor:'white', color:'#1d4ed8',
                        fontWeight:800, fontSize:13, lineHeight:1, padding:0 }}>i</button>
                  </div>

                  {Object.entries(porSector).map(([sectorSup, lista]) => (
                    <div key={sectorSup} style={{ marginBottom:16 }}>
                      <div style={{
                        backgroundColor:'#fef2f2', border:'1.5px solid #fca5a5', borderRadius:'10px 10px 0 0',
                        padding:'8px 14px', display:'flex', alignItems:'center', gap:8,
                      }}>
                        <span style={{ fontSize:16 }}>{emojiSector(sectorSup)}</span>
                        <span style={{ fontWeight:800, fontSize:13, color:rojo }}>{sectorSup}</span>
                        <span style={{ fontSize:11, color:'#7f1d1d', marginLeft:'auto' }}>
                          {lista.length} clase{lista.length !== 1 ? 's' : ''} a cubrir
                        </span>
                      </div>

                      <div style={{ backgroundColor:'white', border:'1.5px solid #fca5a5', borderTop:'none',
                                    borderRadius:'0 0 10px 10px', padding:12 }}>
                        {lista.map(g => {
                          const destino = limpiarGrupo(g.grupo);
                          const aula = g.aula || destino.aula;
                          const falta = nombrePorId(g.profesor_ausente_id) || 'Profesor no identificado';
                          const cubre = nombrePorId(g.profesor_id)
                            || nombreCorto(mapaProfesores, g.profesor_nombre_pdf) || '—';
                          const esMia = g.profesor_id && String(g.profesor_id) === String(profesorId);
                          const fichada = g.estado === 'confirmado';
                          const abierto = dentroDeFranja(g.hora, g.fecha);

                          return (
                            <div key={g.id} style={{
                              padding:'10px 12px', marginBottom:8, borderRadius:8,
                              backgroundColor: esMia ? '#f0fdf4' : '#fafafa',
                              border: esMia ? `2px solid ${verde}` : '1px solid #e5e7eb',
                            }}>
                              {/* Quién falta */}
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
                                <span style={{ fontSize:13, fontWeight:700, color:'#333' }}>{falta}</span>
                                {destino.grupo && (
                                  <span style={{ fontSize:12, fontWeight:700, color:'#0f172a' }}>
                                    · {destino.grupo}
                                  </span>
                                )}
                                {aula && (
                                  <span style={{ fontSize:11.5, fontWeight:700, color:'#1d4ed8',
                                    backgroundColor:'#eff6ff', padding:'2px 8px', borderRadius:6 }}>
                                    aula {aula}
                                  </span>
                                )}
                              </div>

                              {/* La tarea que dejó */}
                              {g.tarea && (
                                <div style={{
                                  fontSize:12, color:'#78350f', backgroundColor:'#fffbeb',
                                  border:'1px solid #fde68a', borderRadius:6,
                                  padding:'7px 10px', marginBottom:8, lineHeight:1.45,
                                }}>
                                  <strong>Tarea:</strong> {g.tarea}
                                </div>
                              )}

                              {/* Quién cubre y, si soy yo, el check */}
                              <div style={{
                                display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
                                backgroundColor:'#f1f5f9', borderRadius:6, padding:'8px 10px',
                              }}>
                                <span style={{ fontSize:12.5, color:'#334155' }}>
                                  <strong style={{ color: fichada ? verde : '#334155' }}>
                                    {fichada ? 'Fichada por' : 'Cubre'}:
                                  </strong>{' '}
                                  <strong>{esMia ? 'tú' : cubre}</strong>
                                  {fichada && g.confirmado_at && (
                                    <span style={{ color:'#64748b' }}>
                                      {' · '}{new Date(g.confirmado_at).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}
                                    </span>
                                  )}
                                </span>

                                {esMia && !fichada && (
                                  <button
                                    onClick={() => abierto
                                      ? (setFichandoId(g.id), setObservaciones(''))
                                      : setVerAyuda(true)}
                                    style={{
                                      marginLeft:'auto', padding:'8px 14px', borderRadius:8, border:'none',
                                      cursor:'pointer', fontWeight:800, fontSize:13, whiteSpace:'nowrap',
                                      backgroundColor: abierto ? verde : '#e2e8f0',
                                      color: abierto ? 'white' : '#94a3b8',
                                    }}>
                                    ✅ Fichar
                                  </button>
                                )}
                                {esMia && !fichada && !abierto && (
                                  <span style={{ fontSize:10.5, color:'#94a3b8', width:'100%' }}>
                                    El check se abre de {horaDe(g.hora)}
                                  </span>
                                )}
                              </div>

                              {g.estado === 'confirmado' && g.incidencia && (
                                <div style={{ fontSize:11.5, color:'#475569', marginTop:6, paddingLeft:2 }}>
                                  Observaciones: {g.incidencia}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}


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
                          const nombre = nombreCorto(mapaProfesores, p);
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
