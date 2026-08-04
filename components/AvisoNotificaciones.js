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
    <Caja fondo="#dbeafe" borde="#93c5fd" color="#1e40af">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 28 }}>🔔</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, marginBottom: 3 }}>Activa las notificaciones</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>
            Recibe avisos en el móvil cuando te asignen un apoyo de guardia,
            se resuelva un DLD o tengas una justificación pendiente.
          </div>
        </div>
        <button
          onClick={activar}
          disabled={estado === 'activando'}
          style={{ ...botonEstilo(VERDE), opacity: estado === 'activando' ? 0.7 : 1 }}
        >
          {estado === 'activando' ? '⏳ Activando...' : '🔔 Activar'}
        </button>
      </div>
    </Caja>
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
