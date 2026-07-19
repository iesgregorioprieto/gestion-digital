'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { getSupabase } from '@/lib/supabase';
const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL','Física y Química',
  'Ciencias Naturales/Biología','Matemáticas','Lengua y Literatura','Inglés',
  'Educación Física','Dibujo/Plástica','Geografía e Historia','Filosofía',
  'Música','Tecnología','Orientación','PT/AL'
];

// Especialidades - lista fija que coincide con los sectores del cuadrante de guardias
const ESPECIALIDADES = [
  { valor: 'TMV', emoji: '🚗', descripcion: 'Familia FP' },
  { valor: 'COMERCIO', emoji: '🛍️', descripcion: 'Familia FP' },
  { valor: 'ELECTRICIDAD', emoji: '⚡', descripcion: 'Familia FP' },
  { valor: 'INFORMÁTICA', emoji: '💻', descripcion: 'Familia FP' },
  { valor: 'HOSTELERÍA', emoji: '🍽️', descripcion: 'Familia FP' },
  { valor: 'INDUSTRIAS ALIMENTARIAS', emoji: '🥖', descripcion: 'Familia FP' },
  { valor: 'ADMINISTRACIÓN', emoji: '🏢', descripcion: 'Familia FP' },
  { valor: 'ESO/BACHILLERATO', emoji: '🎓', descripcion: 'Guardias generales (incluye FOL)' },
];

const ROLES = [
  { valor: 'profesor', emoji: '📚', etiqueta: 'Profesor/a', descripcion: 'Docente del centro' },
  { valor: 'tutor', emoji: '🤝', etiqueta: 'Tutor/a', descripcion: 'Tutor/a de un grupo' },
  { valor: 'jefe_departamento', emoji: '📂', etiqueta: 'Jefe/a de Departamento', descripcion: 'Responsable de departamento' },
];

const verde = '#1e6b2e';
const verdeClaro = '#e8f5e9';

