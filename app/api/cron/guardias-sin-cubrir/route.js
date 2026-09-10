import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';

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
    .select('id, hora, sector_apoyo, profesor_id')
    .eq('fecha', hoy)
    .eq('estado', 'pendiente');

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!abandonados?.length) return Response.json({ ok: true, incidencias: 0 });

  const HORAS_LABEL = { '1':'1ª hora (8:30-9:25)','2':'2ª hora (9:25-10:20)','3':'3ª hora (10:35-11:30)',
    '4':'4ª hora (11:30-12:25)','5':'5ª hora (12:25-13:20)','6':'6ª hora (14:15-15:10)' };

  let creadas = 0;
  for (const ap of abandonados) {
    let nombreSugerido = 'Sin identificar';
    if (ap.profesor_id) {
      const { data: prof } = await sb.from('profesores')
        .select('nombre, apellidos').eq('id', ap.profesor_id);
      if (prof?.[0]) nombreSugerido = `${prof[0].apellidos}, ${prof[0].nombre}`;
    }

    const franja = HORAS_LABEL[String(ap.hora)] || `hora ${ap.hora}`;
    const descripcion =
      `GUARDIA NO CUBIERTA\n` +
      `Franja: ${franja}\n` +
      `Sector: ${ap.sector_apoyo || '—'}\n\n` +
      `Profesor/a sugerido/a (principal responsable):\n` +
      `  \u2022 ${nombreSugerido}\n\n` +
      `El resto de candidatos disponibles esa franja tampoco actuaron.\n` +
      `Acci\u00f3n recomendada: amonestaci\u00f3n verbal a todos los candidatos, ` +
      `especialmente al sugerido.`;

    const { error: eIns } = await sb.from('incidencias_app').insert([{
      profesor_id: ap.profesor_id || null,
      profesor_nombre: nombreSugerido,
      modulo: 'Guardias',
      tipo: 'fallo',
      descripcion,
      estado: 'nueva',
    }]);

    if (!eIns) {
      await sb.from('apoyos_asignados').update({ estado: 'sin_cubrir' }).eq('id', ap.id);
      creadas++;
    }
  }

  return Response.json({ ok: true, incidencias: creadas });
}
