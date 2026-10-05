'use client';
export const dynamic = 'force-dynamic';

/**
 * FICHAJE PRESENCIAL — a donde llevan el QR del cartel y la etiqueta NFC
 *
 *   /fichar?c=<convocatoria>&t=<código del cartel>   → QR
 *   /fichar?n=<código de la etiqueta>                → NFC
 *
 * No hay botón: al abrirse, ficha. Si no hay sesión en este navegador
 * (pasa mucho en iPhone, donde la app instalada y Safari no comparten
 * nada), manda a entrar y vuelve aquí sola.
 *
 * El enlace se borra de la barra de direcciones en cuanto se lee, para
 * que no se quede a mano para copiarlo y mandarlo.
 */

import { useState, useEffect } from 'react';

const VERDE = '#166534';
const ROJO = '#991b1b';
const AMBAR = '#b45309';

/** Identificador de este móvil, para detectar uno que ficha por varios */
function idDispositivo() {
  try {
    let id = localStorage.getItem('aprieto_dispositivo');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9-]/g, '');
      localStorage.setItem('aprieto_dispositivo', id);
    }
    return id;
  } catch { return null; }
}

export default function Fichar() {
  const [estado, setEstado] = useState('cargando');  // cargando | ok | error
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const datos = { c: p.get('c'), t: p.get('t'), n: p.get('n'), dispositivo: idDispositivo() };
    if (!datos.n && !(datos.c && datos.t)) {
      setError('Este enlace no es válido. Escanea el QR de la entrada o acerca el móvil a la etiqueta.');
      setEstado('error');
      return;
    }

    (async () => {
      let r, d;
      try {
        r = await fetch('/api/convocatorias', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'fichar_presencia', datos }),
        });
        d = await r.json().catch(() => ({}));
      } catch {
        setError('No hay conexión. Comprueba los datos o la wifi y vuelve a escanear.');
        setEstado('error');
        return;
      }

      // Sin sesión: a entrar, y de vuelta aquí con el mismo enlace
      if (r.status === 401) {
        window.location.href = `/login?volver=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        return;
      }

      // Ya leído: fuera de la barra de direcciones
      try { window.history.replaceState(null, '', '/fichar'); } catch { /* da igual */ }

      if (!r.ok) { setError(d.error || 'No se ha podido registrar la asistencia'); setEstado('error'); return; }
      setRes(d);
      setEstado('ok');
      try { navigator.vibrate?.(120); } catch { /* da igual */ }
    })();
  }, []);

  const hora = res?.fichado_at
    ? new Date(res.fichado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
    : '';
  const color = estado === 'error' ? ROJO : res?.tarde ? AMBAR : VERDE;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 20, maxWidth: 420, width: '100%', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.12)', textAlign: 'center' }}>

        {estado === 'cargando' && (
          <div style={{ padding: '50px 24px' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 16, color: '#555', fontWeight: 600 }}>Registrando tu asistencia…</div>
          </div>
        )}

        {estado !== 'cargando' && (
          <>
            <div style={{ backgroundColor: color, color: 'white', padding: '28px 22px' }}>
              <div style={{ fontSize: 54, lineHeight: 1 }}>{estado === 'error' ? '⚠️' : '✅'}</div>
              <div style={{ fontSize: 21, fontWeight: 800, marginTop: 10 }}>
                {estado === 'error' ? 'No se ha registrado'
                  : res.yaEstaba ? 'Ya habías fichado'
                  : 'Asistencia registrada'}
              </div>
              {estado === 'ok' && hora && (
                <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{hora}</div>
              )}
            </div>
            <div style={{ padding: '20px 22px 24px' }}>
              {estado === 'error' ? (
                <div style={{ fontSize: 15, color: '#333', lineHeight: 1.5 }}>{error}</div>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{res.titulo}</div>
                  {res.lugar && <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 3 }}>{res.lugar}</div>}
                  {res.tarde && (
                    <div style={{ marginTop: 12, fontSize: 13, color: AMBAR, fontWeight: 700 }}>
                      Consta como incorporación después de la hora de inicio
                    </div>
                  )}
                  <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8' }}>
                    {res.metodo === 'nfc' ? '📶 Etiqueta NFC' : '📷 Código QR'} · ya puedes guardar el móvil
                  </div>
                </>
              )}
              <a href="/profesor" style={{ display: 'block', marginTop: 18, fontSize: 13.5, color: '#1e3a5f', fontWeight: 700 }}>Ir a APrieto</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
