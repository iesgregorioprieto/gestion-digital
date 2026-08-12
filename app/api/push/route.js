import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_KEY  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function configurar() {
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  webpush.setVapidDetails('mailto:llcc12@educastillalamancha.es', PUBLIC_KEY, PRIVATE_KEY);
  return true;
}

// Diagnóstico rápido: /api/push
export async function GET() {
  return Response.json({
    vapid_public_existe:  !!PUBLIC_KEY,
    vapid_private_existe: !!PRIVATE_KEY,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { accion } = body;

    // ── Guardar suscripción del navegador ──
    if (accion === 'suscribir') {
      const { profesor_id, suscripcion } = body;
      if (!profesor_id || !suscripcion?.endpoint) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { error } = await getSupabase()
        .from('push_suscripciones')
        .upsert({
          profesor_id,
          endpoint: suscripcion.endpoint,
          p256dh:   suscripcion.keys.p256dh,
          auth:     suscripcion.keys.auth,
        }, { onConflict: 'endpoint' });

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ── Borrar suscripción ──
    if (accion === 'desuscribir') {
      const { endpoint } = body;
      await getSupabase().from('push_suscripciones').delete().eq('endpoint', endpoint);
      return Response.json({ ok: true });
    }

    // ── Enviar notificación ──
    if (accion === 'enviar') {
      if (!configurar()) {
        return Response.json({ error: 'Claves VAPID no configuradas' }, { status: 500 });
      }

      const { profesor_id, titulo, cuerpo, url } = body;
      if (!profesor_id) return Response.json({ error: 'Falta profesor_id' }, { status: 400 });

      const { data: subs } = await getSupabase()
        .from('push_suscripciones')
        .select('*')
        .eq('profesor_id', profesor_id);

      if (!subs || subs.length === 0) {
        return Response.json({ ok: true, enviados: 0, aviso: 'Sin dispositivos suscritos' });
      }

      const carga = JSON.stringify({
        titulo: titulo || 'IES Gregorio Prieto',
        cuerpo: cuerpo || 'Tienes un aviso nuevo',
        url:    url    || '/profesor',
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
