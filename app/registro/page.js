'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';

const VERDE = '#1e6b2e';

const DEPARTAMENTOS = [
  'TMV/Carrocería', 'Hostelería', 'Informática', 'Electricidad', 'Comercio',
  'Administración', 'Industrias Alimentarias', 'FOL', 'Física y Química',
  'Ciencias Naturales/Biología', 'Matemáticas', 'Lengua y Literatura', 'Inglés',
  'Educación Física', 'Dibujo/Plástica', 'Geografía e Historia', 'Filosofía',
  'Música', 'Tecnología', 'Orientación', 'PT/AL',
];


export default function Registro() {
  const [pantalla, setPantalla] = useState('inicio');
  const [enviando, setEnviando] = useState(false);
  const [error, setError]       = useState('');
  const [verPass, setVerPass]   = useState(false);

  const [form, setForm] = useState({
    nombre:        '',
    apellidos:     '',
    departamento:  '',
    email:         '',
    esTutor:       false,
    grupoTutoria:  '',
    pass1:         '',
    pass2:         '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function enviarSolicitud() {
    setError('');
    const em = form.email.trim().toLowerCase();

    if (!form.nombre.trim())    return setError('Introduce tu nombre.');
    if (!form.apellidos.trim()) return setError('Introduce tus apellidos.');
    if (!form.departamento)     return setError('Selecciona tu departamento.');
    if (!em)                    return setError('Introduce tu email institucional.');
    if (!em.endsWith('@educastillalamancha.es'))
      return setError('Solo se admite email @educastillalamancha.es');
    if (form.esTutor && !form.grupoTutoria.trim())
      return setError('Indica de qué grupo eres tutor/a.');
    if (form.pass1.length < 6)
      return setError('La contraseña debe tener al menos 6 caracteres.');
    if (form.pass1 !== form.pass2)
      return setError('Las contraseñas no coinciden.');

    setEnviando(true);
    try {
      // Se pregunta al servidor por el estado de ese email.
      // El hash de la contraseña nunca llega al navegador.
      const rEstado = await fetch('/api/cuenta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'estado_registro', email: em }),
      });
      const estado = await rEstado.json();

      if (estado.tienePassword) {
        setPantalla('ya_registrado'); setEnviando(false); return;
      }
      if (estado.solicitudEnviada && estado.estado === 'pendiente') {
        setPantalla('pendiente_aprobacion'); setEnviando(false); return;
      }

      const prof = estado.existe ? { id: estado.id } : null;

      // El hash lo calcula el servidor
      const rHash = await fetch('/api/cuenta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'registrar_password', email: em, password: form.pass1 }),
      });
      const dHash = await rHash.json();

      if (!rHash.ok || !dHash.hash) {
        setError(dHash.error === 'ya_tiene_password'
          ? 'Esa cuenta ya tiene contraseña. Inicia sesión.'
          : 'No se pudo procesar la contraseña. Inténtalo de nuevo.');
        setEnviando(false);
        return;
      }
      const hash = dHash.hash;

      const datos = {
        nombre:        form.nombre.trim(),
        apellidos:     form.apellidos.trim(),
        departamento:  form.departamento,
        rol:           form.esTutor ? ['profesor', 'tutor'] : ['profesor'],
        grupo_tutoria: form.esTutor ? form.grupoTutoria.trim().toUpperCase() : null,
        password_hash: hash,
        solicitud_acceso: true,
        estado:        'pendiente',
      };

      if (prof) {
        const { error: err } = await getSupabase()
          .from('profesores').update(datos).eq('id', prof.id);
        if (err) { setError('Error al guardar: ' + err.message); setEnviando(false); return; }
      } else {
        const { error: err } = await getSupabase()
          .from('profesores').insert({ ...datos, email: em });
        if (err) { setError('Error al guardar: ' + err.message); setEnviando(false); return; }
      }

      // Email de confirmación al profesor
      try {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'registro_pendiente',
            datos: { nombre: form.nombre.trim(), email: em },
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
          Hemos recibido tu solicitud, {form.nombre}. El secretario la revisará
          y activará tu cuenta en breve.
        </p>
        <div style={cajaInfo}>
          Te hemos enviado un correo a <strong>{form.email}</strong> confirmando
          que tu solicitud ha llegado. Cuando el secretario la apruebe, recibirás
          otro correo y podrás entrar con tu email y la contraseña que acabas de crear.
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

  // ── Formulario ──────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Solicitud de acceso al portal</div>
        </div>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 40px' }}>

        {/* Pasos */}
        <div style={{ display: 'flex', marginBottom: 20, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          {[
            { n: '1', label: 'Solicitud',       activo: true  },
            { n: '2', label: 'Aprobación',       activo: false },
            { n: '3', label: 'Resto de tu ficha', activo: false },
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

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 26, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 34, textAlign: 'center', marginBottom: 6 }}>📋</div>
          <h2 style={{ color: VERDE, textAlign: 'center', margin: '0 0 6px', fontSize: 20 }}>Solicita el acceso</h2>
          <p style={{ color: '#888', textAlign: 'center', fontSize: 13, lineHeight: 1.5, margin: '0 0 20px' }}>
            Rellena estos datos para que el secretario pueda identificarte.
          </p>

          <Seccion>👤 ¿Quién eres?</Seccion>

          <Campo label="Nombre *">
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
              placeholder="Tu nombre" style={inputEstilo} autoFocus />
          </Campo>

          <Campo label="Apellidos *">
            <input value={form.apellidos} onChange={e => set('apellidos', e.target.value)}
              placeholder="Tus apellidos" style={inputEstilo} />
          </Campo>

          <Campo label="Departamento *">
            <select value={form.departamento} onChange={e => set('departamento', e.target.value)} style={inputEstilo}>
              <option value="">— Selecciona —</option>
              {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>

          {/* Tutoría */}
          <div
            onClick={() => set('esTutor', !form.esTutor)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
              border: `1.5px solid ${form.esTutor ? VERDE : '#ddd'}`,
              backgroundColor: form.esTutor ? '#f0fdf4' : 'white',
              marginBottom: form.esTutor ? 10 : 14,
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              border: `2px solid ${form.esTutor ? VERDE : '#ccc'}`,
              backgroundColor: form.esTutor ? VERDE : 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 13, fontWeight: 700,
            }}>
              {form.esTutor ? '✓' : ''}
            </div>
            <div style={{ fontSize: 14, color: form.esTutor ? VERDE : '#555', fontWeight: form.esTutor ? 600 : 400 }}>
              🤝 Soy tutor/a de un grupo
            </div>
          </div>

          {form.esTutor && (
            <Campo label="¿De qué grupo? *">
              <input value={form.grupoTutoria} onChange={e => set('grupoTutoria', e.target.value)}
                placeholder="Ej: 2ESO-A, GM-2CAR, 1BACH-B" style={inputEstilo} />
            </Campo>
          )}

          <Seccion>🔐 Datos de acceso</Seccion>

          <Campo label="📧 Email institucional *">
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="nombre.apellido@educastillalamancha.es" style={inputEstilo} />
          </Campo>

          <Campo label="🔑 Contraseña *">
            <div style={{ position: 'relative' }}>
              <input type={verPass ? 'text' : 'password'} value={form.pass1} onChange={e => set('pass1', e.target.value)}
                placeholder="Mínimo 6 caracteres" style={{ ...inputEstilo, paddingRight: 44 }} />
              <button type="button" onClick={() => setVerPass(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 0 }}>
                {verPass ? '🙈' : '👁️'}
              </button>
            </div>
          </Campo>

          <Campo label="🔑 Repite la contraseña *">
            <div style={{ position: 'relative' }}>
              <input type={verPass ? 'text' : 'password'} value={form.pass2} onChange={e => set('pass2', e.target.value)}
                placeholder="Repite la contraseña"
                onKeyDown={e => e.key === 'Enter' && enviarSolicitud()}
                style={{ ...inputEstilo, paddingRight: 44 }} />
              <button type="button" onClick={() => setVerPass(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#888', padding: 0 }}>
                {verPass ? '🙈' : '👁️'}
              </button>
            </div>
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
              width: '100%', marginTop: 6, padding: '13px',
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

        <div style={{ marginTop: 14, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#166534', lineHeight: 1.7 }}>
          ℹ️ Recibirás un email de confirmación. Cuando el secretario apruebe tu
          solicitud, recibirás otro y podrás entrar con tu email y contraseña
          para completar el resto de tu ficha.
        </div>

      </div>
    </div>
  );
}

// ── Auxiliares ──────────────────────────────────────

function Wrapper({ children }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        {children}
      </div>
    </div>
  );
}

function Seccion({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginTop: 4, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
      {children}
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
  width: '100%',
  padding: '13px 14px',
  borderRadius: 8,
  border: '1.5px solid #b0b8c1',
  fontSize: 16,              // 16px evita que el móvil haga zoom al escribir
  color: '#1f2937',          // sin esto, algunos navegadores lo pintan casi blanco
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, sans-serif',
  WebkitTextFillColor: '#1f2937',   // Safari/Chrome en Android
  opacity: 1,
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
