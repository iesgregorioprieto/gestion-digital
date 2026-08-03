'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function RecuperarContenido() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [pantalla, setPantalla] = useState(token ? 'verificando' : 'solicitar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (token) {
      verificarToken();
    }
  }, [token]);

  async function verificarToken() {
    try {
      const res = await fetch('/api/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'verificar_token', token }),
      });
      const data = await res.json();
      if (data.ok) {
        setNombre(data.nombre);
        setPantalla('nueva_password');
      } else {
        setError(data.error || 'Token no válido');
        setPantalla('error');
      }
    } catch (e) {
      setError('Error de conexión');
      setPantalla('error');
    }
  }

  async function solicitarReset() {
    if (!email.trim()) { setError('Introduce tu email'); return; }
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'solicitar', email: email.trim() }),
      });
      const data = await res.json();
      setMensaje(data.mensaje || 'Revisa tu correo electrónico.');
      setPantalla('enviado');
    } catch (e) {
      setError('Error de conexión. Inténtalo de nuevo.');
    }
    setEnviando(false);
  }

  async function cambiarPassword() {
    if (!password || password.length < 4) { setError('La contraseña debe tener al menos 4 caracteres'); return; }
    if (password !== password2) { setError('Las contraseñas no coinciden'); return; }
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/recuperar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cambiar', token, nuevaPassword: password }),
      });
      const data = await res.json();
      if (data.ok) {
        setPantalla('cambiada');
      } else {
        setError(data.error || 'Error al cambiar la contraseña');
      }
    } catch (e) {
      setError('Error de conexión');
    }
    setEnviando(false);
  }

  const azul = '#1e3a5f';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 30, maxWidth: 420, width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40 }}>🔑</div>
          <h1 style={{ fontSize: 20, color: azul, margin: '8px 0 4px' }}>Restablecer contraseña</h1>
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>APrieto · IES Gregorio Prieto</p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16, border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {pantalla === 'solicitar' && (
          <>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              Introduce tu email del portal y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu.email@educastillalamancha.es"
              onKeyDown={e => e.key === 'Enter' && solicitarReset()}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <button
              onClick={solicitarReset}
              disabled={enviando}
              style={{ width: '100%', padding: '12px', backgroundColor: azul, color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.7 : 1 }}
            >
              {enviando ? '⏳ Enviando...' : '📧 Enviar enlace de recuperación'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <a href="/login" style={{ color: azul, fontSize: 13, textDecoration: 'none' }}>← Volver al login</a>
            </div>
          </>
        )}

        {pantalla === 'enviado' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 12 }}>📬</div>
            <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>
              {mensaje}
            </p>
            <p style={{ fontSize: 12, color: '#888' }}>Revisa también la carpeta de spam. El enlace caduca en 30 minutos.</p>
            <a href="/login" style={{ display: 'inline-block', marginTop: 16, color: azul, fontSize: 13, textDecoration: 'none' }}>← Volver al login</a>
          </div>
        )}

        {pantalla === 'verificando' && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 30 }}>⏳</div>
            <p style={{ color: '#888' }}>Verificando enlace...</p>
          </div>
        )}

        {pantalla === 'nueva_password' && (
          <>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 16 }}>
              Hola <strong>{nombre}</strong>, elige tu nueva contraseña:
            </p>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Nueva contraseña"
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <input
              type="password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder="Repetir contraseña"
              onKeyDown={e => e.key === 'Enter' && cambiarPassword()}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
            />
            <button
              onClick={cambiarPassword}
              disabled={enviando}
              style={{ width: '100%', padding: '12px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: enviando ? 0.7 : 1 }}
            >
              {enviando ? '⏳ Guardando...' : '✅ Guardar nueva contraseña'}
            </button>
          </>
        )}

        {pantalla === 'cambiada' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 12 }}>✅</div>
            <p style={{ fontSize: 15, color: '#166534', fontWeight: 600 }}>Contraseña cambiada con éxito</p>
            <p style={{ fontSize: 13, color: '#888' }}>Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <a href="/login" style={{
              display: 'inline-block', marginTop: 16, padding: '10px 24px',
              backgroundColor: azul, color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
            }}>Ir al login</a>
          </div>
        )}

        {pantalla === 'error' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 50, marginBottom: 12 }}>❌</div>
            <p style={{ fontSize: 14, color: '#dc2626' }}>{error}</p>
            <a href="/recuperar" style={{
              display: 'inline-block', marginTop: 16, padding: '10px 24px',
              backgroundColor: azul, color: 'white', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
            }}>Solicitar nuevo enlace</a>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecuperarPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⏳ Cargando...</div>}>
      <RecuperarContenido />
    </Suspense>
  );
}
