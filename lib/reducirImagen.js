/**
 * REDUCIR UNA FOTO ANTES DE SUBIRLA
 *
 * Una foto de móvil pesa cuatro, cinco o seis megas. Para ver una
 * persiana rota, una mancha en el suelo o un parte médico sobra con una
 * décima parte. Y el espacio de Supabase es limitado: con fotos a tamaño
 * completo, un curso de incidencias y justificantes lo llenaba.
 *
 * Se redimensiona para que el lado mayor no pase de 1.600 píxeles y se
 * guarda en JPEG al 80 %. Una foto de 5 MB queda en unos 250 o 350 KB.
 *
 * Solo toca imágenes. Un PDF o cualquier otro archivo pasa tal cual. Y si
 * algo falla al reducir —un formato raro, un navegador antiguo—, se sube
 * el original: mejor una foto grande que una incidencia sin foto.
 */

const LADO_MAXIMO = 1600;
const CALIDAD = 0.8;
const YA_PEQUENA = 400 * 1024;   // por debajo de 400 KB no merece la pena

export async function reducirImagen(archivo) {
  if (!archivo || !archivo.type?.startsWith('image/')) return archivo;
  if (archivo.size <= YA_PEQUENA) return archivo;

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);

    const blob = await new Promise(r => lienzo.toBlob(r, 'image/jpeg', CALIDAD));
    if (!blob || blob.size >= archivo.size) return archivo;

    const base = (archivo.name || 'foto').replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return archivo;
  }
}
