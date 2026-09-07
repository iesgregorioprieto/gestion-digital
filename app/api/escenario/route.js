import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { etiquetaMotivo } from '@/lib/motivosAusencia';

export const dynamic = 'force-dynamic';

/**
 * Escenario de un día: quién falta y por qué.
 *
 * Antes lo leía el componente directamente con getSupabase() desde el
 * navegador. Pero las tablas de ausencias, actividades y dld tienen los
 * permisos cerrados (RLS), así que la consulta fallaba en silencio y la
 * pantalla salía en blanco. Ahora pasa por aquí, con la clave de
 * servicio que sí puede leer.
 *
 * Solo equipo directivo.
 */

const TIPOS_DLD = {
  canoso:      '🦳 CANOSO',
  no_lectivo:  '🌙 DLD no lectivo',
  '1_lectivo': '📚 1º DLD lectivo',
  '2_lectivo': '📖 2º DLD lectivo',
  '3_lectivo': '📗 3º DLD lectivo',
};

export async function GET(request) {
  const sesion = await verificarSesion(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  const fecha = new URL(request.url).searchParams.get('fecha');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return Response.json({ error: 'fecha_invalida' }, { status: 400 });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor());

  const [rAus, rAct, rDld] = await Promise.all([
    sb.from('ausencias')
      .select('id, profesor_nombre, fecha_inicio, fecha_fin, subtipo, motivo, horas, estado, datos_extra')
      .lte('fecha_inicio', fecha).gte('fecha_fin', fecha),
    sb.from('actividades')
      .select('id, titulo, profesor_nombre, acompanantes, grupos, fecha_inicio, fecha_fin, estado')
      .lte('fecha_inicio', fecha).gte('fecha_fin', fecha),
    sb.from('dld')
      .select('id, profesor_nombre, tipo_dld, fecha_solicitada, horas, estado')
      .eq('fecha_solicitada', fecha),
  ]);

  if (rAus.error || rAct.error || rDld.error) {
    const msg = rAus.error?.message || rAct.error?.message || rDld.error?.message;
    return Response.json({ error: msg }, { status: 500 });
  }

  const items = [];

  // 1 y 3. Ausencias → las de formación van a su propio bloque
  (rAus.data || []).forEach(a => {
    const esFormacion = a.subtipo === 'permiso_formacion';
    const ex = a.datos_extra || {};
    const detalleFormacion = [ex.curso, ex.entidad, ex.horario].filter(Boolean).join(' · ');
    items.push({
      bloque: esFormacion ? 'formacion' : 'ausencias',
      profesor: a.profesor_nombre || '—',
      detalle: (esFormacion && detalleFormacion)
        ? detalleFormacion
        : (a.subtipo ? etiquetaMotivo(a.subtipo) : (a.motivo || 'Sin especificar')),
      nHoras: Array.isArray(a.horas) ? a.horas.length : 0,
      estado: a.estado,
    });
  });

  // 2. Extraescolares: responsable y acompañantes
  (rAct.data || []).filter(a => a.estado !== 'rechazada').forEach(a => {
    const acomp = Array.isArray(a.acompanantes) ? a.acompanantes : [];
    const nombres = [a.profesor_nombre, ...acomp].filter(Boolean);
    const grupos = Array.isArray(a.grupos) && a.grupos.length ? ` · ${a.grupos.join(', ')}` : '';
    nombres.forEach(n => {
      items.push({
        bloque: 'extraescolar',
        profesor: typeof n === 'string' ? n : (n?.nombre || '—'),
        detalle: `${a.titulo || 'Actividad'}${grupos}`,
        nHoras: 0,
        estado: a.estado,
      });
    });
  });

  // 4. DLD aprobados y pendientes
  (rDld.data || []).filter(d => d.estado === 'aprobada' || d.estado === 'pendiente').forEach(d => {
    items.push({
      bloque: 'dld',
      profesor: d.profesor_nombre || '—',
      detalle: TIPOS_DLD[d.tipo_dld] || d.tipo_dld || 'DLD',
      nHoras: Array.isArray(d.horas) ? d.horas.length : 0,
      estado: d.estado,
    });
  });

  return Response.json({ items });
}
