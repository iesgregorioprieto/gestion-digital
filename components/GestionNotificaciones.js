'use client';

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const salida = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) salida[i] = raw.charCodeAt(i);
  return salida;
}

export default function GestionNotificaciones({ profesorId }) {
  const [estado, setEstado]   = useState('comprobando');
  // 'comprobando' | 'no_soportado' | 'inactivo' | 'activo' | 'trabajando' | 'bloqueado' | 'red_bloqueada' | 'error'
  const [error, setError]     = useState('');
  const [mensaje, setMensaje] = useState('');

  useEffect(() => { comprobar(); }, [profesorId]);

  async function comprobar() {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEstado('no_soportado');
      return;
    }
    if (Notification.permission === 'denied') { setEstado('bloqueado'); return; }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? 'activo' : 'inactivo');
    } catch (_) {
      setEstado('inactivo');
    }
  }

  async function activar() {
    setError(''); setMensaje('');
    setEstado('trabajando');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso === 'denied')  { setEstado('bloqueado'); return; }
      if (permiso !== 'granted') { setEstado('inactivo'); return; }

      const clave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!clave) { setError('Falta la clave de notificaciones.'); setEstado('error'); return; }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(clave),
        });
      }

      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'suscribir', profesor_id: profesorId, suscripcion: sub.toJSON() }),
      });

      setMensaje('✅ Notificaciones activadas');
      setEstado('activo');
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('push service') || msg.includes('registration failed') || e.name === 'AbortError') {
        setEstado('red_bloqueada');
        return;
      }
      setError(e.message || 'No se pudo activar');
      setEstado('error');
    }
  }

  async function desactivar() {
    setError(''); setMensaje('');
    setEstado('trabajando');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'desuscribir', endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setMensaje('🔕 Notificaciones desactivadas en este dispositivo');
      setEstado('inactivo');
    } catch (e) {
      setError(e.message || 'No se pudo desactivar');
      setEstado('error');
    }
  }

  async function probar() {
    setError(''); setMensaje('');
    try {
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'enviar',
          profesor_id: profesorId,
          titulo: '🏫 IES Gregorio Prieto',
          cuerpo: 'Esto es una notificación de prueba. ¡Todo funciona!',
          url: '/profesor',
        }),
      });
      const d = await r.json();
      setMensaje(d.enviados > 0
        ? `📨 Enviada a ${d.enviados} dispositivo${d.enviados > 1 ? 's' : ''}`
        : 'No hay dispositivos suscritos.');
    } catch (e) {
      setError('No se pudo enviar la prueba.');
    }
  }

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
        🔔 Avisos en el móvil
      </div>

      <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.7, marginBottom: 16 }}>
        Recibe un aviso al instante, sin tener que entrar a mirar:
        <div style={{ lineHeight: 2, marginTop: 8 }}>
          🛡️ Cuando te asignen un <strong>apoyo de guardia</strong><br />
          ✅ Cuando se resuelva tu <strong>solicitud de DLD</strong><br />
          📋 Cuando tengas una <strong>justificación pendiente</strong>
        </div>
      </div>

      {mensaje && <Nota fondo="#dcfce7" borde="#86efac" color="#166534">{mensaje}</Nota>}
      {error   && <Nota fondo="#fee2e2" borde="#fca5a5" color="#991b1b">⚠️ {error}</Nota>}

      {estado === 'comprobando' && (
        <div style={{ color: '#888', fontSize: 13 }}>⏳ Comprobando...</div>
      )}

      {estado === 'no_soportado' && (
        <Nota fondo="#f5f5f5" borde="#ddd" color="#666">
          Tu navegador no admite notificaciones. Prueba con Chrome en Android
          o instala la aplicación en tu móvil.
        </Nota>
      )}

      {estado === 'bloqueado' && (
        <Nota fondo="#fef3c7" borde="#fbbf24" color="#78350f">
          <strong>Notificaciones bloqueadas.</strong><br />
          Has denegado el permiso anteriormente. Para activarlas, ve a los
          ajustes de tu navegador o del móvil, busca este sitio y permite
          las notificaciones.
        </Nota>
      )}

      {estado === 'red_bloqueada' && (
        <Nota fondo="#fef3c7" borde="#fbbf24" color="#78350f">
          <strong>📲 Esta versión de la app no admite notificaciones.</strong>
          <div style={{ marginTop: 8, lineHeight: 1.6 }}>
            Para recibir los avisos hay que instalar la app desde Chrome.
            Se ve exactamente igual.
          </div>
          <div style={{ lineHeight: 2, marginTop: 10 }}>
            1. Desinstala esta app del móvil<br />
            2. Abre <strong>Chrome</strong> y entra en app.iesgregorioprieto.com<br />
            3. Pulsa el menú <strong>⋮</strong> arriba a la derecha<br />
            4. Elige <strong>Instalar aplicación</strong><br />
            5. Ábrela y activa los avisos
          </div>
          <div style={{ marginTop: 10, fontSize: 12.5 }}>
            Mientras tanto puedes usar el portal desde Chrome y activarlos allí.
          </div>
          <button onClick={activar} style={{ ...boton('#b45309'), marginTop: 12 }}>
            🔔 Intentar de nuevo
          </button>
        </Nota>
      )}

      {(estado === 'inactivo' || estado === 'error') && (
        <button onClick={activar} style={{ ...boton(VERDE), width: '100%' }}>
          🔔 Activar notificaciones
        </button>
      )}

      {estado === 'trabajando' && (
        <button disabled style={{ ...boton(VERDE), width: '100%', opacity: 0.7 }}>
          ⏳ Un momento...
        </button>
      )}

      {estado === 'activo' && (
        <div>
          <Nota fondo="#dcfce7" borde="#86efac" color="#166534">
            ✅ <strong>Notificaciones activadas</strong> en este dispositivo.
          </Nota>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={probar} style={{ ...boton(VERDE), flex: 1, minWidth: 140 }}>
              📨 Enviar prueba
            </button>
            <button onClick={desactivar} style={{
              ...boton('white'), color: '#991b1b',
              border: '1.5px solid #fca5a5', flex: 1, minWidth: 140,
            }}>
              🔕 Desactivar
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: '#999', lineHeight: 1.6 }}>
        Las notificaciones se activan por dispositivo. Si usas el móvil y el
        ordenador, tendrás que activarlas en cada uno.
      </div>
    </div>
  );
}

function Nota({ fondo, borde, color, children }) {
  return (
    <div style={{
      backgroundColor: fondo, border: `1.5px solid ${borde}`, color,
      borderRadius: 10, padding: '12px 16px', marginBottom: 14,
      fontSize: 13, lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

function boton(color) {
  return {
    padding: '12px 20px', borderRadius: 10,
    border: color === 'white' ? '1.5px solid #ddd' : 'none',
    backgroundColor: color, color: color === 'white' ? '#333' : 'white',
    fontWeight: 700, fontSize: 14, cursor: 'pointer',
  };
}
