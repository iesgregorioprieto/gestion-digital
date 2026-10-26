import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { enviarPushA } from '@/lib/pushServidor';
import { SECCIONES, tipoDeIncidencia } from '@/lib/tiposMantenimiento';

const IDS_SECCION = SECCIONES.map(s => s.id);

/** Avisa a quien dio parte de que su incidencia ya está arreglada. */
async function avisarResueltas(cliente, filas, quien) {
  const porProfesor = {};
  for (const f of filas || []) {
    if (!f.profesor_id || f.profesor_id === quien) continue;
    (porProfesor[f.profesor_id] ||= []).push(f);
  }
  await Promise.all(Object.entries(porProfesor).map(([pid, lista]) => {
    const una = lista[0];
    const cuerpo = lista.length === 1
      ? `${una.estancia ? una.estancia + ': ' : ''}${String(una.descripcion || '').slice(0, 140)}`
      : `${lista.length} de tus avisos de mantenimiento ya están arreglados.`;
    return enviarPushA(cliente, [pid], { titulo: '✅ Avería arreglada', cuerpo, url: '/mantenimiento' });
  }));
}

// Aulas reales del horario, para el buscador del aviso. Cambian una vez
// al año: se guardan una hora en memoria.
let _aulas = null;
let _aulasHora = 0;
async function aulasDelHorario(cliente) {
  if (_aulas && Date.now() - _aulasHora < 3600_000) return _aulas;
  const vistas = new Set();
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await cliente.from('horarios_profesores')
      .select('aula').not('aula', 'is', null).range(desde, desde + 999);
    if (error || !data) break;
    for (const r of data) {
      const a = String(r.aula || '').trim();
      if (a) vistas.add(a);
    }
    if (data.length < 1000) break;
  }
  _aulas = [...vistas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
  _aulasHora = Date.now();
  return _aulas;
}

export async function GET(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });
    const url = new URL(request.url);
    const cliente = supa();

    if (url.searchParams.get('aulas')) {
      return Response.json({ aulas: await aulasDelHorario(cliente) });
    }

    // ¿Ya hay un aviso abierto de esa sección en ese sitio? Solo se
    // devuelve qué pasa y cuándo, no quién lo avisó.
    if (url.searchParams.get('repetidas')) {
      const seccion = url.searchParams.get('seccion') || '';
      const estancia = (url.searchParams.get('estancia') || '').trim();
      if (!estancia) return Response.json({ repetidas: [] });
      const { data } = await cliente.from('mantenimiento')
        .select('id, seccion, estancia, ubicacion_exacta, descripcion, estado, created_at')
        .neq('estado', 'resuelta')
        .ilike('estancia', estancia.replace(/[%_]/g, ''));
      const repetidas = (data || [])
        .filter(i => tipoDeIncidencia(i).id === seccion)
        .map(({ ubicacion_exacta, descripcion, estado, created_at }) => ({ ubicacion_exacta, descripcion, estado, created_at }));
      return Response.json({ repetidas });
    }

    return Response.json({ error: 'Consulta desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

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
      if (tabla === 'mantenimiento' && !IDS_SECCION.includes(fila.seccion)) delete fila.seccion;
      // El equipo directivo puede darla de alta en nombre de otra
      // persona; el resto, solo a su nombre.
      if (!esDirectivo(sesion) || !fila.profesor_id) fila.profesor_id = sesion.id;
      // El estado y los comentarios internos no los pone quien solicita
      if (!esDirectivo(sesion)) {
        fila.estado = 'pendiente';
        delete fila.comentario_secretario;
      }

      let { data, error } = await supa().from(tabla).insert([fila]).select('id');
      // Si la columna «seccion» aún no existe en la tabla, se guarda sin ella
      if (error && fila.seccion && /seccion/i.test(error.message || '')) {
        delete fila.seccion;
        ({ data, error } = await supa().from(tabla).insert([fila]).select('id'));
      }
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Resolver: cambiar estado y dejar comentario ───
    if (accion === 'resolver') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.estado) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const cliente = supa();
      const { data, error } = await cliente.from(tabla).update({
        estado: datos.estado,
        comentario_secretario: datos.comentario_secretario ?? null,
      }).eq('id', id).select(tabla === 'mantenimiento' ? 'id, profesor_id, estancia, descripcion' : 'id');

      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!(data || []).length) return Response.json({ error: 'No se ha encontrado la solicitud' }, { status: 404 });
      if (tabla === 'mantenimiento' && datos.estado === 'resuelta') await avisarResueltas(cliente, data, sesion.id);
      return Response.json({ ok: true });
    }

    // ─── Resolver varias de golpe (hoja de revisión de conserjes) ───
    // Solo cambia el estado; el comentario que tuviera cada una se
    // conserva.
    if (accion === 'resolver_varios') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      const ids = Array.isArray(datos?.ids) ? datos.ids.filter(Boolean) : [];
      if (!ids.length) return Response.json({ error: 'No hay ninguna seleccionada' }, { status: 400 });

      const cliente = supa();
      const { data, error } = await cliente.from(tabla)
        .update({ estado: 'resuelta' })
        .in('id', ids)
        .select(tabla === 'mantenimiento' ? 'id, profesor_id, estancia, descripcion' : 'id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (tabla === 'mantenimiento') await avisarResueltas(cliente, data, sesion.id);
      return Response.json({ ok: true, n: (data || []).length });
    }

    // ─── Cambiar la sección de una incidencia (si el profesor se equivocó) ───
    if (accion === 'cambiar_seccion') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (tabla !== 'mantenimiento' || !id || !IDS_SECCION.includes(datos?.seccion)) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }
      const { error } = await supa().from('mantenimiento').update({ seccion: datos.seccion }).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Guardar la sección de las antiguas, que no la tenían ───
    // Solo rellena las vacías: nunca pisa lo que eligió un profesor o
    // corrigió secretaría.
    if (accion === 'asignar_secciones') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (tabla !== 'mantenimiento') return Response.json({ error: 'tabla_no_valida' }, { status: 400 });
      const lista = Array.isArray(datos?.lista) ? datos.lista : [];
      const porSeccion = {};
      for (const it of lista) {
        if (it?.id && IDS_SECCION.includes(it.seccion)) (porSeccion[it.seccion] ||= []).push(it.id);
      }
      const cliente = supa();
      let n = 0;
      for (const [seccion, ids] of Object.entries(porSeccion)) {
        const { data, error } = await cliente.from('mantenimiento')
          .update({ seccion }).in('id', ids).is('seccion', null).select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        n += (data || []).length;
      }
      return Response.json({ ok: true, n });
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
