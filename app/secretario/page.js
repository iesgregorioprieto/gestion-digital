'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PanelSecretario() {
  const [profesores, setProfesores] = useState([]);
  const [filtro, setFiltro] = useState('pendiente');
  const [cargando, setCargando] = useState(true);

  const cargarProfesores = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('profesores')
      .select('*')
      .eq('estado', filtro)
      .order('created_at', { ascending: true });
    if (!error) setProfesores(data || []);
    setCargando(false);
  };

  useEffect(() => { cargarProfesores(); }, [filtro]);

  const cambiarEstado = async (id, nuevoEstado) => {
    await supabase.from('profesores').update({ estado: nuevoEstado }).eq('id', id);
    cargarProfesores();
  };

  const eliminarInterinos = async () => {
    if (!confirm('¿Eliminar TODOS los interinos? Esta acción no se puede deshacer.')) return;
    await supabase.from('profesores').delete().eq('tipo_contrato', 'Interino sin vacante');
    await supabase.from('profesores').delete().eq('tipo_contrato', 'Interino con vacante');
    cargarProfesores();
  };

  const colorEstado = { pendiente: '#ff9800', activo: '#2E7023', inactivo: '#999' };
  const labelEstado = { pendiente: '⏳ Pendiente', activo: '✅ Activo', inactivo: '❌ Inactivo' };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#f0f4f0' }}>

      {/* HEADER */}
      <header style={{ background: '#2E7023', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, color: 'white', fontSize: '18px' }}>🏫 Panel del Secretario</h1>
          <p style={{ margin: 0, color: '#8DC63F', fontSize: '13px' }}>IES Gregorio Prieto</p>
        </div>
        <a href="/" style={{ color: 'white', fontSize: '13px', textDecoration: 'none' }}>← Inicio</a>
      </header>

      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

        {/* MÓDULOS DEL SECRETARIO */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          {[
            { icon: '👥', label: 'Profesores', activo: true },
            { icon: '🔧', label: 'Mantenimiento', activo: false },
            { icon: '📅', label: 'Guardias', activo: false },
            { icon: '📋', label: 'DLD', activo: false },
            { icon: '📢', label: 'Noticias', activo: false },
          ].map((m, i) => (
            <div key={i} style={{ background: m.activo ? '#2E7023' : 'white', borderRadius: '10px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', opacity: m.activo ? 1 : 0.5, cursor: m.activo ? 'pointer' : 'not-allowed' }}>
              <span style={{ fontSize: '20px' }}>{m.icon}</span>
              <span style={{ color: m.activo ? 'white' : '#555', fontWeight: 'bold', fontSize: '14px' }}>{m.label}</span>
              {!m.activo && <span style={{ fontSize: '10px', color: '#aaa' }}>Próximo</span>}
            </div>
          ))}
        </div>

        {/* FILTROS */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['pendiente', 'activo', 'inactivo'].map(e => (
                <button key={e} onClick={() => setFiltro(e)}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: `2px solid ${filtro === e ? '#2E7023' : '#ddd'}`, background: filtro === e ? '#2E7023' : 'white', color: filtro === e ? 'white' : '#555', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                  {labelEstado[e]}
                </button>
              ))}
            </div>
            <button onClick={eliminarInterinos}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#ffebee', color: '#c62828', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
              🗑️ Eliminar interinos
            </button>
          </div>
        </div>

        {/* LISTA DE PROFESORES */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>Cargando...</div>
        ) : profesores.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '12px', color: '#888' }}>
            No hay profesores en estado "{filtro}"
          </div>
        ) : (
          profesores.map(p => (
            <div key={p.id} style={{ background: 'white', borderRadius: '12px', padding: '20px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ margin: '0 0 6px', color: '#2E7023', fontSize: '16px' }}>{p.nombre} {p.apellidos}</h3>
                  <p style={{ margin: '2px 0', color: '#666', fontSize: '13px' }}>📧 {p.email}</p>
                  <p style={{ margin: '2px 0', color: '#666', fontSize: '13px' }}>🏫 {p.departamento} {p.especialidad ? `· ${p.especialidad}` : ''}</p>
                  <p style={{ margin: '2px 0', color: '#666', fontSize: '13px' }}>💼 {p.tipo_contrato} · {p.rol}</p>
                  {p.es_tutor && <p style={{ margin: '2px 0', color: '#666', fontSize: '13px' }}>🤝 Tutor/a de {p.grupo_tutoria}</p>}
                  <p style={{ margin: '4px 0 0', color: '#aaa', fontSize: '11px' }}>Registrado: {new Date(p.created_at).toLocaleDateString('es-ES')}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {p.estado === 'pendiente' && (
                    <>
                      <button onClick={() => cambiarEstado(p.id, 'activo')}
                        style={{ padding: '10px 18px', background: '#2E7023', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                        ✅ Aprobar
                      </button>
                      <button onClick={() => cambiarEstado(p.id, 'inactivo')}
                        style={{ padding: '10px 18px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                        ❌ Rechazar
                      </button>
                    </>
                  )}
                  {p.estado === 'activo' && (
                    <button onClick={() => cambiarEstado(p.id, 'inactivo')}
                      style={{ padding: '10px 18px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                      ❌ Desactivar
                    </button>
                  )}
                  {p.estado === 'inactivo' && (
                    <button onClick={() => cambiarEstado(p.id, 'activo')}
                      style={{ padding: '10px 18px', background: '#2E7023', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                      ✅ Activar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}