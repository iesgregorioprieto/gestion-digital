/**
 * REPARTO DE GUARDIAS DE CADA MAÑANA
 *
 * El reparto no se deja escrito con días de antelación: se hace sobre el
 * día que se está viviendo, porque el día tiene imprevistos. Este cron
 * lo prepara temprano, antes de que llegue nadie, con las ausencias y
 * los DLD que haya en ese momento.
 *
 * A partir de ahí se vuelve a rehacer cada vez que cambia algo: si a 3ª
 * llama un compañero diciendo que no viene, se registra su ausencia y esa
 * hora se resuelve otra vez desde cero.
 */

import { claveServidor } from '@/lib/claveServidor';

export const dynamic = 'force-dynamic';

function hoyMadrid() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
  const fecha = hoyMadrid();

  try {
    const r = await fetch(`${base}/api/guardias/preasignar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ fecha }),
    });
    const d = await r.json();
    return Response.json({ ok: true, fecha, resultado: d });
  } catch (e) {
    console.error('cron guardias-hoy:', e?.message);
    return Response.json({ error: 'fallo_al_repartir', fecha }, { status: 500 });
  }
}
