/**
 * VOTACIONES DEL CLAUSTRO
 *
 * El voto es secreto de verdad, no de palabra. Se consigue guardando
 * dos cosas en tablas que no se pueden cruzar:
 *
 *   · `votos`     — qué se ha votado, sin decir quién
 *   · `votantes`  — quién ha votado, sin decir qué
 *
 * Ninguna de las dos guarda la hora. Si la guardaran, se podrían
 * emparejar por orden de llegada y el secreto se rompería.
 *
 * El navegador no lee esas tablas: pregunta aquí y recibe recuentos.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';

let _cliente = null;
function supa() {
  if (!_cliente) {
    _cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _cliente;
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

/** Momento en que se cierra sola, si tiene duración */
function cierreDe(v) {
  if (!v.abierta_at || !v.duracion_minutos) return null;
  return new Date(new Date(v.abierta_at).getTime() + v.duracion_minutos * 60000);
}

/** ¿Sigue admitiendo votos? Lo decide el reloj del servidor, no el del móvil */
function sigueAbierta(v) {
  if (v.estado !== 'abierta') return false;
  const cierre = cierreDe(v);
  return !cierre || new Date() < cierre;
}

/**
 * Nombre corto para el tablero: "Luis Javier Cárdenas Calcerrada"
 * queda en "Luis J. Cárdenas". En una pared con 150 nombres, el nombre
 * completo no cabe y no hace falta para reconocerse.
 */
