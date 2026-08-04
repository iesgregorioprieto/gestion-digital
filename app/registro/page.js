'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const verde = '#1e6b2e';

export default function Registro() {
  // pantallas: 'inicio' | 'pendiente_aprobacion' | 'ya_registrado' | 'solicitud_enviada'
  const [pantalla, setPantalla] = useState('inicio');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // ─── ENVIAR SOLICITUD ───
  async function enviarSolicitud() {
    setError('');
    const emailLimpio = email.trim().toLowerCase();

    if (!emailLimpio) { setError('Introduce tu email institucional.'); return; }
    if (!emailLimpio.endsWith('@educastillalamancha.es')) {
      setError('Solo se permite el registro con email @educastillalamancha.es');
      return;
    }
    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      // Comprobar si ya existe
      const { data: existente } = await getSupabase()
        .from('profesores')
        .select('id, estado, password_hash, solicitud_acceso')
        .eq('email', emailLimpio);

      const prof = (existente || [])[0];

      // Ya tiene contraseña → ya está registrado
      if (prof && prof.password_hash && prof.password_hash.length > 0) {
        setPantalla('ya_registrado');
        setEnviando(false);
        return;
      }

      // Ya envió solicitud y espera aprobación
      if (prof && prof.solicitud_acceso) {
        setPantalla('pendiente_aprobacion');
        setEnviando(false);
        return;
      }

      // Calcular hash de la contraseña
      const rHash = await fetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'hash', password }),
      });
      const dHash = await rHash.json();
      if (!dHash.hash) { setError('Error al procesar la contraseña.'); setEnviando(false); return; }

      if (prof) {
        // Ya existe en BD → actualizar con contraseña y marcar solicitud
        await getSupabase()
          .from('profesores')
          .update({ password_hash: dHash.hash, solicitud_acceso: true, estado: 'pendiente' })
          .eq('id', prof.id);
      } else {
        // No existe → crear registro nuevo
        await getSupabase()
          .from('profesores')
          .insert({ email: emailLimpio, password_hash: dHash.hash, solicitud_acceso: true, estado: 'pendiente' });
      }

      // Email al profesor: solicitud recibida
      try {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'registro_pendiente',
            datos: { nombre: 'Profesor/a', email: emailLimpio }
          })
        });
      } catch(e) { console.error('Email profesor (no crítico):', e); }

      // Email al secretario: nueva solicitud
      try {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'nueva_solicitud_secretario',
            datos: { nombre: emailLimpio, email: 'llcc12@educastillalamancha.es', departamento: '' }
          })
        });
      } catch(e) { console.error('Email secretario (no crítico):', e); }

      setPantalla('solicitud_enviada');
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  // ═══════════════════════════════════════════════════
  // PANTALLAS DE RESPUESTA
  // ═══════════════════════════════════════════════════

  if (pantalla === 'solicitud_enviada') {
    return (
      <Mensaje emoji="📨" titulo="¡Solicitud enviada!" verde={verde}>
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Hemos recibido tu solicitud de acceso al portal.<br />
          El <strong>secretario</strong> la revisará y te activará la cuenta.
        </p>
        <p style={{ color: '#888', fontSize: 13, marginTop: 12, backgroundColor: '#f0fdf4', padding: '10px 14px', borderRadius: 8 }}>
          📧 Recibirás un correo de confirmación en <strong>{email}</strong> cuando tu acceso esté activo.<br />
          Entonces podrás entrar con tu email y la contraseña que acabas de crear.
        </p>
        <a href="/" style={btnPrimario(verde)}>← Volver al inicio</a>
      </Mensaje>
    );
  }

  if (pantalla === 'pendiente_aprobacion') {
    return (
      <Mensaje emoji="⏳" titulo="Solicitud en revisión" verde="#92400e">
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Ya has enviado tu solicitud con este email.<br />
          Tu cuenta está <strong>pendiente de aprobación</strong> por el secretario.
        </p>
        <p style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
          Recibirás un correo en cuanto tu acceso esté activado.
        </p>
        <a href="/" style={btnPrimario(verde)}>← Volver al inicio</a>
      </Mensaje>
    );
  }

  if (pantalla === 'ya_registrado') {
    return (
      <Mensaje emoji="👋" titulo="Ya tienes cuenta" verde={verde}>
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Este email ya tiene una cuenta activa.<br />
          Inicia sesión con tu email y contraseña.
        </p>
        <a href="/login" style={btnPrimario(verde)}>🔓 Ir al login</a>
      </Mensaje>
    );
  }

  // ═══════════════════════════════════════════════════
  // PANTALLA INICIAL: email + contraseña
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Solicitud de acceso al portal</div>
        </div>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px' }}>

        {/* PASOS */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 28, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {[
            { n: '1', texto: 'Solicitud', activo: true },
            { n: '2', texto: 'Aprobación', activo: false },
            { n: '3', texto: 'Completa tu ficha', activo: false },
          ].map((paso, i) => (
            <div key={i} style={{ flex: 1, padding: '12px 8px', textAlign: 'center', backgroundColor: paso.activo ? verde : 'white', borderRight: i < 2 ? '1px solid #e5e7eb' : 'none' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: paso.activo ? 'white' : '#ccc' }}>{paso.n}</div>
              <div style={{ fontSize: 11, color: paso.activo ? '#a7f3d0' : '#aaa', marginTop: 2 }}>{paso.texto}</div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>📋</div>
          <h2 style={{ color: verde, textAlign: 'center', margin: '0 0 6px', fontSize: 20 }}>Solicita el acceso</h2>
          <p style={{ color: '#888', textAlign: 'center', fontSize: 13, lineHeight: 1.5, marginBottom: 24 }}>
            Introduce tu email institucional y crea tu contraseña.<br />
            El secretario activará tu cuenta en breve.
          </p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 }}>
              📧 Email institucional *
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nombre.apellido@educastillalamancha.es"
              style={inputEstilo}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 }}>
              🔑 Contraseña *
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={inputEstilo}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 }}>
              🔑 Repite la contraseña *
            </label>
            <input
              type="password"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder="Repite la contraseña"
              onKeyDown={e => e.key === 'Enter' && enviarSolicitud()}
              style={inputEstilo}
            />
          </div>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={enviarSolicitud}
            disabled={enviando}
            style={{ width: '100%', padding: '13px 20px', backgroundColor: verde, color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1 }}
          >
            {enviando ? '⏳ Enviando...' : '📨 Enviar solicitud de acceso'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#888' }}>
            ¿Ya tienes cuenta activa? <a href="/login" style={{ color: verde, fontWeight: 600 }}>Inicia sesión</a>
          </div>
        </div>

        <div style={{ marginTop: 16, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
          ℹ️ Cuando el secretario apruebe tu solicitud, <strong>recibirás un email</strong> y podrás entrar directamente con tu email y la contraseña que acabas de crear.
          Después, completarás tu ficha de datos en el portal.
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// COMPONENTES AUXILIARES
// ═══════════════════════════════════════════════════

function Mensaje({ emoji, titulo, verde, children }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>{emoji}</div>
        <h2 style={{ color: verde, marginBottom: 12 }}>{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

const inputEstilo = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box',
  fontFamily: 'system-ui, sans-serif'
};

function btnPrimario(color) {
  return {
    display: 'inline-block', marginTop: 20, padding: '13px 28px',
    backgroundColor: color, color: 'white', borderRadius: 10,
    textDecoration: 'none', fontWeight: 700, fontSize: 15, border: 'none'
  };
}
