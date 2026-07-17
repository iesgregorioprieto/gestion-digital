'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mostrarInstalar, setMostrarInstalar] = useState(false);

  useEffect(() => {
    // Capturar el evento de instalación PWA
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setMostrarInstalar(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Si ya está instalada, no mostrar
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setMostrarInstalar(false);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function instalarApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setMostrarInstalar(false);
    setDeferredPrompt(null);
  }

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

    // 🔒 NORMALIZAR rol_gestion: minúsculas + trim para evitar bugs
    // (por si en BD queda "Director", "Secretary", " secretario ", etc.)
    const rolGestionNormalizado = (data.rol_gestion || '').toString().trim().toLowerCase();

    // Mapeo de sinónimos por si viene en inglés o mal escrito
    const MAPA_ROLES = {
      'director': 'director',
      'directora': 'director',
      'secretario': 'secretario',
      'secretaria': 'secretario',
      'secretary': 'secretario',
      'jefe_estudios': 'jefe_estudios',
      'jefe estudios': 'jefe_estudios',
      'jefa_estudios': 'jefe_estudios',
      'head of studies': 'jefe_estudios',
    };
    const rolFinal = MAPA_ROLES[rolGestionNormalizado] || rolGestionNormalizado;

    sessionStorage.setItem('profesor_id', data.id);
    sessionStorage.setItem('profesor_nombre', `${data.nombre} ${data.apellidos}`);
    sessionStorage.setItem('profesor_rol_gestion', rolFinal);
    sessionStorage.setItem('profesor_roles', JSON.stringify(Array.isArray(data.rol) ? data.rol : ['profesor']));

    window.location.href = '/profesor';
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f0f4f0',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', padding: 16
    }}>

      {/* BANNER INSTALAR APP */}
      {mostrarInstalar && (
        <div style={{ width: '100%', maxWidth: 400, marginBottom: 16, backgroundColor: '#1e3a5f', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          <img src="/icon-72x72.png" alt="IES" style={{ width: 44, height: 44, borderRadius: 10 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>Instalar app del IES</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Accede más rápido desde tu móvil</div>
          </div>
          <button onClick={instalarApp} style={{ backgroundColor: '#1e6b2e', color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Instalar
          </button>
          <button onClick={() => setMostrarInstalar(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
      )}

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