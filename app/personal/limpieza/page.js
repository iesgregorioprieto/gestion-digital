'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';

const cyan = '#0891b2';

export default function PersonalLimpieza() {
  const [cargado, setCargado] = useState(false);

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
        backgroundColor: cyan,
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
          🧹 Personal de Limpieza
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
              Cargando app de limpieza…
            </div>
          </div>
        </div>
      )}

      {/* IFRAME CON LA APP DE LIMPIEZA */}
      <iframe
        src="https://iesgregorioprieto.github.io/limpieza-IES/"
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
