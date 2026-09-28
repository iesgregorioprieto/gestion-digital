/**
 * NOMBRES DE GRUPO
 *
 * El mismo grupo se escribe de varias formas según de dónde venga: en la
 * ficha del tutor alguien teclea "2º DDC", en el listado de alumnos
 * importado de Delphos pone "2DDC", y en otro sitio "2 D.D.C.". Comparar
 * esas cadenas tal cual hace que un tutor no vea a su propia tutoría.
 *
 * Aquí se comparan por su forma reducida: sin tildes, sin espacios, sin
 * puntos ni guiones, sin las voladitas de "1º" o "2ª", y en mayúsculas.
 * "2º DDC", "2 ddc" y "2-DDC" son el mismo grupo.
 */

export function normGrupo(g) {
  return (g || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

/**
 * Clave del grupo que no depende del ORDEN: Delphos escribe «4ESO-C» y
 * Peñalara «ESO-4C»; para normGrupo eran «4ESOC» y «ESO4C», dos grupos
 * distintos, y la lista de grupos salía con cada uno dos veces.
 * La clave es etapa + número + letras: las dos dan «ESO4C».
 */
export function claveGrupo(g) {
  const n = normGrupo(g);
  const m = n.match(/^(\d+)?(ESO|BTO|BACH|GM|GS|GB|FPB|FPPE)(\d+)?(.*)$/);
  if (!m || (!m[1] && !m[3])) return n;
  return `${m[2] === 'BACH' ? 'BTO' : m[2]}${m[1] || m[3]}${m[4]}`;
}

/**
 * ¿Son el mismo grupo? Sin importar tildes, guiones, espacios NI EL ORDEN:
 * «2ESO-A» (escrito a mano en la ficha) y «ESO-2A» (Delphos) son el mismo.
 * Antes solo se quitaban símbolos, y 8 tutores no veían a sus alumnos en
 * autorizaciones y seguro por tener la tutoría escrita «al revés».
 */
export function mismoGrupo(a, b) {
  const x = claveGrupo(a);
  const y = claveGrupo(b);
  return !!x && x === y;
}

/**
 * Devuelve el nombre del grupo TAL COMO ESTÁ GUARDADO, a partir de
 * cualquier forma de escribirlo. Así se consulta con el valor real de la
 * base de datos en vez de con lo que tecleó una persona.
 */
export function resolverGrupo(buscado, existentes = []) {
  if (!buscado) return null;
  const exacto = existentes.find(g => g === buscado);
  if (exacto) return exacto;
  return existentes.find(g => mismoGrupo(g, buscado)) || null;
}
