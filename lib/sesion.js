/**
 * SESIONES FIRMADAS POR EL SERVIDOR
 *
 * Antes, el rol del usuario se guardaba en el navegador (sessionStorage) y
 * cada página se fiaba de lo que allí pusiera. Cualquiera podía editarlo y
 * hacerse pasar por director.
 *
 * Ahora el servidor emite una credencial firmada con una clave secreta que
 * solo él conoce. El navegador la guarda pero no puede modificarla: si le
 * cambia una sola letra, la firma deja de coincidir y se rechaza.
 *
 * Usa Web Crypto para que funcione tanto en el servidor como en el
 * middleware (que se ejecuta en un entorno restringido).
 */

const NOMBRE_COOKIE = 'ies_sesion';
const DURACION_HORAS = 12;

function b64url(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(texto) {
  const s = texto.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(relleno);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function clave(secreto) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Crea una credencial firmada para ese profesor */
export async function firmarSesion(datos, secreto) {
  const carga = {
    id: datos.id,
    rol: datos.rol || '',              // director | secretario | jefe_estudios | ''
    roles: datos.roles || ['profesor'],
    nombre: datos.nombre || '',
    exp: Date.now() + DURACION_HORAS * 3600 * 1000,
  };

  const cuerpo = b64url(new TextEncoder().encode(JSON.stringify(carga)));
  const firma = await crypto.subtle.sign('HMAC', await clave(secreto), new TextEncoder().encode(cuerpo));
  return `${cuerpo}.${b64url(firma)}`;
}

/**
 * Comprueba una credencial. Devuelve los datos si es válida, o null si
 * ha sido manipulada o ha caducado.
 */
export async function verificarSesion(token, secreto) {
  if (!token || typeof token !== 'string') return null;

  const partes = token.split('.');
  if (partes.length !== 2) return null;

  const [cuerpo, firma] = partes;

  try {
    const valida = await crypto.subtle.verify(
      'HMAC',
      await clave(secreto),
      deB64url(firma),
      new TextEncoder().encode(cuerpo)
    );
    if (!valida) return null;

    const datos = JSON.parse(new TextDecoder().decode(deB64url(cuerpo)));
    if (!datos.exp || Date.now() > datos.exp) return null;

    return datos;
  } catch (e) {
    return null;
  }
}

/** ¿Pertenece al equipo directivo? */
export function esDirectivo(sesion) {
  return !!sesion && ['director', 'secretario', 'jefe_estudios'].includes(sesion.rol);
}

export const COOKIE = NOMBRE_COOKIE;
export const HORAS = DURACION_HORAS;
