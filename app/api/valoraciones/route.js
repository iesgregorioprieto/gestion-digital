import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal, sumarDias } from '@/lib/fechas';

/**
 * VALORACIÓN DE MÓDULOS EN PRUEBA
 *
 * Cada módulo nuevo pasa 15 días a prueba. Durante ese tiempo:
 *
 *   - A la TERCERA vez que alguien usa el módulo se le pregunta qué le
 *     parece. Ni la primera (aún no tiene criterio) ni cada vez (cansa).
 *     Una sola vez por persona y módulo.
 *
 *   - Pasados los 15 días se lanza la encuesta final, solo a quien lo
 *     haya usado. A los demás se les pregunta por qué no lo han usado,
 *     que a veces dice más que una valoración.
 *
 * El nombre solo se guarda si la persona marca que quiere que se le
 * pueda preguntar. Si no, la valoración llega sin identificar: con el
 * nombre visible la gente escribe menos y más suave, y lo que interesa
 * aquí es que digan lo que piensan de verdad.
 */

const VALORACIONES = ['ayuda', 'mejorable', 'no_sirve'];

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

/**
 * ¿Hay que preguntarle algo a esta persona en este módulo?
 * Lo llama la propia pantalla del módulo al abrirse.
 */
export async function GET(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ preguntar: null });

    const url = new URL(request.url);
    const modulo = url.searchParams.get('modulo');

    // ── Panel de resultados: solo equipo directivo ──
    if (url.searchParams.get('resumen') === '1') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

      const [mods, vals] = await Promise.all([
        supa().from('modulos_prueba').select('*').order('fecha_inicio', { ascending: false }),
        supa().from('valoraciones').select('*').order('created_at', { ascending: false }),
      ]);
      return Response.json({ modulos: mods.data || [], valoraciones: vals.data || [] });
    }

    if (!modulo) return Response.json({ preguntar: null });

    // ¿Está este módulo a prueba?
    const { data: mods } = await supa()
      .from('modulos_prueba').select('*')
      .eq('clave', modulo).eq('estado', 'en_prueba');

    const mod = (mods || [])[0];
    if (!mod) return Response.json({ preguntar: null });   // no está a prueba

    // Contar el uso de esta persona
    const { data: usos } = await supa()
      .from('usos_modulo').select('*')
      .eq('modulo', modulo).eq('profesor_id', sesion.id);

    const uso = (usos || [])[0];
    const veces = (uso?.veces || 0) + 1;

    await supa().from('usos_modulo').upsert({
      id: uso?.id,
      modulo, profesor_id: sesion.id, veces,
      preguntado: uso?.preguntado || false,
      encuestado: uso?.encuestado || false,
    }, { onConflict: 'modulo,profesor_id' });

    // ── ¿Toca la encuesta final? ──
    const fin = sumarDias(mod.fecha_inicio, mod.dias_prueba || 15);
    if (hoyLocal() >= fin && !uso?.encuestado) {
      return Response.json({
        preguntar: 'encuesta_final',
        modulo: mod.clave,
        nombre: mod.nombre,
      });
    }

    // ── ¿Toca la valoración rápida? ──
    //
    // Para un módulo: con dos usos ya hay criterio, y así llega a más
    // gente (en 15 días hay quien no abre un módulo tres veces). Quien
    // no llegue ni a eso recibirá igualmente la encuesta final.
    //
    // Para la aplicación en conjunto ('general') se exige más: haber
    // usado al menos 3 módulos distintos y 8 visitas en total. Opinar
    // del portal entero después de entrar dos veces no dice gran cosa.
    let listoParaPreguntar = veces >= 2;

    if (modulo === 'general') {
      const { data: todos } = await supa()
        .from('usos_modulo').select('modulo, veces').eq('profesor_id', sesion.id);

      const distintos = (todos || []).filter(u => u.modulo !== 'general').length;
      const total = (todos || []).reduce((s, u) => s + (u.veces || 0), 0);
      listoParaPreguntar = distintos >= 3 && total >= 8;
    }

    if (listoParaPreguntar && !uso?.preguntado && hoyLocal() < fin) {
      return Response.json({
        preguntar: 'rapida',
        modulo: mod.clave,
        nombre: mod.nombre,
      });
    }

    return Response.json({ preguntar: null });
  } catch (e) {
    // Que esto falle no puede estropear el módulo que la persona vino a usar
    console.error('[valoraciones] error consultando:', e.message);
    return Response.json({ preguntar: null });
  }
}

/** Guardar una valoración */
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { modulo, valoracion, sugerencia, quiere_contacto, tipo } = await request.json();

    if (!modulo || !VALORACIONES.includes(valoracion)) {
      return Response.json({ error: 'datos_no_validos' }, { status: 400 });
    }

    const { error } = await supa().from('valoraciones').insert([{
      modulo,
      // Solo se guarda quién es si ha pedido que se le pueda preguntar
      profesor_id: quiere_contacto ? sesion.id : null,
      valoracion,
      sugerencia: (sugerencia || '').trim().slice(0, 1000) || null,
      quiere_contacto: !!quiere_contacto,
      tipo: tipo === 'encuesta_final' ? 'encuesta_final' : 'rapida',
    }]);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // No volver a preguntar lo mismo a esta persona
    const campo = tipo === 'encuesta_final' ? { encuestado: true } : { preguntado: true };
    await supa().from('usos_modulo').update(campo)
      .eq('modulo', modulo).eq('profesor_id', sesion.id);

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
