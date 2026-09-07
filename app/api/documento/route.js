import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * ACCESO A DOCUMENTOS PRIVADOS
 *
 * Los justificantes de ausencia son partes médicos: datos de salud.
 * Estaban en un almacén público, accesibles para cualquiera que tuviera
 * la dirección del archivo.
 *
 * Ahora el almacén es privado y los archivos solo se sirven desde aquí,
 * comprobando antes que quien los pide es:
 *   - el propio profesor al que pertenece la ausencia, o
 *   - alguien del equipo directivo
 *
 * Se devuelve un enlace temporal que caduca en 60 segundos.
 */

// Dónde se puede subir. El navegador dice el almacén, así que la lista
// manda: sin ella, cualquiera con sesión escribiría donde quisiera.
const BUCKETS_SUBIDA = [
  'ausencias-docs', 'dld-archivos', 'actividades-docs',
  'incidencias-docs', 'compras-docs', 'mantenimiento-fotos', 'calendario',
];

const MAX_BYTES = 10 * 1024 * 1024;   // 10 MB

const EXTENSIONES = [
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'gif',
  'doc', 'docx', 'odt', 'xls', 'xlsx', 'ods', 'txt', 'csv',
];

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

/** Extrae bucket y ruta de una URL de Supabase Storage */
function partirUrl(url) {
  // .../storage/v1/object/public/<bucket>/<ruta>
  const m = (url || '').match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], ruta: decodeURIComponent(m[2]) };
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) {
    return Response.json({ error: 'Necesitas iniciar sesión' }, { status: 401 });
  }

  const url = new URL(request.url);
  const original = url.searchParams.get('url');
  const descargar = url.searchParams.get('descargar');

  if (!original) return Response.json({ error: 'Falta el documento' }, { status: 400 });

  const partes = partirUrl(original);
  if (!partes) return Response.json({ error: 'Documento no reconocido' }, { status: 400 });

  const { bucket, ruta } = partes;

  // ─── Comprobar permiso ───
  let autorizado = esDirectivo(sesion);

  if (!autorizado && bucket === 'ausencias-docs') {
    // ¿Es su propia ausencia?
    const { data } = await supa()
      .from('ausencias')
      .select('profesor_id')
      .ilike('justificacion_url', `%${ruta}%`);
    autorizado = (data || []).some(a => a.profesor_id === sesion.id);
  }

  if (!autorizado && bucket === 'incidencias-docs') {
    // La captura la ve dirección y quien avisó del fallo.
    const { data } = await supa()
      .from('incidencias_app')
      .select('profesor_id')
      .ilike('foto_url', `%${ruta}%`);
    autorizado = (data || []).some(i => i.profesor_id === sesion.id);
  }

  if (!autorizado && bucket === 'actividades-docs') {
    // Las comisiones de servicio las ve dirección y quien propuso la
    // actividad. También quien va de acompañante, que le afectan.
    const { data } = await supa()
      .from('actividades')
      .select('profesor_id, acompanantes')
      .ilike('comision_servicio', `%${ruta}%`);
    autorizado = (data || []).some(a =>
      a.profesor_id === sesion.id ||
      (Array.isArray(a.acompanantes) && a.acompanantes.includes(sesion.id))
    );
  }

  if (!autorizado && bucket === 'dld-archivos') {
    const { data } = await supa()
      .from('dld')
      .select('profesor_id')
      .ilike('justificante_url', `%${ruta}%`);
    autorizado = (data || []).some(d => d.profesor_id === sesion.id);
  }

  if (!autorizado && bucket === 'compras-docs') {
    // El presupuesto o el albarán los ve quien hizo la solicitud.
    const { data } = await supa()
      .from('compras')
      .select('profesor_id')
      .or(`archivo_url.ilike.%${ruta}%,albaran_url.ilike.%${ruta}%`);
    autorizado = (data || []).some(c => c.profesor_id === sesion.id);
  }

  if (!autorizado && bucket === 'mantenimiento-fotos') {
    // La foto de la avería la ve quien la comunicó.
    const { data } = await supa()
      .from('mantenimiento')
      .select('profesor_id')
      .ilike('foto_url', `%${ruta}%`);
    autorizado = (data || []).some(m => m.profesor_id === sesion.id);
  }

  // El calendario escolar lo consulta todo el claustro: no lleva nada
  // personal, es el documento de la Consejería.
  if (!autorizado && bucket === 'calendario') autorizado = true;

  if (!autorizado) {
    return Response.json({ error: 'No tienes permiso para ver este documento' }, { status: 403 });
  }

  // ─── Enlace temporal ───
  const opciones = descargar ? { download: descargar } : undefined;
  const { data, error } = await supa()
    .storage.from(bucket)
    .createSignedUrl(ruta, 60, opciones);

  if (error || !data?.signedUrl) {
    return Response.json({ error: error?.message || 'No se pudo abrir el documento' }, { status: 500 });
  }

  // Redirigir directamente al archivo
  return Response.redirect(data.signedUrl, 302);
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get('archivo');
  const carpeta = String(form.get('carpeta') || 'justificantes');
  const bucket = String(form.get('bucket') || 'ausencias-docs');

  if (!archivo || typeof archivo === 'string') {
    return Response.json({ error: 'Falta el archivo' }, { status: 400 });
  }

  // El bucket lo elige el navegador, así que hay que comprobarlo: si no,
  // cualquiera con sesión podría escribir en un almacén que no le toca.
  if (!BUCKETS_SUBIDA.includes(bucket)) {
    return Response.json({ error: 'Almacén no permitido' }, { status: 403 });
  }

  // La carpeta también viene del navegador y acaba en la ruta del
  // archivo: sin limpiarla se podría salir con ../ a otro sitio.
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(carpeta)) {
    return Response.json({ error: 'Carpeta no válida' }, { status: 400 });
  }

  if (archivo.size > MAX_BYTES) {
    return Response.json({ error: 'El archivo supera los 10 MB' }, { status: 413 });
  }

  const ext = (archivo.name || 'bin').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!EXTENSIONES.includes(ext)) {
    return Response.json({ error: `Tipo de archivo no admitido: .${ext}` }, { status: 415 });
  }

  const nombre = `${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const { error } = await supa().storage.from(bucket).upload(nombre, buffer, {
    contentType: archivo.type || 'application/octet-stream',
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Devolver la ruta interna, no la URL pública. Las descargas siempre
  // pasan por GET /api/documento, que comprueba permisos y firma.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = `${base}/storage/v1/object/public/${bucket}/${nombre}`;

  return Response.json({ url });
}
