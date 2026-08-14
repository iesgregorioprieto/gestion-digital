import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';

/**
 * NOTIFICACIONES PUSH
 *
 * Antes esta ruta se fiaba del `profesor_id` que mandaba el navegador.
 * Sin sesión de ningún tipo, cualquiera desde fuera podía:
 *   - suscribir su propio dispositivo a los avisos de otro profesor,
 *   - borrar suscripciones ajenas,
 *   - y sobre todo, MANDAR UNA NOTIFICACIÓN al móvil de cualquiera del
 *     claustro con el texto y el enlace que quisiera, apareciendo como
 *     un aviso oficial del centro.
 *
 * Ahora el `profesor_id` sale siempre de la sesión firmada, nunca del
 * cuerpo de la petición. Enviar avisos a OTRA persona requiere sesión
 * de equipo directivo.
 */

const PUBLIC_KEY  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor()
  );
}

function configurar() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails('mailto:llcc12@educastillalamancha.es', PUBLIC_KEY, PRIVATE_KEY);
  return true;
}

/** Lee la sesión firmada de la cookie, igual que el resto de rutas */
async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

// Diagnóstico: solo para el equipo directivo. Devuelve si las claves
// VAPID están puestas, nunca su contenido.
export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  return Response.json({
    vapid_public_existe:  !!PUBLIC_KEY,
    vapid_private_existe: !!PRIVATE_KEY,
  });
}

export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) {
      return Response.json({ error: 'sin_sesion' }, { status: 401 });
    }

    const body = await request.json();
    const { accion } = body;

    // ── Guardar suscripción del navegador ──
    // Siempre para uno mismo: el profesor_id sale de la sesión.
    if (accion === 'suscribir') {
      const { suscripcion } = body;
      if (!suscripcion?.endpoint || !suscripcion?.keys?.p256dh || !suscripcion?.keys?.auth) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { error } = await getSupabase()
        .from('push_suscripciones')
        .upsert({
          profesor_id: sesion.id,
          endpoint: suscripcion.endpoint,
          p256dh:   suscripcion.keys.p256dh,
          auth:     suscripcion.keys.auth,
        }, { onConflict: 'endpoint' });

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ── Borrar suscripción ──
    // Solo se puede borrar una suscripción propia.
    if (accion === 'desuscribir') {
      const { endpoint } = body;
      if (!endpoint) return Response.json({ error: 'Falta endpoint' }, { status: 400 });

      await getSupabase()
        .from('push_suscripciones')
        .delete()
        .eq('endpoint', endpoint)
        .eq('profesor_id', sesion.id);

      return Response.json({ ok: true });
    }

    // ── Enviar notificación ──
    if (accion === 'enviar') {
      const { profesor_id, titulo, cuerpo, url } = body;
      if (!profesor_id) return Response.json({ error: 'Falta profesor_id' }, { status: 400 });

      // A uno mismo puede cualquiera (es el botón de "probar").
      // A otra persona, solo el equipo directivo.
      const esParaMi = String(profesor_id) === String(sesion.id);
      if (!esParaMi && !esDirectivo(sesion)) {
        return Response.json({ error: 'No autorizado' }, { status: 403 });
      }

      if (!configurar()) {
        return Response.json({ error: 'Claves VAPID no configuradas' }, { status: 500 });
      }

      const { data: subs } = await getSupabase()
        .from('push_suscripciones')
        .select('*')
        .eq('profesor_id', profesor_id);

      if (!subs || subs.length === 0) {
        return Response.json({ ok: true, enviados: 0, aviso: 'Sin dispositivos suscritos' });
      }

      // El enlace solo puede apuntar dentro del propio portal
      let destino = typeof url === 'string' ? url : '/profesor';
      if (!destino.startsWith('/') || destino.startsWith('//')) destino = '/profesor';

      const carga = JSON.stringify({
        titulo: String(titulo || 'IES Gregorio Prieto').slice(0, 120),
        cuerpo: String(cuerpo || 'Tienes un aviso nuevo').slice(0, 300),
        url:    destino,
      });

      let enviados = 0;
      for (const s of subs) {
        try {
          await webpush.sendNotification({
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          }, carga);
          enviados++;
        } catch (err) {
          // 404/410 = suscripción caducada, se limpia
          if (err.statusCode === 404 || err.statusCode === 410) {
            await getSupabase().from('push_suscripciones').delete().eq('endpoint', s.endpoint);
          }
        }
      }

      return Response.json({ ok: true, enviados, total: subs.length });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
