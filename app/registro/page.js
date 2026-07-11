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

const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL','Física y Química',
  'Ciencias Naturales/Biología','Matemáticas','Lengua y Literatura','Inglés',
  'Educación Física','Dibujo/Plástica','Geografía e Historia','Filosofía',
  'Música','Tecnología','Orientación','PT/AL'
];

const ROLES = [
  { valor: 'profesor', emoji: '📚', etiqueta: 'Profesor/a', descripcion: 'Docente del centro' },
  { valor: 'tutor', emoji: '🤝', etiqueta: 'Tutor/a', descripcion: 'Tutor/a de un grupo' },
  { valor: 'jefe_departamento', emoji: '📂', etiqueta: 'Jefe/a de Departamento', descripcion: 'Responsable de departamento' },
];

export default function Registro() {
  const [paso, setPaso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    email: '',
    departamento: '',
    especialidad: '',
    tipo_contrato: 'Funcionario de carrera',
    antiguedad_centro: '',
    antiguedad_cuerpo: '',
    roles: ['profesor'], // siempre incluye profesor
    password: '',
    password2: '',
  });

  function set(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }));
  }

  function toggleRol(valor) {
    if (valor === 'profesor') return; // siempre marcado
    const actuales = form.roles;
    if (actuales.includes(valor)) {
      set('roles', actuales.filter(r => r !== valor));
    } else {
      set('roles', [...actuales, valor]);
    }
  }

  function siguiente() {
    setError('');
    if (paso === 1) {
      if (!form.nombre || !form.apellidos || !form.email) {
        setError('Por favor rellena nombre, apellidos y email.');
        return;
      }
      if (!form.email.includes('@')) {
        setError('El email no es válido.');
        return;
      }
      if (!form.email.toLowerCase().endsWith('@educastillalamancha.es')) {
        setError('Solo se permite el registro con email institucional (@educastillalamancha.es).');
        return;
      }
    }
    if (paso === 2) {
      if (!form.departamento) {
        setError('Por favor selecciona tu departamento.');
        return;
      }
    }
    setPaso(p => p + 1);
  }

  async function enviar() {
    setError('');
    if (!form.password || form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (form.password !== form.password2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      const { error: err } = await getSupabase().from('profesores').insert([{
        nombre: form.nombre.trim(),
        apellidos: form.apellidos.trim(),
        email: form.email.trim().toLowerCase(),
        departamento: form.departamento,
        especialidad: form.especialidad.trim(),
        tipo_contrato: form.tipo_contrato,
        antiguedad_centro: form.antiguedad_centro ? parseInt(form.antiguedad_centro) : null,
        antiguedad_cuerpo: form.antiguedad_cuerpo ? parseInt(form.antiguedad_cuerpo) : null,
        rol: form.roles,
        estado: 'pendiente',
        password_hash: form.password,
      }]);

      if (err) {
        setError('Error: ' + err.message);
      } else {
        setRegistrado(true);
      }
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  const verde = '#1e6b2e';
  const verdeClaro = '#e8f5e9';

  // ─── PANTALLA DE ÉXITO ───
  if (registrado) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: verde, marginBottom: 12 }}>¡Registro completado!</h2>
          <p style={{ color: '#555', lineHeight: 1.6 }}>
            Tu solicitud ha sido enviada correctamente.<br />
            El secretario revisará tus datos y activará tu cuenta en breve.
          </p>
          <a href="/" style={{ display: 'inline-block', marginTop: 24, padding: '12px 28px', backgroundColor: verde, color: 'white', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
            ← Volver al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Registro de profesores</div>
        </div>
        <a href="/" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
      </div>

      {/* PASOS */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 28, alignItems: 'center' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: n < 3 ? 1 : 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: paso >= n ? verde : '#ddd',
                color: paso >= n ? 'white' : '#999', fontWeight: 700, fontSize: 14, flexShrink: 0
              }}>{n}</div>
              <span style={{ fontSize: 13, color: paso >= n ? verde : '#999', fontWeight: paso === n ? 700 : 400 }}>
                {n === 1 ? 'Datos personales' : n === 2 ? 'Datos laborales' : 'Contraseña'}
              </span>
              {n < 3 && <div style={{ flex: 1, height: 2, backgroundColor: paso > n ? verde : '#ddd' }} />}
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 28, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>

          {/* PASO 1 */}
          {paso === 1 && (
            <div>
              <h2 style={{ color: verde, marginTop: 0, marginBottom: 20, fontSize: 20 }}>👤 Datos personales</h2>
              <Campo label="Nombre *" value={form.nombre} onChange={v => set('nombre', v)} placeholder="Tu nombre" />
              <Campo label="Apellidos *" value={form.apellidos} onChange={v => set('apellidos', v)} placeholder="Tus apellidos" />
              <Campo label="Email institucional * (@educastillalamancha.es)" value={form.email} onChange={v => set('email', v)} placeholder="llcc12@educastillalamancha.es" tipo="email" />
            </div>
          )}

          {/* PASO 2 */}
          {paso === 2 && (
            <div>
              <h2 style={{ color: verde, marginTop: 0, marginBottom: 20, fontSize: 20 }}>🏫 Datos laborales</h2>

              <div style={{ marginBottom: 16 }}>
                <label style={labelEstilo}>Departamento *</label>
                <select value={form.departamento} onChange={e => set('departamento', e.target.value)} style={inputEstilo}>
                  <option value="">— Selecciona tu departamento —</option>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>

              <Campo label="Especialidad" value={form.especialidad} onChange={v => set('especialidad', v)} placeholder="Ej: Carrocería, FOL, Inglés..." />

              <div style={{ marginBottom: 16 }}>
                <label style={labelEstilo}>Tipo de contrato *</label>
                <select value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} style={inputEstilo}>
                  <option value="Funcionario de carrera">Funcionario de carrera</option>
                  <option value="Interino con vacante">Interino con vacante</option>
                  <option value="Interino sin vacante">Interino sin vacante</option>
                  <option value="Comisión de servicios">Comisión de servicios</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <Campo label="Antigüedad en el centro (años)" value={form.antiguedad_centro} onChange={v => set('antiguedad_centro', v)} tipo="number" placeholder="0" />
                <Campo label="Antigüedad en el cuerpo (años)" value={form.antiguedad_cuerpo} onChange={v => set('antiguedad_cuerpo', v)} tipo="number" placeholder="0" />
              </div>

              {/* ROLES - TARJETAS MÚLTIPLES */}
              <div style={{ marginBottom: 8 }}>
                <label style={labelEstilo}>Rol docente * (puedes marcar varios)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 8 }}>
                  {ROLES.map(r => {
                    const marcado = form.roles.includes(r.valor);
                    return (
                      <div
                        key={r.valor}
                        onClick={() => toggleRol(r.valor)}
                        style={{
                          border: `2px solid ${marcado ? verde : '#ddd'}`,
                          backgroundColor: marcado ? verdeClaro : 'white',
                          borderRadius: 10, padding: '14px 10px',
                          textAlign: 'center',
                          cursor: r.valor === 'profesor' ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                          opacity: r.valor === 'profesor' ? 0.85 : 1,
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 6 }}>{r.emoji}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: marcado ? verde : '#444' }}>{r.etiqueta}</div>
                        <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{r.descripcion}</div>
                        {r.valor === 'profesor' && (
                          <div style={{ fontSize: 10, color: verde, marginTop: 4, fontWeight: 600 }}>siempre ✓</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                  💡 Puedes ser profesor/a, tutor/a y jefe/a de departamento a la vez.
                </div>
              </div>
            </div>
          )}

          {/* PASO 3 */}
          {paso === 3 && (
            <div>
              <h2 style={{ color: verde, marginTop: 0, marginBottom: 8, fontSize: 20 }}>🔐 Contraseña de acceso</h2>
              <p style={{ color: '#666', fontSize: 14, marginBottom: 20 }}>
                Esta contraseña la usarás para entrar al portal cuando tu cuenta esté activada.
              </p>

              {/* RESUMEN */}
              <div style={{ backgroundColor: verdeClaro, border: `1px solid ${verde}`, borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 14 }}>
                <div style={{ fontWeight: 700, color: verde, marginBottom: 8 }}>Resumen:</div>
                <div>👤 {form.nombre} {form.apellidos}</div>
                <div>📧 {form.email}</div>
                <div>🏫 {form.departamento}</div>
                <div>💼 {form.tipo_contrato}</div>
                <div>🎭 {form.roles.map(r => ROLES.find(x => x.valor === r)?.etiqueta).filter(Boolean).join(' · ')}</div>
              </div>

              <Campo label="Contraseña *" value={form.password} onChange={v => set('password', v)} tipo="password" placeholder="Mínimo 6 caracteres" />
              <Campo label="Repite la contraseña *" value={form.password2} onChange={v => set('password2', v)} tipo="password" placeholder="Repite la contraseña" />
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginTop: 16, color: '#b91c1c', fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          {/* BOTONES */}
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            {paso > 1 && (
              <button onClick={() => setPaso(p => p - 1)} style={{
                flex: 1, padding: 14, borderRadius: 10, border: '1.5px solid #ddd',
                backgroundColor: 'white', color: '#555', cursor: 'pointer', fontWeight: 600, fontSize: 15
              }}>← Anterior</button>
            )}
            {paso < 3 && (
              <button onClick={siguiente} style={{
                flex: 1, padding: 14, borderRadius: 10, border: 'none',
                backgroundColor: verde, color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 15
              }}>Siguiente →</button>
            )}
            {paso === 3 && (
              <button onClick={enviar} disabled={enviando} style={{
                flex: 1, padding: 14, borderRadius: 10, border: 'none',
                backgroundColor: verde, color: 'white',
                cursor: enviando ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15
              }}>
                {enviando ? 'Enviando...' : '✅ Completar registro'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, tipo = 'text', placeholder = '' }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelEstilo}>{label}</label>
      <input
        type={tipo}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputEstilo}
      />
    </div>
  );
}

const labelEstilo = { display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 5 };
const inputEstilo = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' };