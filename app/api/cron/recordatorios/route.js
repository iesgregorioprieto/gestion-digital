import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Seguridad: solo Vercel Cron puede llamar a este endpoint
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  try {
    // Fecha límite: ausencias de hace 2 días (queda 1 día de plazo de los 3 hábiles)
    const hoy = new Date();
    const hace2 = new Date(hoy);
    hace2.setDate(hace2.getDate() - 2);
    const fechaLimite = hace2.toISOString().split('T')[0];

    // Buscar ausencias sin justificar de esa fecha
    const { data: ausencias, error } = await supabase
      .from('ausencias')
      .select('id, profesor_id, fecha_inicio, motivo, estado, justificado, aviso_justificacion_enviado')
      .eq('fecha_inicio', fechaLimite)
      .neq('estado', 'justificada')
      .or('justificado.is.null,justificado.eq.false');

    if (error) throw error;
    if (!ausencias || ausencias.length === 0) {
      return Response.json({ ok: true, enviados: 0, mensaje: 'Sin ausencias pendientes' });
    }

    let enviados = 0;
    const errores = [];

    for (const a of ausencias) {
      // No repetir aviso si ya se envió
      if (a.aviso_justificacion_enviado) continue;

      const { data: profs } = await supabase
        .from('profesores')
        .select('nombre, apellidos, email')
        .eq('id', a.profesor_id);

      const prof = (profs || [])[0];
      if (!prof?.email) continue;

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
      const res = await fetch(`${baseUrl}/api/enviar-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'justificacion_pendiente',
          datos: {
            nombre: `${prof.nombre} ${prof.apellidos}`,
            email: prof.email,
            fecha_inicio: a.fecha_inicio,
            motivo: a.motivo,
          },
        }),
      });

      if (res.ok) {
        enviados++;
        // Marcar como avisado para no repetir
        await supabase
          .from('ausencias')
          .update({ aviso_justificacion_enviado: true })
          .eq('id', a.id);
      } else {
        errores.push({ id: a.id, status: res.status });
      }
    }

    return Response.json({ ok: true, revisadas: ausencias.length, enviados, errores });
  } catch (err) {
    console.error('Error en cron recordatorios:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