function nombreCorto(nombre, apellidos) {
  const nombres = (nombre || '').trim().split(/\s+/).filter(Boolean);
  const pila = (apellidos || '').trim().split(/\s+/).filter(Boolean);
  const pilaPrimero = pila[0] || '';
  if (nombres.length === 0) return pilaPrimero;
  const primero = nombres[0];
  const inicial = nombres[1] ? ` ${nombres[1][0]}.` : '';
  return `${primero}${inicial} ${pilaPrimero}`.trim();
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion', votaciones: [] }, { status: 401 });

  const cliente = supa();

  // ── Tablero de participación ──
  //
  // Devuelve quién ha votado y quién no, NUNCA qué se ha votado. Se
  // puede saber lo uno sin lo otro porque son dos tablas distintas.
  // El recuento sigue saliendo solo al cerrar: si se viera a la vez que
  // alguien se pone en verde, se ataría el nombre con el voto.
  const url = new URL(request.url);
  if (url.searchParams.get('modo') === 'tablero') {
    if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

    const idV = url.searchParams.get('id');
    if (!idV) return Response.json({ error: 'falta_id' }, { status: 400 });

    const { data: vs } = await cliente.from('votaciones').select('*').eq('id', idV);
    const v = (vs || [])[0];
    if (!v) return Response.json({ error: 'no_encontrada' }, { status: 404 });

    // El censo: en una votación de reunión son los que pasaron lista;
    // en una suelta, el claustro activo.
    let ids = null;
    if (v.comunicacion_id) {
      const { data: fichajes } = await cliente
        .from('comunicaciones_respuestas')
        .select('profesor_id, fichado_at')
        .eq('comunicacion_id', v.comunicacion_id);
      ids = (fichajes || []).filter(f => f.fichado_at).map(f => f.profesor_id);
    }

    let consulta = cliente.from('profesores')
      .select('id, nombre, apellidos')
      .eq('estado', 'activo')
      .order('apellidos', { ascending: true });
    if (ids) consulta = consulta.in('id', ids.length ? ids : ['-']);
    const { data: censo } = await consulta;

    const { data: votantes } = await cliente
      .from('votantes').select('profesor_id').eq('votacion_id', v.id);
    const yaVotaron = new Set((votantes || []).map(x => String(x.profesor_id)));

    const personas = (censo || []).map(p => ({
      id: p.id,
      nombre: nombreCorto(p.nombre, p.apellidos),
      votado: yaVotaron.has(String(p.id)),
    }));

    return Response.json({
      pregunta: v.pregunta,
      abierta: sigueAbierta(v),
      cierre: cierreDe(v),
      de_reunion: !!v.comunicacion_id,
      personas,
      votados: personas.filter(p => p.votado).length,
      total: personas.length,
    });
  }
  const { data: votaciones, error } = await cliente
    .from('votaciones')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return Response.json({ error: error.message, votaciones: [] }, { status: 500 });

  const directivo = esDirectivo(sesion);
  const salida = [];

  // Las que se les ha pasado el tiempo se cierran solas aquí. No hay
  // proceso de fondo: se cierran en cuanto alguien mira la pantalla, y
  // como se refresca sola cada pocos segundos, ocurre al momento. De
  // todas formas el reloj del servidor ya rechazaba los votos tardíos,
  // así que ninguno se cuela por el camino.
  const vencidas = (votaciones || []).filter(
    v => v.estado === 'abierta' && cierreDe(v) && new Date() >= cierreDe(v)
  );
  if (vencidas.length > 0) {
    await cliente
      .from('votaciones')
      .update({ estado: 'cerrada', cerrada_at: new Date().toISOString() })
      .in('id', vencidas.map(v => v.id));
    vencidas.forEach(v => {
      v.estado = 'cerrada';
      v.cerrada_at = new Date().toISOString();
    });
  }

  for (const v of votaciones || []) {
    // Las que están en borrador solo las ve dirección
    if (v.estado === 'borrador' && !directivo) continue;

    const abierta = sigueAbierta(v);

    // ¿Ha votado ya esta persona? Se puede saber sin saber qué votó.
    const { data: yo } = await cliente
      .from('votantes')
      .select('profesor_id')
      .eq('votacion_id', v.id)
      .eq('profesor_id', sesion.id);
    const yaVote = (yo || []).length > 0;

    const { count: participantes } = await cliente
      .from('votantes')
      .select('*', { count: 'exact', head: true })
      .eq('votacion_id', v.id);

    let puedeVotar = true;
    if (v.comunicacion_id) {
      const { data: fichaje } = await cliente
        .from('comunicaciones_respuestas')
        .select('fichado_at')
        .eq('comunicacion_id', v.comunicacion_id)
        .eq('profesor_id', sesion.id);
      puedeVotar = !!(fichaje || [])[0]?.fichado_at;
    }

    const fila = {
      ...v,
      puedeVotar,
      abierta,
      cierre: cierreDe(v),
      yaVote,
      participantes: participantes || 0,
    };

    // El recuento solo cuando ya no se puede votar: si se viera en
    // directo, los últimos votarían sabiendo cómo va.
    if (v.estado === 'cerrada' || (v.estado === 'abierta' && !abierta)) {
      const { data: votos } = await cliente
        .from('votos').select('opcion').eq('votacion_id', v.id);
      const recuento = {};
      (v.opciones || []).forEach(o => { recuento[o] = 0; });
      (votos || []).forEach(x => { recuento[x.opcion] = (recuento[x.opcion] || 0) + 1; });
      fila.recuento = recuento;
      fila.totalVotos = (votos || []).length;
    }

    salida.push(fila);
  }

  return Response.json({ votaciones: salida });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const { accion, id, datos } = await request.json();
    const cliente = supa();

    // ─── Votar ───
    if (accion === 'votar') {
      const { data: vs } = await cliente.from('votaciones').select('*').eq('id', id);
      const v = (vs || [])[0];
      if (!v) return Response.json({ error: 'Esa votación no existe' }, { status: 404 });
      if (!sigueAbierta(v)) return Response.json({ error: 'La votación está cerrada' }, { status: 400 });
      if (!(v.opciones || []).includes(datos?.opcion)) {
        return Response.json({ error: 'Esa opción no es válida' }, { status: 400 });
      }

      // Votación de una reunión: solo vota quien haya fichado. Se
      // comprueba aquí, no en la pantalla: si no, bastaría con enviar
      // la petición a mano para votar sin haber estado.
      if (v.comunicacion_id) {
        const { data: fichaje } = await supa()
          .from('comunicaciones_respuestas')
          .select('fichado_at')
          .eq('comunicacion_id', v.comunicacion_id)
          .eq('profesor_id', sesion.id);
        if (!(fichaje || [])[0]?.fichado_at) {
          return Response.json(
            { error: 'Esta votación es de la reunión y solo pueden votar quienes pasaron lista' },
            { status: 403 }
          );
        }
      }

      // Se apunta primero quién vota. Si ya estaba, la clave primaria
      // lo rechaza y no llega a contarse el voto: nadie vota dos veces.
      const { error: eVotante } = await cliente
        .from('votantes')
        .insert([{ votacion_id: v.id, profesor_id: sesion.id }]);
      if (eVotante) {
        return Response.json({ error: 'Ya has votado en esta votación' }, { status: 400 });
      }

      // Y ahora el voto, suelto, sin nada que lo ate a la persona
      const { error: eVoto } = await cliente
        .from('votos')
        .insert([{ votacion_id: v.id, opcion: datos.opcion }]);
      if (eVoto) return Response.json({ error: eVoto.message }, { status: 500 });

      return Response.json({ ok: true });
    }

    // ─── A partir de aquí, solo dirección ───
    if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

    if (accion === 'crear') {
      const pregunta = (datos?.pregunta || '').trim();
      const opciones = (datos?.opciones || []).map(o => String(o).trim()).filter(Boolean);
      if (!pregunta) return Response.json({ error: 'Falta la pregunta' }, { status: 400 });
      if (opciones.length < 2) return Response.json({ error: 'Pon al menos dos opciones' }, { status: 400 });

      const { data, error } = await cliente.from('votaciones').insert([{
        pregunta,
        descripcion: (datos.descripcion || '').trim() || null,
        opciones,
        duracion_minutos: datos.duracion_minutos ? parseInt(datos.duracion_minutos, 10) : null,
        comunicacion_id: datos.comunicacion_id || null,
        estado: 'borrador',
        creada_por: sesion.nombre || 'Dirección',
      }]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    if (accion === 'abrir') {
      const { error } = await cliente.from('votaciones')
        .update({ estado: 'abierta', abierta_at: new Date().toISOString(), cerrada_at: null })
        .eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'cerrar') {
      const { error } = await cliente.from('votaciones')
        .update({ estado: 'cerrada', cerrada_at: new Date().toISOString() })
        .eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrar y repetir ───
    // Se lleva por delante los votos y la participación: la votación
    // queda como si no se hubiera hecho.
    if (accion === 'eliminar') {
      const { error } = await cliente.from('votaciones').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: 'Error al procesar la petición' }, { status: 500 });
  }
}
