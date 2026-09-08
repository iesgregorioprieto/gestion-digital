import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { avisarDireccion, enviarAviso } from '@/lib/notificaciones';

export const dynamic = 'force-dynamic';

/**
 * ESCALADO AUTOMÁTICO DE PERMISOS DE FORMACIÓN
 *
 * Si el jefe de departamento no responde en 3 días laborables, la
 * solicitud pasa al director automáticamente. Este cron compara la
 * fecha límite con la de hoy y escala las que se hayan pasado.
 *
 * Se ejecuta a diario a las 8:00 de España (6 o 7 UTC según la época).
 */

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

  // Solo la pasada que coincide con las 8:00 de España
  const hora = horaMadrid();
  if (hora !== 8) {
    return Response.json({ ok: true, omitido: `no son las 8 en Madrid (son las ${hora})` });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor());
  const hoy = hoyMadrid();

  const { data: pendientes, error } = await sb
    .from('ausencias')
    .select('id, profesor_id, fecha_inicio, fecha_fin, datos_extra, aprobacion_jefe_limite')
    .eq('subtipo', 'permiso_formacion')
    .eq('aprobacion_jefe', 'pendiente')
    .lte('aprobacion_jefe_limite', hoy);

  if (error) {
    console.error('[cron formacion] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!pendientes || pendientes.length === 0) {
    return Response.json({ ok: true, escaladas: 0 });
  }

  let escaladas = 0;

  for (const aus of pendientes) {
    // Marcar como escalada
    await sb.from('ausencias').update({
      aprobacion_jefe: 'auto_escalada',
      aprobacion_jefe_fecha: new Date().toISOString(),
      aprobacion_jefe_motivo: 'Sin respuesta en el plazo de 3 días laborables.',
    }).eq('id', aus.id);

    // Datos del profesor
    const { data: profs } = await sb.from('profesores')
      .select('nombre, apellidos, departamento').eq('id', aus.profesor_id);
    const prof = (profs || [])[0];
    const nombre = prof ? `${prof.nombre || ''} ${prof.apellidos || ''}`.trim() : '';
    const ex = aus.datos_extra || {};

    // Avisar al director
    await avisarDireccion(sb, 'formacion_auto_escalada', {
      nombre,
      departamento: prof?.departamento || '',
      fecha: aus.fecha_inicio || '',
      fecha_fin: aus.fecha_fin || '',
      curso: ex.curso || '',
    });

    escaladas++;
  }

  return Response.json({ ok: true, escaladas });
}
