import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal, sumarDias } from '@/lib/fechas';
import { IDS_MODULOS, tieneModulo } from '@/lib/modulosValoracion';

/**
 * RONDAS DE VALORACIÓN (oct. 2026)
 *
 * El equipo directivo lanza una ronda con los módulos que quiera y una
 * fecha de cierre. Mientras está abierta, a cada profesor le sale en
 * Tareas pendientes hasta que contesta. Cada módulo: de 1 a 5 estrellas
 * o «No lo uso», con comentario opcional.
 *
 * ANONIMATO: quién ha contestado (valoracion_contestados) y qué ha
 * contestado (valoracion_respuestas) van en tablas separadas, sin hora
 * y sin nada que las enlace. Solo si la persona marca que quiere que
 * la contacten se guarda su id junto a sus respuestas.
 *
 * La tabla antigua `valoraciones` no se toca: es la «Ronda 0».
 */

export const dynamic = 'force-dynamic';

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

/** La ronda abierta hoy, si la hay (la más reciente) */
async function rondaAbierta(c) {
  const hoy = hoyLocal();
  const { data } = await c.from('valoracion_rondas')
    .select('id, titulo, modulos, abre, cierra')
    .lte('abre', hoy).gte('cierra', hoy)
    .order('created_at', { ascending: false }).limit(1);
  return (data || [])[0] || null;
}

