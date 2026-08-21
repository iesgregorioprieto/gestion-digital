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

/**
 * LECTURA DE SOLICITUDES
 *
 * Cada modo devuelve solo lo que esa pantalla necesita:
 *   mias       → las propias, completas
 *   calendario → sin motivos ni causas: solo fecha, estado y quién,
 *                que es lo que pinta el semáforo del calendario
 *   cuadrante  → quién falta ese día y en qué horas, para las guardias
 *   (sin modo) → todo, y solo para el equipo directivo
 *
 * La descripción de la causa y el motivo de rechazo no salen nunca
 * salvo a quien es dueño de la solicitud o al equipo directivo.
 */
export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion', solicitudes: [] }, { status: 401 });

  const url = new URL(request.url);
  const modo = url.searchParams.get('modo');

  // ── Las mías ──
  if (modo === 'mias') {
    const { data, error } = await supa().from('dld').select('*')
      .eq('profesor_id', sesion.id).order('created_at', { ascending: false });
    if (error) return Response.json({ error: error.message, solicitudes: [] }, { status: 500 });
    return Response.json({ solicitudes: data || [] });
  }

  // ── Calendario de carga: lo ve todo el claustro, sin motivos ──
  if (modo === 'calendario') {
    const desde = url.searchParams.get('desde');
    const hasta = url.searchParams.get('hasta');
    if (!desde || !hasta) return Response.json({ error: 'Faltan fechas', solicitudes: [] }, { status: 400 });

    const { data, error } = await supa().from('dld')
      .select('fecha_solicitada, estado, profesor_id, profesor_nombre, tipo_dld')
      .gte('fecha_solicitada', desde).lte('fecha_solicitada', hasta)
      .in('estado', ['aprobada', 'pendiente']);
    if (error) return Response.json({ error: error.message, solicitudes: [] }, { status: 500 });
    return Response.json({ solicitudes: data || [] });
  }

  // ── Cuadrante de guardias: quién falta ese día y qué clases deja ──
  if (modo === 'cuadrante') {
    const fecha = url.searchParams.get('fecha');
    if (!fecha) return Response.json({ error: 'Falta la fecha', solicitudes: [] }, { status: 400 });

    const { data, error } = await supa().from('dld')
      .select('profesor_id, profesor_nombre, horas, grupos_afectados, guardias_horario')
      .eq('fecha_solicitada', fecha).eq('estado', 'aprobada');
    if (error) return Response.json({ error: error.message, solicitudes: [] }, { status: 500 });
    return Response.json({ solicitudes: data || [] });
  }

  // ── Todo: solo equipo directivo ──
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'sin_permisos', solicitudes: [] }, { status: 403 });
  }
  const { data, error } = await supa().from('dld').select('*')
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message, solicitudes: [] }, { status: 500 });
  return Response.json({ solicitudes: data || [] });
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

    // ─── El profesor retira su propia solicitud ───
    if (accion === 'retirar') {
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      // Solo la suya, y solo si aún está pendiente
      let consulta = supa().from('dld').update({
        estado: 'cancelada',
        resuelto_at: new Date().toISOString(),
        resuelto_por: 'Retirada por el solicitante',
      }).eq('id', id).eq('estado', 'pendiente');

      if (!esDirectivo(sesion)) consulta = consulta.eq('profesor_id', sesion.id);

      const { data, error } = await consulta.select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        return Response.json({ error: 'no_se_puede_retirar' }, { status: 403 });
      }
      return Response.json({ ok: true });
    }

    // ─── Archivar las solicitudes al cambiar de curso ───
    if (accion === 'archivar_curso') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

      const { error } = await supa().from('dld')
        .update({ curso_archivado: datos?.curso || 'anterior' })
        .is('curso_archivado', null);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
