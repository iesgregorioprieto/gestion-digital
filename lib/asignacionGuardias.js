/**
 * ASIGNACIÓN DE GUARDIAS — motor único
 *
 * Toda la lógica que decide quién cubre a quién, sin React, para que
 * el servidor pueda preasignar por su cuenta y las pantallas se limiten
 * a mostrar lo que hay.
 *
 * REGLA ACORDADA (septiembre 2026, sustituye a la de agosto):
 *
 *   1. Primero, los que están de guardia en el sector del ausente.
 *      A igualdad, el del mismo departamento; luego el que menos lleve.
 *
 *   2. Al agotarse, se pasa al otro lado, y es simétrico en los dos
 *      sentidos: si falta alguien de FP, entra GENERAL antes que otro
 *      departamento de FP, y al revés.
 *
 *   3. La rotación fuera del propio sector se lleva POR DEPARTAMENTO y
 *      proporcional a su tamaño, para que no bajen siempre los mismos.
 *      Un departamento de 3 profesores con 2 apoyos (0,67 por cabeza)
 *      va después de uno de 9 con 4 (0,44 por cabeza).
 *
 *   4. Un profesor por grupo. Nunca se juntan grupos.
 *
 *   5. Si no hay nadie, el hueco se devuelve igual con cubre = null,
 *      para que quede visible en rojo. Nunca se oculta.
 *
 * Solo cuentan para la rotación las guardias FICHADAS.
 *
 * El recreo NO pasa por aquí: es vigilancia de zona, no sustituye a
 * nadie y se genera directamente del cuadrante.
 */

import { departamentoASector, esSectorRecreo, normSector, sinTildes } from '@/lib/sectores';

// ─────────────────────────────────────────────────────────────
// Franjas horarias — ÚNICA fuente de verdad del centro.
// Cualquier pantalla que necesite horas las importa de aquí.
// ─────────────────────────────────────────────────────────────

export const FRANJAS = [
  { id: '1',      label: '1ª',     inicio: '08:30', fin: '09:25' },
  { id: '2',      label: '2ª',     inicio: '09:25', fin: '10:20' },
  { id: '3',      label: '3ª',     inicio: '10:20', fin: '11:15' },
  { id: 'recreo', label: 'Recreo', inicio: '11:15', fin: '11:45' },
  { id: '4',      label: '4ª',     inicio: '11:45', fin: '12:40' },
  { id: '5',      label: '5ª',     inicio: '12:40', fin: '13:35' },
  { id: '6',      label: '6ª',     inicio: '13:35', fin: '14:30' },
];

export const HORAS_GUARDIA = FRANJAS.map(f => f.id);

export function franja(horaId) {
  return FRANJAS.find(f => f.id === normHora(horaId)) || null;
}

export function rangoFranja(horaId) {
  const f = franja(horaId);
  return f ? `${f.inicio}–${f.fin}` : '';
}

/**
 * ¿Estamos dentro de la franja? Es lo que abre y cierra el check verde.
 * `ahora` es un Date; `fecha` la del día de la guardia (YYYY-MM-DD).
 */
export function dentroDeFranja(horaId, fecha, ahora = new Date()) {
  const f = franja(horaId);
  if (!f || !fecha) return false;
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  if (hoy !== fecha) return false;
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  const aMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return minutos >= aMin(f.inicio) && minutos <= aMin(f.fin);
}

// ─────────────────────────────────────────────────────────────
// Horas y días
// ─────────────────────────────────────────────────────────────

export function normHora(h) {
  return (h || '').toString().replace(/[aª]$/, '').toLowerCase().trim();
}

export function horaCoincide(horaGuardada, horaId) {
  if (!horaGuardada) return false;
  const s = horaGuardada.toString().toLowerCase().trim();
  const m = s.match(/^(\d)/);
  if (m) return m[1] === horaId;
  if (s.includes('recreo') && horaId === 'recreo') return true;
  return false;
}

export function diaSemanaEs(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return dias[new Date(fecha + 'T12:00:00').getDay()];
}

// ─────────────────────────────────────────────────────────────
// Nombres: el horario guarda DOS formatos en la misma columna
//   tipo 'clase'   → "Abaldea García Pliego, Manuel José"
//   tipo 'guardia' → "Aba. GP, MJ"
// El motor tiene que reconocer los dos.
// ─────────────────────────────────────────────────────────────

