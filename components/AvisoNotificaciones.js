'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { consulta, consultaRpc } from '@/lib/consulta';
import { registroAvisos } from '@/lib/swAvisos';

const VERDE = '#1e6b2e';

// Convierte la clave VAPID base64url al formato que espera el navegador
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const salida = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) salida[i] = raw.charCodeAt(i);
  return salida;
}

export default function AvisoNotificaciones({ profesorId }) {
  const [estado, setEstado] = useState('comprobando');
  // 'comprobando' | 'no_soportado' | 'pedir' | 'activando' | 'activo' | 'bloqueado' | 'error'
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState('');

  useEffect(() => {
    (async () => {
      if (typeof window === 'undefined') return;

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setEstado('no_soportado');
        return;
      }

      /**
       * Con el permiso ya dado, la suscripción de ESTE navegador se
       * comprueba y, si falta, se rehace sola: no hace falta preguntar
       * nada. Es lo que recupera los avisos de quien los activó antes
       * del 22/09, cuando se desinstaló el service worker y con él todas
       * las suscripciones. Va antes que lo de «no volver a insistir»
       * porque no molesta: no enseña nada.
       */
      if (Notification.permission === 'granted') {
        try {
          const reg = await registroAvisos();
          let sub = await reg.pushManager.getSubscription();
          const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!sub && clave) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(clave),
            });
          }
          if (sub) {
            setEstado('activo');
            await guardarSuscripcion(sub);
            return;
          }
        } catch (e) {
          // El permiso ya está dado: no se vuelve a enseñar el cartel
          // grande. Se apunta el motivo y se reintenta sola en la próxima
          // carga (normalmente basta con estar fuera de la WiFi del centro).
          reportarFallo(e);
          try {
            if (localStorage.getItem('ies-aviso-notif-oculto') === '1') { setEstado('activo'); return; }
          } catch (_) {}
          setEstado('red_bloqueada');
          return;
        }
      }

      // Si el profesor lo ha descartado, no volver a insistir
      try {
        if (localStorage.getItem('ies-aviso-notif-oculto') === '1') {
          setEstado('activo');
          return;
        }
      } catch (_) {}

      if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }

      // Aquí el permiso no está dado en este navegador. Si ya los tiene
      // activos en otro dispositivo (el móvil), no se le insiste en este.
      // Solo vale si NO hay permiso aquí: con permiso, una fila en la base
      // de datos puede ser una suscripción muerta y taparía el problema.
      if (Notification.permission !== 'granted') {
        try {
          const { data } = await consulta('push_suscripciones')
            .select('id')
            .eq('profesor_id', profesorId)
            .limit(1);
          if (data && data.length > 0) { setEstado('activo'); return; }
        } catch (_) {}
      }

      setEstado('pedir');
    })();
  }, [profesorId]);

  function ocultarParaSiempre() {
    try { localStorage.setItem('ies-aviso-notif-oculto', '1'); } catch (_) {}
    setEstado('activo'); // deja de renderizarse
  }

  async function guardarSuscripcion(sub) {
    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'suscribir',
          profesor_id: profesorId,
          suscripcion: sub.toJSON(),
        }),
      });
    } catch (_) {}
  }

  async function activar() {
    setError('');
    setEstado('activando');

    try {
      const permiso = await Notification.requestPermission();
      if (permiso === 'denied') { setEstado('bloqueado'); return; }
      if (permiso !== 'granted') { setEstado('pedir'); return; }

      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!clave) {
        setError('Falta la clave pública de notificaciones.');
        setEstado('error');
        return;
      }

      const reg = await registroAvisos();
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(clave),
        });
      }

      await guardarSuscripcion(sub);
      try { localStorage.removeItem('ies-aviso-notif-oculto'); } catch (_) {}
      setEstado('activo');
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      // Guardar el detalle técnico para poder diagnosticar
      let origen = '';
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        origen = `${window.location.origin} · SW:${reg ? 'sí' : 'NO'} · scope:${reg?.scope || '-'}`;
      } catch (_) {}
      setDetalle(`${e.name || 'Error'}: ${e.message || '-'} · ${origen}`);
      reportarFallo(e, origen);

      if (msg.includes('push service') || msg.includes('registration failed') || e.name === 'AbortError') {
        setEstado('red_bloqueada');
        return;
      }
      setError(e.message || 'No se pudo activar');
      setEstado('error');
    }
  }

  // No mostrar nada si ya está activo, no se soporta, o aún comprobando
  if (estado === 'comprobando' || estado === 'activo' || estado === 'no_soportado') return null;

  if (estado === 'bloqueado') {
    return (
      <Caja fondo="#fef3c7" borde="#fbbf24" color="#78350f">
        <div style={{ fontWeight: 800, marginBottom: 4 }}>🔕 Notificaciones bloqueadas</div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          Has denegado el permiso. Para recibir avisos de guardias y apoyos,
          actívalo en los ajustes de tu navegador o del móvil, en la sección
          de notificaciones de esta aplicación.
        </div>
      </Caja>
    );
  }

  if (estado === 'red_bloqueada') {
    // Fallo al conectar con el servicio de avisos de Google. Casi siempre
    // es la red (la WiFi del centro lo corta). NO se pide reinstalar: la
    // app instalada funciona por dentro con Chrome y sí admite avisos.
    // Con el permiso ya dado, se reintenta sola en cada carga.
    return (
      <Caja fondo="#fef3c7" borde="#fbbf24" color="#78350f">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 24, lineHeight: 1 }}>📶</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>
                Los avisos no se han podido activar desde esta conexión
              </div>
              <button onClick={ocultarParaSiempre} title="No volver a mostrar"
                style={{ background: 'transparent', border: 'none', color: '#78350f', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              Suele pasar con la WiFi del centro. No tienes que hacer nada:
              se activarán solos la próxima vez que abras la app con datos
              móviles o desde casa. Si quieres, quita la WiFi un momento y
              pulsa el botón.
            </div>
            <button onClick={activar} style={botonEstilo('#b45309')}>🔔 Intentar de nuevo</button>
            {detalle && (
              <div style={{ marginTop: 12, fontSize: 10, color: '#a16207', wordBreak: 'break-all', lineHeight: 1.4, opacity: 0.8 }}>
                {detalle}
              </div>
            )}
          </div>
        </div>
      </Caja>
    );
  }

  if (estado === 'error') {
    return (
      <Caja fondo="#fee2e2" borde="#fca5a5" color="#991b1b">
        <div style={{ fontWeight: 800, marginBottom: 4 }}>⚠️ No se pudieron activar</div>
        <div style={{ fontSize: 13, marginBottom: 10 }}>{error}</div>
        <button onClick={activar} style={botonEstilo('#991b1b')}>Reintentar</button>
      </Caja>
    );
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
      borderRadius: 14, padding: '18px 20px', marginBottom: 20,
      boxShadow: '0 4px 16px rgba(37, 99, 235, 0.25)',
      color: 'white',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div style={{
          display: 'inline-block', backgroundColor: 'rgba(255,255,255,0.2)',
          padding: '3px 10px', borderRadius: 20, fontSize: 11,
          fontWeight: 800, letterSpacing: 0.5,
        }}>
          ⚡ NOVEDAD
        </div>
        <button
          onClick={ocultarParaSiempre}
          title="No volver a mostrar este aviso"
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
            width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
            fontSize: 15, lineHeight: 1, flexShrink: 0,
          }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 36, lineHeight: 1 }}>🔔</div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>
            Recibe los avisos en tu móvil
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, opacity: 0.95, marginBottom: 12 }}>
            Ya no hace falta entrar a mirar. El portal te avisará al instante cuando:
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 2, opacity: 0.95, marginBottom: 14 }}>
            🛡️ Te asignen un <strong>apoyo de guardia</strong><br />
            ✅ Se resuelva tu <strong>solicitud de DLD</strong><br />
            📋 Tengas una <strong>justificación pendiente</strong>
          </div>

          <button
            onClick={activar}
            disabled={estado === 'activando'}
            style={{
              padding: '12px 26px', borderRadius: 10, border: 'none',
              backgroundColor: 'white', color: '#1e40af',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              opacity: estado === 'activando' ? 0.7 : 1,
            }}
          >
            {estado === 'activando' ? '⏳ Activando...' : '🔔 Activar ahora'}
          </button>

          <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 10, lineHeight: 1.5 }}>
            Solo se hace una vez. Si estás en la WiFi del centro, desactívala
            un momento y usa datos.
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Deja el motivo del fallo en los registros del servidor (Vercel → Logs,
 * buscar «push-fallo»), para saber por qué falla sin preguntar a nadie.
 */
function reportarFallo(e, origen = '') {
  try {
    fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'fallo',
        detalle: `${e?.name || 'Error'}: ${e?.message || '-'} ${origen}`.slice(0, 300),
        instalada: window.matchMedia('(display-mode: standalone)').matches,
        ua: navigator.userAgent.slice(0, 200),
      }),
    }).catch(() => {});
  } catch (_) {}
}

function Caja({ fondo, borde, color, children }) {
  return (
    <div style={{
      backgroundColor: fondo, border: `1.5px solid ${borde}`, color,
      borderRadius: 12, padding: '14px 18px', marginBottom: 18,
    }}>
      {children}
    </div>
  );
}

function botonEstilo(color) {
  return {
    padding: '10px 20px', borderRadius: 10, border: 'none',
    backgroundColor: color, color: 'white', fontWeight: 700,
    fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}
