'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

// Ámbar: distingue conserjería del cian de limpieza
const ambar = '#b45309';

// Esta clave va escrita en el código de la página, así que cualquiera
// que mire el código fuente puede verla. No es seguridad de verdad:
// sirve para que no se entre por curiosidad desde la portada.
const CLAVE = 'conserje2026';

export default function PersonalConserjeria() {
  const [cargado, setCargado] = useState(false);
  const [autorizado, setAutorizado] = useState(false);
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');

  // Si ya la puso antes en este dispositivo, no se le pide otra vez
  useEffect(() => {
    if (sessionStorage.getItem('conserjeria_ok') === '1') setAutorizado(true);
  }, []);

  function comprobar() {
    if (clave.trim().toLowerCase() === CLAVE) {
      sessionStorage.setItem('conserjeria_ok', '1');
      setAutorizado(true);
    } else {
      setError('Esa no es la clave. Pregunta en secretaría.');
      setClave('');
    }
  }

  if (!autorizado) {
    return (
      <div style={{
        minHeight: '100vh', backgroundColor: '#f0f4f6', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{
          backgroundColor: 'white', borderRadius: 16, padding: 32,
          maxWidth: 380, width: '100%', textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>🗝️</div>
          <h2 style={{ color: ambar, margin: '0 0 8px', fontSize: 20 }}>Conserjería</h2>
          <p style={{ color: '#666', fontSize: 14, margin: '0 0 22px', lineHeight: 1.6 }}>
            Control del cajetín de llaves del centro.
            <br />Introduce la clave de acceso.
          </p>

          <input
            type="password"
            value={clave}
            onChange={e => { setClave(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && comprobar()}
            placeholder="Clave de conserjería"
            autoFocus
            style={{
              width: '100%', padding: '13px 16px', borderRadius: 10, fontSize: 16,
              border: `1.5px solid ${error ? '#fca5a5' : '#ddd'}`,
              boxSizing: 'border-box', marginBottom: 12, textAlign: 'center',
            }}
          />

          {error && (
            <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</div>
          )}

          <button onClick={comprobar} disabled={!clave.trim()}
            style={{
              width: '100%', padding: '13px', borderRadius: 10, border: 'none',
              backgroundColor: clave.trim() ? ambar : '#cbd5e1', color: 'white',
              fontSize: 16, fontWeight: 700, cursor: clave.trim() ? 'pointer' : 'default',
            }}>
            Entrar
          </button>

          <a href="/personal" style={{
            display: 'block', marginTop: 16, color: '#888',
            fontSize: 13, textDecoration: 'none',
          }}>← Volver</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#f0f4f6',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* BARRA SUPERIOR SUTIL PARA VOLVER */}
      <div style={{
        backgroundColor: ambar,
        color: 'white',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        zIndex: 10,
      }}>
        <a href="/personal" style={{
          color: 'white',
          textDecoration: 'none',
          fontSize: 14,
          padding: '6px 12px',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: 6,
          fontWeight: 700,
        }}>← Volver</a>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          🗝️ Conserjería · Llaves
        </div>
      </div>

      {/* PANTALLA DE CARGA */}
      {!cargado && (
        <div style={{
          position: 'absolute',
          inset: '50px 0 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0f4f6',
          zIndex: 5,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 14, color: '#666', fontWeight: 700 }}>
              Cargando el cajetín de llaves…
            </div>
          </div>
        </div>
      )}

      {/* IFRAME CON LA APP DE LIMPIEZA */}
      <iframe
        src="https://secretariogp.github.io/llaves-ies/"
        onLoad={() => setCargado(true)}
        allow="camera; microphone; geolocation; fullscreen"
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
        }}
        title="App de Limpieza IES"
      />
    </div>
  );
}
