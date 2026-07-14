'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

const verde = '#1e6b2e';
const azul = '#1e3a5f';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const DIAS_LABEL = { lunes: 'Lunes', martes: 'Martes', miércoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };

const HORAS = [
  { id: '1', label: '1ª', horario: '8:30 – 9:25' },
  { id: '2', label: '2ª', horario: '9:25 – 10:20' },
  { id: '3', label: '3ª', horario: '10:20 – 11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15 – 11:45' },
  { id: '4', label: '4ª', horario: '11:45 – 12:40' },
  { id: '5', label: '5ª', horario: '12:40 – 13:35' },
  { id: '6', label: '6ª', horario: '13:35 – 14:30' },
];

export default function Guardias() {
  const [cargando, setCargando] = useState(true);
  const [cuadrantes, setCuadrantes] = useState([]);
  const [cuadranteActivo, setCuadranteActivo] = useState('');
  const [horarioGuardias, setHorarioGuardias] = useState({}); // { cuadrante: { dia: { hora: [profesores] } } }
  const [rolGestion, setRolGestion] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setProfesorNombre(sessionStorage.getItem('profesor_nombre') || '');
    setRolGestion(sessionStorage.getItem('profesor_rol_gestion') || '');
    cargarGuardias();
  }, []);

  async function cargarGuardias() {
    setCargando(true);
    const { data, error } = await getSupabase()
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia')
      .eq('tipo', 'guardia')
      .eq('curso_academico', '2025-2026');

    if (error || !data) { setCargando(false); return; }

    // Normalizar hora_id y agrupar por cuadrante
    const porCuadrante = {};
    data.forEach(g => {
      // El cuadrante es el "grupo" del horario. Si no hay, se agrupa como 'Sin clasificar'
      const cuadrante = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
      const horaNorm = (g.hora_id || '').replace(/[aª]$/, '').toLowerCase();
      const dia = (g.dia || '').toLowerCase();

      if (!porCuadrante[cuadrante]) porCuadrante[cuadrante] = {};
      if (!porCuadrante[cuadrante][dia]) porCuadrante[cuadrante][dia] = {};
      if (!porCuadrante[cuadrante][dia][horaNorm]) porCuadrante[cuadrante][dia][horaNorm] = [];
      porCuadrante[cuadrante][dia][horaNorm].push(g.profesor_nombre_pdf);
    });

    // Ordenar cuadrantes: familias FP primero, luego administración, jefatura, general al final
    const nombres = Object.keys(porCuadrante).sort((a, b) => {
      const pesoA = pesoCuadrante(a);
      const pesoB = pesoCuadrante(b);
      if (pesoA !== pesoB) return pesoA - pesoB;
      return a.localeCompare(b);
    });

    setCuadrantes(nombres);
    setHorarioGuardias(porCuadrante);
    setCuadranteActivo(nombres[0] || '');
    setCargando(false);
  }

  function pesoCuadrante(nombre) {
    const n = nombre.toUpperCase();
    if (n.includes('GENERAL')) return 9;
    if (n.includes('JEFATURA')) return 8;
    if (n.includes('ADMINISTRACIÓN') || n.includes('ADMINISTRACION')) return 7;
    if (n.includes('RECREO')) return 6;
    return 1; // familias profesionales
  }

  function emojiCuadrante(nombre) {
    const n = nombre.toUpperCase();
    if (n.includes('GENERAL')) return '🌐';
    if (n.includes('JEFATURA')) return '📋';
    if (n.includes('ADMINISTRACIÓN') || n.includes('ADMINISTRACION')) return '🏢';
    if (n.includes('RECREO')) return '☕';
    if (n.includes('CARROC')) return '🚗';
    if (n.includes('COCIN') || n.includes('HOSTEL')) return '🍽️';
    if (n.includes('ELECTR')) return '⚡';
    if (n.includes('INFORM')) return '💻';
    if (n.includes('COMERC')) return '🛍️';
    if (n.includes('AUTOM')) return '🔧';
    if (n.includes('ALIMENT')) return '🥖';
    if (n.includes('JARDIN')) return '🌳';
    return '📚';
  }

  function contarGuardias(cuadrante) {
    const datos = horarioGuardias[cuadrante] || {};
    let total = 0;
    DIAS.forEach(d => {
      HORAS.forEach(h => {
        total += (datos[d]?.[h.id] || []).length;
      });
    });
    return total;
  }

  function nombreCorto(nombreCompleto) {
    // "Aguayo Castillo, Encarnación Dolores" → "Aguayo, Encarnación"
    if (!nombreCompleto) return '';
    const partes = nombreCompleto.split(',').map(p => p.trim());
    if (partes.length < 2) return nombreCompleto;
    const primerApellido = partes[0].split(' ')[0];
    const primerNombre = partes[1].split(' ')[0];
    return `${primerApellido}, ${primerNombre}`;
  }

  const datos = horarioGuardias[cuadranteActivo] || {};
  const cuadrantesFiltrados = busqueda.trim()
    ? cuadrantes.filter(c => c.toLowerCase().includes(busqueda.toLowerCase()))
    : cuadrantes;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER */}
      <div style={{ backgroundColor: '#7c2d12', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => {
          const dest = ['secretario', 'director', 'jefe_estudios'].includes(rolGestion) ? '/gestion' : '/profesor';
          window.location.href = dest;
        }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🛡️ Cuadrantes de Guardia</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Curso 2025-2026 · {cuadrantes.length} cuadrantes</div>
        </div>
      </div>

      {cargando ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          Cargando cuadrantes...
        </div>
      ) : cuadrantes.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ color: '#666' }}>No hay datos de guardias en horarios_profesores.</div>
        </div>
      ) : (
        <div style={{ padding: 16 }}>

          {/* SELECTOR DE CUADRANTES */}
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <input
              type="text"
              placeholder="🔍 Buscar cuadrante..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {cuadrantesFiltrados.map(c => {
                const activo = c === cuadranteActivo;
                return (
                  <button key={c} onClick={() => setCuadranteActivo(c)} style={{
                    padding: '7px 14px', borderRadius: 20, border: `1.5px solid ${activo ? '#7c2d12' : '#e0e0e0'}`,
                    backgroundColor: activo ? '#7c2d12' : 'white', color: activo ? 'white' : '#555',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <span>{emojiCuadrante(c)}</span>
                    <span>{c}</span>
                    <span style={{ backgroundColor: activo ? 'rgba(255,255,255,0.25)' : '#f0f0f0', color: activo ? 'white' : '#888', padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                      {contarGuardias(c)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CUADRANTE SELECCIONADO */}
          {cuadranteActivo && (
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: '2px solid #f0f0f0' }}>
                <div style={{ fontSize: 26 }}>{emojiCuadrante(cuadranteActivo)}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: azul }}>{cuadranteActivo}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{contarGuardias(cuadranteActivo)} guardias semanales asignadas</div>
                </div>
              </div>

              {/* TABLA HORARIO */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={cabeceraCelda}>Hora</th>
                      {DIAS.map(d => (
                        <th key={d} style={cabeceraCelda}>{DIAS_LABEL[d]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HORAS.map(h => (
                      <tr key={h.id}>
                        <td style={celdaHora}>
                          <div style={{ fontWeight: 700, color: azul, fontSize: 12 }}>{h.label}</div>
                          <div style={{ fontSize: 10, color: '#888' }}>{h.horario}</div>
                        </td>
                        {DIAS.map(d => {
                          const profs = datos[d]?.[h.id] || [];
                          return (
                            <td key={d} style={celda}>
                              {profs.length === 0 ? (
                                <span style={{ color: '#ccc', fontSize: 11, fontStyle: 'italic' }}>—</span>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {profs.map((p, i) => {
                                    const esYo = p && profesorNombre && p.toLowerCase().includes((profesorNombre || '').toLowerCase().split(' ')[0]);
                                    return (
                                      <span key={i} style={{
                                        display: 'inline-block', backgroundColor: esYo ? '#fef3c7' : '#f0fdf4',
                                        color: esYo ? '#78350f' : '#065f46',
                                        padding: '3px 7px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                        border: esYo ? '1.5px solid #fbbf24' : '1px solid #d1fae5'
                                      }}>
                                        {nombreCorto(p)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 12, fontSize: 11, color: '#888', textAlign: 'center' }}>
                💡 Toca en un cuadrante arriba para cambiar de vista · Tu nombre se resalta en <span style={{ backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>amarillo</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const cabeceraCelda = {
  padding: '10px 8px',
  backgroundColor: '#7c2d12',
  color: 'white',
  fontSize: 12,
  fontWeight: 700,
  textAlign: 'center',
  border: '1px solid #6b2a10',
};

const celdaHora = {
  padding: '8px 10px',
  backgroundColor: '#fafafa',
  border: '1px solid #eee',
  textAlign: 'center',
  minWidth: 70,
  whiteSpace: 'nowrap',
};

const celda = {
  padding: '6px 8px',
  border: '1px solid #eee',
  verticalAlign: 'top',
  minWidth: 110,
};
