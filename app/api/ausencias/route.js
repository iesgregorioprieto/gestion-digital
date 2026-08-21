import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

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
  if (!sesion) {
    return Response.json({ error: 'sin_sesion', ausencias: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const soloMias = url.searchParams.get('mias') === '1';
  const cuadrante = url.searchParams.get('cuadrante');

  // ── Cuadrante de guardias ──
  // Lo consulta todo el profesorado para saber a quién cubre. Devuelve
  // quién falta y en qué horas, pero NUNCA el motivo ni la justificación:
  // que alguien esté de baja lo tiene que saber quien le cubre; por qué
  // lo está, no.
  if (cuadrante) {
    const { data, error } = await supa()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, horas, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', cuadrante)
      .or(`fecha_fin.gte.${cuadrante},fecha_fin.is.null`);

    if (error) return Response.json({ error: error.message, ausencias: [] }, { status: 500 });
    return Response.json({ ausencias: data || [] });
  }

  let consulta = supa()
    .from('ausencias')
    .select('*')
    .order('created_at', { ascending: false });

  // Un profesor solo ve las suyas.
  // Y en la pantalla personal ("mis ausencias") todo el mundo ve solo las
  // suyas, aunque sea del equipo directivo: para ver las del centro está
  // el panel de gestión.
  if (soloMias || !esDirectivo(sesion)) {
    consulta = consulta.eq('profesor_id', sesion.id);
  }

  const { data, error } = await consulta;

  if (error) {
    return Response.json({ error: error.message, ausencias: [] }, { status: 500 });
  }

  return Response.json({ ausencias: data || [] });
}

/**
 * ESCRITURA DE AUSENCIAS
 *
 * Antes las escribía el navegador, y el `profesor_id` salía de
 * sessionStorage: cualquiera podía cambiarlo desde la consola e
 * inventar una ausencia a nombre de otra persona, editar la de un
 * compañero o borrarla. Ahora el identificador sale siempre de la
 * cookie firmada.
 *
 * Quién puede hacer qué:
 *   - Cualquiera con sesión → notificar y editar LA SUYA
 *   - Equipo directivo      → notificar por otro, resolver y borrar
 */
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos } = await request.json();
    if (!accion) return Response.json({ error: 'Falta la acción' }, { status: 400 });

    // ─── Notificar una ausencia ───
    if (accion === 'crear') {
      if (!datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // El equipo directivo puede darla de alta por otra persona;
      // el resto, solo la suya, venga lo que venga en la petición.
      const dueño = (esDirectivo(sesion) && datos.profesor_id) ? datos.profesor_id : sesion.id;

      const fila = { ...datos, profesor_id: dueño };
      // El profesorado no decide el estado de su propia ausencia; el
      // equipo directivo sí (por ejemplo, una baja ya aprobada).
      if (!esDirectivo(sesion)) {
        delete fila.estado;
        delete fila.observaciones_directivo;
        delete fila.comentario_secretario;
      }

      const { data, error } = await supa().from('ausencias').insert([fila]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Editar una ausencia ───
    if (accion === 'editar') {
      if (!id || !datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const cambios = { ...datos };
      // Los comentarios internos son cosa de dirección, aunque la
      // ausencia sea propia.
      if (!esDirectivo(sesion)) {
        delete cambios.observaciones_directivo;
        delete cambios.comentario_secretario;
        delete cambios.profesor_id;      // no se puede cambiar de dueño
      }

      let consulta = supa().from('ausencias').update(cambios).eq('id', id);
      // Quien no es directivo solo puede tocar las suyas
      if (!esDirectivo(sesion)) consulta = consulta.eq('profesor_id', sesion.id);

      const { data, error } = await consulta.select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        return Response.json({ error: 'no_encontrada_o_ajena' }, { status: 403 });
      }
      return Response.json({ ok: true });
    }

    // ─── Resolver: justificada o sin justificar ───
    if (accion === 'resolver') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.estado) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from('ausencias').update({
        estado: datos.estado,
        comentario_secretario: datos.comentario_secretario ?? null,
        observaciones_directivo: datos.observaciones_directivo ?? null,
      }).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrar ───
    if (accion === 'borrar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('ausencias').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Cerrar la ausencia abierta de una baja sin sustituto ───
    // Cuando llega el sustituto, el titular deja de generar guardias.
    if (accion === 'cerrar_baja') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!datos?.profesor_id || !datos?.fecha_fin) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { error } = await supa().from('ausencias')
        .update({ fecha_fin: datos.fecha_fin })
        .eq('profesor_id', datos.profesor_id)
        .eq('categoria', 'baja_sin_sustituto')
        .is('fecha_fin', null);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
