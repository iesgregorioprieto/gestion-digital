/**
 * PUSH DESDE EL SERVIDOR
 *
 * Manda una notificación a varios profesores a la vez desde una ruta de
 * /api, sin pasar por /api/push (que exige sesión de quien la pide).
 *
 * Se envían en paralelo por tandas: con 150 convocados, uno detrás de
 * otro tardaría tanto que Vercel cortaría la petición a medias.
 *
 * Nunca lanza error: si las claves no están o un móvil falla, se sigue.
 * Una notificación es un empujón, no algo de lo que dependa nada.
 */
import webpush from 'web-push';

const TANDA = 25;

export async function enviarPushA(cliente, profesorIds, { titulo, cuerpo, url }) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const ids = [...new Set((profesorIds || []).filter(Boolean))];
  if (!pub || !priv || ids.length === 0) return { enviados: 0 };

  try {
    webpush.setVapidDetails('mailto:llcc12@educastillalamancha.es', pub, priv);

    const { data: subs } = await cliente
      .from('push_suscripciones')
      .select('endpoint, p256dh, auth')
      .in('profesor_id', ids);
    if (!subs || subs.length === 0) return { enviados: 0 };

    let destino = typeof url === 'string' ? url : '/profesor';
    if (!destino.startsWith('/') || destino.startsWith('//')) destino = '/profesor';
    const carga = JSON.stringify({
      titulo: String(titulo || 'IES Gregorio Prieto').slice(0, 120),
      cuerpo: String(cuerpo || '').slice(0, 300),
      url: destino,
    });

    let enviados = 0;
    const caducadas = [];
    for (let i = 0; i < subs.length; i += TANDA) {
      const tanda = subs.slice(i, i + TANDA);
      const res = await Promise.allSettled(tanda.map(s =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga)
      ));
      res.forEach((r, k) => {
        if (r.status === 'fulfilled') enviados++;
        else if (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) caducadas.push(tanda[k].endpoint);
      });
    }
    if (caducadas.length) {
      await cliente.from('push_suscripciones').delete().in('endpoint', caducadas);
    }
    return { enviados };
  } catch (e) {
    console.error('enviarPushA:', e?.message);
    return { enviados: 0 };
  }
}