export default function Registro() {
  // pantalla: 'email' | 'solicitud_enviada' | 'pendiente_aprobacion' | 'completar_datos' | 'ya_registrado' | 'no_autorizado' | 'listo'
  const [pantalla, setPantalla] = useState('email');
  const [email, setEmail] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [profesorId, setProfesorId] = useState(null);

  const [form, setForm] = useState({
    nombre: '', apellidos: '', departamento: '', especialidad: '',
    tipo_contrato: 'Funcionario de carrera',
    antiguedad_centro: '', antiguedad_cuerpo: '',
    roles: ['profesor'], grupo_tutoria: '',
    password: '', password2: '',
  });

  function set(campo, valor) { setForm(f => ({ ...f, [campo]: valor })); }

  function toggleRol(valor) {
    if (valor === 'profesor') return;
    const actuales = form.roles;
    if (actuales.includes(valor)) set('roles', actuales.filter(r => r !== valor));
    else set('roles', [...actuales, valor]);
  }

  // ─── VERIFICAR EMAIL ───
  async function verificarEmail() {
    setError('');
    const emailLimpio = email.trim().toLowerCase();

    if (!emailLimpio) { setError('Introduce tu email.'); return; }
    if (!emailLimpio.endsWith('@educastillalamancha.es')) {
      setError('Solo se permite el registro con email institucional (@educastillalamancha.es).');
      return;
    }

    setVerificando(true);
    try {
      const { data, error: err } = await getSupabase()
        .from('profesores')
        .select('*')
        .eq('email', emailLimpio);

      if (err) { setError('Error: ' + err.message); setVerificando(false); return; }

      const prof = data?.[0];

      // Caso 1: email no autorizado
      if (!prof) { setPantalla('no_autorizado'); setVerificando(false); return; }

      // Caso 2: ya tiene contraseña → ya está registrado
      if (prof.password_hash && prof.password_hash.length > 0) {
        setPantalla('ya_registrado'); setVerificando(false); return;
      }

      // Caso 3: activo pero sin contraseña → PUEDE COMPLETAR SU FICHA
      if (prof.estado === 'activo') {
        setProfesorId(prof.id);
        setForm(f => ({
          ...f,
          nombre: prof.nombre || '',
          apellidos: prof.apellidos || '',
          departamento: prof.departamento || '',
          especialidad: prof.especialidad || '',
          tipo_contrato: prof.tipo_contrato || 'Funcionario de carrera',
          antiguedad_centro: prof.antiguedad_centro?.toString() || '',
          antiguedad_cuerpo: prof.antiguedad_cuerpo?.toString() || '',
          roles: Array.isArray(prof.rol) && prof.rol.length > 0 ? prof.rol : ['profesor'],
          grupo_tutoria: prof.grupo_tutoria || '',
        }));
        setPantalla('completar_datos');
        setVerificando(false);
        return;
      }

      // Caso 4: pendiente y ya ha solicitado acceso
      if (prof.estado === 'pendiente' && prof.solicitud_acceso) {
        setPantalla('pendiente_aprobacion'); setVerificando(false); return;
      }

      // Caso 5: pendiente sin solicitar → MARCAR SOLICITUD
      if (prof.estado === 'pendiente' && !prof.solicitud_acceso) {
        const { error: err2 } = await getSupabase()
          .from('profesores')
          .update({ solicitud_acceso: true })
          .eq('id', prof.id);
        if (err2) { setError('Error: ' + err2.message); setVerificando(false); return; }
        setPantalla('solicitud_enviada'); setVerificando(false); return;
      }

      // Caso 6: inactivo → rechazado
      setError('Tu cuenta ha sido desactivada. Contacta con secretaría.');
      setVerificando(false);
    } catch (e) {
      setError('Error inesperado: ' + e.message);
      setVerificando(false);
    }
  }

  // ─── COMPLETAR DATOS ───
  async function completarRegistro() {
    setError('');
    if (!form.nombre.trim() || !form.apellidos.trim()) { setError('Nombre y apellidos son obligatorios.'); return; }
    if (!form.departamento) { setError('Selecciona tu departamento.'); return; }
    if (!form.especialidad) { setError('Selecciona tu especialidad (TMV, COMERCIO, ESO/BACHILLERATO, etc.).'); return; }
    if (!form.password || form.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (form.password !== form.password2) { setError('Las contraseñas no coinciden.'); return; }

    setEnviando(true);
    try {
      const { error: err } = await getSupabase()
        .from('profesores')
        .update({
          nombre: form.nombre.trim(),
          apellidos: form.apellidos.trim(),
          departamento: form.departamento,
          especialidad: form.especialidad.trim(),
          tipo_contrato: form.tipo_contrato,
          antiguedad_centro: form.antiguedad_centro ? parseInt(form.antiguedad_centro) : null,
          antiguedad_cuerpo: form.antiguedad_cuerpo ? parseInt(form.antiguedad_cuerpo) : null,
          rol: form.roles,
          grupo_tutoria: form.roles.includes('tutor') ? (form.grupo_tutoria || null) : null,
          password_hash: form.password,
        })
        .eq('id', profesorId);

      if (err) { setError('Error: ' + err.message); setEnviando(false); return; }
      setPantalla('listo');
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  // ═══════════════════════════════════════════════════
  // PANTALLAS DE RESPUESTA (ÉXITO / MENSAJES)
  // ═══════════════════════════════════════════════════

  if (pantalla === 'listo') {
    return (
      <Mensaje emoji="✅" titulo="¡Cuenta activada!" verde={verde}>
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Tu cuenta está lista para usarse. Ya puedes iniciar sesión con tu email y contraseña.
        </p>
        <a href="/login" style={btnPrimario(verde)}>🔓 Ir al login</a>
      </Mensaje>
    );
  }

  if (pantalla === 'solicitud_enviada') {
    return (
      <Mensaje emoji="📨" titulo="Solicitud enviada" verde={verde}>
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Hemos recibido tu solicitud de acceso.<br />
          El <strong>secretario</strong> la revisará y activará tu cuenta en breve.
        </p>
        <p style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
          Cuando tu cuenta esté activada, vuelve a entrar en <strong>/registro</strong> con el mismo email para crear tu contraseña.
        </p>
        <a href="/" style={btnPrimario(verde)}>← Volver al inicio</a>
      </Mensaje>
    );
  }

  if (pantalla === 'pendiente_aprobacion') {
    return (
      <Mensaje emoji="⏳" titulo="Solicitud en revisión" verde="#92400e">
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Ya has solicitado acceso con este email.<br />
          Tu cuenta está <strong>pendiente de aprobación</strong> por el secretario.
        </p>
        <p style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
          Vuelve más tarde para activar tu contraseña.
        </p>
        <a href="/" style={btnPrimario(verde)}>← Volver al inicio</a>
      </Mensaje>
    );
  }

  if (pantalla === 'ya_registrado') {
    return (
      <Mensaje emoji="👋" titulo="Ya estás registrado" verde={verde}>
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Este email ya tiene una cuenta activa con contraseña.<br />
          Puedes iniciar sesión directamente.
        </p>
        <a href="/login" style={btnPrimario(verde)}>🔓 Ir al login</a>
      </Mensaje>
    );
  }

  if (pantalla === 'no_autorizado') {
    return (
      <Mensaje emoji="🚫" titulo="Email no autorizado" verde="#991b1b">
        <p style={{ color: '#555', lineHeight: 1.6 }}>
          Este email no consta en la lista de profesorado del centro.<br />
          Contacta con <strong>secretaría</strong> para solicitar el alta.
        </p>
        <button onClick={() => { setPantalla('email'); setEmail(''); setError(''); }} style={btnPrimario(verde)}>← Probar otro email</button>
      </Mensaje>
    );
  }

  // ═══════════════════════════════════════════════════
  // PANTALLA: COMPLETAR DATOS
  // ═══════════════════════════════════════════════════

  if (pantalla === 'completar_datos') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>Activa tu cuenta</div>
          </div>
          <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
        </div>

        <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
          <div style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '14px 18px', borderRadius: 10, marginBottom: 20, fontSize: 14 }}>
            ✅ <strong>Tu cuenta está activa.</strong> Completa los datos que falten y crea tu contraseña.
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {/* Email fijo */}
            <div style={{ marginBottom: 20, padding: '12px 14px', backgroundColor: '#f5f5f5', borderRadius: 8, fontSize: 13 }}>
              📧 <strong>{email}</strong>
            </div>

            {/* DATOS PERSONALES */}
            <SubTitulo>📝 Datos personales</SubTitulo>
            <Campo label="Nombre *"><input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={inputEstilo} /></Campo>
            <Campo label="Apellidos *"><input value={form.apellidos} onChange={e => set('apellidos', e.target.value)} style={inputEstilo} /></Campo>

            {/* DATOS LABORALES */}
            <SubTitulo>💼 Datos laborales</SubTitulo>
            <Campo label="Departamento *">
              <select value={form.departamento} onChange={e => set('departamento', e.target.value)} style={inputEstilo}>
                <option value="">— Selecciona —</option>
                {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Campo>
            <Campo label="🎓 Especialidad *">
              <select value={form.especialidad} onChange={e => set('especialidad', e.target.value)} style={inputEstilo}>
                <option value="">— Selecciona tu especialidad —</option>
                {ESPECIALIDADES.map(e => (
                  <option key={e.valor} value={e.valor}>{e.emoji} {e.valor} — {e.descripcion}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4, lineHeight: 1.4 }}>
                💡 Selecciona la familia profesional a la que perteneces. Si eres profesor/a de ESO, Bachillerato o FOL selecciona <strong>ESO/BACHILLERATO</strong>.
              </div>
            </Campo>
            <Campo label="Tipo de contrato">
              <select value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} style={inputEstilo}>
                <option>Funcionario de carrera</option>
                <option>Interino con vacante</option>
                <option>Interino sin vacante</option>
              </select>
            </Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Campo label="Antigüedad en el centro (años)"><input type="number" min="0" value={form.antiguedad_centro} onChange={e => set('antiguedad_centro', e.target.value)} style={inputEstilo} /></Campo>
              <Campo label="Antigüedad en el cuerpo (años)"><input type="number" min="0" value={form.antiguedad_cuerpo} onChange={e => set('antiguedad_cuerpo', e.target.value)} style={inputEstilo} /></Campo>
            </div>

            {/* ROLES */}
            <SubTitulo>👥 ¿Qué eres en el centro?</SubTitulo>
            <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
              {ROLES.map(r => {
                const activo = form.roles.includes(r.valor);
                return (
                  <div key={r.valor} onClick={() => toggleRol(r.valor)}
                    style={{ padding: 12, borderRadius: 10, border: `2px solid ${activo ? verde : '#e0e0e0'}`, backgroundColor: activo ? verdeClaro : 'white', cursor: r.valor === 'profesor' ? 'default' : 'pointer', opacity: r.valor === 'profesor' ? 0.85 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{r.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: activo ? verde : '#333' }}>{r.etiqueta}</div>
                        <div style={{ fontSize: 12, color: '#888' }}>{r.descripcion}</div>
                      </div>
                      {activo && <span style={{ color: verde, fontSize: 20 }}>✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {form.roles.includes('tutor') && (
              <Campo label="Grupo de tutoría"><input value={form.grupo_tutoria} onChange={e => set('grupo_tutoria', e.target.value)} placeholder="Ej: GM-2CAR" style={inputEstilo} /></Campo>
            )}

            {/* CONTRASEÑA */}
            <SubTitulo>🔑 Crea tu contraseña</SubTitulo>
            <Campo label="Contraseña *"><input type="password" value={form.password} onChange={e => set('password', e.target.value)} style={inputEstilo} /></Campo>
            <Campo label="Repite contraseña *"><input type="password" value={form.password2} onChange={e => set('password2', e.target.value)} style={inputEstilo} /></Campo>

            {error && <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

            <button onClick={completarRegistro} disabled={enviando} style={{ ...btnPrimario(verde), width: '100%', border: 'none', cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
              {enviando ? '⏳ Guardando...' : '✅ Activar mi cuenta'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // PANTALLA INICIAL: pedir email
  // ═══════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Registro de profesorado</div>
        </div>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
      </div>

      <div style={{ maxWidth: 500, margin: '0 auto', padding: '32px 16px' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>📧</div>
          <h2 style={{ color: verde, textAlign: 'center', margin: '0 0 8px', fontSize: 22 }}>Introduce tu email institucional</h2>
          <p style={{ color: '#666', textAlign: 'center', fontSize: 14, lineHeight: 1.5, marginBottom: 24 }}>
            Solicita el alta en el portal con tu email <strong>@educastillalamancha.es</strong>.<br />
            El secretario verificará tu solicitud.
          </p>

          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Email *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre.apellido@educastillalamancha.es"
            onKeyDown={e => e.key === 'Enter' && verificarEmail()}
            style={{ ...inputEstilo, marginBottom: 14 }} autoFocus />

          {error && <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{error}</div>}

          <button onClick={verificarEmail} disabled={verificando}
            style={{ width: '100%', padding: '13px 20px', backgroundColor: verde, color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: verificando ? 'not-allowed' : 'pointer', opacity: verificando ? 0.7 : 1 }}>
            {verificando ? '⏳ Verificando...' : 'Continuar →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#888' }}>
            ¿Ya tienes contraseña? <a href="/login" style={{ color: verde, fontWeight: 600 }}>Inicia sesión</a>
          </div>
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

function SubTitulo({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginTop: 20, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #eee' }}>{children}</div>;
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

const inputEstilo = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif' };

function btnPrimario(color) {
  return { display: 'inline-block', marginTop: 24, padding: '13px 28px', backgroundColor: color, color: 'white', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15, border: 'none' };
}
