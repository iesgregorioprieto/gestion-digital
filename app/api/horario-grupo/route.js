/**
 * GET /api/horario-grupo
 *   ?lista=1            → { grupos: [...] }  grupos con horario este curso
 *   ?grupo=tutoria      → horario de MI tutoría (la de mi ficha, o la del
 *                         titular al que sustituyo si está de baja)
 *   ?grupo=<código>     → horario de ese grupo
 *
 * Como /api/horario-de: los horarios no son datos sensibles y cualquier
 * profesor con sesión puede consultarlos.
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { getCursoActual } from '@/lib/curso';
import { tutoriaEfectiva } from '@/lib/tutoriaEfectiva';
import { gruposConHorario, horarioDeGrupo } from '@/lib/horarioDeGrupo';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secreto = process.env.SESSION_SECRET;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  const sesion = secreto && m ? await verificarSesion(m[1], secreto) : null;
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const url = new URL(request.url);
  try {
    const cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
      { auth: { persistSession: false, autoRefreshToken: false } });
    const curso = await getCursoActual();

    if (url.searchParams.get('lista') === '1') {
      return Response.json({ grupos: await gruposConHorario(cliente, curso) });
    }

    const pedido = (url.searchParams.get('grupo') || '').trim();
    if (!pedido) return Response.json({ error: 'falta_grupo' }, { status: 400 });

    if (pedido === 'tutoria') {
      const t = await tutoriaEfectiva(cliente, sesion.id);
      if (!t?.grupo) return Response.json({ sinTutoria: true, horas: [] });
      const r = await horarioDeGrupo(cliente, curso, t.grupo);
      return Response.json({ ...r, tutoria: t.grupo, heredadaDe: t.heredadaDe });
    }

    return Response.json(await horarioDeGrupo(cliente, curso, pedido));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
