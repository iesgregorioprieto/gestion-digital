/**
 * CIERRE DEL DÍA
 *
 * A las 18:00 se da por cerrada la jornada: las guardias que nadie ha
 * fichado quedan marcadas como no realizadas, y así salen en el informe
 * de jefatura.
 *
 * Aquí no se amonesta a nadie ni se crea ninguna incidencia. Esto solo
 * deja constancia. Si jefatura ve que alguien no ficha sus guardias, será
 * jefatura quien hable con esa persona.
 */

import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { FRANJAS } from '@/lib/asignacionGuardias';

export const dynamic = 'force-dynamic';

function hoyMadrid() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function horaMadrid() {
  return parseInt(new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false,
  }).format(new Date()), 10);
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const hora = horaMadrid();
  if (hora !== 18) {
    return Response.json({ ok: true, omitido: `no son las 18 en Madrid (son las ${hora})` });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor());
  const hoy = hoyMadrid();

  const { data: abandonados, error } = await sb
    .from('apoyos_asignados')
    .select('id')
    .eq('fecha', hoy)
    .eq('estado', 'pendiente');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!abandonados?.length) return Response.json({ ok: true, cerradas: 0 });

  // El recreo también se cierra: si no se fichó, no se hizo.
  const { error: errCierre } = await sb
    .from('apoyos_asignados')
    .update({ estado: 'sin_cubrir' })
    .in('id', abandonados.map(a => a.id));

  if (errCierre) return Response.json({ error: errCierre.message }, { status: 500 });

  return Response.json({ ok: true, fecha: hoy, cerradas: abandonados.length });
}
