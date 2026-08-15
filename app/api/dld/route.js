import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * SOLICITUDES DE DLD
 *
 * Antes el navegador escribía directamente en la tabla, y el
 * `profesor_id` salía de sessionStorage. Cualquiera podía cambiarlo
 * desde la consola y pedir un día libre a nombre de otra persona,
 * aprobarse el suyo propio o borrar solicitudes ajenas.
 *
 * Ahora:
 *   - Solicitar    → cualquiera con sesión, siempre para sí mismo
 *   - Resolver     → solo equipo directivo, y solo si sigue pendiente
 *   - Revocar      → solo equipo directivo
 *   - Borrar       → solo equipo directivo
 *
 * El estado nunca lo decide el navegador.
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

    const { accion, id, datos } = await request.json();
    if (!accion) return Response.json({ error: 'Falta la acción' }, { status: 400 });

    // ─── Pedir un día ───
    if (accion === 'solicitar') {
      if (!datos?.fecha_solicitada) {
        return Response.json({ error: 'Falta la fecha' }, { status: 400 });
      }

      const fila = { ...datos };
      // Siempre a nombre de quien tiene la sesión, y siempre pendiente:
      // ni el dueño ni el estado se aceptan del navegador.
      fila.profesor_id = sesion.id;
      fila.estado = 'pendiente';
      delete fila.resuelto_at;
      delete fila.resuelto_por;
      delete fila.motivo_rechazo;

      const { data, error } = await supa().from('dld').insert([fila]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Resolver: aprobar o denegar ───
    if (accion === 'resolver') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.estado) return Response.json({ error: 'Faltan datos' }, { status: 400 });
      if (!['aprobada', 'rechazada'].includes(datos.estado)) {
        return Response.json({ error: 'estado_no_valido' }, { status: 400 });
      }

      // Solo si sigue pendiente: si el director y jefatura la tocan casi
      // a la vez, el segundo no pisa al primero ni manda un correo que
      // contradiga al anterior.
      const { data, error } = await supa().from('dld').update({
        estado: datos.estado,
        resuelto_at: new Date().toISOString(),
        resuelto_por: datos.resuelto_por || sesion.nombre || '',
        motivo_rechazo: datos.motivo_rechazo ?? null,
      }).eq('id', id).eq('estado', 'pendiente').select('id');

      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        return Response.json({ error: 'ya_resuelta' }, { status: 409 });
      }
      return Response.json({ ok: true });
    }

    // ─── Revocar un permiso ya concedido ───
    if (accion === 'revocar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('dld').update({
        estado: 'rechazada',
        resuelto_at: new Date().toISOString(),
        resuelto_por: datos?.resuelto_por || sesion.nombre || '',
        motivo_rechazo: datos?.motivo_rechazo ?? null,
      }).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrar ───
    if (accion === 'borrar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('dld').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
