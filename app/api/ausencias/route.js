import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';

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
  const privada = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    privada || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    privada ? { auth: { persistSession: false, autoRefreshToken: false } } : undefined
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

  let consulta = supa()
    .from('ausencias')
    .select('*')
    .order('created_at', { ascending: false });

  // Un profesor solo ve las suyas
  if (!esDirectivo(sesion)) {
    consulta = consulta.eq('profesor_id', sesion.id);
  }

  const { data, error } = await consulta;

  if (error) {
    return Response.json({ error: error.message, ausencias: [] }, { status: 500 });
  }

  return Response.json({ ausencias: data || [] });
}
