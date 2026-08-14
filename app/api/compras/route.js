import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * SOLICITUDES DE COMPRA
 *
 * El presupuesto de un departamento no es asunto de los demás:
 *   - Cada profesor ve solo sus solicitudes
 *   - El equipo directivo ve las de todo el centro
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
  if (!sesion) return Response.json({ error: 'sin_sesion', compras: [] }, { status: 401 });

  const url = new URL(request.url);
  const todas = url.searchParams.get('todas') === '1';

  let consulta = supa().from('compras').select('*').order('created_at', { ascending: false });

  // Solo el equipo directivo puede pedir las de todo el centro
  if (!todas || !esDirectivo(sesion)) {
    consulta = consulta.eq('profesor_id', sesion.id);
  }

  const { data, error } = await consulta;
  if (error) return Response.json({ error: error.message, compras: [] }, { status: 500 });

  return Response.json({ compras: data || [] });
}
