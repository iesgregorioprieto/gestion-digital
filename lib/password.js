/**
 * CIFRADO DE CONTRASEÑAS
 *
 * Antes existía una ruta abierta, /api/password, que cifraba cualquier
 * contraseña que le mandaras y —peor— permitía comprobar si una
 * contraseña coincidía con un hash. Eso daba una forma de probar
 * contraseñas sin pasar por el login, saltándose la pausa de medio
 * segundo y el límite de intentos.
 *
 * Solo la usaba /api/recuperar y solo para cifrar, así que la ruta se ha
 * eliminado y el cálculo vive aquí, sin URL propia.
 */

const hex = a => Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');

/** Devuelve el hash en formato "salt:hash" listo para guardar. */
export async function cifrarPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256
  );
  return hex(salt) + ':' + hex(new Uint8Array(bits));
}
