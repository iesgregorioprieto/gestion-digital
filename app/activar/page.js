'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const VERDE = '#1e6b2e';

export default function Activar() {
  const [estado, setEstado] = useState('comprobando');
  // 'comprobando' | 'listo' | 'ya_activa' | 'invalido' | 'error'
  const [nombre, setNombre] = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('t');

      if (!token) { setEstado('invalido'); return; }

      try {
        const { data: rows, error: err } = await getSupabase()
          .from('profesores')
          .select('id, nombre, apellidos, email_verificado, estado')
          .eq('token_activacion', token);

        if (err) { setError(err.message); setEstado('error'); return; }

        const prof = (rows || [])[0];
        if (!prof) { setEstado('invalido'); return; }

        setNombre(prof.nombre || '');

        if (prof.email_verificado) { setEstado('ya_activa'); return; }

        const { error: errUpd } = await getSupabase()
          .from('profesores')
          .update({ email_verificado: true, token_activacion: null })
          .eq('id', prof.id);

        if (errUpd) { setError(errUpd.message); setEstado('error'); return; }

        setEstado('listo');
      } catch (e) {
        setError(e.message);
        setEstado('error');
      }
    })();
  }, []);

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f0f4f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 40,
        maxWidth: 460, width: '100%', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      }}>

        {estado === 'comprobando' && (
          <>
            <div style={{ fontSize: 50, marginBottom: 14 }}>⏳</div>
            <div style={{ color: '#888', fontSize: 15 }}>Activando tu cuenta...</div>
          </>
        )}

        {estado === 'listo' && (
          <>
            <div style={{ fontSize: 64, marginBottom: 14 }}>🎉</div>
            <h2 style={{ color: VERDE, margin: '0 0 12px' }}>
              ¡Cuenta activada{nombre ? ', ' + nombre : ''}!
            </h2>
            <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 24px' }}>
              Tu correo ha quedado verificado. Ya puedes entrar en el portal
              con tu email y la contraseña que creaste.
            </p>
            <a href="/login" style={boton}>🔓 Entrar al portal</a>
          </>
        )}

        {estado === 'ya_activa' && (
          <>
            <div style={{ fontSize: 64, marginBottom: 14 }}>👋</div>
            <h2 style={{ color: VERDE, margin: '0 0 12px' }}>Tu cuenta ya está activa</h2>
            <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 24px' }}>
              No hace falta hacer nada más. Entra con tu email y contraseña.
            </p>
            <a href="/login" style={boton}>🔓 Entrar al portal</a>
          </>
        )}

        {estado === 'invalido' && (
          <>
            <div style={{ fontSize: 64, marginBottom: 14 }}>🔗</div>
            <h2 style={{ color: '#92400e', margin: '0 0 12px' }}>Enlace no válido</h2>
            <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
              Este enlace ya se ha usado o no es correcto.
            </p>
            <div style={{
              backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 10, padding: '12px 16px', fontSize: 13,
              color: '#166534', lineHeight: 1.6, marginBottom: 20, textAlign: 'left',
            }}>
              Si ya activaste tu cuenta antes, entra directamente.
              Si no, escribe al secretario para que te reenvíe el correo.
            </div>
            <a href="/login" style={boton}>🔓 Ir al portal</a>
          </>
        )}

        {estado === 'error' && (
          <>
            <div style={{ fontSize: 64, marginBottom: 14 }}>⚠️</div>
            <h2 style={{ color: '#991b1b', margin: '0 0 12px' }}>Ha habido un problema</h2>
            <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 8px' }}>
              No se pudo activar la cuenta.
            </p>
            <p style={{ color: '#999', fontSize: 12, margin: '0 0 24px' }}>{error}</p>
            <a href="/login" style={boton}>Ir al portal</a>
          </>
        )}

      </div>
    </div>
  );
}

const boton = {
  display: 'inline-block', padding: '13px 30px',
  backgroundColor: VERDE, color: 'white', borderRadius: 10,
  textDecoration: 'none', fontWeight: 700, fontSize: 15,
};
