import { getSupabase } from '@/lib/supabase';
import { hoyLocal, sumarDias } from '@/lib/fechas';

// Cache en memoria para no consultar la BD en cada llamada
let _cache = null;
let _cacheAt = 0;
const TTL = 60000; // 1 minuto

/**
 * Devuelve la configuración del curso activo junto con sus periodos no lectivos.
 * Si no hay ningún curso configurado, devuelve valores por defecto razonables.
 */
export async function getConfigCurso(forzar = false) {
  if (!forzar && _cache && Date.now() - _cacheAt < TTL) return _cache;

  try {
    const { data: cfgs } = await getSupabase()
      .from('config_centro')
      .select('*')
      .eq('activo', true);

    const cfg = (cfgs || [])[0] || null;

    let periodos = [];
    if (cfg) {
      const { data: per } = await getSupabase()
        .from('periodos_no_lectivos')
        .select('*')
        .eq('curso', cfg.curso);
      periodos = per || [];
    }

    _cache = { config: cfg, periodos, configurado: !!cfg };
    _cacheAt = Date.now();
    return _cache;
  } catch (e) {
    return { config: null, periodos: [], configurado: false };
  }
}

/**
 * Curso académico activo, en formato '2026-2027'.
 *
 * Estaba escrito a mano en 20 sitios del portal. Al cambiar de curso en
 * septiembre, todas esas consultas seguirían buscando el curso anterior:
 * el cuadrante de guardias saldría vacío y las ausencias no cruzarían
 * con los horarios. Ahora sale de config_centro, que es donde se
 * configura el curso desde Datos del centro.
 */
export async function getCursoActual() {
  const cfg = await getConfigCurso();
  return cfg?.config?.curso || cursoPorFecha();
}

/** Si no hay curso configurado, se deduce de la fecha (septiembre a agosto) */
export function cursoPorFecha(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth(); // 0 = enero
  return mes >= 8 ? anio + '-' + (anio + 1) : (anio - 1) + '-' + anio;
}

/**
 * Días hábiles entre dos fechas, sin contar el día de partida.
 *
 * La Resolución de 18/07/2024 pide la solicitud de DLD con una antelación
 * mínima de 2 días hábiles y máxima de 30. Son días HÁBILES, no naturales:
 * pedir el viernes para el lunes son cero días hábiles de margen, aunque
 * pasen tres de calendario.
 *
 * Se descuentan fines de semana y los periodos no lectivos configurados
 * en Datos del centro (Navidad, Semana Santa, festivos locales...).
 * No se descuentan los días de septiembre y junio sin alumnado, porque
 * siguen siendo días de trabajo en el centro.
 */
export function diasHabilesEntre(desde, hasta, cfg) {
  if (!desde || !hasta || hasta <= desde) return 0;

  const periodos = cfg?.periodos || [];
  const enVacaciones = f => periodos.some(p => f >= p.fecha_inicio && f <= p.fecha_fin);

  let cuenta = 0;
  let fecha = sumarDias(desde, 1);       // el día de hoy no cuenta
  let vueltas = 0;

  while (fecha <= hasta && vueltas < 400) {   // tope de seguridad
    const d = new Date(fecha + 'T12:00:00').getDay();
    if (d !== 0 && d !== 6 && !enVacaciones(fecha)) cuenta++;
    fecha = sumarDias(fecha, 1);
    vueltas++;
  }
  return cuenta;
}

/**
 * ¿Está la solicitud dentro de plazo?
 *
 * Devuelve qué pasa con esa fecha, para que la pantalla decida:
 *   estado 'ok'          → dentro de plazo
 *   estado 'muy_pronto'  → más de 30 días hábiles: NO se puede pedir
 *   estado 'muy_tarde'   → menos de 2: solo vale por causa sobrevenida
 */
export function plazoSolicitudDLD(fechaSolicitada, cfg, hoy = null) {
  const desde = hoy || hoyLocal();
  if (!fechaSolicitada) return { estado: 'ok', habiles: null };

  const habiles = diasHabilesEntre(desde, fechaSolicitada, cfg);

  if (habiles > 30) {
    return {
      estado: 'muy_pronto', habiles,
      mensaje: `La normativa permite solicitarlo como máximo con 30 días hábiles de antelación, y faltan ${habiles}. Podrás pedirlo más adelante.`,
    };
  }
  if (habiles < 2) {
    return {
      estado: 'muy_tarde', habiles,
      mensaje: habiles === 0
        ? 'La normativa pide 2 días hábiles de antelación y no queda ninguno. Solo cabe por causa sobrevenida (enfermedad, hospitalización o fallecimiento de un familiar).'
        : `La normativa pide 2 días hábiles de antelación y solo queda ${habiles}. Solo cabe por causa sobrevenida (enfermedad, hospitalización o fallecimiento de un familiar).`,
    };
  }
  return { estado: 'ok', habiles };
}

/** Número de profesores de la plantilla (para los límites de DLD) */
export function numProfesores(cfg, porDefecto = 150) {
  return cfg?.config?.num_profesores || porDefecto;
}

/**
 * Clasifica un día del calendario. Es la función que decide qué se puede
 * pedir y con qué cupo.
 *
 *   'finde'        → sábado o domingo
 *   'fuera_curso'  → antes del inicio o después del fin del curso escolar
 *   'vacaciones'   → Navidad, Semana Santa... No se trabaja, no se pide DLD
 *   'sin_alumnado' → laborable pero sin clases (primeros días de septiembre,
 *                    últimos de junio). SÍ se pide DLD, con el cupo alto de 1/3
 *   'lectivo'      → día normal de clase
 */
