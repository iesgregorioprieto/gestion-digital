'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const VERDE = '#1e6b2e';

const DEPARTAMENTOS = [
  'TMV/Carrocería', 'Hostelería', 'Informática', 'Electricidad', 'Comercio',
  'Administración', 'Industrias Alimentarias', 'FOL', 'Física y Química',
  'Ciencias Naturales/Biología', 'Matemáticas', 'Lengua y Literatura', 'Inglés',
  'Educación Física', 'Dibujo/Plástica', 'Geografía e Historia', 'Filosofía',
  'Música', 'Tecnología', 'Orientación', 'PT/AL',
];

const ESPECIALIDADES = [
  { valor: 'TMV',                    emoji: '🚗' },
  { valor: 'COMERCIO',               emoji: '🛍️' },
  { valor: 'ELECTRICIDAD',           emoji: '⚡' },
  { valor: 'INFORMÁTICA',            emoji: '💻' },
  { valor: 'HOSTELERÍA',             emoji: '🍽️' },
  { valor: 'INDUSTRIAS ALIMENTARIAS', emoji: '🥖' },
  { valor: 'ADMINISTRACIÓN',         emoji: '🏢' },
  { valor: 'ESO/BACHILLERATO',       emoji: '🎓' },
];

export default function CompletarPerfil() {
  const [profId,   setProfId]   = useState(null);
  const [email,    setEmail]    = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error,    setError]    = useState('');
  const [listo,    setListo]    = useState(false);

  const [form, setForm] = useState({
    nombre:            '',
    apellidos:         '',
    departamento:      '',
    especialidad:      '',
    tipo_contrato:     'Funcionario de carrera',
    antiguedad_centro: '',
    antiguedad_cuerpo: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const em = sessionStorage.getItem('profesor_email') || '';
    if (!id) { window.location.href = '/login'; return; }
    setProfId(id);
    setEmail(em);
  }, []);

  async function guardar() {
    setError('');
    if (!form.nombre.trim())    return setError('El nombre es obligatorio.');
    if (!form.apellidos.trim()) return setError('Los apellidos son obligatorios.');
    if (!form.departamento)     return setError('Selecciona tu departamento.');
    if (!form.especialidad)     return setError('Selecciona tu especialidad.');

    setEnviando(true);
    try {
      const { error: err } = await getSupabase()
        .from('profesores')
        .update({
          nombre:            form.nombre.trim(),
          apellidos:         form.apellidos.trim(),
          departamento:      form.departamento,
          especialidad:      form.especialidad,
          tipo_contrato:     form.tipo_contrato,
          antiguedad_centro: form.antiguedad_centro ? parseInt(form.antiguedad_centro) : null,
          antiguedad_cuerpo: form.antiguedad_cuerpo ? parseInt(form.antiguedad_cuerpo) : null,
        })
        .eq('id', profId);

      if (err) { setError('Error al guardar: ' + err.message); setEnviando(false); return; }

      sessionStorage.setItem('profesor_nombre', form.nombre.trim() + ' ' + form.apellidos.trim());
      setListo(true);
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  // ── Pantalla de éxito ──────────────────────────────

  if (listo) {
    return (
      <div style={estiloCenter}>
        <div style={tarjeta}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
          <h2 style={{ color: VERDE, margin: '0 0 10px' }}>¡Ficha guardada!</h2>
          <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 24px' }}>
            Ya puedes usar el portal. El secretario te asignará
            los roles que correspondan (tutor, jefe de departamento…).
          </p>
          <a href="/profesor" style={btnEstilo(VERDE)}>Ir al portal →</a>
        </div>
      </div>
    );
  }

  // ── Formulario ─────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* Cabecera */}
      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>Completa tu ficha</div>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20 }}>
          {[
            { n: '1', label: 'Solicitud',        hecho: true,  activo: false },
            { n: '2', label: 'Aprobación',        hecho: true,  activo: false },
            { n: '3', label: 'Completa tu ficha', hecho: false, activo: true  },
          ].map((p, i, arr) => (
            <div key={i} style={{
              flex: 1, padding: '11px 6px', textAlign: 'center',
              backgroundColor: p.activo ? VERDE : p.hecho ? '#f0fdf4' : 'white',
              borderRight: i < arr.length - 1 ? '1px solid #e5e7eb' : 'none',
            }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: p.activo ? 'white' : p.hecho ? '#166534' : '#ccc' }}>
                {p.hecho && !p.activo ? '✓' : p.n}
              </div>
              <div style={{ fontSize: 11, color: p.activo ? '#a7f3d0' : p.hecho ? '#166534' : '#bbb', marginTop: 2 }}>
                {p.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 540, margin: '0 auto', padding: '0 16px 32px' }}>

        {/* Aviso */}
        <div style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '13px 16px', borderRadius: 10, marginBottom: 18, fontSize: 14, lineHeight: 1.5 }}>
          👋 <strong>¡Bienvenido/a!</strong> Tu acceso ha sido aprobado.
          Completa tus datos para que el sistema te identifique correctamente.
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* Email (solo lectura) */}
          <div style={{ marginBottom: 18, padding: '10px 14px', backgroundColor: '#f5f5f5', borderRadius: 8, fontSize: 13, color: '#555' }}>
            📧 {email}
          </div>

          <Seccion>👤 Datos personales</Seccion>

          <Campo label="Nombre *">
            <input
              value={form.nombre}
              onChange={e => set('nombre', e.target.value)}
              placeholder="Tu nombre"
              style={inputEstilo}
              autoFocus
            />
          </Campo>

          <Campo label="Apellidos *">
            <input
              value={form.apellidos}
              onChange={e => set('apellidos', e.target.value)}
              placeholder="Tus apellidos"
              style={inputEstilo}
            />
          </Campo>

          <Seccion>💼 Datos laborales</Seccion>

          <Campo label="Departamento *">
            <select value={form.departamento} onChange={e => set('departamento', e.target.value)} style={inputEstilo}>
              <option value="">— Selecciona —</option>
              {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>

          <Campo label="Especialidad (cuadrante de guardias) *">
            <select value={form.especialidad} onChange={e => set('especialidad', e.target.value)} style={inputEstilo}>
              <option value="">— Selecciona —</option>
              {ESPECIALIDADES.map(e => (
                <option key={e.valor} value={e.valor}>{e.emoji} {e.valor}</option>
              ))}
            </select>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              💡 ESO, Bachillerato o FOL → selecciona <strong>ESO/BACHILLERATO</strong>
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
            <Campo label="Antigüedad en el centro (años)">
              <input type="number" min="0" value={form.antiguedad_centro}
                onChange={e => set('antiguedad_centro', e.target.value)} style={inputEstilo} />
            </Campo>
            <Campo label="Antigüedad en el cuerpo (años)">
              <input type="number" min="0" value={form.antiguedad_cuerpo}
                onChange={e => set('antiguedad_cuerpo', e.target.value)} style={inputEstilo} />
            </Campo>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', margin: '16px 0 8px', lineHeight: 1.6 }}>
            ℹ️ Los roles (tutor, jefe de departamento…) los asignará el secretario desde el panel de gestión.
          </div>

          {error && (
            <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={guardar}
            disabled={enviando}
            style={{
              width: '100%', padding: '13px', backgroundColor: VERDE,
              color: 'white', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, marginTop: 8,
              cursor: enviando ? 'not-allowed' : 'pointer',
              opacity: enviando ? 0.7 : 1,
            }}
          >
            {enviando ? '⏳ Guardando...' : '💾 Guardar y entrar al portal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Auxiliares ─────────────────────────────────────

function Seccion({ children }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginTop: 20, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
      {children}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 13 }}>
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

const estiloCenter = {
  minHeight: '100vh', backgroundColor: '#f0f4f0',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, fontFamily: 'system-ui, sans-serif',
};

const tarjeta = {
  backgroundColor: 'white', borderRadius: 16, padding: 40,
  maxWidth: 440, width: '100%', textAlign: 'center',
  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
};

function btnEstilo(color) {
  return {
    display: 'inline-block', padding: '12px 28px',
    backgroundColor: color, color: 'white', borderRadius: 10,
    textDecoration: 'none', fontWeight: 700, fontSize: 15,
  };
}
