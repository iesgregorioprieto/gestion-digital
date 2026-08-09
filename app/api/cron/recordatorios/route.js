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
    const hoy = new Date();
    const dia = f => f.toISOString().split('T')[0];

    // Aviso: ausencias de hace 2 días (queda 1 día del plazo de 3).
    // Se usa un RANGO en vez de un día exacto: si el cron falla una jornada
    // o cae en festivo, esas ausencias seguirían sin avisar.
    const desde = new Date(hoy); desde.setDate(desde.getDate() - 10);
    const hasta = new Date(hoy); hasta.setDate(hasta.getDate() - 2);

    const { data: ausencias, error } = await supabase
      .from('ausencias')
      .select('id, profesor_id, fecha_inicio, motivo, estado, aviso_justificacion_enviado')
      .gte('fecha_inicio', dia(desde))
      .lte('fecha_inicio', dia(hasta))
      .neq('estado', 'justificada');

    if (error) throw error;
    let enviados = 0;
    const errores = [];

    for (const a of (ausencias || [])) {
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

    // Pasado el plazo de 3 días, las que sigan pendientes se marcan como
    // "sin justificar". El profesor puede justificarlas igualmente después,
    // pero queda constancia de que se pasó el plazo.
    let marcadas = 0;
    try {
      const limite = new Date(hoy);
      limite.setDate(limite.getDate() - 3);

      const { data: vencidas } = await supabase
        .from('ausencias')
        .select('id')
        .lt('fecha_inicio', dia(limite))
        .eq('estado', 'pendiente');

      if (vencidas && vencidas.length > 0) {
        await supabase
          .from('ausencias')
          .update({ estado: 'sin_justificar' })
          .in('id', vencidas.map(v => v.id));
        marcadas = vencidas.length;
      }
    } catch (e) {
      console.error('Error marcando ausencias vencidas:', e);
    }

    return Response.json({ ok: true, revisadas: (ausencias || []).length, enviados, marcadas, errores });
  } catch (err) {
    console.error('Error en cron recordatorios:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
