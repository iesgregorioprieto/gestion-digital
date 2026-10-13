/**
 * El service worker de los avisos (public/sw-avisos.js), en un solo sitio.
 *
 * Antes se esperaba a navigator.serviceWorker.ready sin haber registrado
 * nada: esa promesa no se resuelve nunca si no hay service worker, y
 * «Activar ahora» se quedaba cargando para siempre.
 */

export const SW_AVISOS = '/sw-avisos.js';

/** ¿Es este registro el de los avisos? */
export function esSwAvisos(reg) {
  const w = reg?.active || reg?.waiting || reg?.installing;
  return !!w && new URL(w.scriptURL).pathname === SW_AVISOS;
}

/** Registra el de los avisos (si ya está, no hace nada) y espera a que esté listo. */
export async function registroAvisos() {
  await navigator.serviceWorker.register(SW_AVISOS, { scope: '/' });
  return navigator.serviceWorker.ready;
}

/**
 * Quita los service workers viejos (el que cacheaba y rompía la carga),
 * pero NUNCA el de los avisos: desregistrarlo borra la suscripción y el
 * profesor deja de recibir notificaciones sin enterarse.
 */
export async function quitarSwViejos() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.filter(r => !esSwAvisos(r)).map(r => r.unregister().catch(() => {})));
}
