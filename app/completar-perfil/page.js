'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const VERDE = '#1e6b2e';

const ESPECIALIDADES = [
  { valor: 'TMV',                     emoji: '🚗' },
  { valor: 'COMERCIO',                emoji: '🛍️' },
  { valor: 'ELECTRICIDAD',            emoji: '⚡' },
  { valor: 'INFORMÁTICA',             emoji: '💻' },
  { valor: 'HOSTELERÍA',              emoji: '🍽️' },
  { valor: 'INDUSTRIAS ALIMENTARIAS', emoji: '🥖' },
  { valor: 'ADMINISTRACIÓN',          emoji: '🏢' },
  { valor: 'ESO/BACHILLERATO',        emoji: '🎓' },
];

export default function CompletarPerfil() {
  const [profId,   setProfId]   = useState(null);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error,    setError]    = useState('');
  const [listo,    setListo]    = useState(false);

  // Datos que ya puso en el registro (solo lectura)
  const [ficha, setFicha] = useState({ nombre: '', apellidos: '', email: '', departamento: '', grupo_tutoria: '' });

  const [form, setForm] = useState({
    especialidad:      '',
    tipo_contrato:     'Funcionario de carrera',
    anio_centro:       '',
    anio_cuerpo:       '',
    telefono:          '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    (async () => {
      const id = sessionStorage.getItem('profesor_id');
      if (!id) { window.location.href = '/login'; return; }
      setProfId(id);

      const { data: rows } = await getSupabase()
        .from('profesores')
        .select('nombre, apellidos, email, departamento, grupo_tutoria, especialidad, tipo_contrato, anio_centro, anio_cuerpo')
        .eq('id', id);

      const p = (rows || [])[0];
      if (p) {
        setFicha({
          nombre:        p.nombre        || '',
          apellidos:     p.apellidos     || '',
          email:         p.email         || '',
          departamento:  p.departamento  || '',
          grupo_tutoria: p.grupo_tutoria || '',
        });
        setForm(f => ({
          ...f,
          especialidad:      p.especialidad  || '',
          tipo_contrato:     p.tipo_contrato || 'Funcionario de carrera',
          anio_centro:       p.anio_centro?.toString() || '',
          anio_cuerpo:       p.anio_cuerpo?.toString() || '',
        }));
      }
      setCargando(false);
    })();
  }, []);

  async function guardar() {
    setError('');
    if (!form.especialidad) return setError('Selecciona tu especialidad.');

    setEnviando(true);
    try {
      const _rp = await fetch('/api/profesores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'guardar_mi_ficha', datos: {
          especialidad:      form.especialidad,
          tipo_contrato:     form.tipo_contrato,
          anio_centro:       form.anio_centro ? parseInt(form.anio_centro) : null,
          anio_cuerpo:       form.anio_cuerpo ? parseInt(form.anio_cuerpo) : null,
          antiguedad_centro: form.anio_centro ? Math.max(0, new Date().getFullYear() - parseInt(form.anio_centro)) : null,
          antiguedad_cuerpo: form.anio_cuerpo ? Math.max(0, new Date().getFullYear() - parseInt(form.anio_cuerpo)) : null,
          telefono:          form.telefono.trim() || null,
        } }),
      });
      const err = _rp.ok ? null : await _rp.json();

      if (err) { setError('Error al guardar: ' + (err.error || 'inténtalo de nuevo')); setEnviando(false); return; }
      setListo(true);
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  if (cargando) {
    return (
      <div style={estiloCenter}>
        <div style={{ color: '#888', fontSize: 15 }}>⏳ Cargando tu ficha...</div>
      </div>
    );
  }

  if (listo) {
    return (
      <div style={estiloCenter}>
        <div style={tarjeta}>
          <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
          <h2 style={{ color: VERDE, margin: '0 0 10px' }}>¡Ficha completada!</h2>
          <p style={{ color: '#555', lineHeight: 1.6, margin: '0 0 24px' }}>
            Ya puedes usar el portal con normalidad.
          </p>
          <a href="/profesor" style={btnEstilo(VERDE)}>Ir al portal →</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 24px' }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>🏫 IES Gregorio Prieto</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Completa tu ficha</div>
      </div>

      <div style={{ maxWidth: 540, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Pasos */}
        <div style={{ display: 'flex', backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 18 }}>
          {[
            { n: '1', label: 'Solicitud',        hecho: true,  activo: false },
            { n: '2', label: 'Aprobación',        hecho: true,  activo: false },
            { n: '3', label: 'Resto de tu ficha', hecho: false, activo: true  },
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

        <div style={{ backgroundColor: '#dbeafe', color: '#1e40af', padding: '13px 16px', borderRadius: 10, marginBottom: 18, fontSize: 14, lineHeight: 1.5 }}>
          👋 <strong>¡Bienvenido/a, {ficha.nombre}!</strong> Tu acceso ha sido aprobado.
          Solo faltan unos datos para terminar.
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* Resumen de lo ya registrado */}
          <div style={{ backgroundColor: '#f9fafb', border: '1px solid #eee', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#555', lineHeight: 1.9 }}>
            <div style={{ fontWeight: 700, color: '#333', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Datos de tu solicitud
            </div>
            👤 {ficha.nombre} {ficha.apellidos}<br />
            📧 {ficha.email}<br />
            🏢 {ficha.departamento}
            {ficha.grupo_tutoria && <><br />🤝 Tutor/a de {ficha.grupo_tutoria}</>}
            <div style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
              Si algo no es correcto, avisa al secretario.
            </div>
          </div>

          <Seccion>💼 Datos laborales</Seccion>

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
            <Campo label="Año de llegada al centro">
              <input type="number" min="1970" max={new Date().getFullYear()}
                value={form.anio_centro} placeholder="Ej: 2018"
                onChange={e => set('anio_centro', e.target.value)} style={inputEstilo} />
            </Campo>
            <Campo label="Año de ingreso en el cuerpo">
              <input type="number" min="1970" max={new Date().getFullYear()}
                value={form.anio_cuerpo} placeholder="Ej: 2010"
                onChange={e => set('anio_cuerpo', e.target.value)} style={inputEstilo} />
            </Campo>
          </div>

          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', lineHeight: 1.6, marginBottom: 13 }}>
            💡 Indica el <strong>año</strong>, no los años que llevas. La antigüedad
            se calcula sola cada curso.
          </div>

          <Campo label="Teléfono de contacto (opcional)">
            <input type="tel" value={form.telefono} onChange={e => set('telefono', e.target.value)}
              placeholder="Para avisos urgentes" style={inputEstilo} />
          </Campo>

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
    <div style={{ fontSize: 14, fontWeight: 700, color: '#333', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
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
