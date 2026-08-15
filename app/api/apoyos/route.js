import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * APOYOS DE GUARDIA
 *
 * Antes el navegador escribía directamente en el cuadrante. Cualquiera
 * podía quitarse un apoyo de encima, asignárselo a un compañero o dar
 * por confirmado el de otro, alterando además la rotación por sectores.
 *
 * Reparto de permisos:
 *   - Confirmar   → cada uno el suyo, y solo el suyo
 *   - Asignar     → solo jefatura y equipo directivo
 *   - Cambiar     → solo equipo directivo
 *   - Desactivar  → solo equipo directivo
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

export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos, lista } = await request.json();
    if (!accion) return Response.json({ error: 'Falta la acción' }, { status: 400 });

    // ─── El profesor confirma SU apoyo ───
    if (accion === 'confirmar') {
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      // El filtro por profesor_id impide confirmar el apoyo de otro
      const { data, error } = await supa().from('apoyos_asignados')
        .update({ estado: 'confirmado', confirmado_at: new Date().toISOString() })
        .eq('id', id).eq('profesor_id', sesion.id).select('id');

      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        return Response.json({ error: 'apoyo_ajeno' }, { status: 403 });
      }
      return Response.json({ ok: true });
    }

    // ─── Asignar apoyos (uno o varios de golpe) ───
    if (accion === 'asignar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

      const filas = (Array.isArray(lista) ? lista : [datos]).filter(Boolean);
      if (filas.length === 0) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // Quién asigna lo decide el servidor, no el navegador
      const conAutor = filas.map(f => ({ ...f, asignado_por: sesion.id }));

      const { data, error } = await supa().from('apoyos_asignados').insert(conAutor).select();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, apoyos: data || [] });
    }

    // ─── Cambiar el profesor de un apoyo ya asignado ───
    if (accion === 'cambiar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.profesor_id) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from('apoyos_asignados').update({
        profesor_id: datos.profesor_id,
        sector_apoyo: datos.sector_apoyo ?? null,
        asignado_por: sesion.id,
        estado: 'pendiente',          // al cambiar de persona vuelve a estar sin confirmar
        confirmado_at: null,
      }).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Quitar un apoyo del cuadrante ───
    if (accion === 'desactivar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('apoyos_asignados').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
