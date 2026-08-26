import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * CALENDARIO ESCOLAR DEL CURSO
 *
 * El cartel oficial de la Consejería. Lo sube el equipo directivo una
 * vez al año desde Datos del centro, y lo consulta todo el claustro.
 *
 * La lectura es abierta a cualquiera con sesión: es un documento
 * público que está también en el tablón y en la web de la Consejería.
 * Subirlo, en cambio, es cosa de dirección.
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

// ─── Consultar el calendario vigente ───
export async function GET(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion', calendario: null }, { status: 401 });

    // El más reciente: al empezar curso nuevo se sube otro y este queda atrás
    const { data, error } = await supa()
      .from('calendario_escolar')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) return Response.json({ error: error.message, calendario: null }, { status: 500 });
    return Response.json({ calendario: (data || [])[0] || null });
  } catch (e) {
    return Response.json({ error: e.message, calendario: null }, { status: 500 });
  }
}

// ─── Publicar o sustituir ───
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!esDirectivo(sesion)) {
      return Response.json({ error: 'sin_permisos' }, { status: 403 });
    }

    const { curso, archivo_url, nombre, tipo } = await request.json();
    if (!curso || !archivo_url) {
      return Response.json({ error: 'Faltan el curso o el archivo' }, { status: 400 });
    }

    // Un calendario por curso: si se vuelve a subir, sustituye al anterior
    const { error } = await supa().from('calendario_escolar').upsert({
      curso,
      archivo_url,
      nombre: nombre || null,
      tipo: tipo || null,
      subido_por: sesion.nombre || null,
      created_at: new Date().toISOString(),
    }, { onConflict: 'curso' });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
