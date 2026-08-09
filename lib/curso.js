import { getSupabase } from '@/lib/supabase';

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
