'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const VERDE = '#1e6b2e';

export default function Registro() {
  const [pantalla, setPantalla] = useState('inicio');
  const [email, setEmail]       = useState('');
  const [pass1, setPass1]       = useState('');
  const [pass2, setPass2]       = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError]       = useState('');

  async function enviarSolicitud() {
    setError('');
    const em = email.trim().toLowerCase();

    if (!em)
      return setError('Introduce tu email institucional.');
    if (!em.endsWith('@educastillalamancha.es'))
      return setError('Solo se admite email @educastillalamancha.es');
    if (pass1.length < 6)
      return setError('La contraseña debe tener al menos 6 caracteres.');
    if (pass1 !== pass2)
      return setError('Las contraseñas no coinciden.');

    setEnviando(true);
    try {
      // ¿Ya existe este email?
      const { data: rows } = await getSupabase()
        .from('profesores')
        .select('id, password_hash, solicitud_acceso')
        .eq('email', em);

      const prof = (rows || [])[0];

      if (prof?.password_hash?.length > 0) {
        setPantalla('ya_registrado');
        setEnviando(false);
        return;
      }

      if (prof?.solicitud_acceso) {
        setPantalla('pendiente_aprobacion');
        setEnviando(false);
        return;
      }

      // Hash de contraseña
      const rh = await fetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'hash', password: pass1 }),
      });
      const { hash } = await rh.json();
      if (!hash) {
        setError('Error al procesar la contraseña. Inténtalo de nuevo.');
        setEnviando(false);
        return;
      }

      // Guardar en BD
      if (prof) {
        await getSupabase()
          .from('profesores')
          .update({ password_hash: hash, solicitud_acceso: true, estado: 'pendiente' })
          .eq('id', prof.id);
      } else {
        await getSupabase()
          .from('profesores')
          .insert({ email: em, password_hash: hash, solicitud_acceso: true, estado: 'pendiente' });
      }

      // Email al profesor informando que su solicitud ha llegado
      try {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'registro_pendiente',
            datos: { nombre: 'Profesor/a', email: em },
          }),
        });
      } catch (_) {}

      setPantalla('solicitud_enviada');
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  // ── Pantallas de respuesta ──────────────────────────

  if (pantalla === 'solicitud_enviada') {
    return (
      <Wrapper>
        <div style={{ fontSize: 64, marginBottom: 12 }}>📨</div>
        <h2 style={{ color: VERDE, margin: '0 0 12px' }}>¡Solicitud enviada!</h2>
        <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
          Hemos recibido tu solicitud. El secretario la revisará
          y activará tu cuenta en breve.
        </p>
        <div style={cajaInfo}>
          Te hemos enviado un correo a <strong>{email}</strong> para
          confirmarte que tu solicitud ha llegado.{' '}
          Cuando el secretario la apruebe, recibirás otro correo
          y podrás entrar con tu email y la contraseña que acabas de crear.
        </div>
        <a href="/" style={btnEstilo(VERDE)}>← Volver al inicio</a>
      </Wrapper>
    );
  }

  if (pantalla === 'pendiente_aprobacion') {
    return (
      <Wrapper>
        <div style={{ fontSize: 64, marginBottom: 12 }}>⏳</div>
        <h2 style={{ color: '#92400e', margin: '0 0 12px' }}>Solicitud en revisión</h2>
        <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
          Ya enviaste una solicitud con este email.
          Tu cuenta está <strong>pendiente de aprobación</strong>.
        </p>
        <div style={cajaInfo}>
          Recibirás un correo en cuanto el secretario active tu acceso.
        </div>
        <a href="/" style={btnEstilo(VERDE)}>← Volver al inicio</a>
      </Wrapper>
    );
  }

  if (pantalla === 'ya_registrado') {
    return (
      <Wrapper>
        <div style={{ fontSize: 64, marginBottom: 12 }}>👋</div>
        <h2 style={{ color: VERDE, margin: '0 0 12px' }}>Ya tienes cuenta</h2>
        <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 12px' }}>
          Este email ya tiene una cuenta activa.
          Inicia sesión con tu email y contraseña.
        </p>
        <a href="/login" style={btnEstilo(VERDE)}>🔓 Ir al login</a>
      </Wrapper>
    );
  }

  // ── Pantalla principal ──────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* Cabecera */}
      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Solicitud de acceso al portal</div>
        </div>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
      </div>

      <div style={{ maxWidth: 460, margin: '0 auto', padding: '28px 16px' }}>

        {/* Indicador de pasos */}
        <div style={{ display: 'flex', marginBottom: 24, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {[
            { n: '1', label: 'Solicitud',         activo: true  },
            { n: '2', label: 'Aprobación',         activo: false },
            { n: '3', label: 'Completa tu ficha',  activo: false },
          ].map((p, i, arr) => (
            <div key={i} style={{
              flex: 1, padding: '11px 6px', textAlign: 'center',
              backgroundColor: p.activo ? VERDE : 'white',
              borderRight: i < arr.length - 1 ? '1px solid #e5e7eb' : 'none',
            }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: p.activo ? 'white' : '#ccc' }}>{p.n}</div>
              <div style={{ fontSize: 11, color: p.activo ? '#a7f3d0' : '#bbb', marginTop: 2 }}>{p.label}</div>
            </div>
          ))}
        </div>

        {/* Formulario */}
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 26, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 6 }}>📋</div>
          <h2 style={{ color: VERDE, textAlign: 'center', margin: '0 0 6px', fontSize: 20 }}>Solicita el acceso</h2>
          <p style={{ color: '#888', textAlign: 'center', fontSize: 13, lineHeight: 1.5, margin: '0 0 22px' }}>
            Usa tu email <strong>@educastillalamancha.es</strong> y elige una contraseña.
          </p>

          <Campo label="📧 Email institucional *">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nombre.apellido@educastillalamancha.es"
              style={inputEstilo}
              autoFocus
            />
          </Campo>

          <Campo label="🔑 Contraseña *">
            <input
              type="password"
              value={pass1}
              onChange={e => setPass1(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              style={inputEstilo}
            />
          </Campo>

          <Campo label="🔑 Repite la contraseña *">
            <input
              type="password"
              value={pass2}
              onChange={e => setPass2(e.target.value)}
              placeholder="Repite la contraseña"
              onKeyDown={e => e.key === 'Enter' && enviarSolicitud()}
              style={inputEstilo}
            />
          </Campo>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={enviarSolicitud}
            disabled={enviando}
            style={{
              width: '100%', marginTop: 4, padding: '13px',
              backgroundColor: VERDE, color: 'white', border: 'none',
              borderRadius: 10, fontSize: 15, fontWeight: 700,
              cursor: enviando ? 'not-allowed' : 'pointer',
              opacity: enviando ? 0.7 : 1,
            }}
          >
            {enviando ? '⏳ Enviando...' : '📨 Enviar solicitud de acceso'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#888' }}>
            ¿Ya tienes cuenta?{' '}
            <a href="/login" style={{ color: VERDE, fontWeight: 600 }}>Inicia sesión</a>
          </p>
        </div>

        {/* Nota informativa */}
        <div style={{ marginTop: 14, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
          ℹ️ Al enviar la solicitud recibirás un email de confirmación.
          Cuando el secretario la apruebe, recibirás otro email y podrás
          entrar directamente con tu email y contraseña.
        </div>

      </div>
    </div>
  );
}

// ── Componentes auxiliares ──────────────────────────

function Wrapper({ children }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        {children}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputEstilo = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid #ddd', fontSize: 14,
  boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif',
};

const cajaInfo = {
  backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
  borderRadius: 8, padding: '10px 14px', fontSize: 13,
  color: '#166534', lineHeight: 1.6, margin: '12px 0 24px',
  textAlign: 'left',
};

function btnEstilo(color) {
  return {
    display: 'inline-block', padding: '12px 28px',
    backgroundColor: color, color: 'white', borderRadius: 10,
    textDecoration: 'none', fontWeight: 700, fontSize: 15,
  };
}