export function normClave(s) {
  return sinTildes(s).toLowerCase().replace(/\s+/g, '');
}

export function claveCompleta(apellidos, nombre) {
  return normClave(`${apellidos || ''},${nombre || ''}`);
}

export function claveAbreviada(apellidos, nombre) {
  const partes = (apellidos || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const raiz = partes[0].slice(0, 3);
  const resto = partes.slice(1).map(p => p[0]).join('');
  const ap = resto ? `${raiz}. ${resto}` : `${raiz}.`;
  const nom = (nombre || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).join('');
  return normClave(`${ap}, ${nom}`);
}

/**
 * Clave laxa: tres letras del primer apellido e iniciales del nombre,
 * ignorando el resto de apellidos. Sirve de red para cuando la ficha y
 * el cuadrante no coinciden en el número de apellidos.
 */
export function claveLaxa(apellidos, nombre) {
  const raiz = (apellidos || '').trim().split(/\s+/)[0] || '';
  const nom = (nombre || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).join('');
  if (!raiz || !nom) return '';
  return normClave(`${raiz.slice(0, 3)}|${nom}`);
}

// La misma clave, pero a partir de una abreviatura del cuadrante
// ("Gar. M, JL" → "gar|jl").
export function claveLaxaDeAbreviatura(abrev) {
  const [ap, nom] = (abrev || '').split(',');
  if (!ap || !nom) return '';
  const raiz = ap.trim().replace(/\..*$/, '').trim();
  return normClave(`${raiz.slice(0, 3)}|${nom.replace(/\./g, '').trim()}`);
}

/**
 * Índice de profesores por sus dos claves.
 * Si dos personas comparten abreviatura ("Gar. M, JL" puede ser García
 * Moreno o García Muñoz), la clave queda ambigua y NO se asigna a nadie:
 * mejor un hueco en rojo que un profesor en un aula que no le toca.
 */
export function indiceProfesores(profesores) {
  const estrictas = {};
  const laxas = {};
  const apunta = (mapa, clave, p) => {
    if (!clave) return;
    const lista = mapa[clave] = mapa[clave] || [];
    if (!lista.some(x => x.id === p.id)) lista.push(p);
  };
  (profesores || []).forEach(p => {
    apunta(estrictas, claveCompleta(p.apellidos, p.nombre), p);
    apunta(estrictas, claveAbreviada(p.apellidos, p.nombre), p);
    apunta(laxas, claveLaxa(p.apellidos, p.nombre), p);
  });
  return { estrictas, laxas };
}

export function buscaProfesor(indice, nombrePdf) {
  const { estrictas = {}, laxas = {} } = indice || {};

  const exacta = estrictas[normClave(nombrePdf)] || [];
  if (exacta.length === 1) return exacta[0];
  if (exacta.length > 1) return null;   // ambigua: mejor nadie que quien no es

  // Red de seguridad: la ficha y el cuadrante no siempre traen el mismo
  // número de apellidos ni las mismas tildes.
  const suelta = laxas[claveLaxaDeAbreviatura(nombrePdf)]
    || laxas[claveLaxa(...(nombrePdf || '').split(',').map(x => x.trim()))]
    || [];
  return suelta.length === 1 ? suelta[0] : null;
}

export function clavesAmbiguas(indice) {
  return Object.entries((indice || {}).estrictas || {})
    .filter(([, lista]) => lista.length > 1)
    .map(([clave, lista]) => ({ clave, personas: lista.map(p => `${p.apellidos}, ${p.nombre}`) }));
}

export function nombreDe(p) {
  return p ? `${p.apellidos}, ${p.nombre}` : '';
}

// ─────────────────────────────────────────────────────────────
// Preparación de datos
// ─────────────────────────────────────────────────────────────

export function sectorDe(profesor) {
  if (!profesor) return 'GENERAL';
  let sector = departamentoASector(profesor.departamento);
  if (sector === 'GENERAL' && profesor.especialidad
      && !['ESO/BACHILLERATO', 'GENERAL'].includes(profesor.especialidad)) {
    sector = profesor.especialidad;
  }
  return sector;
}

/**
 * Cuántos profesores tiene cada sector. Es el divisor de la rotación
 * proporcional: sin esto, a FOL (3 personas) le tocaría lo mismo que a
 * TMV (9) y sus profesores harían el triple de guardias cada uno.
 */
export function tamanoSectores(profesores) {
  const tam = {};
  (profesores || []).forEach(p => {
    const s = normSector(sectorDe(p));
    tam[s] = (tam[s] || 0) + 1;
  });
  return tam;
}

/**
 * Cuadrante de guardias: sector → día → hora → [profesor resuelto].
 * Los nombres que no casen con ninguna ficha se devuelven aparte para
 * poder avisar en vez de perderlos en silencio.
 */
export function construirCuadrante(horarios, profesores) {
  const indice = indiceProfesores(profesores);
  const porSector = {};
  const sinResolver = new Set();

  (horarios || []).filter(h => h.tipo === 'guardia').forEach(g => {
    const sector = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
    const hora = normHora(g.hora_id);
    const dia = (g.dia || '').toLowerCase();
    const prof = buscaProfesor(indice, g.profesor_nombre_pdf);

    if (!prof) { sinResolver.add(g.profesor_nombre_pdf); return; }

    porSector[sector] = porSector[sector] || {};
    porSector[sector][dia] = porSector[sector][dia] || {};
    porSector[sector][dia][hora] = porSector[sector][dia][hora] || [];
    if (!porSector[sector][dia][hora].some(p => p.id === prof.id)) {
      porSector[sector][dia][hora].push({
        id: prof.id,
        nombre: nombreDe(prof),
        departamento: prof.departamento || '',
        sectorCuadrante: sector,
        zona: g.aula?.trim() || '',
      });
    }
  });

  return { porSector, sinResolver: [...sinResolver] };
}

/**
 * Quién está en clase a cada hora, para no sacar a nadie de su aula.
 */
export function ocupadosEnClase(horarios, profesores, dia, hora) {
  const indice = indiceProfesores(profesores);
  const ids = new Set();
  (horarios || [])
    .filter(h => h.tipo === 'clase'
      && (h.dia || '').toLowerCase() === dia
      && normHora(h.hora_id) === hora)
    .forEach(h => {
      const p = buscaProfesor(indice, h.profesor_nombre_pdf);
      if (p) ids.add(p.id);
    });
  return ids;
}

/**
 * Convierte en huecos lo que hay que cubrir ese día.
 *
 * Tres orígenes, y para el motor son lo mismo:
 *   - 'ausencia'  → alguien falta
 *   - 'dld'       → día de libre disposición aprobado
 *   - 'direccion' → guardia imprevista creada por jefatura (el profesor
 *                   está en el centro, pero no puede atender su grupo)
 *
 * Dos formas de declarar las horas, y las dos acaban igual:
 *
 *   POR HORAS — ausencias de un día. El profesor marca qué horas falta
 *   y deja la tarea de cada una. Se usa tal cual.
 *
 *   POR MÓDULO — ausencias de varios días y bajas. No tiene sentido
 *   pedir hora por hora de cada día, así que el profesor deja una tarea
 *   por módulo o grupo. Las horas se sacan de SU HORARIO de ese día y a
 *   cada clase se le engancha la tarea del módulo que le corresponde.
 *   Una baja registrada sin horas funciona igual, solo que sin tareas.
 *
 * Solo se crean huecos de las horas en las que el profesor tenía CLASE,
 * porque solo ahí hay un grupo de alumnos esperando.
 *
 * Si a esa hora le tocaba GUARDIA, no hay nada que cubrir: el centro
 * tiene ese rato un guardia menos para las ausencias que haya, y ya
 * está. Eso se resuelve solo, porque al ausente se le saca de la lista
 * de candidatos. Lo mismo vale para el recreo.
 */
// Una hora de guardia (o de recreo) del que falta no genera hueco:
// no hay grupo al que atender.
function esHoraDeGuardia(h) {
  const tipo = (h?.tipo || '').toLowerCase();
  if (tipo.includes('guardia') || tipo.includes('recreo')) return true;
  return esSectorRecreo(h?.grupo);
}

export function prepararHuecos(faltas, profesores, opciones = {}) {
  const { horarios = null, dia = null } = opciones;
  const indice = indiceProfesores(profesores);
  const salida = [];

  for (const falta of faltas || []) {
    const prof = (profesores || []).find(p => p.id === falta.profesor_id);
    if (!prof) continue;

    const declaradas = (falta.horas || []).filter(h => !esHoraDeGuardia(h));
    const porHoras = declaradas.filter(h => esHoraReal(h.hora));

    // Si lo que hay son horas de verdad, mandan ellas. Si no (bloques por
    // módulo de una ausencia larga, o una baja sin horas), se saca del horario.
    const horas = porHoras.length > 0
      ? porHoras
      : expandirDesdeHorario({ profesor: prof, horarios, dia, indice, bloques: declaradas });

    salida.push({
      profesorId: falta.profesor_id,
      profesor: nombreDe(prof),
      departamento: prof.departamento || '',
      sector: sectorDe(prof),
      origen: falta.origen || falta.tipo_falta || 'ausencia',
      motivoDireccion: falta.motivo || '',
      registroId: falta.id || null,
      horas,
    });
  }
  return salida;
}

// ¿"3ª", "5", "recreo"… son horas de verdad? "Ausencia larga" no lo es.
function esHoraReal(hora) {
  return HORAS_GUARDIA.some(id => horaCoincide(hora, id));
}

/**
 * Saca las horas de clase del profesor ese día de su horario oficial y
 * les engancha la tarea del módulo correspondiente.
 *
 * El emparejamiento va de lo más preciso a lo más laxo: primero grupo y
 * materia, luego solo el grupo, y si solo dejó un bloque de tarea, ese
 * vale para todo. Así una tarea puesta como "2º CAR" llega igual aunque
 * en el horario la materia se llame de otra forma.
 */
function expandirDesdeHorario({ profesor, horarios, dia, indice, bloques }) {
  if (!horarios || !dia) return [];

  const mias = horarios.filter(h =>
    h.tipo === 'clase'
    && (h.dia || '').toLowerCase() === dia
    && buscaProfesor(indice, h.profesor_nombre_pdf)?.id === profesor.id);

  const norm = t => normClave(t || '');
  const unico = bloques.length === 1 ? bloques[0] : null;

  return mias.map(h => {
    const tarea =
      bloques.find(b => norm(b.grupo) === norm(h.grupo) && norm(b.materia) === norm(h.materia))
      || bloques.find(b => norm(b.grupo) === norm(h.grupo))
      || unico
      || {};

    return {
      hora: normHora(h.hora_id),
      tipo: 'clase',
      grupo: h.grupo || '',
      materia: h.materia || '',
      instrucciones: tarea.instrucciones || null,
      archivo_url: tarea.archivo_url || null,
      archivo_nombre: tarea.archivo_nombre || null,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// El reparto
// ─────────────────────────────────────────────────────────────

/**
 * Calcula las asignaciones de una hora concreta.
 *
 * Devuelve [{ hueco, hora, grupo, aula, materia, instrucciones,
 *             cubre, escalon, motivo }].
 * `cubre` es null cuando no hay nadie: el hueco se devuelve igual.
 */
export function asignacionesDeHora({
  hora,
  dia,
  huecos,                    // salida de prepararHuecos
  cuadrante,                 // .porSector de construirCuadrante
  horarios,
  profesores,
  apoyosPorProfesor = {},    // id → guardias FICHADAS
  apoyosFueraPorSector = {}, // sector → guardias FICHADAS cubriendo fuera
  yaCubiertos = [],          // [{ profesorAusenteId, hora }] intocables
  ocupadosIds = null,
}) {
  const h = normHora(hora);
  const enClase = ocupadosIds || ocupadosEnClase(horarios, profesores, dia, h);
  const tam = tamanoSectores(profesores);
  const indice = indiceProfesores(profesores);

  const ausentesIds = new Set(huecos.map(x => x.profesorId));
  const ocupadosAhora = new Set();   // se va llenando conforme asignamos

  // Los que ya tienen una guardia puesta a mano por dirección no se tocan.
  yaCubiertos.forEach(c => {
    if (normHora(c.hora) === h && c.profesorId) ocupadosAhora.add(c.profesorId);
  });

  const cubiertoYa = hueco => yaCubiertos.some(c =>
    normHora(c.hora) === h && c.profesorAusenteId === hueco.profesorId);

  // Candidatos: todo el que esté de guardia esa hora, salvo recreo.
  const candidatos = [];
  Object.entries(cuadrante || {}).forEach(([sector, porDia]) => {
    if (esSectorRecreo(sector)) return;
    (porDia?.[dia]?.[h] || []).forEach(p => {
      candidatos.push({ ...p, sector: normSector(sector) });
    });
  });

  const cargaSector = sector => {
    const s = normSector(sector);
    const n = tam[s] || 1;
    return (apoyosFueraPorSector[s] || 0) / n;
  };

  const elegir = hueco => {
    const sectorHueco = normSector(hueco.sector);

    const libres = candidatos.filter(c =>
      c.id !== hueco.profesorId
      && !ausentesIds.has(c.id)
      && !ocupadosAhora.has(c.id)
      && !enClase.has(c.id));

    if (libres.length === 0) return null;

    // Escalón 0: el propio sector del ausente.
    const propios = libres.filter(c => c.sector === sectorHueco);
    if (propios.length > 0) {
      propios.sort((a, b) =>
        (mismoDepto(b, hueco) - mismoDepto(a, hueco))
        || ((apoyosPorProfesor[a.id] || 0) - (apoyosPorProfesor[b.id] || 0))
        || a.nombre.localeCompare(b.nombre, 'es'));
      return { elegido: propios[0], escalon: 0, motivo: 'mismo sector' };
    }

    // Escalón 1: el otro lado, por rotación proporcional de departamento.
    const resto = [...libres].sort((a, b) =>
      (cargaSector(a.sector) - cargaSector(b.sector))
      || ((apoyosPorProfesor[a.id] || 0) - (apoyosPorProfesor[b.id] || 0))
      || a.nombre.localeCompare(b.nombre, 'es'));

    return { elegido: resto[0], escalon: 1, motivo: 'rotación entre departamentos' };
  };

  const mismoDepto = (cand, hueco) =>
    hueco.departamento && normSector(cand.departamento) === normSector(hueco.departamento) ? 1 : 0;

  // Orden de atención: primero el propio sector (más fácil de casar),
  // después por nombre, para que el resultado sea siempre el mismo.
  const pendientes = huecos
    .filter(x => x.horas.some(hh => horaCoincide(hh.hora, h)))
    .filter(x => !cubiertoYa(x))
    .sort((a, b) => a.profesor.localeCompare(b.profesor, 'es'));

  const salida = [];

  for (const hueco of pendientes) {
    const detalle = hueco.horas.find(hh => horaCoincide(hh.hora, h)) || {};
    const clase = (horarios || []).find(x =>
      x.tipo === 'clase'
      && (x.dia || '').toLowerCase() === dia
      && normHora(x.hora_id) === h
      && buscaProfesor(indice, x.profesor_nombre_pdf)?.id === hueco.profesorId) || {};

    const r = elegir(hueco);
    if (r) ocupadosAhora.add(r.elegido.id);

    salida.push({
      hueco,
      hora: h,
      grupo: detalle.grupo || clase.grupo || '',
      aula: clase.aula || '',
      materia: clase.materia || '',
      instrucciones: detalle.instrucciones || hueco.motivoDireccion || '',
      cubre: r ? {
        profesorId: r.elegido.id,
        nombre: r.elegido.nombre,
        sector: r.elegido.sector,
        departamento: r.elegido.departamento,
      } : null,
      escalon: r ? r.escalon : null,
      motivo: r ? r.motivo : 'sin cubrir: nadie disponible',
    });
  }

  return salida;
}

/**
 * Fichajes de recreo: salen del cuadrante tal cual, haya o no ausencias.
 * No sustituyen a nadie y no entran en la rotación.
 */
export function fichajesDeRecreo({ cuadrante, dia, profesoresAusentes = [] }) {
  const fuera = new Set(profesoresAusentes);
  const salida = [];
  Object.entries(cuadrante || {}).forEach(([sector, porDia]) => {
    if (!esSectorRecreo(sector)) return;
    (porDia?.[dia]?.['recreo'] || []).forEach(p => {
      if (fuera.has(p.id)) return;
      salida.push({
        profesorId: p.id,
        nombre: p.nombre,
        zona: p.zona || sector,
        hora: 'recreo',
        tipo: 'recreo',
      });
    });
  });
  return salida;
}
