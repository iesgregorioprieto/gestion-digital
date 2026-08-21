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

    const [aus, dlds, apoyos, avisos] = await Promise.all([
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
    ]);

    return Response.json({
      fecha: hoy,
      ausencias: aus.data || [],
      dlds: dlds.data || [],
      apoyos: apoyos.data || [],
      avisos: avisos.data || [],
    });
  } catch (e) {
    return Response.json({ error: e.message, ausencias: [], dlds: [], apoyos: [], avisos: [] }, { status: 500 });
  }
}
