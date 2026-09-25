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

import { departamentoASector, esSectorFP, esSectorRecreo, normSector, sinTildes } from '@/lib/sectores';

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
 * La fecha y la hora AHORA MISMO en el centro.
 *
 * El servidor va en UTC: a las 10:30 de la mañana en Valdepeñas creería
 * que son las 8:30 y no dejaría fichar a nadie. Todo lo que dependa del
 * reloj tiene que mirar la hora española, no la del servidor.
 */
export function ahoraEnCentro(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(ahora).reduce((o, p) => (o[p.type] = p.value, o), {});

  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

/**
 * ¿Estamos dentro de la franja? Es lo que abre y cierra el check.
 *
 * Se puede fichar únicamente durante la hora de la guardia: ni antes de
 * que empiece ni después de que acabe.
 */
export function dentroDeFranja(horaId, fecha, ahora = new Date()) {
  const f = franja(horaId);
  if (!f || !fecha) return false;

  const centro = ahoraEnCentro(ahora);
  if (centro.fecha !== fecha) return false;

  const aMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  // El inicio es inclusivo y el fin exclusivo para que dos horas
  // consecutivas no estén activas a la vez (a las 9:25 no puede
  // ser 1ª y 2ª al mismo tiempo).
  return centro.minutos >= aMin(f.inicio) && centro.minutos < aMin(f.fin);
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
 * Clave laxa: tres letras del primer apellido + TRES letras del nombre.
 *
 * Antes usaba solo la primera inicial del nombre ("gar|a"), lo que era
 * ambiguo para cualquier par como García Cámara/Alfonso y García
 * Casarrubios/Arturo: los dos producían "gar|a" y el motor no podía
 * distinguirlos.
 *
 * Con tres letras ("gar|alf" vs "gar|art") el margen de colisión se
 * reduce drásticamente. No es perfecto, pero los casos reales que se
 * han visto hasta ahora se resuelven.
 *
 * Si dos personas siguen colisionando, la equivalencia confirmada a mano
 * tiene prioridad absoluta y resuelve el caso sin que haya nada que
 * adivinar.
 */
export function claveLaxa(apellidos, nombre) {
  const raiz = (apellidos || '').trim().split(/\s+/)[0] || '';
  const nom  = (nombre || '').trim().split(/\s+/).filter(Boolean).map(p => p[0]).join('');
  const nom3 = (nombre || '').trim().split(/\s+/).filter(Boolean)[0]?.slice(0, 3) || nom;
  if (!raiz || !nom) return '';
  return normClave(`${raiz.slice(0, 3)}|${nom3}`);
}

// La misma clave, pero a partir de una abreviatura del cuadrante.
// "Gar. M, JL" → raiz="gar", nombre="jl" (dos iniciales: se quedan así,
// porque la abreviatura no da más).
// "Gar. M, Alf." → raiz="gar", nombre="alf" (tres letras cuando el
// cuadrante trae el nombre abreviado con punto).
export function claveLaxaDeAbreviatura(abrev) {
  const [ap, nom] = (abrev || '').split(',');
  if (!ap || !nom) return '';
  const raiz    = ap.trim().replace(/\..*$/, '').trim();
  const nomLimp = nom.replace(/\./g, '').trim();
  // Si el cuadrante trae el nombre como iniciales sueltas ("JL", "AF"),
  // las usamos tal cual. Si trae un fragmento más largo ("Alf", "Art"),
  // lo cortamos a tres letras para que case con claveLaxa().
  const nom3    = nomLimp.length <= 2 ? nomLimp : nomLimp.slice(0, 3);
  return normClave(`${raiz.slice(0, 3)}|${nom3}`);
}

/**
 * Tercera red: compatibilidad de iniciales.
 *
 * Ni Delphos ni las fichas escriben los nombres igual, y ninguno de los
 * dos es coherente consigo mismo. Delphos abrevia "Jiménez Jiménez, Eva
 * María" como "Jim. J, E" y la ficha daría "EM". La ficha de "Aguilar
 * Casado, Victoria" no trae el "María" que el cuadrante sí escribe
 * ("Agu. C, MV"). Los apellidos con guion los cuenta Delphos como dos
 * ("Cor. SM, A") y la ficha como uno.
 *
 * Por eso ya no se fabrica una abreviatura exigiendo que case letra por
 * letra: se comprueba que las iniciales de un lado quepan dentro de las
 * del otro. Si encaja exactamente una persona, es esa. Si encajan dos, no
 * se asigna a nadie.
 *
 * El apellido nunca se inventa: si el cuadrante dice que hay un segundo
 * apellido y la ficha no lo tiene, no hay emparejamiento. Eso se arregla
 * completando la ficha, no adivinando.
 */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'd']);

