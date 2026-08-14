import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * LECTURA DE AUSENCIAS
 *
 * El texto de la justificación suele contener información médica.
 * Para que no lo pueda leer cualquiera consultando la base de datos
 * directamente, esa columna deja de estar disponible para el navegador
 * y se sirve solo desde aquí:
 *
 *   - Equipo directivo → todas las ausencias
 *   - Profesorado      → solo las suyas
 */

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

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) {
    return Response.json({ error: 'sin_sesion', ausencias: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const soloMias = url.searchParams.get('mias') === '1';

  let consulta = supa()
    .from('ausencias')
    .select('*')
    .order('created_at', { ascending: false });

  // Un profesor solo ve las suyas.
  // Y en la pantalla personal ("mis ausencias") todo el mundo ve solo las
  // suyas, aunque sea del equipo directivo: para ver las del centro está
  // el panel de gestión.
  if (soloMias || !esDirectivo(sesion)) {
    consulta = consulta.eq('profesor_id', sesion.id);
  }

  const { data, error } = await consulta;

  if (error) {
    return Response.json({ error: error.message, ausencias: [] }, { status: 500 });
  }

  return Response.json({ ausencias: data || [] });
}
