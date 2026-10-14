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

function claveBytes(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const salida = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) salida[i] = raw.charCodeAt(i);
  return salida;
}

function mismaClave(sub, bytes) {
  try {
    const k = sub?.options?.applicationServerKey;
    if (!k) return true; // el navegador no la expone: se da por buena
    const a = new Uint8Array(k);
    return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
  } catch (_) { return true; }
}

const esperar = ms => new Promise(r => setTimeout(r, ms));

/**
 * Consigue una suscripción válida SIN reinstalar nada.
 *
 * El «push service error» de Chrome (AbortError) suele quedarse pegado
 * cuando hay restos de una suscripción vieja: la del service worker
 * antiguo que se borró, o una hecha con otra clave. Aquí se limpia lo
 * que haya y se reintenta hasta tres veces con una pausa entre medias,
 * que es lo que Chrome necesita para volver a pedir el registro a Google.
 */
export async function suscribirAvisos(clave) {
  const bytes = claveBytes(clave);
  const reg = await registroAvisos();

  let sub = await reg.pushManager.getSubscription();
  if (sub && mismaClave(sub, bytes)) return sub;
  if (sub) { try { await sub.unsubscribe(); } catch (_) {} }

  let ultimo;
  for (let intento = 0; intento < 3; intento++) {
    try {
      return await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
    } catch (e) {
      ultimo = e;
      // Limpiar cualquier resto y dar tiempo a Chrome antes de reintentar
      try { const vieja = await reg.pushManager.getSubscription(); if (vieja) await vieja.unsubscribe(); } catch (_) {}
      if (intento === 1) {
        // Segundo fallo: se rehace también el service worker de avisos
        try { await reg.unregister(); } catch (_) {}
        await esperar(800);
        const nuevo = await registroAvisos();
        await esperar(500);
        try { return await nuevo.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }); }
        catch (e2) { ultimo = e2; }
      }
      await esperar(1500);
    }
  }
  throw ultimo;
}
