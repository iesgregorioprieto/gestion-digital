/**
 * TAREAS PENDIENTES — lo que tiene por hacer quien tiene la sesión
 *
 * Petición de José María (30/09/2026): un bloque en el panel, debajo de
 * Mi Horario, con las tareas pendientes según el perfil de cada uno.
 * Todo se calcula aquí, en el servidor, en una sola petición: el filtro
 * por persona y por cargo no puede depender del navegador.
 *
 * Cada tarea: { id, icono, texto, detalle?, enlace, urgente? }
 *
 * PASO 1 (este): para todos y para el director.
 *   · Todos: ausencias sin justificar, hoja de servicios sin subir.
 *   · Director: DLD sin resolver, actividades por revisar.
 *   · Director y secretario: incidencias de la app sin atender.
 * Pasos siguientes: tutor, jefe de departamento, jefatura de estudios.
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal } from '@/lib/fechas';
import { computaComoFalta, etiquetaMotivo } from '@/lib/motivosAusencia';
import { ahoraEnCentro } from '@/lib/asignacionGuardias';

export const dynamic = 'force-dynamic';

const PLAZO_JUSTIFICAR = 3; // días desde el día de la falta

// Días entre dos fechas AAAA-MM-DD (b - a), sin líos de horario de verano
function diasEntre(a, b) {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

function fechaCorta(f) {
  return new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export async function GET(request) {
  const secreto = process.env.SESSION_SECRET;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  const sesion = secreto && m ? await verificarSesion(m[1], secreto) : null;
  if (!sesion) return Response.json({ error: 'sin_sesion', tareas: [] }, { status: 401 });

  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } });
  const hoy = hoyLocal();
  const tareas = [];

  // Cada bloque va por separado: si uno falla, los demás salen igual
  const bloque = async (nombre, fn) => {
    try { await fn(); } catch (e) { console.error(`[pendientes] ${nombre}:`, e?.message); }
  };

  const esDirector = sesion.rol === 'director';
  const esSecretario = sesion.rol === 'secretario';

  await Promise.all([

    // ── TODOS: ausencias sin justificar ─────────────────────────────
    // Solo las que ya han empezado (lo futuro aún no se puede justificar)
    // y solo las que cuentan como falta (DLD y actividades no).
    bloque('ausencias', async () => {
      const { data } = await c.from('ausencias')
        .select('id, fecha_inicio, subtipo, estado')
        .eq('profesor_id', sesion.id)
        .in('estado', ['pendiente', 'sin_justificar'])
        .lte('fecha_inicio', hoy)
        .order('fecha_inicio', { ascending: true });
      const faltas = (data || []).filter(a => !a.subtipo || computaComoFalta(a.subtipo));
      for (const a of faltas) {
        const quedan = PLAZO_JUSTIFICAR - diasEntre(a.fecha_inicio, hoy);
        const vencida = a.estado === 'sin_justificar' || quedan <= 0;
        tareas.push({
          id: `aus-${a.id}`, icono: '📄',
          texto: `Justificar la ausencia del ${fechaCorta(a.fecha_inicio)}`,
          detalle: `${a.subtipo ? etiquetaMotivo(a.subtipo) + ' · ' : ''}${vencida
            ? 'Plazo vencido: puedes justificarla igualmente'
            : `Te quedan ${quedan} día${quedan !== 1 ? 's' : ''}`}`,
          enlace: '/ausencias', urgente: vencida || quedan <= 1,
        });
      }
    }),

    // ── TODOS: confirmar asistencia a una convocatoria ──────────────
    // Se queda en pendientes hasta que empieza la reunión (fecha + hora,
    // en hora de Madrid), haya respondido o no: es sobre todo un
    // recordatorio de que hay una convocatoria, no solo una petición de
    // respuesta. Si no se puso hora, se queda durante todo ese día.
    bloque('convocatorias', async () => {
      const { data } = await c.from('convocatorias')
        .select('id, titulo, fecha, hora')
        .contains('convocados', [sesion.id])
        .eq('estado', 'convocada')
        .order('fecha', { ascending: true });
      let lista = data || [];
      if (!lista.length) return;
      const centro = ahoraEnCentro();
      const minutosDe = (hhmm) => { const [h, m] = (hhmm || '').split(':').map(Number); return h * 60 + (m || 0); };
      lista = lista.filter(cv => {
        if (!cv.fecha) return true;
        if (cv.fecha > centro.fecha) return true;
        if (cv.fecha < centro.fecha) return false;
        return !cv.hora || centro.minutos < minutosDe(cv.hora);
      });
      if (!lista.length) return;

      const { data: a } = await c.from('convocatoria_asistencia')
        .select('convocatoria_id, asistira').in('convocatoria_id', lista.map(x => x.id)).eq('profesor_id', sesion.id);
      const miRespuesta = new Map((a || []).map(x => [x.convocatoria_id, x.asistira]));

      for (const cv of lista) {
        const quedan = cv.fecha ? diasEntre(hoy, cv.fecha) : null;
        const resp = miRespuesta.get(cv.id);
        tareas.push({
          id: `conv-${cv.id}`, icono: '📅',
          texto: resp === undefined
            ? `Confirma si asistirás: ${cv.titulo}`
            : `${resp ? 'Vas a asistir' : 'Has dicho que no podrás'}: ${cv.titulo}`,
          detalle: `${cv.fecha ? fechaCorta(cv.fecha) : ''}${cv.hora ? ` · ${cv.hora}` : ''}`,
          enlace: '/convocatorias', urgente: resp === undefined && quedan !== null && quedan <= 1,
        });
      }
    }),

    // ── TODOS: encuesta de valoración abierta y sin contestar ──────
    bloque('valoracion', async () => {
      const { data: rondas } = await c.from('valoracion_rondas')
        .select('id, titulo, cierra').lte('abre', hoy).gte('cierra', hoy)
        .order('created_at', { ascending: false }).limit(1);
      const r = (rondas || [])[0];
      if (!r) return;
      const { data: ya } = await c.from('valoracion_contestados')
        .select('ronda_id').eq('ronda_id', r.id).eq('profesor_id', sesion.id).limit(1);
      if ((ya || []).length) return;
      const quedan = diasEntre(hoy, r.cierra);
      tareas.push({
        id: `valoracion-${r.id}`, icono: '⭐',
        texto: 'Valorar los módulos de APrieto',
        detalle: `${r.titulo} · Anónima, un par de minutos · ${quedan === 0 ? 'Cierra hoy' : `Cierra el ${fechaCorta(r.cierra)}`}`,
        enlace: '/valoracion', urgente: quedan <= 1,
      });
    }),

    // ── TODOS: hoja de servicios ────────────────────────────────────
    bloque('hoja', async () => {
      const { data } = await c.from('profesores').select('*').eq('id', sesion.id);
      const p = (data || [])[0];
      // Si la columna no existiera, no se molesta a nadie
      if (p && 'servicios_origen' in p && p.servicios_origen !== 'hoja') {
        tareas.push({
          id: 'hoja', icono: '🗂️',
          texto: 'Subir tu hoja de servicios',
          detalle: 'Se usa para tu antigüedad en el cuerpo (desempates de DLD y día CANOSO). Solo una vez',
          enlace: '/mis-datos#hoja-servicios',
        });
      }
    }),

    // ── TODOS: formación autorizada sin ausencia registrada ─────────
    bloque('formacion_mia', async () => {
      const { data } = await c.from('solicitudes_formacion')
        .select('id, titulo, fecha_inicio')
        .eq('profesor_id', sesion.id).eq('estado', 'autorizada')
        .is('ausencia_id', null)
        .order('fecha_inicio', { ascending: true });
      for (const s of (data || [])) {
        const quedan = diasEntre(hoy, s.fecha_inicio);
        tareas.push({
          id: `form-${s.id}`, icono: '🎓',
          texto: `Registrar la ausencia de tu formación del ${fechaCorta(s.fecha_inicio)}`,
          detalle: `${s.titulo} · Concedida: registra la ausencia y solicita el permiso en Delphos`,
          enlace: `/ausencias?formacion=${s.id}&fecha=${s.fecha_inicio}`, urgente: quedan <= 2,
        });
      }
    }),

    // ── JEFE DE DEPARTAMENTO: formación por aprobar ─────────────────
    bloque('formacion_jefe', async () => {
      const { data: fichas } = await c.from('profesores').select('departamento, rol').eq('id', sesion.id);
      const yo = (fichas || [])[0];
      if (!yo?.departamento || !Array.isArray(yo.rol) || !yo.rol.includes('jefe_departamento')) return;
      const { data } = await c.from('solicitudes_formacion')
        .select('id, fecha_inicio, jefe_limite')
        .eq('estado', 'pendiente_jefe').eq('departamento', yo.departamento).neq('profesor_id', sesion.id)
        .order('jefe_limite', { ascending: true });
      const lista = data || [];
      if (!lista.length) return;
      const limite = lista[0].jefe_limite;
      tareas.push({
        id: 'formacion_jefe', icono: '🎓',
        texto: `${lista.length} solicitud${lista.length !== 1 ? 'es' : ''} de formación de tu departamento por aprobar`,
        detalle: limite ? `Plazo hasta el ${fechaCorta(limite)}; si no contestas, pasa sola al director` : '',
        enlace: '/formacion?vista=jefe', urgente: !!limite && diasEntre(hoy, limite) <= 1,
      });
    }),

    // ── DIRECTOR: formación por autorizar ───────────────────────────
    esDirector && bloque('formacion_dir', async () => {
      const { data } = await c.from('solicitudes_formacion')
        .select('id, fecha_inicio').eq('estado', 'pendiente_director')
        .order('fecha_inicio', { ascending: true });
      const lista = data || [];
      if (!lista.length) return;
      const cerca = lista.filter(s => diasEntre(hoy, s.fecha_inicio) <= 3).length;
      tareas.push({
        id: 'formacion_dir', icono: '🎓',
        texto: `${lista.length} solicitud${lista.length !== 1 ? 'es' : ''} de formación por autorizar`,
        detalle: cerca ? `${cerca} empieza${cerca !== 1 ? 'n' : ''} en los próximos 3 días` : `La más próxima, ${fechaCorta(lista[0].fecha_inicio)}`,
        enlace: '/formacion?vista=direccion', urgente: cerca > 0,
      });
    }),

    // ── DIRECTOR: DLD sin resolver ──────────────────────────────────
    esDirector && bloque('dld', async () => {
      const { data } = await c.from('dld')
        .select('id, fecha_solicitada')
        .eq('estado', 'pendiente')
        .order('fecha_solicitada', { ascending: true });
      const lista = data || [];
      if (!lista.length) return;
      const proxima = lista[0].fecha_solicitada;
      const cerca = lista.filter(d => d.fecha_solicitada && diasEntre(hoy, d.fecha_solicitada) <= 2).length;
      tareas.push({
        id: 'dld', icono: '📅',
        texto: `${lista.length} día${lista.length !== 1 ? 's' : ''} de libre disposición por resolver`,
        detalle: cerca
          ? `${cerca} para hoy o los dos próximos días`
          : proxima ? `El más próximo, ${fechaCorta(proxima)}` : '',
        enlace: '/gestion/dld', urgente: cerca > 0,
      });
    }),

    // ── DIRECTOR: actividades complementarias por revisar ───────────
    esDirector && bloque('actividades', async () => {
      const { data } = await c.from('actividades').select('id, estado');
      const n = (data || []).filter(a => (a.estado || 'pendiente') === 'pendiente').length;
      if (!n) return;
      tareas.push({
        id: 'actividades', icono: '🎒',
        texto: `${n} actividad${n !== 1 ? 'es' : ''} complementaria${n !== 1 ? 's' : ''} por revisar`,
        enlace: '/gestion/actividades',
      });
    }),

    // ── DIRECTOR Y SECRETARIO: incidencias de la app ────────────────
    (esDirector || esSecretario) && bloque('incidencias', async () => {
      const { data } = await c.from('incidencias_app').select('id').eq('estado', 'nueva');
      const n = (data || []).length;
      if (!n) return;
      tareas.push({
        id: 'incidencias', icono: '🐞',
        texto: `${n} incidencia${n !== 1 ? 's' : ''} o sugerencia${n !== 1 ? 's' : ''} de la app sin atender`,
        enlace: '/gestion/incidencias',
      });
    }),
  ].filter(Boolean));

  // Lo urgente, arriba
  tareas.sort((a, b) => (b.urgente ? 1 : 0) - (a.urgente ? 1 : 0));
  return Response.json({ tareas });
}
