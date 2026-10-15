/**
 * ¿EXISTE YA ESTA PERSONA?
 *
 * Dos altas de la misma persona rompen las guardias: el cuadrante encuentra
 * dos fichas con el mismo nombre, no sabe cuál es y lo deja sin identificar
 * (Javier Merino, oct. 2026: alta rápida con el correo mal escrito y luego
 * registro propio con el bueno).
 *
 * El correo no basta para detectarlo: una errata («educastillalamanha») o un
 * correo personal hacen que parezcan personas distintas. Así que se compara
 * también el nombre completo, sin tildes, mayúsculas ni guiones, y la parte
 * del correo antes de la arroba.
 */

export function normNombre(t) {
  return (t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function usuarioDeCorreo(email) {
  return (email || '').toLowerCase().trim().split('@')[0] || '';
}

/**
 * Devuelve la ficha que parece la misma persona, o null.
 * `excluirId` evita compararse consigo misma al actualizar.
 */
export async function buscarDuplicado(cliente, { nombre, apellidos, email, excluirId = null }) {
  const completo = normNombre(`${nombre} ${apellidos}`);
  const usuario = usuarioDeCorreo(email);
  if (!completo && !usuario) return null;

  // Filtro grueso en la base de datos por el primer apellido; el fino, aquí.
  // (Solo letras y números en los filtros: una coma rompería el .or())
  const primerApellido = (normNombre(apellidos).split(' ')[0] || '').replace(/[^a-z]/g, '');
  const usuarioFiltro = usuario.replace(/[^a-z0-9._-]/g, '');
  const filtros = [];
  if (primerApellido.length >= 3) filtros.push(`apellidos.ilike.%${primerApellido.slice(0, 4)}%`);
  if (usuarioFiltro.length >= 4) filtros.push(`email.ilike.${usuarioFiltro}@%`);
  if (filtros.length === 0) return null;

  const consulta = cliente.from('profesores')
    .select('id, nombre, apellidos, email, estado, provisional, password_hash, creado_por')
    .or(filtros.join(','));
  const { data } = await consulta;

  return (data || []).find(p => {
    if (excluirId && p.id === excluirId) return false;
    if (completo && normNombre(`${p.nombre} ${p.apellidos}`) === completo) return true;
    // Mismo usuario de correo con otro dominio: casi seguro una errata.
    return usuario.length >= 4 && usuarioDeCorreo(p.email) === usuario;
  }) || null;
}

/**
 * Correos corporativos mal escritos: «educastillalamanha.es»,
 * «educastilalamancha.es»… Se avisa en vez de crear una cuenta a la que
 * nadie podrá entrar.
 */
export function errataDominio(email) {
  const dominio = (email || '').toLowerCase().trim().split('@')[1] || '';
  if (!dominio || dominio === 'educastillalamancha.es') return null;
  const plano = dominio.replace(/[^a-z]/g, '');
  const parecido = plano.startsWith('educa') && /cast|lamanch|mancha/.test(plano);
  return parecido ? 'educastillalamancha.es' : null;
}
