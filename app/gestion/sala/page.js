"use client";
import { useState, useEffect } from "react";
import { getSupabase } from "../../../lib/supabase";

export default function GestionSala() {
  const [avisos, setAvisos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState(null);

  // Formulario nuevo aviso
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(null);

  const azul = '#1e3a5f';

  useEffect(() => {
    // Solo el equipo directivo puede publicar avisos en la sala de profesores
    const id  = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || !['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/login';
      return;
    }
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
    cargarAvisos();
  }, []);

  async function cargarAvisos() {
    setCargando(true);
    const { data } = await getSupabase()
      .from('avisos_sala')
      .select('*')
      .order('created_at', { ascending: false });
    setAvisos(data || []);
    setCargando(false);
  }

  function mostrarMsg(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  async function guardarAviso() {
    if (!titulo.trim() || !texto.trim()) { mostrarMsg('Rellena título y mensaje', 'error'); return; }
    setEnviando(true);

    if (editando) {
      const { error } = await getSupabase().from('avisos_sala').update({
        titulo: titulo.trim(),
        mensaje: texto.trim(),
        urgente,
      }).eq('id', editando);
      if (!error) mostrarMsg('✅ Aviso actualizado', 'ok');
      else mostrarMsg('❌ Error: ' + error.message, 'error');
    } else {
      const { error } = await getSupabase().from('avisos_sala').insert({
        titulo: titulo.trim(),
        mensaje: texto.trim(),
        urgente,
        autor: nombre,
        activo: true,
      });
      if (!error) mostrarMsg('✅ Aviso publicado', 'ok');
      else mostrarMsg('❌ Error: ' + error.message, 'error');
    }

    setTitulo(''); setTexto(''); setUrgente(false); setEditando(null);
    setEnviando(false);
    cargarAvisos();
  }

  async function toggleActivo(id, activo) {
    await getSupabase().from('avisos_sala').update({ activo: !activo }).eq('id', id);
    cargarAvisos();
  }

  async function eliminarAviso(id) {
    if (!confirm('¿Eliminar este aviso definitivamente?')) return;
    await getSupabase().from('avisos_sala').delete().eq('id', id);
    mostrarMsg('🗑️ Aviso eliminado', 'ok');
    cargarAvisos();
  }

  function editarAviso(a) {
    setEditando(a.id);
    setTitulo(a.titulo);
    setTexto(a.mensaje);
    setUrgente(a.urgente || false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/gestion'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🖥️</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Panel Sala de Profesores</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre} · Gestión de avisos</div>
        </div>
      </div>

      {mensaje && (
        <div style={{
          margin: '12px 16px 0', padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'ok' ? '#dcfce7' : '#fef2f2',
          color: mensaje.tipo === 'ok' ? '#166534' : '#dc2626',
          border: `1px solid ${mensaje.tipo === 'ok' ? '#86efac' : '#fecaca'}`,
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* ENLACE A PANTALLA */}
        <a href="/sala" target="_blank" style={{
          display: 'block', backgroundColor: '#0f172a', color: 'white', padding: '14px 18px',
          borderRadius: 12, textDecoration: 'none', marginBottom: 16, textAlign: 'center',
          fontSize: 15, fontWeight: 700,
        }}>
          🖥️ Abrir pantalla de la sala de profesores (para TV)
        </a>

        {/* FORMULARIO */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: azul }}>
            {editando ? '✏️ Editar aviso' : '📝 Nuevo aviso'}
          </h3>

          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Título del aviso"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
          />

          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            placeholder="Mensaje..."
            rows={3}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', resize: 'vertical' }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={urgente} onChange={e => setUrgente(e.target.checked)} />
              🔴 Marcar como urgente
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={guardarAviso}
              disabled={enviando}
              style={{
                flex: 1, padding: '10px', backgroundColor: azul, color: 'white',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                opacity: enviando ? 0.7 : 1,
              }}
            >
              {enviando ? '⏳...' : editando ? '💾 Guardar cambios' : '📢 Publicar aviso'}
            </button>
            {editando && (
              <button
                onClick={() => { setEditando(null); setTitulo(''); setTexto(''); setUrgente(false); }}
                style={{ padding: '10px 16px', backgroundColor: '#e5e7eb', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}
              >
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* LISTA DE AVISOS */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, color: azul }}>📋 Avisos publicados ({avisos.length})</h3>

          {cargando ? (
            <p style={{ textAlign: 'center', color: '#888' }}>⏳ Cargando...</p>
          ) : avisos.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: 20 }}>Sin avisos todavía</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {avisos.map(a => (
                <div key={a.id} style={{
                  padding: '12px 14px', borderRadius: 10,
                  backgroundColor: a.activo ? '#f8fafc' : '#f1f5f9',
                  border: `1.5px solid ${a.urgente && a.activo ? '#fecaca' : '#e2e8f0'}`,
                  opacity: a.activo ? 1 : 0.6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>
                        {a.urgente ? '🔴' : '📌'} {a.titulo}
                        {!a.activo && <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>(oculto)</span>}
                      </div>
                      <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4, lineHeight: 1.4 }}>{a.mensaje}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                        {a.autor || '—'} · {new Date(a.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                      <button onClick={() => toggleActivo(a.id, a.activo)} title={a.activo ? 'Ocultar' : 'Mostrar'}
                        style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>
                        {a.activo ? '👁️' : '👁️‍🗨️'}
                      </button>
                      <button onClick={() => editarAviso(a)} title="Editar"
                        style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>
                        ✏️
                      </button>
                      <button onClick={() => eliminarAviso(a.id)} title="Eliminar"
                        style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