function esSubsecuencia(corta, larga) {
  let i = 0;
  for (const c of larga) if (c === corta[i]) i++;
  return i === corta.length;
}

function inicialesCompatibles(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return esSubsecuencia(a, b) || esSubsecuencia(b, a);
}

// En el nombre sí se admite que un lado calle: "Eva María" y "Eva" son
// la misma persona. En el apellido no.
function nombreCompatible(a, b) {
  if (!a || !b) return true;
  return inicialesCompatibles(a, b);
}

/**
 * ¿Esto es una abreviatura del cuadrante ("Gar. M, JL") o un nombre
 * completo ("Abaldea García Pliego, Manuel José")? La red solo vale para
 * abreviaturas: con un nombre completo compararía cosas que no son
 * iniciales.
 */
export function pareceAbreviatura(texto) {
  const t = (texto || '').trim();
  if (!t.includes('.') && !t.includes(',')) return false;
  const primero = t.split(/[.,]/)[0].trim();
  return primero.length > 0 && primero.length <= 4;
}

/**
 * "Gar. M, JL" → { raiz:'gar', apIniciales:'m', nomIniciales:'jl' }
 * Tolera los renglones que Delphos escribe torcidos, con la coma y el
 * punto cambiados de sitio: "Cre, V. P", "Pad, B. EV".
 */
export function trozosDeAbreviatura(abrev) {
  const trozos = (abrev || '').split(/[.,]/).map(t => t.trim()).filter(Boolean);
  if (trozos.length === 0) return null;
  return {
    raiz: normClave(trozos[0]).slice(0, 3),
    apIniciales: normClave(trozos[1] || ''),
    nomIniciales: normClave(trozos[2] || ''),
  };
}

/**
 * Todas las formas en que Delphos podría abreviar a esta persona.
 */
