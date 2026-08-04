'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL','Física y Química',
  'Ciencias Naturales/Biología','Matemáticas','Lengua y Literatura','Inglés',
  'Educación Física','Dibujo/Plástica','Geografía e Historia','Filosofía',
  'Música','Tecnología','Orientación','PT/AL'
];

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

const verde = '#1e6b2e';

export default function CompletarPerfil() {
  const [profId, setProfId] = useState(null);
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);

  const [form, setForm] = useState({
    nombre: '',
    apellidos: '',
    departamento: '',
    especialidad: '',
    tipo_contrato: 'Funcionario de carrera',
    antiguedad_centro: '',
    antiguedad_cuerpo: '',
  });

  function set(campo, valor) { setForm(f => ({ ...f, [campo]: valor })); }

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const em = sessionStorage.getItem('profesor_email') || '';
    if (!id) { window.location.href = '/login'; return; }
    setProfId(id);
    setEmail(em);
  }, []);

  async function guardar() {
    setError('');
    if (!form.nombre.trim())       { setError('El nombre es obligatorio.'); return; }
    if (!form.apellidos.trim())    { setError('Los apellidos son obligatorios.'); return; }
    if (!form.departamento)        { setError('Selecciona tu departamento.'); return; }
    if (!form.especialidad)        { setError('Selecciona tu especialidad.'); return; }

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

      // Actualizar nombre en sesión
      sessionStorage.setItem('profesor_nombre', form.nombre.trim() + ' ' + form.apellidos.trim());
      setListo(true);
    } catch(e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  if (listo) {
    return (
      <div style={{ minHeight:'100vh', backgroundColor:'#f0f4f0', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ backgroundColor:'white', borderRadius:16, padding:40, maxWidth:440, width:'100%', textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize:60, marginBottom:16 }}>✅</div>
          <h2 style={{ color:verde, marginBottom:12 }}>¡Ficha guardada!</h2>
          <p style={{ color:'#555', lineHeight:1.6, marginBottom:24 }}>
            Ya puedes usar el portal. El secretario te asignará los roles que te correspondan.
          </p>
          <a href="/profesor" style={{ display:'inline-block', padding:'13px 28px', backgroundColor:verde, color:'white', borderRadius:10, textDecoration:'none', fontWeight:700, fontSize:15 }}>
            Ir al portal →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:'100vh', backgroundColor:'#f0f4f0', fontFamily:'system-ui,sans-serif' }}>
      {/* HEADER */}
      <div style={{ backgroundColor:verde, color:'white', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:18, fontWeight:700 }}>🏫 IES Gregorio Prieto</div>
          <div style={{ fontSize:13, opacity:0.85 }}>Completa tu ficha</div>
        </div>
      </div>

      <div style={{ maxWidth:560, margin:'0 auto', padding:'24px 16px' }}>

        {/* AVISO */}
        <div style={{ backgroundColor:'#dbeafe', color:'#1e40af', padding:'14px 18px', borderRadius:10, marginBottom:20, fontSize:14, lineHeight:1.5 }}>
          👋 <strong>¡Bienvenido/a al portal!</strong> Tu acceso ha sido aprobado.<br />
          Completa tus datos para que el sistema te identifique correctamente.
        </div>

        <div style={{ backgroundColor:'white', borderRadius:14, padding:24, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>

          {/* Email fijo */}
          <div style={{ marginBottom:20, padding:'10px 14px', backgroundColor:'#f5f5f5', borderRadius:8, fontSize:13, color:'#555' }}>
            📧 {email || 'Tu email institucional'}
          </div>

          {/* DATOS PERSONALES */}
          <Seccion>👤 Datos personales</Seccion>
          <Campo label="Nombre *">
            <input value={form.nombre} onChange={e => set('nombre', e.target.value)} style={estiloInput} placeholder="Tu nombre" />
          </Campo>
          <Campo label="Apellidos *">
            <input value={form.apellidos} onChange={e => set('apellidos', e.target.value)} style={estiloInput} placeholder="Tus apellidos" />
          </Campo>

          {/* DATOS LABORALES */}
          <Seccion>💼 Datos laborales</Seccion>
          <Campo label="Departamento *">
            <select value={form.departamento} onChange={e => set('departamento', e.target.value)} style={estiloInput}>
              <option value="">— Selecciona —</option>
              {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Campo>

          <Campo label="Especialidad (cuadrante de guardias) *">
            <select value={form.especialidad} onChange={e => set('especialidad', e.target.value)} style={estiloInput}>
              <option value="">— Selecciona —</option>
              {ESPECIALIDADES.map(e => (
                <option key={e.valor} value={e.valor}>{e.emoji} {e.valor} — {e.descripcion}</option>
              ))}
            </select>
            <div style={{ fontSize:11, color:'#888', marginTop:4 }}>
              💡 ESO, Bachillerato o FOL → selecciona <strong>ESO/BACHILLERATO</strong>
            </div>
          </Campo>

          <Campo label="Tipo de contrato">
            <select value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)} style={estiloInput}>
              <option>Funcionario de carrera</option>
              <option>Interino con vacante</option>
              <option>Interino sin vacante</option>
            </select>
          </Campo>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Campo label="Antigüedad en el centro (años)">
              <input type="number" min="0" value={form.antiguedad_centro} onChange={e => set('antiguedad_centro', e.target.value)} style={estiloInput} />
            </Campo>
            <Campo label="Antigüedad en el cuerpo (años)">
              <input type="number" min="0" value={form.antiguedad_cuerpo} onChange={e => set('antiguedad_cuerpo', e.target.value)} style={estiloInput} />
            </Campo>
          </div>

          <div style={{ backgroundColor:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#166534', margin:'16px 0' }}>
            ℹ️ Los roles (tutor, jefe de departamento) los asignará el secretario desde el panel de gestión.
          </div>

          {error && (
            <div style={{ backgroundColor:'#fee2e2', color:'#991b1b', padding:'10px 14px', borderRadius:8, marginBottom:14, fontSize:13 }}>
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={guardar}
            disabled={enviando}
            style={{ width:'100%', padding:'13px 20px', backgroundColor:verde, color:'white', border:'none', borderRadius:10, fontSize:15, fontWeight:700, cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1, marginTop:8 }}
          >
            {enviando ? '⏳ Guardando...' : '💾 Guardar y entrar al portal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Seccion({ children }) {
  return (
    <div style={{ fontSize:14, fontWeight:700, color:'#333', marginTop:20, marginBottom:10, paddingBottom:6, borderBottom:'1px solid #eee' }}>
      {children}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom:12 }}>
      <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#555', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  );
}

const estiloInput = {
  width:'100%', padding:'10px 12px', borderRadius:8,
  border:'1.5px solid #ddd', fontSize:14, boxSizing:'border-box',
  fontFamily:'system-ui,sans-serif'
};
