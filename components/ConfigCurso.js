'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const AZUL  = '#1e3a5f';
const VERDE = '#1e6b2e';

// Genera '2026-2027' a partir de la fecha de hoy
function cursoPorDefecto() {
  const h = new Date();
  const a = h.getMonth() >= 7 ? h.getFullYear() : h.getFullYear() - 1;
  return `${a}-${a + 1}`;
}

export default function ConfigCurso() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const [cursos, setCursos] = useState([]);
  const [cursoSel, setCursoSel] = useState('');
  const [periodos, setPeriodos] = useState([]);

  const [form, setForm] = useState({
    curso: cursoPorDefecto(),
    num_profesores: '',
    fecha_inicio_curso: '',
    fecha_fin_curso: '',
    fecha_inicio_lectivo: '',
    fecha_fin_lectivo: '',
    activo: true,
  });

  const [nuevoPeriodo, setNuevoPeriodo] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '' });

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setP = (k, v) => setNuevoPeriodo(p => ({ ...p, [k]: v }));
  const aviso = (texto, tipo = 'ok') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  };

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await getSupabase()
      .from('config_centro').select('*').order('curso', { ascending: false });

    const lista = data || [];
    setCursos(lista);

    const activo = lista.find(c => c.activo) || lista[0];
    if (activo) {
      setCursoSel(activo.curso);
      cargarCurso(activo);
      cargarPeriodos(activo.curso);
    } else {
      setCursoSel('');
    }
    setCargando(false);
  }

  function cargarCurso(c) {
    setForm({
      curso: c.curso,
      num_profesores: c.num_profesores?.toString() || '',
      fecha_inicio_curso: c.fecha_inicio_curso || '',
      fecha_fin_curso: c.fecha_fin_curso || '',
      fecha_inicio_lectivo: c.fecha_inicio_lectivo || '',
      fecha_fin_lectivo: c.fecha_fin_lectivo || '',
      activo: c.activo,
    });
  }

  async function cargarPeriodos(curso) {
    const { data } = await getSupabase()
      .from('periodos_no_lectivos').select('*').eq('curso', curso).order('fecha_inicio');
    setPeriodos(data || []);
  }

  function elegirCurso(curso) {
    setCursoSel(curso);
    const c = cursos.find(x => x.curso === curso);
    if (c) { cargarCurso(c); cargarPeriodos(curso); }
  }

  function nuevoCurso() {
    const ultimo = cursos[0];
    let siguiente = cursoPorDefecto();
    if (ultimo) {
      const a = parseInt(ultimo.curso.split('-')[0]) + 1;
      siguiente = `${a}-${a + 1}`;
    }
    setCursoSel('');
    setPeriodos([]);
    setForm({
      curso: siguiente,
      num_profesores: ultimo?.num_profesores?.toString() || '',
      fecha_inicio_curso: '', fecha_fin_curso: '',
      fecha_inicio_lectivo: '', fecha_fin_lectivo: '',
      activo: false,
    });
  }

  async function guardar() {
    if (!/^\d{4}-\d{4}$/.test(form.curso)) return aviso('El curso debe tener el formato 2026-2027', 'error');
    if (!form.num_profesores)                return aviso('Indica el número de profesores', 'error');

    setGuardando(true);
    try {
      // Solo un curso puede estar activo
      if (form.activo) {
        await getSupabase().from('config_centro').update({ activo: false }).neq('curso', form.curso);
      }

      const datos = {
        curso: form.curso,
        num_profesores: parseInt(form.num_profesores),
        fecha_inicio_curso: form.fecha_inicio_curso || null,
        fecha_fin_curso: form.fecha_fin_curso || null,
        fecha_inicio_lectivo: form.fecha_inicio_lectivo || null,
        fecha_fin_lectivo: form.fecha_fin_lectivo || null,
        activo: form.activo,
      };

      const { error } = await getSupabase()
        .from('config_centro').upsert(datos, { onConflict: 'curso' });

      if (error) { aviso('Error: ' + error.message, 'error'); setGuardando(false); return; }

      aviso('✅ Configuración guardada');
      await cargar();
      setCursoSel(form.curso);
    } catch (e) {
      aviso('Error: ' + e.message, 'error');
    }
    setGuardando(false);
  }

  async function anadirPeriodo() {
    if (!nuevoPeriodo.nombre.trim())  return aviso('Ponle nombre al periodo', 'error');
    if (!nuevoPeriodo.fecha_inicio)   return aviso('Indica la fecha de inicio', 'error');
    if (!nuevoPeriodo.fecha_fin)      return aviso('Indica la fecha de fin', 'error');
    if (nuevoPeriodo.fecha_fin < nuevoPeriodo.fecha_inicio) return aviso('La fecha de fin es anterior a la de inicio', 'error');

    const { error } = await getSupabase().from('periodos_no_lectivos').insert({
      curso: form.curso,
      nombre: nuevoPeriodo.nombre.trim(),
      fecha_inicio: nuevoPeriodo.fecha_inicio,
      fecha_fin: nuevoPeriodo.fecha_fin,
    });

    if (error) { aviso('Error: ' + error.message, 'error'); return; }
    setNuevoPeriodo({ nombre: '', fecha_inicio: '', fecha_fin: '' });
    cargarPeriodos(form.curso);
    aviso('✅ Periodo añadido');
  }

  async function borrarPeriodo(id) {
    if (!confirm('¿Eliminar este periodo?')) return;
    await getSupabase().from('periodos_no_lectivos').delete().eq('id', id);
    cargarPeriodos(form.curso);
  }

  if (cargando) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>⏳ Cargando configuración...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: AZUL, marginBottom: 6 }}>
        📅 Datos del curso académico
      </div>
      <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, marginBottom: 18 }}>
        La aplicación usa estos datos para calcular los límites de DLD y para saber
        si un día es lectivo o no.
      </div>

      {mensaje && (
        <div style={{
          padding: '11px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13.5, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
          color:           mensaje.tipo === 'ok' ? '#166534' : '#991b1b',
          border: `1.5px solid ${mensaje.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
        }}>{mensaje.texto}</div>
      )}

      {/* Selector de curso */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {cursos.map(c => (
          <button key={c.curso} onClick={() => elegirCurso(c.curso)} style={{
            padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
            border: cursoSel === c.curso ? 'none' : '1.5px solid #ddd',
            backgroundColor: cursoSel === c.curso ? AZUL : 'white',
            color: cursoSel === c.curso ? 'white' : '#555',
          }}>
            {c.curso} {c.activo && '✓'}
          </button>
        ))}
        <button onClick={nuevoCurso} style={{
          padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 700,
          border: '1.5px dashed #93c5fd', backgroundColor: '#f0f7ff', color: '#1e40af',
        }}>
          ➕ Nuevo curso
        </button>
      </div>

      <div style={{ backgroundColor: '#f9fafb', border: '1px solid #eee', borderRadius: 12, padding: 20, marginBottom: 20 }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Campo label="Curso académico *">
            <input value={form.curso} onChange={e => set('curso', e.target.value)}
              placeholder="2026-2027" style={inputEstilo} />
          </Campo>

          <Campo label="Nº de profesores del centro *">
            <input type="number" min="1" value={form.num_profesores}
              onChange={e => set('num_profesores', e.target.value)}
              placeholder="150" style={inputEstilo} />
          </Campo>
        </div>

        <div style={{ fontSize: 12.5, color: '#666', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 14px', margin: '4px 0 16px', lineHeight: 1.6 }}>
          💡 Con {form.num_profesores || '—'} profesores, el límite diario de DLD en periodo
          <strong> no lectivo</strong> será de <strong>{form.num_profesores ? Math.floor(parseInt(form.num_profesores) / 3) : '—'}</strong> (un tercio de la plantilla).
        </div>

        <Sub>📆 Periodo del curso (profesorado)</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Campo label="Inicio del curso">
            <input type="date" value={form.fecha_inicio_curso}
              onChange={e => set('fecha_inicio_curso', e.target.value)} style={inputEstilo} />
          </Campo>
          <Campo label="Fin del curso">
            <input type="date" value={form.fecha_fin_curso}
              onChange={e => set('fecha_fin_curso', e.target.value)} style={inputEstilo} />
          </Campo>
        </div>

        <Sub>📚 Periodo lectivo (clases con alumnado)</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Campo label="Primer día de clase">
            <input type="date" value={form.fecha_inicio_lectivo}
              onChange={e => set('fecha_inicio_lectivo', e.target.value)} style={inputEstilo} />
          </Campo>
          <Campo label="Último día de clase">
            <input type="date" value={form.fecha_fin_lectivo}
              onChange={e => set('fecha_fin_lectivo', e.target.value)} style={inputEstilo} />
          </Campo>
        </div>

        <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.6 }}>
          Fuera del periodo lectivo no se pedirá el horario ni las tareas al solicitar un DLD,
          porque no hay clases que cubrir.
        </div>

        <div onClick={() => set('activo', !form.activo)} style={{
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '11px 14px', borderRadius: 10, marginBottom: 16,
          border: `1.5px solid ${form.activo ? VERDE : '#ddd'}`,
          backgroundColor: form.activo ? '#f0fdf4' : 'white',
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
            border: `2px solid ${form.activo ? VERDE : '#ccc'}`,
            backgroundColor: form.activo ? VERDE : 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 13, fontWeight: 700,
          }}>{form.activo ? '✓' : ''}</div>
          <div style={{ fontSize: 13.5, color: form.activo ? VERDE : '#555', fontWeight: form.activo ? 700 : 400 }}>
            Este es el curso actual
          </div>
        </div>

        <button onClick={guardar} disabled={guardando} style={{
          width: '100%', padding: '13px', borderRadius: 10, border: 'none',
          backgroundColor: AZUL, color: 'white', fontWeight: 700, fontSize: 14.5,
          cursor: guardando ? 'not-allowed' : 'pointer', opacity: guardando ? 0.7 : 1,
        }}>
          {guardando ? '⏳ Guardando...' : '💾 Guardar datos del curso'}
        </button>
      </div>

      {/* PERIODOS NO LECTIVOS */}
      <Sub>🏖️ Vacaciones y días sin clase</Sub>
      <div style={{ fontSize: 12.5, color: '#777', lineHeight: 1.6, marginBottom: 14 }}>
        Navidad, Semana Santa, festivos locales... En estos días tampoco se pedirá horario ni tareas.
      </div>

      {periodos.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {periodos.map(p => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px', borderRadius: 10,
              border: '1px solid #e5e7eb', backgroundColor: 'white',
            }}>
              <div style={{ fontSize: 20 }}>🏖️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#333', fontSize: 13.5 }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: '#888' }}>
                  {p.fecha_inicio} → {p.fecha_fin}
                </div>
              </div>
              <button onClick={() => borrarPeriodo(p.id)} style={{
                padding: '6px 12px', borderRadius: 7, cursor: 'pointer',
                border: '1.5px solid #fca5a5', backgroundColor: '#fff5f5',
                color: '#b91c1c', fontWeight: 600, fontSize: 12,
              }}>🗑️</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ backgroundColor: '#f9fafb', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Campo label="Nombre">
            <input value={nuevoPeriodo.nombre} onChange={e => setP('nombre', e.target.value)}
              placeholder="Ej: Navidad" style={inputEstilo} />
          </Campo>
          <Campo label="Desde">
            <input type="date" value={nuevoPeriodo.fecha_inicio}
              onChange={e => setP('fecha_inicio', e.target.value)} style={inputEstilo} />
          </Campo>
          <Campo label="Hasta">
            <input type="date" value={nuevoPeriodo.fecha_fin}
              onChange={e => setP('fecha_fin', e.target.value)} style={inputEstilo} />
          </Campo>
        </div>
        <button onClick={anadirPeriodo} style={{
          width: '100%', padding: '11px', borderRadius: 9, border: 'none',
          backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
        }}>
          ➕ Añadir periodo
        </button>
      </div>
    </div>
  );
}

function Sub({ children }) {
  return (
    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#333', marginTop: 18, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #eee' }}>
      {children}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#555', marginBottom: 5 }}>
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
