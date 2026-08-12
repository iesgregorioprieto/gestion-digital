/**
 * LIMITADOR DE INTENTOS EN MEMORIA
 *
 * Protege endpoints sensibles (login, recuperar contraseña) contra
 * ataques de fuerza bruta y spam. No requiere Redis ni ninguna
 * dependencia externa: se guarda en la memoria del proceso de Vercel.
 *
 * Limitaciones conocidas:
 * - Si Vercel arranca una instancia nueva, el contador se resetea.
 * - No es compartido entre instancias paralelas.
 * Para un centro de ~150 profesores es más que suficiente.
 *
 * Uso:
 *   const rl = getRateLimiter('login');
 *   const { ok, restantes, reinicioEn } = rl.comprobar(ip);
 *   if (!ok) return Response.json({ error: '...' }, { status: 429 });
 *   // ... procesar ...
 *   rl.registrarFallo(ip);   // solo si el intento ha fallado
 *   rl.limpiar(ip);          // cuando tiene éxito
 */

const CONFIGS = {
  login: {
    maxIntentos:  10,   // intentos fallidos antes de bloquear
    ventanaMs:    15 * 60 * 1000,  // ventana de 15 minutos
    bloqueoMs:    15 * 60 * 1000,  // bloqueo de 15 minutos
  },
  recuperar: {
    maxIntentos:  5,
    ventanaMs:    60 * 60 * 1000,  // ventana de 1 hora
    bloqueoMs:    60 * 60 * 1000,  // bloqueo de 1 hora
  },
};

// Mapa global: endpoint → ip → { intentos, bloqueadoHasta }
const REGISTROS = new Map();

function getRateLimiter(nombre) {
  const cfg = CONFIGS[nombre];
  if (!cfg) throw new Error('Rate limiter desconocido: ' + nombre);

  if (!REGISTROS.has(nombre)) REGISTROS.set(nombre, new Map());
  const mapa = REGISTROS.get(nombre);

  return {
    comprobar(ip) {
      if (!ip) return { ok: true, restantes: cfg.maxIntentos };

      const ahora = Date.now();
      const entrada = mapa.get(ip);

      if (!entrada) return { ok: true, restantes: cfg.maxIntentos };

      // Bloqueo activo
      if (entrada.bloqueadoHasta && ahora < entrada.bloqueadoHasta) {
        const reinicioEn = Math.ceil((entrada.bloqueadoHasta - ahora) / 1000);
        return { ok: false, restantes: 0, reinicioEn };
      }

      // Ventana expirada → limpiar
      if (ahora - entrada.desde > cfg.ventanaMs) {
        mapa.delete(ip);
        return { ok: true, restantes: cfg.maxIntentos };
      }

      const restantes = Math.max(0, cfg.maxIntentos - entrada.intentos);
      return { ok: restantes > 0, restantes, reinicioEn: 0 };
    },

    registrarFallo(ip) {
      if (!ip) return;
      const ahora = Date.now();
      const entrada = mapa.get(ip) || { intentos: 0, desde: ahora, bloqueadoHasta: null };

      // Si la ventana expiró, reiniciar
      if (ahora - entrada.desde > cfg.ventanaMs) {
        entrada.intentos = 0;
        entrada.desde = ahora;
        entrada.bloqueadoHasta = null;
      }

      entrada.intentos++;
      if (entrada.intentos >= cfg.maxIntentos) {
        entrada.bloqueadoHasta = ahora + cfg.bloqueoMs;
      }
      mapa.set(ip, entrada);
    },

    limpiar(ip) {
      if (ip) mapa.delete(ip);
    },
  };
}

export { getRateLimiter };
