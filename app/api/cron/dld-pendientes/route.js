import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { avisarDireccion } from '@/lib/notificaciones';

export const dynamic = 'force-dynamic';

/**
 * AVISO DE LAS 18:00 — SOLICITUDES DE DLD SIN RESOLVER
 *
 * Pedido por dirección: cuando queden menos de 3 días para la fecha de
 * un día de libre disposición y siga sin resolverse, avisar al director
 * a las 18:00.
 *
 * SOBRE LA HORA. Vercel lanza los cron en UTC, y España cambia de hora
 * dos veces al año: las 18:00 de aquí son las 16:00 UTC en verano y las
 * 17:00 en invierno. Por eso está programado a las dos horas y aquí se
 * comprueba qué hora es de verdad en Madrid: la que no toca se va sin
 * hacer nada. Así el aviso cae a las 18:00 todo el año sin tener que
 * acordarse de cambiarlo en marzo y en octubre.
 */

/** Fecha de hoy en España, en formato AAAA-MM-DD */
function hoyMadrid() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Hora del reloj en España, 0-23 */
function horaMadrid() {
  return parseInt(new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false,
  }).format(new Date()), 10);
}

/** Días entre dos fechas AAAA-MM-DD, contando de mediodía a mediodía */
function diasEntre(desde, hasta) {
  const a = new Date(desde + 'T12:00:00');
  const b = new Date(hasta + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron dld] CRON_SECRET no configurado — endpoint bloqueado');
    return Response.json({ error: 'Configuración incompleta' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  // Solo la pasada que coincide con las 18:00 de España
  const hora = horaMadrid();
  if (hora !== 18) {
    return Response.json({ ok: true, omitido: `no son las 18:00 en Madrid (son las ${hora})` });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor());

  try {
    const hoy = hoyMadrid();

    // Menos de 3 días quiere decir hoy, mañana o pasado. Se piden desde
    // hoy para no arrastrar las que ya se pasaron de fecha: esas ya no
    // se pueden resolver a tiempo y avisar de ellas cada tarde sería
    // ruido que acabaría haciendo que nadie mire el correo.
    const limite = new Date(hoy + 'T12:00:00');
    limite.setDate(limite.getDate() + 2);
    const hasta = limite.toISOString().slice(0, 10);

    const { data: pendientes, error } = await supabase
      .from('dld')
      .select('id, profesor_nombre, fecha_solicitada, tipo_dld, estado')
      .eq('estado', 'pendiente')
      .gte('fecha_solicitada', hoy)
      .lte('fecha_solicitada', hasta)
      .order('fecha_solicitada', { ascending: true });

    if (error) throw error;

    if (!pendientes || pendientes.length === 0) {
      return Response.json({ ok: true, pendientes: 0 });
    }

    const solicitudes = pendientes.map(p => ({
      profesor: p.profesor_nombre || '—',
      fecha: new Date(p.fecha_solicitada + 'T12:00:00')
        .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
      tipo_dld: p.tipo_dld || '',
      dias_restantes: diasEntre(hoy, p.fecha_solicitada),
    }));

    await avisarDireccion(supabase, 'dld_sin_resolver', { solicitudes });

    return Response.json({ ok: true, pendientes: solicitudes.length });
  } catch (e) {
    console.error('[cron dld] error:', e?.message);
    return Response.json({ error: e?.message }, { status: 500 });
  }
}
