'use client';

import { useState, useEffect } from 'react';

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

      if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }

      if (Notification.permission === 'granted') {
        try {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            setEstado('activo');
            // Reasegurar que está guardada para este profesor
            await guardarSuscripcion(sub);
            return;
          }
        } catch (_) {}
      }

      setEstado('pedir');
    })();
  }, [profesorId]);

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

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();

      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(clave),
        });
      }

      await guardarSuscripcion(sub);
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
    return (
      <Caja fondo="#fef3c7" borde="#fbbf24" color="#78350f">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 28, lineHeight: 1 }}>📶</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 15 }}>
              Activa las notificaciones
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>
              La WiFi del centro bloquea el servicio de notificaciones.
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.9, marginBottom: 10 }}>
              <strong>Para activarlas:</strong><br />
              1. Desactiva la WiFi del móvil (usa datos)<br />
              2. Pulsa <strong>🔔 Activar</strong><br />
              3. Vuelve a conectar la WiFi
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 12, fontWeight: 700 }}>
              Solo hay que hacerlo una vez. Después te llegarán siempre,
              también en el instituto.
            </div>
            <button onClick={activar} style={botonEstilo('#b45309')}>🔔 Activar</button>
            {detalle && (
              <div style={{ marginTop: 12, fontSize: 10.5, color: '#a16207', wordBreak: 'break-all', lineHeight: 1.4 }}>
                Detalle técnico: {detalle}
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
      <div style={{
        display: 'inline-block', backgroundColor: 'rgba(255,255,255,0.2)',
        padding: '3px 10px', borderRadius: 20, fontSize: 11,
        fontWeight: 800, letterSpacing: 0.5, marginBottom: 10,
      }}>
        ⚡ NOVEDAD
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
