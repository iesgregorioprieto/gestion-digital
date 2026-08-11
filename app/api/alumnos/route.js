import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';

/**
 * DATOS DE ALUMNADO
 *
 * Esta tabla contiene DNI de menores y sus autorizaciones de imagen.
 * Son datos personales con protección reforzada, así que solo se sirven
 * a profesorado con sesión iniciada, y nunca directamente desde la base
 * de datos al navegador.
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
    return Response.json({ error: 'sin_sesion', alumnos: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const grupo    = url.searchParams.get('grupo');
  const apellidos = url.searchParams.get('apellidos');
  const resumen  = url.searchParams.get('resumen') === '1';

  // Resumen: solo cifras, sin datos personales
  if (resumen) {
    const { data } = await supa()
      .from('alumnos')
      .select('grupo, auth_imagenes, auth_salidas, auth_actividades, auth_informar_progeni, auth_imagenes_mayor');

    const filas = data || [];
    const conRestricciones = filas.filter(a =>
      a.auth_imagenes === false || a.auth_salidas === false || a.auth_actividades === false ||
      a.auth_informar_progeni === false || a.auth_imagenes_mayor === false
    ).length;

    return Response.json({
      total: filas.length,
      conRestricciones,
      grupos: new Set(filas.map(a => a.grupo)).size,
    });
  }

  // Búsqueda: siempre acotada, nunca el listado completo del centro
  if (!grupo && !apellidos) {
    return Response.json({ error: 'Indica un grupo o unos apellidos', alumnos: [] }, { status: 400 });
  }

  let consulta = supa().from('alumnos').select('*');
  if (grupo)          consulta = consulta.eq('grupo', grupo);
  else if (apellidos) consulta = consulta.ilike('apellidos', `%${apellidos}%`);

  const { data, error } = await consulta.order('apellidos');
  if (error) return Response.json({ error: error.message, alumnos: [] }, { status: 500 });

  return Response.json({ alumnos: data || [] });
}
