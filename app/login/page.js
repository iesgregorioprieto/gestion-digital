'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const verde = '#1e6b2e';

  async function entrar() {
    setError('');
    if (!email || !password) {
      setError('Por favor introduce tu email y contraseña.');
      return;
    }

    setCargando(true);

    const supabase = getSupabase();
    const { data: rows, error: err } = await supabase
      .from('profesores')
      .select('id, nombre, apellidos, rol, rol_gestion, estado, password_hash')
      .eq('email', email.trim().toLowerCase());

    setCargando(false);

    if (err || !rows || rows.length === 0) {
      setError('Email o contraseña incorrectos.');
      return;
    }
    const data = rows[0];

    if (data.estado !== 'activo') {
      setError('Tu cuenta aún no está activada. Contacta con el secretario.');
      return;
    }

    if (data.password_hash !== password) {
      setError('Email o contraseña incorrectos.');
      return;
    }

    sessionStorage.setItem('profesor_id', data.id);
    sessionStorage.setItem('profesor_nombre', `${data.nombre} ${data.apellidos}`);
    sessionStorage.setItem('profesor_rol_gestion', data.rol_gestion || '');
    sessionStorage.setItem('profesor_roles', JSON.stringify(Array.isArray(data.rol) ? data.rol : ['profesor']));

    const rol = data.rol_gestion || '';
    if (rol === 'secretario') window.location.href = '/secretario';
    else if (rol === 'director') window.location.href = '/director';
    else window.location.href = '/profesor';
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f0f4f0',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', padding: 16
    }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏫</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: verde }}>IES Gregorio Prieto</div>
        <div style={{ fontSize: 14, color: '#777', marginTop: 4 }}>Valdepeñas · Castilla-La Mancha</div>
      </div>

      <div style={{
        backgroundColor: 'white', borderRadius: 16, padding: 32,
        maxWidth: 420, width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)'
      }}>
        <h2 style={{ margin: '0 0 24px 0', color: verde, fontSize: 20, textAlign: 'center' }}>
          🔐 Acceso al portal
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 }}>
            Email institucional
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            placeholder="llcc12@educastillalamancha.es"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 }}>
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && entrar()}
            placeholder="Tu contraseña"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>

        {error && (
          <div style={{
            backgroundColor: '#fee2e2', border: '1px solid #fca5a5',
            borderRadius: 8, padding: 12, marginBottom: 16,
            color: '#b91c1c', fontSize: 14
          }}>
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={entrar}
          disabled={cargando}
          style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            backgroundColor: verde, color: 'white', fontWeight: 700,
            fontSize: 16, cursor: cargando ? 'not-allowed' : 'pointer',
            opacity: cargando ? 0.7 : 1
          }}
        >
          {cargando ? 'Comprobando...' : '→ Entrar'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#888' }}>
          ¿Aún no tienes cuenta?{' '}
          <a href="/registro" style={{ color: verde, fontWeight: 600, textDecoration: 'none' }}>
            Regístrate aquí
          </a>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Volver al inicio</a>
      </div>
    </div>
  );
}