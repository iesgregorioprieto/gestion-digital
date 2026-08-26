import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Seguridad: solo Vercel Cron puede llamar a este endpoint.
  // Si la clave no está configurada no se ejecuta nada: sin clave no hay
  // forma de distinguir a Vercel de cualquiera que conozca la URL.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron] CRON_SECRET no configurado — endpoint bloqueado');
    return Response.json({ error: 'Configuración incompleta' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor()
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
        headers: {
          'Content-Type': 'application/json',
          // Acredita que la llamada sale del propio servidor, no de fuera
          'x-clave-interna': process.env.SESSION_SECRET || '',
        },
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

    // ── Resumen diario de sugerencias sobre módulos en prueba ──
    // Se manda una sola vez al día con todas las de la jornada: con 150
    // profesores, un correo por sugerencia llenaría el buzón.
    let sugerenciasEnviadas = 0;
    try {
      const urlBase = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
      const desde = new Date();
      desde.setHours(0, 0, 0, 0);

      const { data: sugs } = await supabase
        .from('valoraciones')
        .select('modulo, valoracion, sugerencia, quiere_contacto, profesor_id')
        .not('sugerencia', 'is', null)
        .gte('created_at', desde.toISOString());

      if (sugs && sugs.length > 0) {
        // Nombre solo de quien ha aceptado que se le pregunte
        const conNombre = await Promise.all(sugs.map(async s => {
          let quien = null;
          if (s.quiere_contacto && s.profesor_id) {
            const { data } = await supabase.from('profesores')
              .select('nombre, apellidos').eq('id', s.profesor_id);
            const p = (data || [])[0];
            if (p) quien = `${p.nombre} ${p.apellidos}`;
          }
          return { ...s, quien };
        }));

        // Al director y al secretario
        const { data: equipo } = await supabase.from('profesores')
          .select('email').in('rol_gestion', ['director', 'secretario']);

        for (const p of (equipo || [])) {
          if (!p.email) continue;
          await fetch(`${urlBase}/api/enviar-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-clave-interna': process.env.SESSION_SECRET || '',
            },
            body: JSON.stringify({
              tipo: 'sugerencias_del_dia',
              datos: { email: p.email, sugerencias: conNombre },
            }),
          });
          sugerenciasEnviadas++;
          await new Promise(r => setTimeout(r, 600));   // Resend: 2 correos por segundo
        }
      }
    } catch (e) {
      console.error('Error enviando el resumen de sugerencias:', e);
    }

    return Response.json({ ok: true, revisadas: (ausencias || []).length, enviados, marcadas, errores, sugerenciasEnviadas });
  } catch (err) {
    console.error('Error en cron recordatorios:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
