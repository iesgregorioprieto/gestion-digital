import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
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

/** Lee la sesión de la cookie, igual que el resto de rutas */
async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

export async function GET(request) {
  /**
   * SOLO EL EQUIPO DIRECTIVO.
   *
   * El escenario del día no es una lista de quién falta: trae el motivo
   * tal como lo escribió cada uno, y ahí hay cosas como «visita
   * ginecología» o «pruebas del preoperatorio de mi hijo». Eso es un dato
   * de salud, y solo lo puede ver quien tramita la justificación.
   *
   * Antes bastaba con tener la sesión iniciada. Las cuatro pantallas que
   * lo usan son de dirección y están bien protegidas, pero eso no
   * protegía nada: cualquier profesor podía pedir este endpoint desde el
   * navegador y leer el escenario de cualquier día. La comprobación tiene
   * que estar aquí, que es por donde salen los datos.
   */
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'solo_equipo_directivo' }, { status: 403 });
  }

  const fecha = new URL(request.url).searchParams.get('fecha');
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return Response.json({ error: 'fecha_invalida' }, { status: 400 });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor());

  const [rProf, rAus, rAct, rDld] = await Promise.all([
    sb.from('profesores').select('id, nombre, apellidos'),
    // Sin fecha de fin la ausencia sigue abierta: es lo que es una baja,
    // que no tiene alta prevista. Pedir que fecha_fin sea mayor o igual
    // que hoy las dejaba fuera, y quien lleva dos semanas de baja no
    // aparecía en el escenario del día.
    sb.from('ausencias')
      .select('id, profesor_id, profesor_nombre, fecha_inicio, fecha_fin, subtipo, motivo, horas, estado, datos_extra')
      .lte('fecha_inicio', fecha)
      .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
    sb.from('actividades')
      .select('id, titulo, profesor_nombre, acompanantes, grupos, fecha_inicio, fecha_fin, estado')
      .lte('fecha_inicio', fecha)
      .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
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
    // Una ausencia abierta es una baja. Se marca como tal para que en el
    // vistazo del día se distinga de quien falta una mañana.
    const esBaja = !a.fecha_fin && a.fecha_inicio < fecha;
    const ex = a.datos_extra || {};
    const detalleFormacion = [ex.curso, ex.entidad, ex.horario].filter(Boolean).join(' · ');
    items.push({
      bloque: esFormacion ? 'formacion' : 'ausencias',
      profesor: a.profesor_nombre || '—',
      detalle: (esFormacion && detalleFormacion)
        ? detalleFormacion
        : esBaja
          ? `Baja desde el ${a.fecha_inicio.slice(8, 10)}/${a.fecha_inicio.slice(5, 7)} — sin sustituto`
          : (a.subtipo ? etiquetaMotivo(a.subtipo) : (a.motivo || 'Sin especificar')),
      nHoras: Array.isArray(a.horas) ? a.horas.length : 0,
      estado: a.estado,
    });
  });

  // 2. Extraescolares: responsable y acompañantes
  //
  // Los acompañantes se guardan por identificador, no por nombre. Antes se
  // pintaban en crudo y en el escenario del día aparecía un profesor
  // llamado "76689848-1d3f-43b7-be61-...".
  const nombrePorId = new Map(
    (rProf.data || []).map(p => [p.id, `${p.nombre} ${p.apellidos}`.trim()])
  );
  const comoNombre = x => {
    if (!x) return null;
    if (typeof x === 'string') return nombrePorId.get(x) || x;
    return nombrePorId.get(x.id) || x.nombre || null;
  };

  (rAct.data || []).filter(a => a.estado !== 'rechazada').forEach(a => {
    const acomp = Array.isArray(a.acompanantes) ? a.acompanantes : [];
    const nombres = [a.profesor_nombre, ...acomp.map(comoNombre)].filter(Boolean);
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
