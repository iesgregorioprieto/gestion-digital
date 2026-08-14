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

const BUCKETS_PRIVADOS = ['ausencias-docs', 'dld-archivos'];

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

  if (!autorizado && bucket === 'dld-archivos') {
    const { data } = await supa()
      .from('dld')
      .select('profesor_id')
      .ilike('justificante_url', `%${ruta}%`);
    autorizado = (data || []).some(d => d.profesor_id === sesion.id);
  }

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
