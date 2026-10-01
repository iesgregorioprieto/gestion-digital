/**
 * CALENDARIO DE EVENTOS
 *
 * GET  ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD
 *      Los eventos de ese tramo que puede ver quien pregunta, más las
 *      convocatorias oficiales en las que está convocado (solo lectura:
 *      se gestionan en su propio módulo, aquí solo se ven).
 *
 * POST { accion: 'crear' | 'editar' | 'eliminar', id?, datos? }
 *      Solo equipo directivo.
 *
 * Quién ve qué lo decide SIEMPRE el servidor:
 *   · Dirección ve todos.
 *   · El resto ve los marcados «visibles para todo el claustro» y
 *     aquellos de los que es destinatario.
 *   · El aviso del banner solo les llega a los destinatarios (/api/hoy).
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { esDestinatario } from '@/app/api/comunicaciones/route';
import { TIPOS_EVENTO, OPCIONES_AVISO, horaValida } from '@/lib/eventos';

export const dynamic = 'force-dynamic';

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const AMBITOS_VALIDOS = ['claustro', 'ccp', 'jefes_dpto', 'tutores', 'equipo_directivo',
  'jefes_estudios', 'director', 'secretario', 'departamento', 'equipo', 'manual'];

// ─── Consultar ───
export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion', eventos: [] }, { status: 401 });

  const url = new URL(request.url);
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta');
  if (!FECHA.test(desde || '') || !FECHA.test(hasta || '')) {
    return Response.json({ error: 'Faltan las fechas', eventos: [] }, { status: 400 });
  }

  try {
    const c = supa();
    const directivo = esDirectivo(sesion);

    const { data: fichas } = await c.from('profesores')
      .select('id, nombre, apellidos, departamento, rol, rol_gestion').eq('id', sesion.id);
    const ficha = (fichas || [])[0] || null;

    // Los que empiezan antes de «hasta» y no han terminado antes de «desde»
    const { data, error } = await c.from('eventos').select('*')
      .lte('fecha', hasta)
      .or(`fecha.gte.${desde},fecha_fin.gte.${desde}`)
      .order('fecha').order('hora_inicio', { ascending: true, nullsFirst: true });
    if (error) return Response.json({ error: error.message, eventos: [] }, { status: 500 });

    const eventos = [];
    for (const ev of data || []) {
      const mio = esDestinatario(ev, ficha);
      if (!directivo && !ev.visible_todos && !mio) continue;
      const fila = { ...ev, origen: 'evento', esMio: mio };
      // Quién creó y a quién va es cosa de gestión; al profesorado le basta el evento
      if (!directivo) { delete fila.destinatarios; delete fila.creado_por; }
      eventos.push(fila);
    }

    // Convocatorias oficiales en las que está convocado (o todas, si es directivo)
    try {
      const { data: convs } = await c.from('convocatorias')
        .select('id, titulo, fecha, hora, lugar, estado, convocados')
        .gte('fecha', desde).lte('fecha', hasta)
        .in('estado', ['convocada', 'en_curso', 'cerrada']);
      for (const cv of convs || []) {
        const convocado = (cv.convocados || []).includes(sesion.id);
        if (!directivo && !convocado) continue;
        const h = /^(\d{1,2}):(\d{2})/.exec(cv.hora || '');
        eventos.push({
          id: `conv-${cv.id}`, origen: 'convocatoria', tipo: 'claustro',
          titulo: cv.titulo, fecha: cv.fecha, fecha_fin: null,
          hora_inicio: h ? `${h[1].padStart(2, '0')}:${h[2]}` : null, hora_fin: null,
          lugar: cv.lugar, enlace: '/convocatorias', descripcion: null,
          asistencia_obligatoria: true, esMio: convocado,
        });
      }
    } catch (e) {
      console.error('[eventos] convocatorias:', e?.message);
    }

    eventos.sort((a, b) => (a.fecha + (a.hora_inicio || '')).localeCompare(b.fecha + (b.hora_inicio || '')));
    return Response.json({ eventos, puedeEditar: directivo });
  } catch (e) {
    return Response.json({ error: e.message, eventos: [] }, { status: 500 });
  }
}

/** Revisa y limpia lo que llega del formulario. Devuelve { fila } o { error } */
async function prepararFila(c, datos) {
  const titulo = (datos?.titulo || '').trim();
  if (!titulo) return { error: 'Falta el título' };
  if (!FECHA.test(datos.fecha || '')) return { error: 'Falta la fecha' };

  const fecha_fin = FECHA.test(datos.fecha_fin || '') && datos.fecha_fin > datos.fecha ? datos.fecha_fin : null;
  const hora_inicio = horaValida(datos.hora_inicio) ? datos.hora_inicio : null;
  const hora_fin = hora_inicio && horaValida(datos.hora_fin) ? datos.hora_fin : null;
  if (hora_inicio && hora_fin && !fecha_fin && hora_fin <= hora_inicio) {
    return { error: 'La hora de fin debe ser posterior a la de inicio' };
  }

  let enlace = (datos.enlace || '').trim() || null;
  if (enlace && !/^https?:\/\//i.test(enlace)) enlace = `https://${enlace}`;

  const ambito = (Array.isArray(datos.ambito) ? datos.ambito : []).filter(a => AMBITOS_VALIDOS.includes(a));
  if (!ambito.length) return { error: 'Elige a quién afecta' };
  const departamento = ambito.includes('departamento') && Array.isArray(datos.departamento) ? datos.departamento : null;
  if (ambito.includes('departamento') && !departamento?.length) return { error: 'Elige al menos un departamento' };

  // Personas a dedo + miembros de los equipos elegidos, fijados al guardar
  // (igual que Comunicaciones: cambiar el equipo mañana no reescribe esto)
  let destinatarios = ambito.includes('manual') && Array.isArray(datos.destinatarios) ? datos.destinatarios : [];
  if (ambito.includes('equipo')) {
    if (!Array.isArray(datos.equipos) || !datos.equipos.length) return { error: 'Elige al menos un equipo' };
    const { data: eqs } = await c.from('equipos').select('miembros').in('id', datos.equipos);
    destinatarios = [...destinatarios, ...(eqs || []).flatMap(e => e.miembros || [])];
  }
  if (ambito.includes('manual') && !destinatarios.length) return { error: 'Elige al menos una persona' };
  destinatarios = [...new Set(destinatarios)];

  const aviso = datos.aviso_minutos === null || datos.aviso_minutos === '' || datos.aviso_minutos === undefined
    ? null : Number(datos.aviso_minutos);
  if (aviso !== null && !OPCIONES_AVISO.some(o => o.valor === aviso)) return { error: 'Antelación de aviso no válida' };

  return {
    fila: {
      titulo,
      tipo: TIPOS_EVENTO.some(t => t.valor === datos.tipo) ? datos.tipo : 'otro',
      fecha: datos.fecha, fecha_fin, hora_inicio, hora_fin,
      lugar: (datos.lugar || '').trim() || null,
      enlace,
      descripcion: (datos.descripcion || '').trim() || null,
      ambito, departamento,
      destinatarios: destinatarios.length ? destinatarios : null,
      visible_todos: datos.visible_todos !== false,
      asistencia_obligatoria: !!datos.asistencia_obligatoria,
      aviso_minutos: aviso,
    },
  };
}

// ─── Crear, editar, eliminar ───
export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  try {
    const { accion, id, datos } = await request.json();
    const c = supa();

    if (accion === 'eliminar') {
      if (!id) return Response.json({ error: 'Falta el evento' }, { status: 400 });
      const { error } = await c.from('eventos').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion !== 'crear' && accion !== 'editar') {
      return Response.json({ error: 'Acción no válida' }, { status: 400 });
    }

    const { fila, error: invalido } = await prepararFila(c, datos);
    if (invalido) return Response.json({ error: invalido }, { status: 400 });

    if (accion === 'crear') {
      const { data, error } = await c.from('eventos').insert({
        ...fila, creado_por: sesion.id, creado_por_nombre: sesion.nombre || null,
      }).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    if (!id) return Response.json({ error: 'Falta el evento' }, { status: 400 });
    const { error } = await c.from('eventos')
      .update({ ...fila, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
