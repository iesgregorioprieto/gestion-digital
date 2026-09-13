'use client';

/**
 * EQUIPOS DE TRABAJO
 *
 * Grupos que no salen de la ficha de nadie: una comisión de empleo, un
 * grupo de trabajo, la comisión de convivencia. Se les pone nombre, se
 * eligen los miembros, y quedan disponibles como un destinatario más
 * cada vez que se convoca algo.
 *
 * Los gestiona y los ve solo el equipo directivo.
 */

import { useState, useEffect } from 'react';
import { consulta } from '@/lib/consulta';

const VERDE = '#166534';
const AZUL  = '#1e3a5f';
const ROJO  = '#991b1b';

function sinTildes(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function PanelEquipos() {
  const [equipos, setEquipos] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  // null = no se está editando nada; { id?, nombre, miembros } = formulario
  const [editando, setEditando] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const [rEq, rProf] = await Promise.all([
        fetch('/api/equipos').then(r => r.json()),
        consulta('profesores')
          .select('id, nombre, apellidos, departamento')
          .eq('estado', 'activo')
          .order('apellidos'),
      ]);
      setEquipos(rEq.equipos || []);
      setProfesores(rProf.data || []);
    } catch (e) {
      aviso('No se han podido cargar los equipos', 'error');
    }
    setCargando(false);
  }

  function aviso(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  const nombreDe = id => {
    const p = profesores.find(x => x.id === id);
    return p ? `${p.apellidos}, ${p.nombre}` : '—';
  };

  async function guardar() {
    if (!editando?.nombre?.trim()) return aviso('Ponle un nombre al equipo', 'error');
    if (!editando.miembros?.length) return aviso('Elige al menos una persona', 'error');

    setGuardando(true);
    try {
      const r = await fetch('/api/equipos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: editando.id ? 'editar' : 'crear',
          id: editando.id || null,
          datos: { nombre: editando.nombre.trim(), miembros: editando.miembros },
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      aviso(editando.id ? 'Equipo actualizado' : 'Equipo creado');
      setEditando(null);
      setBusqueda('');
      cargar();
    } catch (e) {
      aviso(e.message || 'No se ha podido guardar', 'error');
    }
    setGuardando(false);
  }

  async function eliminar(eq) {
    if (!confirm(
      `¿Eliminar el equipo "${eq.nombre}"?\n\n` +
      `Las convocatorias que ya se hayan enviado a este equipo NO se tocan: ` +
      `siguen con sus destinatarios y sus respuestas.`
    )) return;

    try {
      const r = await fetch('/api/equipos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'eliminar', id: eq.id }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      aviso('Equipo eliminado');
      cargar();
    } catch (e) {
      aviso(e.message || 'No se ha podido eliminar', 'error');
    }
  }

  function alternarMiembro(id) {
    setEditando(e => ({
      ...e,
      miembros: e.miembros.includes(id)
        ? e.miembros.filter(x => x !== id)
        : [...e.miembros, id],
    }));
  }

  const caja = {
    backgroundColor: 'white', borderRadius: 12, padding: 18,
    border: '1px solid #e5e7eb', marginBottom: 12,
  };

  const filtrados = profesores.filter(p =>
    busqueda.length < 2 ||
    sinTildes(`${p.nombre} ${p.apellidos} ${p.departamento || ''}`).toLowerCase()
      .includes(sinTildes(busqueda).toLowerCase()));

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px', lineHeight: 1.6 }}>
        Grupos que no salen de la ficha de nadie: una comisión, un grupo de
        trabajo. Al convocar aparecerán como un destinatario más.
      </p>

      {mensaje && (
        <div style={{
          padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          color: mensaje.tipo === 'ok' ? VERDE : ROJO,
        }}>{mensaje.texto}</div>
      )}

      {!editando && (
        <button
          onClick={() => { setEditando({ nombre: '', miembros: [] }); setBusqueda(''); }}
          style={{
            padding: '11px 18px', borderRadius: 9, border: 'none', backgroundColor: VERDE,
            color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 18,
          }}>
          ➕ Nuevo equipo
        </button>
      )}

      {/* ─── Alta / edición ─── */}
      {editando && (
        <div style={{ ...caja, border: `2px solid ${VERDE}` }}>
          <div style={{ fontWeight: 800, color: VERDE, marginBottom: 14, fontSize: 15 }}>
            {editando.id ? 'Editar equipo' : 'Nuevo equipo'}
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 5 }}>
            Nombre del equipo
          </label>
          <input
            value={editando.nombre}
            onChange={e => setEditando({ ...editando, nombre: e.target.value })}
            placeholder="Comisión de empleo, Grupo de convivencia…"
            style={{
              width: '100%', padding: '11px 13px', borderRadius: 9, border: '1.5px solid #ddd',
              fontSize: 14.5, boxSizing: 'border-box', marginBottom: 16,
            }} />

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569' }}>Miembros</label>
            <span style={{ fontSize: 12, color: VERDE, fontWeight: 700 }}>
              {editando.miembros.length} elegido{editando.miembros.length !== 1 ? 's' : ''}
            </span>
          </div>

          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, apellidos o departamento…"
            style={{
              width: '100%', padding: '10px 13px', borderRadius: 9, border: '1.5px solid #ddd',
              fontSize: 14, boxSizing: 'border-box', marginBottom: 10,
            }} />

          <div style={{
            maxHeight: 290, overflowY: 'auto', border: '1px solid #eee',
            borderRadius: 9, padding: 8, marginBottom: 16,
          }}>
            {filtrados.map(p => {
              const marcado = editando.miembros.includes(p.id);
              return (
                <label key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  borderRadius: 7, cursor: 'pointer', marginBottom: 3,
                  backgroundColor: marcado ? '#f0fdf4' : 'transparent',
                }}>
                  <input type="checkbox" checked={marcado}
                    onChange={() => alternarMiembro(p.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  <span style={{ fontSize: 13.5, fontWeight: marcado ? 700 : 500, color: '#333' }}>
                    {p.apellidos}, {p.nombre}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 'auto' }}>
                    {p.departamento || ''}
                  </span>
                </label>
              );
            })}
            {filtrados.length === 0 && (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: 12, textAlign: 'center' }}>
                No hay nadie con ese nombre
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 9 }}>
            <button onClick={guardar} disabled={guardando}
              style={{
                padding: '11px 20px', borderRadius: 9, border: 'none', backgroundColor: VERDE,
                color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer',
              }}>
              {guardando ? 'Guardando…' : editando.id ? 'Guardar cambios' : 'Crear equipo'}
            </button>
            <button onClick={() => { setEditando(null); setBusqueda(''); }}
              style={{
                padding: '11px 20px', borderRadius: 9, border: '1.5px solid #cbd5e1',
                backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ─── Lista ─── */}
      {cargando && <div style={{ color: '#888', fontSize: 13 }}>Cargando…</div>}

      {!cargando && equipos.length === 0 && !editando && (
        <div style={{ ...caja, color: '#aaa', fontSize: 13.5, textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>👥</div>
          Todavía no has creado ningún equipo
        </div>
      )}

      {equipos.map(eq => (
        <div key={eq.id} style={caja}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 800, fontSize: 15.5, color: AZUL }}>{eq.nombre}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                {(eq.miembros || []).length} miembro{(eq.miembros || []).length !== 1 ? 's' : ''}
                {eq.creado_por ? ` · creado por ${eq.creado_por}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              <button
                onClick={() => {
                  setEditando({ id: eq.id, nombre: eq.nombre, miembros: [...(eq.miembros || [])] });
                  setBusqueda('');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${AZUL}`,
                  backgroundColor: 'white', color: AZUL, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                }}>
                Editar
              </button>
              <button onClick={() => eliminar(eq)}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5',
                  backgroundColor: 'white', color: ROJO, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                }}>
                Eliminar
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 11 }}>
            {(eq.miembros || []).map(id => (
              <span key={id} style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11.5, fontWeight: 600,
                backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0',
              }}>
                {nombreDe(id)}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
