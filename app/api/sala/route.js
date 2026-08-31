import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal } from '@/lib/fechas';

/**
 * PANTALLA DE LA SALA DE PROFESORES
 *
 * Esta ruta NO pide sesión, y es a propósito: la pantalla está colgada
 * en la pared de la sala y la enciende cualquiera por la mañana. Pedir
 * contraseña ahí sería inservible.
 *
 * A cambio, devuelve lo mínimo y solo del día de hoy: quién falta, qué
 * horas deja libres y quién cubre. Es exactamente lo que antes estaba
 * escrito en el tablón de corcho.
 *
 * Lo que NO sale nunca: motivos de ausencia, justificaciones, causas de
 * los DLD, comentarios internos, ni nada de días distintos de hoy.
 */

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function GET() {
  try {
    const hoy = hoyLocal();
    const cliente = supa();

    // Semana en curso, de lunes a domingo, para las extraescolares
    const d = new Date(hoy + 'T12:00:00');
    const diaSemana = (d.getDay() + 6) % 7;           // 0 = lunes
    const lunes = new Date(d); lunes.setDate(d.getDate() - diaSemana);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    const iso = f => f.toISOString().slice(0, 10);
    const lunesStr = iso(lunes), domingoStr = iso(domingo);

    const [aus, dlds, apoyos, avisos, actividades] = await Promise.all([
      cliente.from('ausencias')
        .select('profesor_nombre, horas, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', hoy)
        .or(`fecha_fin.gte.${hoy},fecha_fin.is.null`),

      cliente.from('dld')
        .select('profesor_nombre, horas, grupos_afectados, guardias_horario')
        .eq('fecha_solicitada', hoy)
        .eq('estado', 'aprobada'),

      cliente.from('apoyos_asignados')
        .select('*')
        .eq('fecha', hoy),

      cliente.from('avisos_sala')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false }),

      // Extraescolares de esta semana (las rechazadas se descartan luego)
      cliente.from('actividades')
        .select('titulo, profesor_nombre, acompanantes, grupos, fecha_inicio, fecha_fin, lugar, estado')
        .lte('fecha_inicio', domingoStr)
        .gte('fecha_fin', lunesStr)
        .order('fecha_inicio', { ascending: true }),
    ]);

    return Response.json({
      fecha: hoy,
      ausencias: aus.data || [],
      dlds: dlds.data || [],
      apoyos: apoyos.data || [],
      avisos: avisos.data || [],
      actividades: (actividades.data || []).filter(a => a.estado !== 'rechazada'),
      semana: { desde: lunesStr, hasta: domingoStr },
    });
  } catch (e) {
    return Response.json({ error: e.message, ausencias: [], dlds: [], apoyos: [], avisos: [] }, { status: 500 });
  }
}
