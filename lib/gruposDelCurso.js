/**
 * LA LISTA DE GRUPOS DEL CURSO (en el servidor) — una sola fuente
 *
 * La usan el desplegable de tutoría (vía /api/alumnos?grupos=1) y la
 * comprobación que hace el servidor al guardar una tutoría: así nunca
 * pueden discrepar lo que se ofrece y lo que se acepta.
 *
 * Se juntan el alumnado, la lista oficial de unidades y los códigos de los
 * horarios, sin duplicados («4ESO-C» y «ESO-4C» son uno), prefiriendo el
 * nombre del ALUMNADO, que es con el que están guardados seguros y
 * autorizaciones.
 */
import { claveGrupo, mismoGrupo } from '@/lib/grupos';

// El código termina donde empieza el siguiente: «BTO-1CTBBTO-1HCS» son dos.
export const CODIGO_GRUPO = /(ESO|BTO|GB|GM|GS|FPPE)-\d+[A-ZÑ0-9.]*?(?=(?:ESO|BTO|GB|GM|GS|FPPE)-|[^A-ZÑ0-9.]|$)/g;

async function todas(cliente, tabla, columnas) {
  let filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await cliente.from(tabla).select(columnas).range(desde, desde + 999);
    if (error || !data) break;
    filas = filas.concat(data);
    if (data.length < 1000) break;
  }
  return filas;
}

/** → { grupos: [nombre], detalle: [{ grupo, alumnos }] } */
export async function gruposDelCurso(cliente) {
  const [oficiales, alumnado, horarios] = await Promise.all([
    todas(cliente, 'grupos', 'codigo'),
    todas(cliente, 'alumnos', 'grupo'),
    todas(cliente, 'horarios_profesores', 'grupo'),
  ]);
  const deHorarios = new Set();
  horarios.forEach(h => { for (const m of String(h.grupo || '').toUpperCase().matchAll(CODIGO_GRUPO)) deHorarios.add(m[0]); });

  const porClave = new Map();
  for (const g of [...alumnado.map(a => a.grupo), ...oficiales.map(o => o.codigo), ...deHorarios]) {
    if (!g) continue;
    const k = claveGrupo(g);
    if (!porClave.has(k)) porClave.set(k, g);
  }
  const grupos = [...porClave.values()].sort((a, b) => a.localeCompare(b, 'es'));
  const cuenta = {};
  alumnado.forEach(a => { if (a.grupo) { const k = claveGrupo(a.grupo); cuenta[k] = (cuenta[k] || 0) + 1; } });
  return { grupos, detalle: grupos.map(g => ({ grupo: g, alumnos: cuenta[claveGrupo(g)] || 0 })) };
}

/**
 * ¿Es un grupo de tutoría válido? Devuelve el nombre oficial del grupo, o
 * null si no existe este curso. Vacío = «sin tutoría», que es válido.
 */
export async function grupoTutoriaValido(cliente, valor) {
  const v = String(valor || '').trim();
  if (!v) return { ok: true, grupo: null };
  const { grupos } = await gruposDelCurso(cliente);
  const g = grupos.find(x => mismoGrupo(x, v));
  return g ? { ok: true, grupo: g } : { ok: false };
}

export const MENSAJE_TUTORIA = 'Elige tu grupo de tutoría en el desplegable: no se puede escribir a mano.';
