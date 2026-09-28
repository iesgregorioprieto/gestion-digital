/**
 * ARCHIVOS DE UNA TAREA
 *
 * Antes cada tarea llevaba UN archivo (archivo_url / archivo_nombre).
 * Ahora lleva una lista: archivos: [{ url, nombre }]. Se siguen guardando
 * también archivo_url y archivo_nombre con el primero, para que nada de
 * lo antiguo se rompa.
 *
 * adjuntosDe() devuelve siempre la lista, venga la tarea de antes o de
 * ahora. enlaceDocumento() da el enlace que funciona: el almacén es
 * privado y los archivos se abren a través del servidor.
 */
export function adjuntosDe(t) {
  if (!t) return [];
  if (Array.isArray(t.archivos) && t.archivos.length) return t.archivos.filter(a => a && a.url);
  if (t.archivo_url) return [{ url: t.archivo_url, nombre: t.archivo_nombre || 'Archivo' }];
  return [];
}

export function enlaceDocumento(url) {
  return `/api/documento?url=${encodeURIComponent(url)}`;
}

export const MAX_ADJUNTOS = 6;