export function clasificarDia(fecha, cfg) {
  if (!fecha) return { tipo: 'lectivo', motivo: null };

  const d = new Date(fecha + 'T12:00:00');
  const n = d.getDay();
  if (n === 0 || n === 6) return { tipo: 'finde', motivo: 'Fin de semana' };

  // Sin configuración no podemos afinar: se asume día de clase
  if (!cfg?.configurado) return { tipo: 'lectivo', motivo: null };
  const k = cfg.config;

  if (k.fecha_inicio_curso && fecha < k.fecha_inicio_curso)
    return { tipo: 'fuera_curso', motivo: 'El curso aún no ha empezado' };
  if (k.fecha_fin_curso && fecha > k.fecha_fin_curso)
    return { tipo: 'fuera_curso', motivo: 'El curso ya ha terminado' };

  // Vacaciones: no se trabaja
  for (const p of (cfg.periodos || [])) {
    if (fecha >= p.fecha_inicio && fecha <= p.fecha_fin)
      return { tipo: 'vacaciones', motivo: p.nombre };
  }

  // Dentro del curso pero fuera del periodo lectivo:
  // se trabaja, pero no hay alumnado
  if (k.fecha_inicio_lectivo && fecha < k.fecha_inicio_lectivo)
    return { tipo: 'sin_alumnado', motivo: 'Aún no han empezado las clases' };
  if (k.fecha_fin_lectivo && fecha > k.fecha_fin_lectivo)
    return { tipo: 'sin_alumnado', motivo: 'Las clases ya han terminado' };

  return { tipo: 'lectivo', motivo: null };
}

/** ¿Se puede solicitar un DLD ese día? */
export function sePuedePedirDLD(fecha, cfg) {
  const t = clasificarDia(fecha, cfg).tipo;
  return t === 'lectivo' || t === 'sin_alumnado';
}

/**
 * ¿Ese día hay clase con alumnado?
 * Devuelve { lectivo, motivo } — motivo explica por qué no lo es.
 */
export function esDiaLectivo(fecha, cfg) {
  if (!fecha) return { lectivo: true, motivo: null };

  // Fin de semana
  const d = new Date(fecha + 'T12:00:00');
  const diaSemana = d.getDay();
  if (diaSemana === 0 || diaSemana === 6) {
    return { lectivo: false, motivo: 'Es fin de semana' };
  }

  // Sin configuración no podemos afinar: se asume lectivo
  if (!cfg?.configurado) return { lectivo: true, motivo: null };

  const c = cfg.config;

  // Fuera del periodo lectivo del curso
  if (c.fecha_inicio_lectivo && fecha < c.fecha_inicio_lectivo) {
    return { lectivo: false, motivo: 'Aún no han comenzado las clases' };
  }
  if (c.fecha_fin_lectivo && fecha > c.fecha_fin_lectivo) {
    return { lectivo: false, motivo: 'Las clases ya han finalizado' };
  }

  // Dentro de un periodo de vacaciones
  for (const p of (cfg.periodos || [])) {
    if (fecha >= p.fecha_inicio && fecha <= p.fecha_fin) {
      return { lectivo: false, motivo: p.nombre };
    }
  }

  return { lectivo: true, motivo: null };
}

/** ¿La fecha cae dentro del curso académico? */
export function dentroDelCurso(fecha, cfg) {
  if (!cfg?.configurado || !fecha) return true;
  const c = cfg.config;
  if (c.fecha_inicio_curso && fecha < c.fecha_inicio_curso) return false;
  if (c.fecha_fin_curso    && fecha > c.fecha_fin_curso)    return false;
  return true;
}

/**
 * Años de antigüedad a partir del año de incorporación.
 * Si el profesor tiene el dato antiguo (años acumulados), se respeta.
 */
export function calcularAntiguedad(anioIncorporacion, aniosAntiguos, cfg) {
  if (anioIncorporacion) {
    const cursoRef = cfg?.config?.curso
      ? parseInt(cfg.config.curso.split('-')[0])
      : new Date().getFullYear();
    return Math.max(0, cursoRef - parseInt(anioIncorporacion));
  }
  return aniosAntiguos || 0;
}

/**
 * Límite de profesores que pueden tener DLD un día concreto.
 * ÚNICO sitio donde se calcula: si cambia la norma, se cambia aquí.
 *
 *  - Día lectivo     → escalón por tamaño de plantilla (máx. 4)
 *  - Día NO lectivo  → un tercio de la plantilla
 *
 * Devuelve { limite, esLectivo, motivo, plantilla }
 */
export function limiteDLD(fecha, cfg, tipoDld = null) {
  const plantilla = numProfesores(cfg);
  const clase = fecha ? clasificarDia(fecha, cfg) : { tipo: 'lectivo', motivo: null };

  // El tipo declarado en la solicitud manda sobre el calendario:
  // permite pedir "no lectivo" en días que la app no tiene configurados.
  const esLectivo = tipoDld === 'no_lectivo' ? false : (clase.tipo === 'lectivo');

  const limite = esLectivo
    ? (plantilla > 60 ? 4 : plantilla > 40 ? 3 : plantilla > 20 ? 2 : 1)
    : Math.floor(plantilla / 3);

  return { limite, esLectivo, motivo: clase.motivo, tipo: clase.tipo, plantilla };
}

/** Limpia la caché (tras guardar cambios en la configuración) */
export function limpiarCacheCurso() {
  _cache = null;
  _cacheAt = 0;
}
