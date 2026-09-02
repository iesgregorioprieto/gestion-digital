/**
 * AVISOS A DIRECCIÓN
 *
 * Funciones para avisar por correo al equipo directivo desde el
 * servidor. Se usa desde las rutas de la API, nunca desde el navegador.
 *
 * Si el correo falla no se interrumpe nada: quien llama debe capturar
 * el error y seguir. Lo importante es que el dato quede guardado.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';

/**
 * Quién recibe los avisos de actividades complementarias.
 * Son direcciones fijas a propósito: la de jefatura es del centro y no
 * depende de quién ocupe el cargo. Si cambia el equipo directivo, se
 * cambian aquí.
 */
export const AVISOS_ACTIVIDADES = [
  'jjds04@educastillalamancha.es',   // José María Díaz-Cano, director
  'jefatura@iesgregorioprieto.com',  // Jefatura de estudios
];

/**
 * Devuelve los correos de quien ocupa el cargo indicado.
 * @param {object} cliente  cliente de Supabase con clave de servidor
 * @param {string} cargo    'director' | 'secretario' | 'jefe'
 */
export async function correosDe(cliente, cargo) {
  const { data } = await cliente
    .from('profesores')
    .select('email, rol_gestion')
    .not('rol_gestion', 'is', null);

  return (data || [])
    .filter(p => (p.rol_gestion || '').toLowerCase().startsWith(cargo) && p.email)
    .map(p => p.email);
}

/**
 * Envía un correo de un tipo concreto a una lista de direcciones.
 * Los tipos deben estar dados de alta en /api/enviar-email.
 */
export async function enviarAviso(tipo, destinos, datos) {
  for (const email of destinos) {
    try {
      await fetch(`${BASE_URL}/api/enviar-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clave-interna': process.env.SESSION_SECRET || '',
        },
        body: JSON.stringify({ tipo, datos: { ...datos, email } }),
      });
    } catch (e) {
      console.error(`aviso ${tipo} a ${email}:`, e?.message);
    }
  }
}

/** Atajo: avisar a quien sea director/a */
export async function avisarDireccion(cliente, tipo, datos) {
  const destinos = await correosDe(cliente, 'director');
  if (destinos.length === 0) return;
  await enviarAviso(tipo, destinos, datos);
}