export function variantesDeFicha(p) {
  const apellidos = (p.apellidos || '').replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  const trozos = apellidos.split(' ').filter(Boolean);
  const resto = trozos.slice(1);
  const unaLetra = normClave(resto.map(t => t[0]).join(''));
  const porGuion = normClave(resto.map(t => t.split('-').map(x => x[0]).join('')).join(''));
  // Si el guion está en el PRIMER apellido, Delphos se lleva la segunda
  // mitad al grupo siguiente: "Díaz-Parreño Torres" → "Dia. PT".
  const mitad = trozos[0]?.includes('-')
    ? normClave(trozos[0].split('-')[1]?.[0] || '')
    : '';

  const nombre = (p.nombre || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const todas = normClave(nombre.map(t => t[0]).join(''));
  const sinParticulas = normClave(
    nombre.filter(t => !PARTICULAS.has(normClave(t))).map(t => t[0]).join('')
  );

  return {
    p,
    raiz: normClave(trozos[0] || '').slice(0, 3),
    apVariantes: [...new Set([unaLetra, porGuion, mitad + unaLetra, mitad + porGuion])].filter(Boolean),
    nomVariantes: [...new Set([todas, sinParticulas])].filter(Boolean),
  };
}

function casaConVariantes(t, v, apellidoComodin = false) {
  if (v.raiz !== t.raiz) return false;
  const apOk = (apellidoComodin && v.apVariantes.length === 0)
    ? true
    : v.apVariantes.some(a => inicialesCompatibles(t.apIniciales, a));
  if (!apOk) return false;
  return v.nomVariantes.some(n => nombreCompatible(t.nomIniciales, n));
}

/**
 * ¿PUEDE esta abreviatura del cuadrante ser esta persona?
 *
 * Esto NO sirve para asignar: sirve para PREGUNTAR. Como quien decide es
 * el propio profesor, aquí se puede ser más generoso que en el motor y
 * admitir que la ficha se haya quedado sin segundo apellido — que es
 * justo el caso que el motor no puede resolver solo ("Checa, Javier" en
 * la ficha, "Che. G, J" en el cuadrante).
 *
 * Nunca se asigna nada por esta vía sin que la persona lo confirme.
 */
export function puedeSerLaMisma(nombrePdf, profesor) {
  if (!profesor || !pareceAbreviatura(nombrePdf)) return false;
  const t = trozosDeAbreviatura(nombrePdf);
  if (!t || !t.raiz) return false;
  return casaConVariantes(t, variantesDeFicha(profesor), true);
}

/**
 * Índice de profesores por sus dos claves.
 * Si dos personas comparten abreviatura ("Gar. M, JL" puede ser García
 * Moreno o García Muñoz), la clave queda ambigua y NO se asigna a nadie:
 * mejor un hueco en rojo que un profesor en un aula que no le toca.
 */
export function indiceProfesores(profesores, equivalencias = []) {
  const estrictas = {};
  const apunta = (mapa, clave, p) => {
    if (!clave) return;
    const lista = mapa[clave] = mapa[clave] || [];
    if (!lista.some(x => x.id === p.id)) lista.push(p);
  };
  (profesores || []).forEach(p => {
    apunta(estrictas, claveCompleta(p.apellidos, p.nombre), p);
    apunta(estrictas, claveAbreviada(p.apellidos, p.nombre), p);
  });

  // Equivalencias confirmadas a mano desde Personal. El horario de
  // Delphos y la ficha del profesor no siempre coinciden ("García
  // López-Tello, Pilar" en el horario, "María del Pilar" en su ficha), y
  // cuando no casan ese profesor no existe para el motor. Aquí no se
  // deduce nada: alguien lo confirmó, y eso manda por encima de
  // cualquier parecido.
  const confirmadas = {};
  (equivalencias || []).forEach(e => {
    const p = (profesores || []).find(x => x.id === e.profesor_id);
    if (p && e.nombre_horario) confirmadas[normClave(e.nombre_horario)] = p;
  });

  return {
    estrictas,
    confirmadas,
    variantes: (profesores || []).map(variantesDeFicha),
  };
}

export function buscaProfesor(indice, nombrePdf) {
  const { estrictas = {}, confirmadas = {}, variantes = [] } = indice || {};

  // Lo confirmado a mano manda siempre: no se discute ni se compara.
  const aMano = confirmadas[normClave(nombrePdf)];
  if (aMano) return aMano;

  const exacta = estrictas[normClave(nombrePdf)] || [];
  if (exacta.length === 1) return exacta[0];
  if (exacta.length > 1) return null;   // ambigua: mejor nadie que quien no es

  // Red de seguridad por compatibilidad de iniciales. Sustituye a la
  // clave laxa anterior, que sobre los datos reales del centro no
  // resolvía ni un solo caso: construía la clave del profesorado con las
  // tres primeras letras del nombre ("gar|jos") y la del cuadrante con
  // las iniciales ("gar|jl"), y nunca podían coincidir.
  if (!pareceAbreviatura(nombrePdf)) return null;

  const t = trozosDeAbreviatura(nombrePdf);
  if (!t || !t.raiz) return null;

  // Para asignar automáticamente hacen falta las dos partes: iniciales de
  // apellido E iniciales de nombre. Con una sola ("San. E") no se sabe
  // siquiera cuál de las dos es, y se acaba dando por buena a la persona
  // equivocada. Esos casos los resuelve el propio profesor desde el
  // aviso "¿Eres tú?", que sí puede preguntar.
  if (!t.apIniciales || !t.nomIniciales) return null;

  const compatibles = variantes.filter(v => casaConVariantes(t, v));

  return compatibles.length === 1 ? compatibles[0].p : null;
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
export function construirCuadrante(horarios, profesores, equivalencias = []) {
  const indice = indiceProfesores(profesores, equivalencias);
  const porSector = {};
  const sinResolver = new Set();

  (horarios || []).filter(h => h.tipo === 'guardia').forEach(g => {
    const sector = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
    const hora = normHora(g.hora_id);
    const dia = (g.dia || '').toLowerCase();
    const prof = buscaProfesor(indice, g.profesor_nombre_pdf);

    /**
     * El que no sabemos quién es SIGUE ESTANDO DE GUARDIA.
     *
     * Que su nombre abreviado no case con ninguna ficha es un problema
     * nuestro, no del reparto: el cuadrante dice que esa persona está de
     * guardia en ese departamento a esa hora. Antes se descartaba, su
     * departamento parecía tener una persona menos y bajaba alguien de
     * otro sitio sin hacer falta.
     *
     * Entra como candidato de su propio departamento, pero el último de
     * los suyos: si hay alguien identificado, va primero, porque a ese sí
     * se le puede avisar. Y cuando se le asigna una guardia, queda a su
     * nombre del cuadrante, sin dueño, hasta que alguien la reclame desde
     * la aplicación y se identifique de paso.
     */
    const ficha = prof || {
      id: null,
      nombre: g.profesor_nombre_pdf,
      departamento: '',
      sinIdentificar: true,
    };
    if (!prof) sinResolver.add(g.profesor_nombre_pdf);

    const clave = prof ? prof.id : `sin:${normClave(g.profesor_nombre_pdf)}`;

    porSector[sector] = porSector[sector] || {};
    porSector[sector][dia] = porSector[sector][dia] || {};
    porSector[sector][dia][hora] = porSector[sector][dia][hora] || [];
    if (!porSector[sector][dia][hora].some(p => (p.id || p.clave) === clave)) {
      porSector[sector][dia][hora].push({
        id: ficha.id,
        clave,
        nombre: prof ? nombreDe(prof) : g.profesor_nombre_pdf,
        nombrePdf: g.profesor_nombre_pdf,
        sinIdentificar: !prof,
        departamento: ficha.departamento || '',
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
export function ocupadosEnClase(horarios, profesores, dia, hora, equivalencias = []) {
  const indice = indiceProfesores(profesores, equivalencias);
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
// Tampoco una hora LIBRE: el DLD guarda todas las horas del día, también
// las que no tiene nada, y sin esto cada hora libre salía como un hueco sin
// grupo que alguien tenía que cubrir.
function esHoraDeGuardia(h) {
  // Solo una hora de CLASE tiene alumnos esperando. Guardia, complementaria
  // (reuniones, atención a familias...), libre o recreo no se cubren. Las
  // horas sin tipo (tareas por módulo de ausencias antiguas) se dejan pasar.
  const tipo = (h?.tipo || '').toLowerCase();
  if (tipo && !tipo.includes('clase')) return true;
  return esSectorRecreo(h?.grupo);
}

export function prepararHuecos(faltas, profesores, opciones = {}) {
  const { horarios = null, dia = null, equivalencias = [] } = opciones;
  const indice = indiceProfesores(profesores, equivalencias);
  const salida = [];

  for (const falta of faltas || []) {
    const prof = (profesores || []).find(p => p.id === falta.profesor_id);
    if (!prof) continue;

    const declaradas = (falta.horas || []).filter(h => !esHoraDeGuardia(h));
    // Horas concretas que marcó, sean del tipo que sean. Si solo marcó una
    // reunión o una guardia, sigue siendo una falta por horas: no hay nada
    // que cubrir, pero NO es un día entero.
    const marcadas = (falta.horas || []).filter(h => esHoraReal(h.hora));
    const porHoras = declaradas.filter(h => esHoraReal(h.hora));

    // Si lo que hay son horas de verdad, mandan ellas. Si no (bloques por
    // módulo de una ausencia larga, o una baja sin horas), se saca del horario.
    const horas = marcadas.length > 0
      ? porHoras
      : expandirDesdeHorario({ profesor: prof, horarios, dia, indice, bloques: declaradas });

    /**
     * ¿ESTÁ EN EL CENTRO EL RESTO DEL DÍA?
     *
     * Son dos cosas distintas y hay que guardarlas por separado:
     *
     *   'horas'        → las horas de CLASE que hay que cubrir. Solo esas
     *                    generan hueco; las de guardia no se sustituyen.
     *   'horasAusente' → las horas en que la persona NO ESTÁ. Incluye
     *                    también sus horas de guardia, porque quien no
     *                    viene tampoco puede cubrir a nadie.
     *
     * Una baja o una ausencia larga no declara horas concretas: esa
     * persona falta el día entero, y no puede aparecer como candidata a
     * guardia a ninguna hora.
     */
    // Un DLD es siempre el día entero, aunque en sus horas guardadas falte
    // alguna (le pasó a uno cuya guardia de 3ª no quedó apuntada y el motor
    // le puso a cubrir a esa hora estando de DLD).
    const esDld = (falta.origen || falta.tipo_falta) === 'dld';
    const diaCompleto = esDld || marcadas.length === 0;
    const horasAusente = diaCompleto
      ? null
      : (falta.horas || []).map(h => normHora(h.hora)).filter(Boolean);

    salida.push({
      profesorId: falta.profesor_id,
      profesor: nombreDe(prof),
      departamento: prof.departamento || '',
      sector: sectorDe(prof),
      origen: falta.origen || falta.tipo_falta || 'ausencia',
      motivoDireccion: falta.motivo || '',
      registroId: falta.id || null,
      horas,
      diaCompleto,
      horasAusente,
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
  equivalencias = [],        // confirmadas a mano en Personal
}) {
  const h = normHora(hora);
  const enClase = ocupadosIds || ocupadosEnClase(horarios, profesores, dia, h);
  const tam = tamanoSectores(profesores);
  const indice = indiceProfesores(profesores, equivalencias);

  /**
   * Ausente A ESTA HORA, no en todo el día.
   *
   * Un compañero que falta a 1ª por el médico está en el centro a 4ª, y
   * si a 4ª le toca guardia, cuenta como cualquier otro. Antes se le
   * quitaba de la lista de candidatos la jornada entera: su sector
   * parecía tener una persona menos a todas las horas y se acababa
   * bajando gente de otro departamento sin necesidad.
   */
  /**
   * QUIÉN NO ESTÁ EN EL CENTRO A ESTA HORA.
   *
   * No es lo mismo "hay que cubrirle esta hora" que "no ha venido". Quien
   * está de baja, o falta el día entero, no puede cubrir a nadie a
   * NINGUNA hora, aunque a esa hora le tocara guardia y por tanto no
   * genere ningún hueco que cubrir.
   *
   * Y al revés: quien falta a 1ª por el médico está en el centro a 4ª, y
   * si a 4ª le toca guardia, la hace como cualquier otro.
   */
  const ausentesIds = new Set(
    huecos
      .filter(x => x.diaCompleto
        || (x.horasAusente || []).some(hh => horaCoincide(hh, h))
        || (x.horas || []).some(hh => horaCoincide(hh.hora, h)))
      .map(x => x.profesorId)
  );
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

  const elegir = (hueco, opciones = {}) => {
    const sectorHueco = normSector(hueco.sector);

    // Los sin identificar no tienen id, así que se les sigue la pista por
    // su clave del cuadrante: hay que poder saber que ya se les ha dado
    // una guardia esta hora.
    const suClave = c => c.id || c.clave;

    const libres = candidatos.filter(c =>
      suClave(c) !== hueco.profesorId
      && !ausentesIds.has(c.id)
      && !ocupadosAhora.has(suClave(c))
      && !enClase.has(c.id));

    if (libres.length === 0) return null;

    // Escalón 0: el propio sector del ausente.
    const propios = libres.filter(c => c.sector === sectorHueco);
    if (propios.length > 0) {
      // Dentro del sector: primero el del mismo departamento, luego el que
      // menos guardias lleve. Si empatan en las dos cosas, se respeta el
      // orden del cuadrante (el ordenado de JavaScript es estable), sin
      // meter el apellido de por medio.
      // Dentro del sector, el sin identificar va el último de los suyos:
      // si hay alguien con nombre, va antes, porque a ese sí se le puede
      // avisar. Pero por delante de cualquiera de otro departamento.
      propios.sort((a, b) =>
        ((a.sinIdentificar ? 1 : 0) - (b.sinIdentificar ? 1 : 0))
        || (mismoDepto(b, hueco) - mismoDepto(a, hueco))
        || ((apoyosPorProfesor[a.id] || 0) - (apoyosPorProfesor[b.id] || 0)));
      return { elegido: propios[0], escalon: 0, motivo: 'mismo sector' };
    }

    // En la primera pasada solo se mira el propio sector: si no hay
    // nadie, este hueco se deja para la segunda vuelta.
    if (opciones.soloPropioSector) return null;

    // Escalón 1: EL OTRO LADO. Es simétrico en los dos sentidos:
    //   falta uno de FP  → entra GENERAL antes que otro departamento de FP
    //   falta uno de GENERAL → entra FP
    // Dentro del escalón manda la rotación proporcional por departamento.
    const huecoEsFP = esSectorFP(sectorHueco);
    const delOtroLado = c => huecoEsFP ? !esSectorFP(c.sector) : esSectorFP(c.sector);

    // Rotación pura: primero el departamento que menos ha bajado a cubrir
    // fuera (en proporción a su tamaño), y dentro de él quien menos
    // guardias lleve. A igualdad total, el orden del cuadrante.
    const porRotacion = lista => [...lista].sort((a, b) =>
      (cargaSector(a.sector) - cargaSector(b.sector))
      || ((apoyosPorProfesor[a.id] || 0) - (apoyosPorProfesor[b.id] || 0)));

    const otroLado = libres.filter(delOtroLado);
    if (otroLado.length > 0) {
      return {
        elegido: porRotacion(otroLado)[0],
        escalon: 1,
        motivo: huecoEsFP ? 'GENERAL por rotación' : 'FP por rotación',
      };
    }

    // Escalón 2: no queda nadie del otro lado. Solo entonces se recurre a
    // otro departamento del mismo lado (otro FP cubriendo a un FP).
    return {
      elegido: porRotacion(libres)[0],
      escalon: 2,
      motivo: 'otro departamento por rotación',
    };
  };

  const mismoDepto = (cand, hueco) =>
    hueco.departamento && normSector(cand.departamento) === normSector(hueco.departamento) ? 1 : 0;

  // Orden de atención: primero el propio sector (más fácil de casar),
  // después por nombre, para que el resultado sea siempre el mismo.
  // No se impone ningún orden entre las ausencias. Antes se ordenaban por
  // apellido, y eso no es ninguna regla del centro: era un criterio que no
  // pintaba nada y que además provocaba que, según qué apellidos faltaran
  // ese día, unas ausencias se llevaran los candidatos antes que otras.
  // Con las dos pasadas de más abajo el orden ya no decide nada: primero
  // cobra cada sector con los suyos, y solo lo que sobra se reparte.
  const pendientes = huecos
    .filter(x => x.horas.some(hh => horaCoincide(hh.hora, h)))
    .filter(x => !cubiertoYa(x));

  const salida = [];

  /**
   * CADA SECTOR RESUELVE LO SUYO, POR SEPARADO.
   *
   * Un sector de guardia es un grupo independiente: los generales cubren
   * a los generales, los de TMV a los de TMV, los de Hostelería a los de
   * Hostelería. Cada grupo se resuelve por su cuenta con los profesores
   * de guardia que tiene, sean uno, dos o tres.
   *
   * Solo cuando un sector se queda corto -- tiene más ausencias que
   * profesores de guardia -- pide ayuda fuera, y entonces se aplica el
   * escalón siguiente (el otro lado primero; otro sector de FP solo si
   * tampoco queda nadie allí).
   *
   * Esto NO es "una primera vuelta y una segunda": es que ningún sector
   * puede llevarse a un profesor de otro mientras ese otro lo necesite
   * para los suyos. Antes se atendían las ausencias de una en una y la
   * primera que llegaba se llevaba lo que hubiera, así que una ausencia
   * de FP podía dejar sin generales a una ausencia de GENERAL.
   */
  const asignado = new Map();

  // Las ausencias, agrupadas por el sector al que pertenecen.
  const porSectorHueco = new Map();
  for (const hueco of pendientes) {
    const sec = normSector(hueco.sector);
    if (!porSectorHueco.has(sec)) porSectorHueco.set(sec, []);
    porSectorHueco.get(sec).push(hueco);
  }

  // Cada grupo, con los suyos.
  for (const [, delSector] of porSectorHueco) {
    for (const hueco of delSector) {
      const r = elegir(hueco, { soloPropioSector: true });
      if (r) {
        ocupadosAhora.add(r.elegido.id || r.elegido.clave);
        asignado.set(hueco, r);
      }
    }
  }

  // Lo que ha quedado sin cubrir en su propio sector: ahora sí se pide fuera.
  for (const hueco of pendientes) {
    if (asignado.has(hueco)) continue;
    const r = elegir(hueco);
    if (r) {
      ocupadosAhora.add(r.elegido.id || r.elegido.clave);
      asignado.set(hueco, r);
    }
  }

  for (const hueco of pendientes) {
    const detalle = hueco.horas.find(hh => horaCoincide(hh.hora, h)) || {};
    const clase = (horarios || []).find(x =>
      x.tipo === 'clase'
      && (x.dia || '').toLowerCase() === dia
      && normHora(x.hora_id) === h
      && buscaProfesor(indice, x.profesor_nombre_pdf)?.id === hueco.profesorId) || {};

    const r = asignado.get(hueco) || null;

    salida.push({
      hueco,
      hora: h,
      grupo: detalle.grupo || clase.grupo || '',
      aula: clase.aula || '',
      materia: clase.materia || '',
      instrucciones: detalle.instrucciones || hueco.motivoDireccion || '',
      cubre: r ? {
        profesorId: r.elegido.id,                    // null si no sabemos quién es
        nombre: r.elegido.nombre,
        nombrePdf: r.elegido.nombrePdf || r.elegido.nombre,
        sinIdentificar: !!r.elegido.sinIdentificar,
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
