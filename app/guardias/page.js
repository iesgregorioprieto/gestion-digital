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

function normHora(h) { return (h||'').toString().replace(/[aª]$/,'').toLowerCase(); }

// El grupo llega del horario importado con el código del módulo y el aula
// pegados: "PBPR-2686687GM-1COC(5 E004 COC)". Al compañero que va a cubrir
// eso no le dice nada; lo suyo es "GM-1COC" y "aula E004".
function limpiarGrupo(txt) {
  const t = String(txt || '').trim();
  if (!t || t.toLowerCase() === 'libre') return { grupo: '', aula: '' };
  const g = t.match(/((?:GM|GS|GB|BTO|ESO|FPPE)-\d[A-Z0-9.]*|CA-CFGS-[A-Z])/i);
  const a = t.match(/\(\s*\d+\s+([A-Za-z]?\d{1,4}[A-Za-z]?)\b/);
  return { grupo: g ? g[1].toUpperCase() : t.split('(')[0].trim(), aula: a ? a[1].toUpperCase() : '' };
}

// Franja de una hora, y si se puede fichar ahora mismo.
function horaDe(horaId) {
  const h = HORAS.find(x => x.id === normHora(horaId));
  return h ? h.horario : '';
}
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
function sinTildes(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function claveAbreviatura(apellidos, nombre) {
  const ap = abreviarApellido(apellidos);
  const nom = inicialesNombre(nombre);
  // Sin tildes: Delphos y las fichas no siempre las escriben igual, y por
  // una tilde se dejaba de reconocer a la persona y salía la sigla.
  return sinTildes(`${ap}, ${nom}`).toLowerCase().replace(/\s/g, '');
}
// Red de seguridad: tres letras del primer apellido e iniciales del
// nombre, para cuando la ficha y el cuadrante no traen los mismos apellidos.
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
// Nombre de la persona a partir de la sigla del cuadrante.
function nombreLargo(mapa, abrev) {
  if (!abrev) return '';
  return mapa[sinTildes(abrev).toLowerCase().replace(/\s/g, '')]
    || mapa['~' + claveLaxaDeAbrev(abrev)]
    || abrev;
}
function normAbrev(str) {
  return (str || '').toLowerCase().replace(/\s/g, '');
}

export default function Guardias() {
  const [cargando, setCargando]         = useState(true);
  const [fecha, setFecha]               = useState(hoyLocal());
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
  const [apoyosPorProfesor, setApoyosPorProfesor] = useState({});
  const [apoyosAsignados, setApAsig]    = useState([]);
  const [modalCambiar, setModalCambiar] = useState(null); // apoyo a cambiar
  const [fichandoId, setFichandoId]       = useState(null);
  const [observaciones, setObservaciones] = useState('');
  const [fichando, setFichando]           = useState(false);
  const [verAyuda, setVerAyuda]           = useState(false);

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
  // Somos 154 en el claustro: hace falta el nombre entero y saber de qué
  // departamento es quien cubre, que si no nadie se reconoce.
  const fichaPorId = id => (profesoresList || []).find(p => String(p.id) === String(id));
  const fichaPorAbrev = abrev => (profesoresList || []).find(p =>
    claveAbreviatura(p.apellidos, p.nombre) === normAbrev(abrev || ''));
  const nombreEntero = ficha => ficha ? `${ficha.nombre} ${ficha.apellidos}` : '';

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
            cubre = { nombre: nombreLargo(mapaProfesores, p), abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
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
            cubre = { nombre: nombreLargo(mapaProfesores, p), abrev: p, sectorOriginal: sectorSup, tipo: 'guardia_sector' };
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
            nombre: nombreLargo(mapaProfesores, p),
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
  // El registro automático desde el navegador se ha retirado: lo hacía el
  // equipo de cada profesor que abriera la pantalla, creaba guardias sin
  // saber a quién cubrían ni en qué aula, y dos personas mirando a la vez
  // generaban duplicados. Ahora las calcula y las guarda el servidor.


  // El profesor confirma la guardia que le han preasignado.
  // El servidor comprueba que el apoyo es suyo antes de aceptarlo.
  /**
   * Fichar la guardia: un solo gesto, ya en el aula. Queda la hora real y,
   * si hace falta, las observaciones. Solo durante la franja; el servidor
   * lo vuelve a comprobar, porque el reloj del navegador lo cambia cualquiera.
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
    } catch { alert('Sin conexión.'); }
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
  const modalFichaje = fichandoId ? (() => {
    const g = apoyosAsignados.find(a => a.id === fichandoId) || {};
    return (
      <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:1000,
        display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
        onClick={() => setFichandoId(null)}>
        <div style={{ backgroundColor:'white', borderRadius:14, padding:24, width:'100%', maxWidth:440,
          boxShadow:'0 8px 30px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize:18, fontWeight:800, color:'#16a34a', marginBottom:10 }}>
            ✅ Fichar la guardia
          </div>
          <div style={{ fontSize:13.5, color:'#334155', marginBottom:14 }}>
            {g.grupo ? <strong>{g.grupo}</strong> : 'Tu guardia'}
            {g.aula ? ` · aula ${g.aula}` : ''}{g.hora ? ` · ${horaDe(g.hora)}` : ''}
          </div>
          <label style={{ fontSize:12.5, fontWeight:700, color:'#475569', display:'block', marginBottom:5 }}>
            Observaciones (opcional)
          </label>
          <textarea value={observaciones} onChange={e => setObservaciones(e.target.value)}
            placeholder="Alumnos que faltan, si el grupo no estaba, si no había tarea…"
            rows={3} style={{ width:'100%', padding:'11px 12px', borderRadius:8,
              border:'1.5px solid #ddd', fontSize:14, boxSizing:'border-box', resize:'vertical' }} />
          <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
            <button onClick={() => setFichandoId(null)} style={{
              padding:'10px 18px', borderRadius:9, border:'1.5px solid #cbd5e1',
              backgroundColor:'white', color:'#475569', fontWeight:700, fontSize:14, cursor:'pointer',
            }}>Cancelar</button>
            <button onClick={ficharGuardia} disabled={fichando} style={{
              padding:'10px 18px', borderRadius:9, border:'none',
              backgroundColor: fichando ? '#94a3b8' : '#16a34a',
              color:'white', fontWeight:800, fontSize:14, cursor:'pointer',
            }}>{fichando ? 'Fichando…' : 'Fichar'}</button>
          </div>
        </div>
      </div>
    );
  })() : null;

  const modalAyuda = verAyuda ? (
    <div style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.5)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={() => setVerAyuda(false)}>
      <div style={{ backgroundColor:'white', borderRadius:14, padding:24, width:'100%', maxWidth:470,
        maxHeight:'80vh', overflowY:'auto', boxShadow:'0 8px 30px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:18, fontWeight:800, color:'#1d4ed8', marginBottom:14 }}>
          Cómo funciona tu guardia
        </div>
        <div style={{ fontSize:14, color:'#334155', lineHeight:1.6 }}>
          <p style={{ margin:'0 0 12px' }}>
            Es horario lectivo obligatorio, igual que tu clase. La asigna el
            sistema por rotación entre los departamentos.
          </p>
          <p style={{ margin:'0 0 12px' }}>
            <strong>Preséntate</strong> en el aula y con el grupo que te indica la
            ficha. Un profesor por grupo: no se juntan grupos aunque las aulas
            estén al lado.
          </p>
          <p style={{ margin:'0 0 12px' }}>
            <strong>Ficha</strong> cuando estés en el aula. El check solo está
            activo durante la hora de la guardia. Queda registrada la hora.
          </p>
          <p style={{ margin:'0 0 12px' }}>
            <strong>Observaciones:</strong> al fichar se abre el cuadro. Anota
            alumnos ausentes, si el grupo no estaba, si no había tarea o
            cualquier incidencia. Se puede dejar en blanco.
          </p>
          <p style={{ margin:'0 0 12px', padding:'10px 12px', borderRadius:8,
            backgroundColor:'#fef2f2', border:'1px solid #fca5a5', color:'#991b1b', fontWeight:600 }}>
            Si no fichas, la guardia consta como no realizada.
          </p>
          <p style={{ margin:0, fontSize:13, color:'#64748b' }}>
            Las guardias de recreo son vigilancia de zona: no sustituyen a nadie
            y se fichan igual.
          </p>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:16 }}>
          <button onClick={() => setVerAyuda(false)} style={{
            padding:'10px 20px', borderRadius:9, border:'none',
            backgroundColor:'#1d4ed8', color:'white', fontWeight:700, fontSize:14, cursor:'pointer',
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
        <button onClick={() => setFecha(sumarDias(fecha, -1))} style={btnNav}>←</button>
        <div style={{ flex:1, textAlign:'center' }}>
          <div style={{ fontWeight:800, fontSize:15, color:azul, textTransform:'capitalize' }}>{fechaCorta(fecha)}</div>
          <div style={{ fontSize:12, color:'#666', marginTop:2 }}>
            {esFinde ? '🏖️ Fin de semana' : `${ausentesEstaHora().length === 0 ? '✅ Sin ausencias' : `🚨 ${ausenciasDia.length} profesor${ausenciasDia.length!==1?'es':''} ausente${ausenciasDia.length!==1?'s':''}`}`}
          </div>
        </div>
        <button onClick={() => setFecha(sumarDias(fecha, 1))} style={btnNav}>→</button>
        <button onClick={() => setFecha(hoyLocal())}
          style={{ ...btnNav, backgroundColor:marron, color:'white', border:'none', fontSize:11 }}>Hoy</button>
      </div>

      {/* COBERTURA DE GUARDIAS HOY */}
      {!esFinde && (() => {
        // Todas las guardias del día, agrupadas por hora
        // Muestra quién cubre a quién — visible para todos los profesores
        const porHora = {};
        apoyosAsignados.forEach(a => {
          const h = normHora(a.hora);
          if (!porHora[h]) porHora[h] = [];
          porHora[h].push(a);
        });
        const horasConGuardias = HORAS.filter(h => porHora[h.id]?.length > 0);
        if (horasConGuardias.length === 0) return (
          <div style={{ margin: '12px 16px', padding: '14px', borderRadius: 12,
            backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', textAlign: 'center',
            fontSize: 13, color: '#166534', fontWeight: 600 }}>
            ✅ No hay guardias asignadas hoy
          </div>
        );

        // Mis guardias (para que el propio profesor pueda confirmarlas)
        const misGuardias = apoyosAsignados.filter(a =>
          a.profesor_id && String(a.profesor_id) === String(profesorId));

        return (
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1.5px solid #d1d5db', backgroundColor: 'white' }}>
              <div style={{ padding: '10px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                <strong style={{ fontSize: 14.5, color: '#1e3a5f' }}>🛡️ Cobertura de guardias hoy</strong>
                <button onClick={() => setVerAyuda(true)} title="Cómo funciona tu guardia"
                  style={{ marginLeft: 8, width: 22, height: 22, borderRadius: '50%', cursor: 'pointer',
                    border: '1.5px solid #93c5fd', backgroundColor: 'white', color: '#1d4ed8',
                    fontWeight: 800, fontSize: 13, lineHeight: 1, padding: 0 }}>i</button>
              </div>

              {horasConGuardias.map(h => {
                const asignados = porHora[h.id] || [];
                return (
                  <div key={h.id} style={{ borderTop: '1px solid #f1f5f9', padding: '10px 14px' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 6,
                      textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {h.label}
                    </div>
                    {asignados.map(a => {
                      // esMia: por UUID (lo ideal) o por nombre PDF cuando el matching de nombres falló
                      const miNombrePdf = (sessionStorage.getItem('profesor_nombre_pdf') || '').toLowerCase().trim();
                      const esMia = (a.profesor_id && String(a.profesor_id) === String(profesorId))
                        || (!a.profesor_id && miNombrePdf && (a.profesor_nombre_pdf || '').toLowerCase().trim() === miNombrePdf);
                      const esConf = a.estado === 'confirmado';
                      const esInc = a.estado === 'incidencia';
                      const esPend = !esConf && !esInc;
                      const colorEstado = esConf ? '#16a34a' : esInc ? '#ea580c' : '#dc2626';
                      const iconoEstado = esConf ? '✅' : esInc ? '⚠️' : '🔴';
                      // Nombre del ausente al que cubre
                      const ausente = ausenciasDia.find(au =>
                        au.horas?.some(ah => normHora(ah.hora || ah) === h.id) &&
                        (au.profesorId === a.profesor_ausente_id || au.abrev === a.sector_destino)
                      );
                      return (
                        <div key={a.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                          padding: '8px 10px', borderRadius: 8,
                          backgroundColor: esMia ? (esPend ? '#fefce8' : esConf ? '#f0fdf4' : '#fff7ed') : '#fafafa',
                          border: '1.5px solid ' + (esMia ? colorEstado : '#e5e7eb'),
                        }}>
                          <span style={{ fontSize: 15 }}>{iconoEstado}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>
                              {nombreEntero(fichaPorId(a.profesor_id))
                                || nombreLargo(mapaProfesores, a.profesor_nombre_pdf)
                                || a.sector_apoyo || '—'}
                              {esMia && <span style={{ fontSize: 11, color: colorEstado, fontWeight: 800, marginLeft: 6 }}>← ERES TÚ</span>}
                            </div>
                            <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 1 }}>
                              {(() => {
                                const quienFalta = nombreEntero(fichaPorId(a.profesor_ausente_id))
                                  || ausente?.profesor || a.sector_destino || '—';
                                const destino = limpiarGrupo(a.grupo);
                                const aula = a.aula || destino.aula;
                                return (
                                  <>
                                    cubre a {quienFalta}
                                    {destino.grupo ? ` · ${destino.grupo}` : ''}
                                    {aula ? ` · aula ${aula}` : ''}
                                  </>
                                );
                              })()}
                            </div>
                            {a.tarea && (
                              <div style={{ fontSize: 11.5, color: '#1e40af', marginTop: 3 }}>📝 {a.tarea}</div>
                            )}
                          </div>
                          {/* Botones de acción para el profesor asignado */}
                          {esMia && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
                              {esPend && (() => {
                                const abierto = dentroDeFranja(a.hora, a.fecha);
                                return (
                                  <>
                                    <button
                                      onClick={() => abierto
                                        ? (setFichandoId(a.id), setObservaciones(''))
                                        : setVerAyuda(true)}
                                      style={{
                                        padding: '9px 14px', borderRadius: 8, border: 'none',
                                        cursor: 'pointer', whiteSpace: 'nowrap', width: '100%',
                                        backgroundColor: abierto ? '#16a34a' : '#e5e7eb',
                                        color: abierto ? 'white' : '#9ca3af',
                                        fontWeight: 800, fontSize: 12.5,
                                      }}>✅ Fichar guardia</button>
                                    <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'right' }}>
                                      {abierto ? 'Púlsalo en el aula' : `Se abre de ${horaDe(a.hora)}`}
                                    </div>
                                  </>
                                );
                              })()}
                              {esConf && (
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#16a34a',
                                  backgroundColor: '#dcfce7', padding: '6px 12px', borderRadius: 16,
                                  border: '1.5px solid #86efac' }}>
                                  ✅ Fichada{a.confirmado_at ? ` · ${new Date(a.confirmado_at).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}` : ''}
                                </span>
                              )}
                              {esInc && (
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#ea580c',
                                  backgroundColor: '#fff7ed', padding: '6px 12px', borderRadius: 16,
                                  border: '1.5px solid #fdba74' }}>🟠 Incidencia registrada</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* SELECTOR DE HORAS */}
      {!esFinde && (
        <div style={{ padding:'10px 16px 0', backgroundColor:'white', borderBottom:'1px solid #e5e7eb' }}>
          <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:8 }}>
            {HORAS.map(h => {
              const activa = h.id === horaActiva;
              // Se cuenta sobre las guardias ya calculadas por el servidor:
              // las ausencias de varios días y las bajas no guardan horas
              // concretas, así que contando sobre ellas salían de menos.
              const aCubrir = new Set();
              apoyosAsignados.filter(x => normHora(x.hora) === h.id)
                .forEach(x => aCubrir.add(x.profesor_ausente_id || `g:${x.id}`));
              ausenciasDia.filter(a => a.horas.some(hh => horaCoincide(hh.hora, h.id)))
                .forEach(a => aCubrir.add(a.profesorId || `a:${a.abrev}`));
              const cnt = aCubrir.size;

              return (
                <button key={h.id} onClick={() => setHoraActiva(h.id)} style={{
                  flexShrink:0, padding:'8px 14px', borderRadius:10, cursor:'pointer',
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
                          
                          // Si es una guardia huérfana (no clase)
                          if (asig.tipoHora === 'guardia') {
                            return (
                              <div key={idx} style={{
                                padding:'10px 12px', marginBottom:8,
                                backgroundColor:'#fef3c7', borderRadius:8,
                                border:'1.5px solid #fbbf24',
                              }}>
                                <div style={{ fontSize:13, fontWeight:700, color:'#78350f', marginBottom:4 }}>
                                  {nombreEntero(fichaPorId(asig.ausencia.profesorId)) || asig.ausencia.profesor}
                                </div>
                                <div style={{ fontSize:12, color:'#92400e', fontWeight:600 }}>
                                  ⚠️ Faltaba y tenía <strong>GUARDIA en {sectorSup}</strong>
                                </div>
                                <div style={{ fontSize:11, color:'#78350f', marginTop:4, fontStyle:'italic' }}>
                                  El sector pierde 1 profesor de guardia. Puede necesitar un sustituto si otros profesores del sector también faltan.
                                </div>

                                {/* Lista de candidatos — diseño a prueba de ciruelos */}
                                {(() => {
                                  const libre = profesoresLibresParaApoyo(new Set(), ausenciasPorSector(), sectorSup);
                                  if (libre.length === 0) return null;
                                  return (
                                    <div style={{ marginTop:12, borderTop:'2px dashed #fbbf24', paddingTop:12 }}>

                                      {libre[0]?.profesorId === profesorId ? (
                                        /* SOY EL SUGERIDO: pantalla grande y clara */
                                        <div style={{ backgroundColor:'#fff7ed', border:'2.5px solid #f97316', borderRadius:12, padding:16, textAlign:'center' }}>
                                          <div style={{ fontSize:22, marginBottom:6 }}>👆 TE TOCA A TI</div>
                                          <div style={{ fontSize:14, fontWeight:800, color:'#c2410c', marginBottom:4 }}>
                                            Eres el/la sugerido/a para cubrir esta guardia
                                          </div>
                                          <div style={{ fontSize:12, color:'#7c2d12', marginBottom:14 }}>
                                            La app te ha elegido porque llevas menos guardias que el resto
                                          </div>
                                          <button onClick={() => activarApoyo(libre[0], sectorSup, [])} style={{
                                            width:'100%', padding:'14px', borderRadius:10, border:'none', cursor:'pointer',
                                            backgroundColor:'#f97316', color:'white', fontWeight:900, fontSize:18,
                                          }}>
                                            ✅ ASUMIR ESTA GUARDIA
                                          </button>
                                          <div style={{ fontSize:11, color:'#9a3412', marginTop:8 }}>
                                            Si no puedes, deja que lo haga otro compañero de la lista
                                          </div>
                                        </div>
                                      ) : (
                                        /* NO SOY EL SUGERIDO: lista compacta */
                                        <div>
                                          <div style={{ fontSize:12, fontWeight:700, color:'#78350f', marginBottom:10 }}>
                                            👥 ¿Quién cubre la guardia? — <span style={{ fontWeight:400 }}>Pulsa ✅ si eres tú o alguien te lo pide</span>
                                          </div>
                                          {libre.map((c, i) => {
                                            const esSugerido = i === 0;
                                            const esMiTurno = c.profesorId === profesorId;
                                            return (
                                              <div key={c.abrev} style={{
                                                display:'flex', alignItems:'center', gap:10,
                                                padding: esSugerido ? '12px 14px' : '8px 10px',
                                                borderRadius:10, marginBottom:6,
                                                backgroundColor: esSugerido ? '#fff7ed' : esMiTurno ? '#f0fdf4' : '#fafafa',
                                                border:'2px solid ' + (esSugerido ? '#f97316' : esMiTurno ? '#86efac' : '#e5e7eb'),
                                              }}>
                                                <span style={{ fontSize: esSugerido ? 20 : 14, minWidth:28, textAlign:'center' }}>
                                                  {esSugerido ? '🏅' : i === 1 ? '🥈 2º' : i === 2 ? '🥉 3º' : esMiTurno ? '🧑‍🏫' : `${i+1}.`}
                                                </span>
                                                <div style={{ flex:1, minWidth:0 }}>
                                                  <div style={{ fontSize: esSugerido ? 15 : 13, fontWeight: esSugerido ? 900 : (esMiTurno ? 700 : 500), color:'#1a1a1a' }}>
                                                    {c.nombre}
                                                    {esSugerido && <span style={{ fontSize:11, color:'#f97316', fontWeight:700, marginLeft:8 }}>← SUGERIDO</span>}
                                                    {!esSugerido && esMiTurno && <span style={{ fontSize:11, color:'#16a34a', fontWeight:700, marginLeft:8 }}>← ERES TÚ</span>}
                                                  </div>
                                                  <div style={{ fontSize:11, color:'#9ca3af' }}>
                                                    {c.sectorOriginal}{esSugerido && <span style={{ color:'#f97316' }}> · lleva menos guardias</span>}
                                                  </div>
                                                </div>
                                                <button onClick={() => activarApoyo(c, sectorSup, [])} style={{
                                                  padding: esSugerido ? '10px 18px' : '7px 12px',
                                                  borderRadius:9, border:'none', cursor:'pointer',
                                                  backgroundColor: esSugerido ? '#f97316' : (esMiTurno ? verde : '#94a3b8'),
                                                  color:'white', fontWeight:800, fontSize: esSugerido ? 14 : 12, whiteSpace:'nowrap',
                                                }}>
                                                  ✅ {esSugerido ? 'Asumir' : 'Activar'}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          }

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
                                  {nombreEntero(fichaPorId(asig.ausencia.profesorId)) || asig.ausencia.profesor}
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
                                  {(() => {
                                    const ficha = fichaPorId(cubre.profesorId) || fichaPorAbrev(cubre.abrev);
                                    const entero = nombreEntero(ficha) || cubre.nombre;
                                    const depto = ficha?.departamento || cubre.sectorOriginal;
                                    return (
                                      <>
                                        <span style={{ fontWeight:800, color: yoCubro ? verde : '#333' }}>
                                          {yoCubro ? 'TÚ' : entero}
                                        </span>
                                        {!yoCubro && depto && (
                                          <span style={{ fontSize:11.5, fontWeight:700, color:'#1d4ed8' }}>
                                            ({depto})
                                          </span>
                                        )}
                                        <span style={{ fontSize:11, color:'#666', marginLeft:'auto' }}>
                                          {cubre.tipo === 'apoyo_cruzado'
                                            ? `${cubre.sectorOriginal} (${cubre.apoyosPrevios} apoyos)`
                                            : `guardia ${cubre.sectorOriginal}`}
                                        </span>
                                      </>
                                    );
                                  })()}
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
                          const nombre = nombreLargo(mapaProfesores, p);
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
