/**
 * GET /api/horario-de?de=<id>|mi[&dia=lunes]
 * El horario de un profesor, reconocido con el mismo método que el reparto
 * de guardias (ver lib/horarioDeProfesor.js). Los horarios no son datos
 * personales sensibles: cualquier profesor puede ver el de un compañero,
 * como ya permitía el buscador de «Mi horario».
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { getCursoActual } from '@/lib/curso';
import { horarioDe } from '@/lib/horarioDeProfesor';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secreto = process.env.SESSION_SECRET;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  const sesion = secreto && m ? await verificarSesion(m[1], secreto) : null;
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const url = new URL(request.url);
  const de = url.searchParams.get('de');
  const dia = url.searchParams.get('dia');
  const id = !de || de === 'mi' ? sesion.id : de;

  try {
    const cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
      { auth: { persistSession: false, autoRefreshToken: false } });
    const r = await horarioDe(cliente, id, await getCursoActual(), dia || null);
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
