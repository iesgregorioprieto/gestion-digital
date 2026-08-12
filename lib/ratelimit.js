/**
 * LIMITADOR DE INTENTOS CON SUPABASE
 *
 * Guarda los contadores en la tabla `rate_limit` para que funcione
 * aunque Vercel arranque varias instancias en paralelo.
 *
 * Uso:
 *   const { ok, reinicioEn } = await comprobarRateLimit('login', ip, supabase);
 *   if (!ok) return Response.json({ error: '...' }, { status: 429 });
 *   // ... procesar ...
 *   await registrarFalloRateLimit('login', ip, supabase);   // si falla
 *   await limpiarRateLimit('login', ip, supabase);          // si tiene éxito
 */

const CONFIGS = {
  login: {
    maxIntentos: 10,
    ventanaMin:  15,
    bloqueoMin:  15,
  },
  recuperar: {
    maxIntentos: 5,
    ventanaMin:  60,
    bloqueoMin:  60,
  },
};

export async function comprobarRateLimit(nombre, ip, supabase) {
  if (!ip) return { ok: true };
  const cfg = CONFIGS[nombre];
  if (!cfg) return { ok: true };

  const id = `${nombre}:${ip}`;
  const ahora = new Date();

  // Limpiar entradas antiguas de paso (más de 2 horas)
  await supabase.from('rate_limit')
    .delete()
    .lt('desde', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

  const { data } = await supabase.from('rate_limit').select('*').eq('id', id);
  const entrada = (data || [])[0];

  if (!entrada) return { ok: true, restantes: cfg.maxIntentos };

  // Bloqueo activo
  if (entrada.bloqueado_hasta && new Date(entrada.bloqueado_hasta) > ahora) {
    const reinicioEn = Math.ceil((new Date(entrada.bloqueado_hasta) - ahora) / 1000);
    return { ok: false, restantes: 0, reinicioEn };
  }

  // Ventana expirada → como si no existiera
  const ventanaMs = cfg.ventanaMin * 60 * 1000;
  if (ahora - new Date(entrada.desde) > ventanaMs) {
    await supabase.from('rate_limit').delete().eq('id', id);
    return { ok: true, restantes: cfg.maxIntentos };
  }

  const restantes = Math.max(0, cfg.maxIntentos - entrada.intentos);
  return { ok: restantes > 0, restantes };
}

export async function registrarFalloRateLimit(nombre, ip, supabase) {
  if (!ip) return;
  const cfg = CONFIGS[nombre];
  if (!cfg) return;

  const id = `${nombre}:${ip}`;
  const ahora = new Date();
  const ventanaMs = cfg.ventanaMin * 60 * 1000;

  const { data } = await supabase.from('rate_limit').select('*').eq('id', id);
  let entrada = (data || [])[0];

  if (!entrada || (ahora - new Date(entrada.desde) > ventanaMs)) {
    // Nueva entrada o ventana expirada
    entrada = { id, intentos: 1, desde: ahora.toISOString(), bloqueado_hasta: null };
  } else {
    entrada.intentos += 1;
  }

  if (entrada.intentos >= cfg.maxIntentos) {
    entrada.bloqueado_hasta = new Date(Date.now() + cfg.bloqueoMin * 60 * 1000).toISOString();
  }

  await supabase.from('rate_limit').upsert(entrada, { onConflict: 'id' });
}

export async function limpiarRateLimit(nombre, ip, supabase) {
  if (!ip) return;
  await supabase.from('rate_limit').delete().eq('id', `${nombre}:${ip}`);
}
