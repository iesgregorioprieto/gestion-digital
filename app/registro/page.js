'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL','Física y Química',
  'Ciencias Naturales/Biología','Matemáticas','Lengua y Literatura','Inglés',
  'Educación Física','Dibujo/Plástica','Geografía e Historia','Filosofía',
  'Música','Tecnología','Orientación','PT/AL',
];

const TIPOS = ['Funcionario de carrera','Interino con vacante','Interino sin vacante','Comisión de servicio'];

const ROLES_DOCENTES = [
  { id: 'profesor', icon: '📚', label: 'Profesor/a' },
  { id: 'tutor', icon: '🤝', label: 'Tutor/a' },
  { id: 'jefe_departamento', icon: '📂', label: 'Jefe/a de Departamento' },
];

export default function Registro() {
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);
  const [error, setError] = useState('');

  const [datos, setDatos] = useState({
    nombre: '', apellidos: '', email: '',
    departamento: '', especialidad: '',
    tipo: '', antiguedad_centro: '', antiguedad_cuerpo: '',
    rol: 'profesor', es_tutor: false, grupo_tutoria: '',
    password: '', password2: '',
  });

  const set = (campo, valor) => setDatos(prev => ({ ...prev, [campo]: valor }));

  const validarPaso = () => {
    if (paso === 1) {
      if (!datos.nombre || !datos.apellidos || !datos.email) { setError('Rellena nombre, apellidos y email.'); return false; }
      if (!datos.email.includes('@')) { setError('El email no es válido.'); return false; }
      if (!datos.departamento) { setError('Selecciona un departamento.'); return false; }
    }
    if (paso === 2) {
      if (!datos.tipo) { setError('Selecciona tu tipo de contrato.'); return false; }
      if (!datos.rol) { setError('Selecciona tu rol docente.'); return false; }
    }
    if (paso === 3) {
      if (!datos.password || datos.password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return false; }
      if (datos.password !== datos.password2) { setError('Las contraseñas no coinciden.'); return false; }
    }
    setError('');
    return true;
  };

  const siguiente = () => { if (validarPaso()) setPaso(p => p + 1); };
  const anterior = () => { setError(''); setPaso(p => p - 1); };

  const enviar = async () => {
    if (!validarPaso()) return;
    setEnviando(true);
    setError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: datos.email,
        password: datos.password,
      });
      if (authError) throw new Error(authError.message);

      const { error: dbError } = await supabase.from('profesores').insert([{
        id: authData.user?.id,
        nombre: datos.nombre,
        apellidos: datos.apellidos,
        email: datos.email,
        departamento: datos.departamento,
        especialidad: datos.especialidad || null,
        tipo_contrato: datos.tipo,
        antiguedad_centro: datos.antiguedad_centro ? parseInt(datos.antiguedad_centro) : 0,
        antiguedad_cuerpo: datos.antiguedad_cuerpo ? parseInt(datos.antiguedad_cuerpo) : 0,
        rol: datos.rol,
        es_tutor: datos.es_tutor,
        grupo_tutoria: datos.es_tutor ? datos.grupo_tutoria : null,
        estado: 'pendiente',
      }]);
      if (dbError) throw new Error(dbError.message);
      setExito(true);
    } catch (e) {
      setError('Error: ' + e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (exito) return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '48px 32px', textAlign: 'center', maxWidth: '480px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
        <h2 style={{ color: '#2E7023', marginBottom: '12px' }}>¡Registro enviado!</h2>
        <p style={{ color: '#555', marginBottom: '8px' }}>Tu solicitud está <strong>pendiente de aprobación</strong>.</p>
        <p style={{ color: '#888', fontSize: '14px', marginBottom: '32px' }}>El secretario del centro la revisará y recibirás un email cuando esté activa.</p>
        <button onClick={() => router.push('/')} style={{ background: '#2E7023', color: 'white', border: 'none', borderRadius: '8px', padding: '12px 32px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}>
          Volver al inicio
        </button>
      </div>
    </div>
  );

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #ccc', fontSize: '14px', boxSizing: 'border-box', marginBottom: '12px' };
  const labelStyle = { display: 'block', color: '#444', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', padding: '24px' }}>
      <div style={{ background: '#2E7023', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', color: 'white', fontSize: '20px', cursor: 'pointer' }}>←</button>
        <div>
          <h2 style={{ margin: 0, color: 'white', fontSize: '18px' }}>Registro de Profesor/a</h2>
          <p style={{ margin: 0, color: '#8DC63F', fontSize: '13px' }}>IES Gregorio Prieto</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['Datos personales', 'Datos laborales', 'Contraseña'].map((label, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: '6px', borderRadius: '3px', background: paso > i ? '#2E7023' : '#ddd', marginBottom: '4px' }} />
            <span style={{ fontSize: '11px', color: paso > i ? '#2E7023' : '#aaa' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>

        {paso === 1 && (
          <div>
            <h3 style={{ color: '#2E7023', marginBottom: '20px' }}>👤 Datos personales</h3>
            <label style={labelStyle}>Nombre *</label>
            <input style={inputStyle} value={datos.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Luis Javier" />
            <label style={labelStyle}>Apellidos *</label>
            <input style={inputStyle} value={datos.apellidos} onChange={e => set('apellidos', e.target.value)} placeholder="Ej: Cárdenas Calcerrada" />
            <label style={labelStyle}>Email *</label>
            <input style={inputStyle} type="email" value={datos.email} onChange={e => set('email', e.target.value)} placeholder="profesor@ejemplo.com" />
            <label style={labelStyle}>Departamento *</label>
            <select style={inputStyle} value={datos.departamento} onChange={e => set('departamento', e.target.value)}>
              <option value="">— Selecciona —</option>
              {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <label style={labelStyle}>Especialidad (opcional)</label>
            <input style={inputStyle} value={datos.especialidad} onChange={e => set('especialidad', e.target.value)} placeholder="Ej: Carrocería" />
          </div>
        )}

        {paso === 2 && (
          <div>
            <h3 style={{ color: '#2E7023', marginBottom: '20px' }}>💼 Datos laborales</h3>
            <label style={labelStyle}>Tipo de contrato *</label>
            <select style={inputStyle} value={datos.tipo} onChange={e => set('tipo', e.target.value)}>
              <option value="">— Selecciona —</option>
              {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={labelStyle}>Antigüedad en el centro (años)</label>
            <input style={inputStyle} type="number" min="0" value={datos.antiguedad_centro} onChange={e => set('antiguedad_centro', e.target.value)} placeholder="0" />
            <label style={labelStyle}>Antigüedad en el cuerpo (años)</label>
            <input style={inputStyle} type="number" min="0" value={datos.antiguedad_cuerpo} onChange={e => set('antiguedad_cuerpo', e.target.value)} placeholder="0" />
            <h4 style={{ color: '#2E7023', marginTop: '20px', marginBottom: '12px' }}>Rol docente *</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {ROLES_DOCENTES.map(r => (
                <button key={r.id} onClick={() => set('rol', r.id)}
                  style={{ flex: 1, minWidth: '130px', padding: '14px 10px', borderRadius: '10px', border: `2px solid ${datos.rol === r.id ? '#2E7023' : '#ddd'}`, background: datos.rol === r.id ? '#e8f5e9' : 'white', cursor: 'pointer', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px' }}>{r.icon}</div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: datos.rol === r.id ? '#2E7023' : '#555' }}>{r.label}</div>
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
              <input type="checkbox" checked={datos.es_tutor} onChange={e => set('es_tutor', e.target.checked)} style={{ width: '18px', height: '18px' }} />
              <span style={{ color: '#444', fontSize: '14px' }}>También soy tutor/a de un grupo</span>
            </label>
            {datos.es_tutor && (
              <>
                <label style={labelStyle}>Grupo de tutoría</label>
                <input style={inputStyle} value={datos.grupo_tutoria} onChange={e => set('grupo_tutoria', e.target.value)} placeholder="Ej: 2º CFGM Carrocería" />
              </>
            )}
          </div>
        )}

        {paso === 3 && (
          <div>
            <h3 style={{ color: '#2E7023', marginBottom: '20px' }}>🔒 Contraseña de acceso</h3>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '16px' }}>Elige una contraseña segura (mínimo 6 caracteres).</p>
            <label style={labelStyle}>Contraseña *</label>
            <input style={inputStyle} type="password" value={datos.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
            <label style={labelStyle}>Repite la contraseña *</label>
            <input style={inputStyle} type="password" value={datos.password2} onChange={e => set('password2', e.target.value)} placeholder="••••••••" />
            <div style={{ background: '#e8f5e9', borderRadius: '10px', padding: '16px', marginTop: '16px', fontSize: '13px', color: '#2E7023' }}>
              <strong>Resumen:</strong><br />
              👤 {datos.nombre} {datos.apellidos}<br />
              📧 {datos.email}<br />
              🏫 {datos.departamento}<br />
              💼 {datos.tipo}<br />
              📚 {ROLES_DOCENTES.find(r => r.id === datos.rol)?.label}
              {datos.es_tutor && <><br />🤝 Tutor/a de {datos.grupo_tutoria}</>}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: '#ffebee', color: '#c62828', borderRadius: '8px', padding: '12px', marginTop: '12px', fontSize: '14px' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', gap: '12px' }}>
          {paso > 1 && (
            <button onClick={anterior} style={{ flex: 1, padding: '12px', background: 'white', border: '2px solid #2E7023', borderRadius: '8px', color: '#2E7023', cursor: 'pointer', fontWeight: 'bold' }}>
              ← Anterior
            </button>
          )}
          {paso < 3 && (
            <button onClick={siguiente} style={{ flex: 1, padding: '12px', background: '#2E7023', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
              Siguiente →
            </button>
          )}
          {paso === 3 && (
            <button onClick={enviar} disabled={enviando} style={{ flex: 1, padding: '12px', background: enviando ? '#aaa' : '#2E7023', border: 'none', borderRadius: '8px', color: 'white', cursor: enviando ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
              {enviando ? 'Enviando...' : '✅ Completar registro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}