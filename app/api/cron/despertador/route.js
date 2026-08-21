import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';

/**
 * DESPERTADOR DE LA BASE DE DATOS
 *
 * Supabase pausa los proyectos del plan gratuito tras 7 días sin
 * actividad de base de datos. El portal ya tiene el cron de
 * recordatorios, que consulta a diario, pero ese comprueba primero la
 * clave CRON_SECRET: si esa clave falta o cambia, devuelve un error
 * ANTES de tocar la base de datos. El cron parece que se ejecuta, y en
 * cambio el contador de inactividad sigue corriendo.
 *
 * Por eso esta ruta va aparte y no comprueba nada: hace una lectura
 * mínima y punto. Si el otro cron fallara, este mantiene el proyecto
 * despierto igual.
 *
 * No hay nada que proteger: lee una fila de la configuración del centro
 * y no devuelve ningún dato.
 */
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      claveServidor(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { error } = await supabase
      .from('config_centro')
      .select('id')
      .limit(1);

    if (error) {
      console.error('[despertador] la consulta falló:', error.message);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log('[despertador] base de datos despierta');
    return Response.json({ ok: true, cuando: new Date().toISOString() });
  } catch (e) {
    console.error('[despertador] error inesperado:', e.message);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
