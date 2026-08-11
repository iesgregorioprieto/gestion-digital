import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';

/**
 * DATOS DEL PROFESORADO
 *
 * La tabla contiene teléfonos y datos laborales. El navegador solo puede
 * leer las columnas públicas del claustro; todo lo demás pasa por aquí:
 *
 *   - Cada profesor puede ver su ficha completa (la suya)
 *   - El equipo directivo puede ver la de cualquiera
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
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const url = new URL(request.url);
  const mia = url.searchParams.get('mi_ficha') === '1';
  const estado = url.searchParams.get('estado');

  // ─── Mi propia ficha ───
  if (mia) {
    const { data, error } = await supa()
      .from('profesores')
      .select('id, nombre, apellidos, email, departamento, especialidad, tipo_contrato, antiguedad_centro, antiguedad_cuerpo, anio_centro, anio_cuerpo, telefono, rol, rol_gestion, grupo_tutoria')
      .eq('id', sesion.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ profesor: (data || [])[0] || null });
  }

  // ─── Listado completo: solo equipo directivo ───
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'sin_permisos' }, { status: 403 });
  }

  let consulta = supa().from('profesores').select('*').order('apellidos', { ascending: true });
  if (estado) consulta = consulta.eq('estado', estado);

  const { data, error } = await consulta;
  if (error) return Response.json({ error: error.message, profesores: [] }, { status: 500 });

  return Response.json({ profesores: data || [] });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const { accion, datos, id } = await request.json();

    // ─── Guardar mi propia ficha ───
    if (accion === 'guardar_mi_ficha') {
      // Campos que el profesor puede cambiar de sí mismo.
      // Ni el rol de gestión ni el estado: eso lo decide el secretario.
      const permitidos = [
        'nombre', 'apellidos', 'telefono', 'departamento', 'especialidad',
        'tipo_contrato', 'antiguedad_centro', 'antiguedad_cuerpo',
        'anio_centro', 'anio_cuerpo', 'rol', 'grupo_tutoria',
      ];
      const limpio = {};
      for (const k of permitidos) {
        if (datos && k in datos) limpio[k] = datos[k];
      }

      const { error } = await supa().from('profesores').update(limpio).eq('id', sesion.id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Ficha de otro profesor: solo equipo directivo ───
    if (accion === 'guardar_ficha') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('profesores').update(datos || {}).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
