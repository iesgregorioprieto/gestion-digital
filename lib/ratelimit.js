import { createClient } from '@supabase/supabase-js';
import { claveServidor } from './claveServidor';

/**
 * LIMITADOR DE INTENTOS
 *
 * Frena la fuerza bruta en el login y el spam en la recuperación de
 * contraseña. Los contadores viven en la tabla `rate_limit` de Supabase
 * y no en la memoria del proceso, porque Vercel arranca varias copias
 * del servidor a la vez y cada una tendría su propia cuenta.
 *
 * REGLA DE ORO: si algo falla aquí dentro (la tabla no existe, Supabase
 * no responde, un permiso mal puesto...), se DEJA PASAR y se anota en el
 * log. Un limitador roto no puede dejar a 150 profesores sin entrar al
 * portal. Perder el freno un rato es molesto; perder el acceso, no.
 */

const CONFIGS = {
  login:     { maxIntentos: 10, ventanaMin: 15, bloqueoMin: 15 },
  recuperar: { maxIntentos:  5, ventanaMin: 60, bloqueoMin: 60 },
};

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ¿Puede seguir intentándolo? Ante la duda, sí. */
export async function comprobarLimite(nombre, ip) {
  const cfg = CONFIGS[nombre];
  if (!cfg || !ip) return { permitido: true };

  try {
    const { data, error } = await supa()
      .from('rate_limit')
      .select('intentos, desde, bloqueado_hasta')
      .eq('id', `${nombre}:${ip}`);

    if (error) throw error;

    const fila = (data || [])[0];
    if (!fila) return { permitido: true };

    const ahora = Date.now();

    if (fila.bloqueado_hasta && new Date(fila.bloqueado_hasta).getTime() > ahora) {
      const segundos = Math.ceil((new Date(fila.bloqueado_hasta).getTime() - ahora) / 1000);
      return { permitido: false, segundos };
    }

    // Ventana caducada: cuenta a cero
    if (ahora - new Date(fila.desde).getTime() > cfg.ventanaMin * 60000) {
      return { permitido: true };
    }

    return { permitido: fila.intentos < cfg.maxIntentos };
  } catch (e) {
    console.error(`[ratelimit] fallo comprobando ${nombre}, se deja pasar:`, e.message);
    return { permitido: true };
  }
}

/** Suma un intento fallido. Si falla, no pasa nada: solo no cuenta. */
export async function registrarFallo(nombre, ip) {
  const cfg = CONFIGS[nombre];
  if (!cfg || !ip) return;

  try {
    const id = `${nombre}:${ip}`;
    const ahora = Date.now();

    const { data } = await supa()
      .from('rate_limit')
      .select('intentos, desde')
      .eq('id', id);

    const fila = (data || [])[0];
    const caducada = !fila || (ahora - new Date(fila.desde).getTime() > cfg.ventanaMin * 60000);

    const intentos = caducada ? 1 : fila.intentos + 1;
    const desde    = caducada ? new Date(ahora).toISOString() : fila.desde;
    const bloqueado_hasta = intentos >= cfg.maxIntentos
      ? new Date(ahora + cfg.bloqueoMin * 60000).toISOString()
      : null;

    await supa().from('rate_limit')
      .upsert({ id, intentos, desde, bloqueado_hasta }, { onConflict: 'id' });
  } catch (e) {
    console.error(`[ratelimit] no se pudo anotar el fallo de ${nombre}:`, e.message);
  }
}

/** Borra el contador (login correcto). */
export async function limpiarLimite(nombre, ip) {
  if (!ip) return;
  try {
    await supa().from('rate_limit').delete().eq('id', `${nombre}:${ip}`);
  } catch (e) {
    console.error(`[ratelimit] no se pudo limpiar ${nombre}:`, e.message);
  }
}

/** IP del visitante detrás del proxy de Vercel. */
export function ipDe(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}