// Resume las respuestas de una ronda por módulo
function resumir(respuestas) {
  const por = {};
  for (const r of respuestas) {
    const m = por[r.modulo] ||= { usan: 0, no_usa: 0, suma: 0, reparto: [0, 0, 0, 0, 0] };
    if (r.no_usa) { m.no_usa++; continue; }
    m.usan++; m.suma += r.estrellas; m.reparto[r.estrellas - 1]++;
  }
  for (const k of Object.keys(por)) {
    por[k].media = por[k].usan ? Math.round((por[k].suma / por[k].usan) * 10) / 10 : null;
    delete por[k].suma;
  }
  return por;
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  const c = supa();
  const url = new URL(request.url);
  const vista = url.searchParams.get('vista');

  try {
    // ── La encuesta del profesor ──
    if (vista === 'mia') {
      const ronda = await rondaAbierta(c);
      if (!ronda) return Response.json({ ronda: null });
      const { data } = await c.from('valoracion_contestados')
        .select('ronda_id').eq('ronda_id', ronda.id).eq('profesor_id', sesion.id).limit(1);
      return Response.json({ ronda, contestada: (data || []).length > 0 });
    }

    // ── Panel del equipo directivo ──
    if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

    const { data: rondas } = await c.from('valoracion_rondas')
      .select('id, titulo, modulos, abre, cierra, created_at')
      .order('created_at', { ascending: false });

    const { count: activos } = await c.from('profesores')
      .select('id', { count: 'exact', head: true }).eq('estado', 'activo');

    const lista = [];
    for (const r of (rondas || [])) {
      const { count } = await c.from('valoracion_contestados')
        .select('profesor_id', { count: 'exact', head: true }).eq('ronda_id', r.id);
      lista.push({ ...r, contestados: count || 0 });
    }

    const id = url.searchParams.get('ronda');
    if (!id) return Response.json({ rondas: lista, activos: activos || 0, hoy: hoyLocal() });

    const actual = lista.find(r => r.id === id);
    if (!actual) return Response.json({ error: 'ronda_no_existe' }, { status: 404 });

    const { data: resp } = await c.from('valoracion_respuestas')
      .select('id, modulo, estrellas, no_usa, sugerencia, profesor_id, quiere_contacto')
      .eq('ronda_id', id);

    // La ronda anterior, para comparar medias
    const idx = lista.indexOf(actual);
    const anterior = lista[idx + 1] || null;
    let resumenAnterior = null;
    if (anterior) {
      const { data: respAnt } = await c.from('valoracion_respuestas')
        .select('modulo, estrellas, no_usa').eq('ronda_id', anterior.id);
      resumenAnterior = resumir(respAnt || []);
    }

    // Nombre y correo solo de quien pidió que le contacten
    const ids = [...new Set((resp || []).filter(r => r.quiere_contacto && r.profesor_id).map(r => r.profesor_id))];
    const personas = {};
    if (ids.length) {
      const { data: profs } = await c.from('profesores').select('id, nombre, apellidos, email').in('id', ids);
      for (const p of (profs || [])) personas[p.id] = { nombre: `${p.nombre} ${p.apellidos}`, email: p.email };
    }

    const comentarios = (resp || []).filter(r => r.sugerencia).map(r => ({
      id: r.id, modulo: r.modulo, estrellas: r.estrellas, no_usa: r.no_usa, sugerencia: r.sugerencia,
      persona: r.quiere_contacto ? personas[r.profesor_id] || null : null,
    }));

    return Response.json({
      rondas: lista, activos: activos || 0, hoy: hoyLocal(),
      resumen: resumir(resp || []), anterior: anterior ? { titulo: anterior.titulo, resumen: resumenAnterior } : null,
      comentarios,
    });
  } catch (e) {
    console.error('[valoraciones/rondas] GET:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  const c = supa();
  const body = await request.json().catch(() => ({}));
  const hoy = hoyLocal();

  try {
    // ── Contestar la encuesta ──
    if (body.accion === 'responder') {
      const ronda = await rondaAbierta(c);
      if (!ronda || ronda.id !== body.ronda_id) {
        return Response.json({ error: 'La encuesta ya está cerrada.' }, { status: 400 });
      }
      const respuestas = Array.isArray(body.respuestas) ? body.respuestas : [];
      const porModulo = new Map(respuestas.map(r => [r.modulo, r]));

      // Roles reales de la ficha: Tutorías y Compras solo se exigen a quien las ve
      const { data: fichas } = await c.from('profesores').select('rol').eq('id', sesion.id);
      const roles = Array.isArray(fichas?.[0]?.rol) ? fichas[0].rol : [];

      const filas = [];
      for (const mod of ronda.modulos) {
        const r = porModulo.get(mod);
        if (!r && !tieneModulo(mod, roles, sesion.rol)) continue;
        const noUsa = !!r?.no_usa;
        const est = Number(r?.estrellas);
        if (!r || (!noUsa && !(est >= 1 && est <= 5))) {
          return Response.json({ error: 'Falta valorar algún módulo.' }, { status: 400 });
        }
        const texto = typeof r.sugerencia === 'string' ? r.sugerencia.trim().slice(0, 1500) : '';
        filas.push({
          ronda_id: ronda.id, modulo: mod,
          estrellas: noUsa ? null : Math.round(est), no_usa: noUsa,
          sugerencia: texto || null,
          quiere_contacto: !!body.quiereContacto,
          profesor_id: body.quiereContacto ? sesion.id : null,
        });
      }

      // Primero se apunta que ha contestado: la clave primaria impide
      // contestar dos veces aunque pulse Enviar dos veces seguidas.
      const { error: e1 } = await c.from('valoracion_contestados')
        .insert([{ ronda_id: ronda.id, profesor_id: sesion.id }]);
      if (e1) {
        if (e1.code === '23505') return Response.json({ error: 'Ya habías contestado esta encuesta.' }, { status: 409 });
        throw e1;
      }
      const { error: e2 } = await c.from('valoracion_respuestas').insert(filas);
      if (e2) {
        // Si no se han guardado las respuestas, que pueda volver a intentarlo
        await c.from('valoracion_contestados').delete().eq('ronda_id', ronda.id).eq('profesor_id', sesion.id);
        throw e2;
      }
      return Response.json({ ok: true });
    }

    // ── Lo demás, solo equipo directivo ──
    if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

    if (body.accion === 'lanzar') {
      const titulo = String(body.titulo || '').trim().slice(0, 120);
      const modulos = (Array.isArray(body.modulos) ? body.modulos : []).filter(m => IDS_MODULOS.includes(m));
      const cierra = String(body.cierra || '');
      if (!titulo) return Response.json({ error: 'Falta el título.' }, { status: 400 });
      if (!modulos.length) return Response.json({ error: 'Elige al menos un módulo.' }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(cierra) || cierra < hoy || cierra > sumarDias(hoy, 60)) {
        return Response.json({ error: 'La fecha de cierre debe estar entre hoy y dentro de 60 días.' }, { status: 400 });
      }
      if (await rondaAbierta(c)) {
        return Response.json({ error: 'Ya hay una ronda abierta. Ciérrala antes de lanzar otra.' }, { status: 409 });
      }
      // Se guardan en el orden de la lista común, elija en el orden que elija
      const ordenados = IDS_MODULOS.filter(m => modulos.includes(m));
      const { data, error } = await c.from('valoracion_rondas')
        .insert([{ titulo, modulos: ordenados, abre: hoy, cierra, creada_por: sesion.id }])
        .select('id').single();
      if (error) throw error;
      return Response.json({ ok: true, id: data.id });
    }

    if (body.accion === 'cerrar') {
      // Cerrar ya = que su último día haya sido ayer
      const { error } = await c.from('valoracion_rondas')
        .update({ cierra: sumarDias(hoy, -1) }).eq('id', body.id).gte('cierra', hoy);
      if (error) throw error;
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'accion_no_valida' }, { status: 400 });
  } catch (e) {
    console.error('[valoraciones/rondas] POST:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
