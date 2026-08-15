import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * INCIDENCIAS DE MANTENIMIENTO Y SOLICITUDES DE COMPRA
 *
 * Las dos funcionan igual: el profesorado las crea, y el equipo
 * directivo las resuelve o las borra. Antes las escribía el navegador
 * con el profesor_id de sessionStorage, así que se podía firmar una
 * solicitud a nombre de otro departamento, cambiar el estado de una
 * ajena o borrar las de cualquiera.
 *
 * Se atienden las dos tablas desde aquí porque el flujo es idéntico;
 * la tabla se comprueba contra una lista cerrada.
 */

const TABLAS = ['mantenimiento', 'compras'];

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

    const { tabla, accion, id, datos } = await request.json();

    if (!TABLAS.includes(tabla)) {
      return Response.json({ error: 'tabla_no_valida' }, { status: 400 });
    }

    // ─── Crear ───
    if (accion === 'crear') {
      if (!datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const fila = { ...datos };
      // El equipo directivo puede darla de alta en nombre de otra
      // persona; el resto, solo a su nombre.
      if (!esDirectivo(sesion) || !fila.profesor_id) fila.profesor_id = sesion.id;
      // El estado y los comentarios internos no los pone quien solicita
      if (!esDirectivo(sesion)) {
        fila.estado = 'pendiente';
        delete fila.comentario_secretario;
      }

      const { data, error } = await supa().from(tabla).insert([fila]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Resolver: cambiar estado y dejar comentario ───
    if (accion === 'resolver') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.estado) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from(tabla).update({
        estado: datos.estado,
        comentario_secretario: datos.comentario_secretario ?? null,
      }).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrar ───
    if (accion === 'borrar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from(tabla).delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
