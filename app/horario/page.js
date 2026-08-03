"use client";
import { useState, useEffect } from "react";
import { getSupabase } from "../../lib/supabase";

const DIAS = ['lunes','martes','miercoles','jueves','viernes'];
const DIAS_LABEL = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };
const HORAS = [
  { id: '1', label: '1ª', rango: '8:30–9:25' },
  { id: '2', label: '2ª', rango: '9:25–10:20' },
  { id: '3', label: '3ª', rango: '10:20–11:15' },
  { id: 'R', label: 'Recreo', rango: '11:15–11:45' },
  { id: '4', label: '4ª', rango: '11:45–12:40' },
  { id: '5', label: '5ª', rango: '12:40–13:35' },
  { id: '6', label: '6ª', rango: '13:35–14:30' },
];

export default function HorarioProfesor() {
  const [horario, setHorario] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');

  const verde = '#0f766e';
  const azul = '#1e3a5f';

  useEffect(() => {
    cargarHorario();
  }, []);

  async function cargarHorario() {
    setCargando(true);
    const n = sessionStorage.getItem('profesor_nombre');
    setNombre(n || '');

    if (!n) {
      setError('No se ha identificado al profesor. Vuelve al panel e inicia sesión.');
      setCargando(false);
      return;
    }

    try {
      // Buscar horario usando la función de normalización
      const { data, error: err } = await getSupabase()
        .rpc('buscar_profesor_horario', { nombre_buscar: n });

      if (err) throw err;
      setHorario(data || []);
    } catch (e) {
      // Fallback: buscar directo
      try {
        const { data } = await getSupabase()
          .from('horarios_profesores')
          .select('*')
          .ilike('profesor', `%${n}%`);
        setHorario(data || []);
      } catch(e2) {
        setError('Error al cargar horario');
      }
    }
    setCargando(false);
  }

  // Organizar horario en grid
  const grid = {};
  for (const h of horario) {
    const dia = (h.dia || '').toLowerCase();
    const hora = (h.hora_id || '').toString().replace(/[aª]/g, '');
    const key = `${dia}-${hora}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(h);
  }

  // Detectar día actual
  const hoyIdx = new Date().getDay();
  const hoyDia = DIAS[hoyIdx - 1] || '';

  // Hora actual
  function horaActual() {
    const now = new Date();
    const t = now.getHours() * 60 + now.getMinutes();
    if (t < 565) return '1';
    if (t < 615) return '2';
    if (t < 675) return '3';
    if (t < 705) return 'R';
    if (t < 760) return '4';
    if (t < 815) return '5';
    return '6';
  }
  const horaAct = horaActual();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0fdfa', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🕐</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Mi Horario</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre}</div>
        </div>
      </div>

      {error && (
        <div style={{ margin: 16, padding: 14, backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 10, fontSize: 13, border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando horario...</div>
      ) : horario.length === 0 && !error ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          <div style={{ fontSize: 40 }}>📭</div>
          <p>No se ha encontrado tu horario. Contacta con secretaría.</p>
        </div>
      ) : (
        <div style={{ padding: 12, overflowX: 'auto' }}>

          {/* TABLA HORARIO */}
          <div style={{ minWidth: 700 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 8px', backgroundColor: azul, color: 'white', fontSize: 12, fontWeight: 700, textAlign: 'center', width: 70 }}>Hora</th>
                  {DIAS.map(d => (
                    <th key={d} style={{
                      padding: '10px 8px',
                      backgroundColor: d === hoyDia ? '#0f766e' : azul,
                      color: 'white', fontSize: 12, fontWeight: 700, textAlign: 'center',
                      border: d === hoyDia ? '2px solid #5eead4' : 'none',
                    }}>
                      {DIAS_LABEL[d]}
                      {d === hoyDia && ' 📍'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORAS.map(h => (
                  <tr key={h.id}>
                    <td style={{
                      padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                      backgroundColor: h.id === horaAct ? '#ccfbf1' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 800 }}>{h.label}</div>
                      <div style={{ fontSize: 9, color: '#888' }}>{h.rango}</div>
                    </td>
                    {DIAS.map(d => {
                      const celdas = grid[`${d}-${h.id}`] || [];
                      const esAhora = d === hoyDia && h.id === horaAct;
                      const esRecreo = h.id === 'R';

                      if (esRecreo && celdas.length === 0) {
                        return (
                          <td key={d} style={{
                            padding: 6, textAlign: 'center', borderBottom: '1px solid #e2e8f0',
                            backgroundColor: '#f0f9ff', fontSize: 11, color: '#94a3b8',
                          }}>
                            ☕
                          </td>
                        );
                      }

                      return (
                        <td key={d} style={{
                          padding: 4, textAlign: 'center', borderBottom: '1px solid #e2e8f0',
                          backgroundColor: esAhora ? '#ccfbf1' : (celdas.length > 0 ? 'white' : '#f8fafc'),
                          border: esAhora ? '2px solid #14b8a6' : '1px solid #e2e8f0',
                          verticalAlign: 'top',
                        }}>
                          {celdas.length > 0 ? (
                            <div style={{ padding: 2 }}>
                              {celdas.map((c, i) => {
                                const esGuardia = (c.tipo || '').toLowerCase().includes('guardia') || (c.actividad || '').toLowerCase().includes('guardia');
                                return (
                                  <div key={i} style={{
                                    padding: '4px 6px', borderRadius: 6, marginBottom: i < celdas.length - 1 ? 3 : 0,
                                    backgroundColor: esGuardia ? '#fef3c7' : '#eff6ff',
                                    border: `1px solid ${esGuardia ? '#fcd34d' : '#bfdbfe'}`,
                                  }}>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: esGuardia ? '#92400e' : '#1e40af' }}>
                                      {c.actividad || c.materia || c.tipo || '—'}
                                    </div>
                                    {c.grupo && <div style={{ fontSize: 10, color: '#555' }}>{c.grupo}</div>}
                                    {c.aula && <div style={{ fontSize: 9, color: '#888' }}>📍 {c.aula}</div>}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span style={{ fontSize: 10, color: '#ccc' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* LEYENDA */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }} />
              <span>Clase</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#fef3c7', border: '1px solid #fcd34d' }} />
              <span>Guardia</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#ccfbf1', border: '1px solid #14b8a6' }} />
              <span>Hora actual</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
