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

/** Limpia la caché (tras guardar cambios en la configuración) */
export function limpiarCacheCurso() {
  _cache = null;
  _cacheAt = 0;
}
