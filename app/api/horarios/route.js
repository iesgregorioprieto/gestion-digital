import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * HORARIOS DEL PROFESORADO
 *
 * Son 3.000 registros de los que dependen el cuadrante de guardias, las
 * ausencias y las solicitudes de DLD. Con el permiso abierto en el
 * navegador, cualquiera podía vaciarlos de una sola orden y dejar el
 * centro sin cuadrante en plena mañana.
 *
 * Todas las operaciones exigen sesión de equipo directivo.
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
    if (!esDirectivo(sesion)) {
      return Response.json({ error: 'sin_permisos' }, { status: 403 });
    }

    const { accion, curso, tipo, profesor_id, lote } = await request.json();

    // ─── Borrar los horarios de un curso (antes de reimportarlos) ───
    if (accion === 'borrar_curso') {
      if (!curso) return Response.json({ error: 'Falta el curso' }, { status: 400 });

      let consulta = supa().from('horarios_profesores').delete().eq('curso_academico', curso);
      if (tipo) consulta = consulta.eq('tipo', tipo);   // solo guardias, por ejemplo

      const { error } = await consulta;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Insertar un lote de la importación ───
    if (accion === 'insertar') {
      if (!Array.isArray(lote) || lote.length === 0) {
        return Response.json({ error: 'Lote vacío' }, { status: 400 });
      }
      if (lote.length > 600) {
        return Response.json({ error: 'Lote demasiado grande' }, { status: 400 });
      }

      const { error } = await supa().from('horarios_profesores').insert(lote);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, insertados: lote.length });
    }

    // ─── Borrar el horario de una persona (sustituciones) ───
    if (accion === 'borrar_de_profesor') {
      if (!profesor_id) return Response.json({ error: 'Falta el profesor' }, { status: 400 });

      const { error } = await supa().from('horarios_profesores')
        .delete().eq('profesor_id', profesor_id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
