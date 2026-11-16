/**
 * EL HORARIO DE UN GRUPO (en el servidor)
 *
 * Peñalara no exporta el horario de cada grupo, pero se puede reconstruir:
 * es la suma de las horas de todos los profesores que dan clase a ese
 * grupo. Aquí se juntan esas horas y se pone a cada una el nombre de quien
 * la da (si el titular está de baja, el de su sustituto).
 *
 * Lo usan «Mi tutoría» y «Horario de un curso» en /horario.
 *
 * El grupo del horario a veces trae varios códigos pegados
 * («CAII-3101817GB-2CR(5 E008 AUL)CAII-3101177GB-2EE»): una hora así sale
 * en los dos grupos. Y el mismo grupo se escribe distinto según la fuente
 * («4ESO-C» en el alumnado, «ESO-4C» en Peñalara): se compara con
 * mismoGrupo(), que no depende del orden.
 *
 * Caché de 10 minutos en la memoria del servidor (como lib/cacheNombres):
 * el horario no cambia durante el día y así no se descarga entero en cada
 * consulta. Las guardias no se tienen en cuenta: no son horas del grupo.
 */
import { CODIGO_GRUPO } from '@/lib/gruposDelCurso';
import { claveGrupo, mismoGrupo, separarGrupoAula } from '@/lib/grupos';
import { datosNombres } from '@/lib/cacheNombres';

const TTL = 10 * 60 * 1000;
const _cache = new Map(); // curso → { at, promesa }

async function todas(consulta) {
  let filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas = filas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return filas;
}

function codigosDe(texto) {
  const t = String(texto || '').toUpperCase().replace(/\([^)]*\)/g, ' ');
  return [...new Set([...t.matchAll(CODIGO_GRUPO)].map(m => m[0]))];
}

function corto(p) {
  if (!p) return '';
  return `${p.nombre || ''} ${(p.apellidos || '').split(/\s+/)[0] || ''}`.trim();
}

async function cargar(cliente, curso) {
  const [filas, fichas, nombres] = await Promise.all([
    todas(() => cliente.from('horarios_profesores')
      .select('dia, hora_id, tipo, grupo, materia, aula, profesor_nombre_pdf')
      .eq('curso_academico', curso).neq('tipo', 'guardia')),
    todas(() => cliente.from('profesores')
      .select('id, nombre, apellidos, estado, en_baja, titular_id')),
    datosNombres(cliente, curso),
  ]);

  const porId = new Map(fichas.map(p => [p.id, p]));
  // Titular de baja → su sustituto activo
  const sustitutoDe = new Map();
  fichas.filter(p => p.titular_id && p.estado !== 'inactivo')
    .forEach(p => { if (porId.get(p.titular_id)?.en_baja) sustitutoDe.set(p.titular_id, p); });

  const horas = [];
  for (const f of filas) {
    const codigos = codigosDe(f.grupo);
    if (!codigos.length) continue;            // reuniones y horas sin grupo
    const id = nombres.duenio.get(f.profesor_nombre_pdf) || null;
    const titular = id ? porId.get(id) : null;
    const sust = id ? sustitutoDe.get(id) : null;
    horas.push({
      dia: f.dia,
      hora_id: f.hora_id,
      tipo: f.tipo,
      materia: f.materia || '',
      aula: f.aula || separarGrupoAula(f.grupo).aula || '',
      codigos,
      profesor: sust ? corto(sust) : (titular ? corto(titular) : (f.profesor_nombre_pdf || '')),
      sustituye: sust ? corto(titular) : '',
    });
  }

  // Lista de grupos que tienen horario (sin repetidos por forma de escribirlos)
  const porClave = new Map();
  horas.forEach(h => h.codigos.forEach(c => { const k = claveGrupo(c); if (!porClave.has(k)) porClave.set(k, c); }));
  const grupos = [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  return { horas, grupos };
}

function datos(cliente, curso) {
  const e = _cache.get(curso);
  if (e && Date.now() - e.at < TTL) return e.promesa;
  const promesa = cargar(cliente, curso);
  _cache.set(curso, { at: Date.now(), promesa });
  promesa.catch(() => { if (_cache.get(curso)?.promesa === promesa) _cache.delete(curso); });
  return promesa;
}

/** Grupos que tienen horario este curso. */
export async function gruposConHorario(cliente, curso) {
  return (await datos(cliente, curso)).grupos;
}

/**
 * Horas de un grupo. Devuelve también el nombre con el que sale en el
 * horario (puede diferir del de la ficha del tutor: «4ESO-C» / «ESO-4C»).
 */
export async function horarioDeGrupo(cliente, curso, grupo) {
  const { horas, grupos } = await datos(cliente, curso);
  const enHorario = grupos.find(g => mismoGrupo(g, grupo)) || null;
  if (!enHorario) return { grupo: null, horas: [] };
  const suyas = horas
    .filter(h => h.codigos.some(c => mismoGrupo(c, enHorario)))
    .map(({ codigos, ...h }) => ({
      ...h,
      // Si la hora es compartida con otros grupos, se dice con cuáles
      compartida: codigos.filter(c => !mismoGrupo(c, enHorario)).join(', '),
    }));
  return { grupo: enHorario, horas: suyas };
}
