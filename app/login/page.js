'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [avisoPermisos, setAvisoPermisos] = useState(false);
  const [verPass, setVerPass] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('motivo') === 'permisos') setAvisoPermisos(true);
  }, []);
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

    // ─────────────────────────────────────────────────────────────
    // TODA la comprobación se hace en el servidor.
    //
    // Antes, el navegador se descargaba el hash de la contraseña para
    // compararlo. Eso obligaba a que cualquiera con la clave pública
    // pudiera leer los hash de todo el claustro. Ahora solo viajan el
    // email y la contraseña, y el servidor responde sí o no.
    // ─────────────────────────────────────────────────────────────
    const emailBuscado = email.trim().toLowerCase();

    let respuesta, datos;
    try {
      respuesta = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'entrar',
          email: emailBuscado,
          password: password.trim(),
        }),
      });
      datos = await respuesta.json();
    } catch (e) {
      setCargando(false);
      setError('No se pudo conectar con el servidor. Inténtalo de nuevo.');
      return;
    }

    setCargando(false);

    if (!respuesta.ok) {
      const motivo = datos?.error;
      if (motivo === 'no_existe') {
        setError('No existe ninguna cuenta con ese email. Revisa que esté bien escrito o regístrate.');
      } else if (motivo === 'credenciales') {
        setError('Contraseña incorrecta.');
      } else if (motivo === 'inactivo') {
        setError('Tu cuenta no está activa. Contacta con el secretario.');
      } else if (motivo === 'sin_verificar') {
        setError('CORREO_SIN_VERIFICAR');
      } else {
        setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
      }
      return;
    }

    const prof = datos.profesor;

    // Se mantiene sessionStorage para que el resto de la aplicación siga
    // funcionando igual. Ya no decide los permisos: eso lo hace la cookie
    // firmada que acaba de emitir el servidor.
    sessionStorage.setItem('profesor_id', prof.id);
    sessionStorage.setItem('profesor_nombre', `${prof.nombre || ''} ${prof.apellidos || ''}`.trim());
    sessionStorage.setItem('profesor_email', prof.email || '');
    sessionStorage.setItem('profesor_rol_gestion', prof.rol_gestion || '');
    sessionStorage.setItem('profesor_roles', JSON.stringify(prof.roles || ['profesor']));

    // Si aún no ha rellenado su ficha → a completarla
    window.location.href = prof.fichaCompleta ? '/profesor' : '/completar-perfil';
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
          <div style={{ position: 'relative' }}>
            <input
              type={verPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && entrar()}
              placeholder="Tu contraseña"
              style={{ width: '100%', padding: '11px 44px 11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
            />
            <button type="button" onClick={() => setVerPass(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 0 }}>
              {verPass ? '🙈' : '👁️'}
            </button>
          </div>
        </div>

        {avisoPermisos && (
          <div style={{
            backgroundColor: '#fef3c7', border: '1.5px solid #fbbf24',
            borderRadius: 10, padding: '13px 16px', marginBottom: 16,
            color: '#78350f', fontSize: 13.5, lineHeight: 1.6
          }}>
            🔒 <strong>Necesitas permisos para esa página.</strong><br />
            Inicia sesión con una cuenta del equipo directivo.
          </div>
        )}

        {error === 'CORREO_SIN_VERIFICAR' && (
          <div style={{
            backgroundColor: '#fef3c7', border: '1.5px solid #fbbf24',
            borderRadius: 10, padding: '14px 16px', marginBottom: 16,
            color: '#78350f', fontSize: 13.5, lineHeight: 1.6
          }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              📧 Falta activar tu cuenta
            </div>
            Te hemos enviado un correo con el asunto <strong>«Tu acceso ha sido
            activado»</strong>. Ábrelo y pulsa el botón <strong>🔓 Activar mi cuenta</strong>.
            <div style={{ marginTop: 8, fontSize: 12.5 }}>
              Si no lo encuentras, mira en la carpeta de <strong>spam</strong> o
              pide al secretario que te lo reenvíe.
            </div>
          </div>
        )}

        {error && error !== 'CORREO_SIN_VERIFICAR' && (
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

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <a href="/recuperar" style={{ color: '#888', fontSize: 12, textDecoration: 'none' }}>
            🔑 ¿Has olvidado tu contraseña?
          </a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: '#888' }}>
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