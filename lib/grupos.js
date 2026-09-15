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

export function mismoGrupo(a, b) {
  const x = normGrupo(a);
  const y = normGrupo(b);
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
