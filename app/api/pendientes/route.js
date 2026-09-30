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
