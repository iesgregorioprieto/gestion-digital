import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * VALORACIÓN DEL PORTAL
 *
 * Una sola pregunta por persona, a los 15 días de darse de alta. Se
 * empezó con una encuesta por módulo, pero con diez módulos eso son
 * diez preguntas para cada profesor y nadie contesta en serio a partir
 * de la tercera. Preguntando una vez por el portal entero, y pidiendo
 * en un desplegable de qué parte habla, se obtiene lo mismo sin
 * cansar a nadie.
 *
 * El nombre solo se guarda si la persona marca que quiere que se le
 * pueda preguntar. Si no, la respuesta llega sin identificar.
 */

const VALORACIONES = ['ayuda', 'mejorable', 'no_sirve'];
const DIAS_ESPERA = 15;

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

/** ¿Hay que preguntarle a esta persona? */
export async function GET(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ preguntar: false }, { status: 401 });

    // ── Panel de resultados para el equipo directivo ──
    if (new URL(request.url).searchParams.get('resumen') === '1') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

      const { data } = await supa().from('valoraciones')
        .select('*').order('created_at', { ascending: false });
      return Response.json({ valoraciones: data || [] });
    }

    // ¿Ya ha contestado? Solo se pregunta una vez
    const { data: previas } = await supa().from('valoraciones')
      .select('id').eq('profesor_id_control', sesion.id).limit(1);
    if (previas && previas.length > 0) return Response.json({ preguntar: false });

    // ¿Lleva ya 15 días de alta?
    const { data: profs } = await supa().from('profesores')
      .select('created_at').eq('id', sesion.id);

    const alta = (profs || [])[0]?.created_at;
    if (!alta) return Response.json({ preguntar: false });

    const dias = Math.floor((Date.now() - new Date(alta).getTime()) / 86400000);
    return Response.json({ preguntar: dias >= DIAS_ESPERA });
  } catch (e) {
    // Que esto falle no puede estropear la pantalla que la persona vino a usar
    console.error('[valoraciones] error al comprobar:', e.message);
    return Response.json({ preguntar: false });
  }
}

/** Guardar la valoración */
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { valoracion, parte, sugerencia, quiereContacto } = await request.json();
    if (!VALORACIONES.includes(valoracion)) {
      return Response.json({ error: 'valoracion_no_valida' }, { status: 400 });
    }

    const texto = typeof sugerencia === 'string' ? sugerencia.trim().slice(0, 1500) : null;

    const { error } = await supa().from('valoraciones').insert([{
      modulo: parte || 'general',
      // Se guarda quién es solo si acepta que se le pregunte...
      profesor_id: quiereContacto ? sesion.id : null,
      // ...pero siempre queda constancia de que YA contestó, para no
      // volver a preguntarle. Ese campo no se muestra en el panel.
      profesor_id_control: sesion.id,
      valoracion,
      sugerencia: texto || null,
      quiere_contacto: !!quiereContacto,
      tipo: 'general',
    }]);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
