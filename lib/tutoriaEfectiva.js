/**
 * TUTORÍA EFECTIVA (en el servidor)
 *
 * El grupo del que alguien es tutor/a a efectos de autorizaciones y seguro:
 *   · el suyo, si tiene «Soy tutor/a» y grupo;
 *   · o, si está SUSTITUYENDO a un titular que sigue de baja y ese titular
 *     es tutor, el del titular. Antes el sustituto no heredaba la tutoría y
 *     nadie podía marcar ese grupo (p. ej. GM-2EVA, con 34 alumnos, a cero).
 */
export async function tutoriaEfectiva(cliente, profesorId) {
  const { data } = await cliente.from('profesores')
    .select('id, rol, grupo_tutoria, titular_id').eq('id', profesorId);
  const p = (data || [])[0];
  if (!p) return null;
  const esTutor = Array.isArray(p.rol) && p.rol.includes('tutor');
  if (esTutor && p.grupo_tutoria) return { grupo: p.grupo_tutoria, heredadaDe: null };

  if (p.titular_id) {
    const { data: t } = await cliente.from('profesores')
      .select('nombre, apellidos, rol, grupo_tutoria, en_baja').eq('id', p.titular_id);
    const tit = (t || [])[0];
    if (tit?.en_baja && tit.grupo_tutoria) {
      return { grupo: tit.grupo_tutoria, heredadaDe: `${tit.apellidos}, ${tit.nombre}` };
    }
  }
  return null;
}
