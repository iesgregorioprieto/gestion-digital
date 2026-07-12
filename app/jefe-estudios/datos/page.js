'use client';
export const dynamic = 'force-dynamic';

import { useEffect } from 'react';

export default function RedirectDatos() {
  useEffect(() => {
    window.location.href = '/gestion/datos';
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#555' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Redirigiendo al Panel de Gestión...</div>
      </div>
    </div>
  );
}
