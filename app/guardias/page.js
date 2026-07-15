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
const rojo = '#991b1b';
const marron = '#7c2d12';

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const HORAS = [
  { id: '1', label: '1ª', horario: '8:30 – 9:25' },
  { id: '2', label: '2ª', horario: '9:25 – 10:20' },
  { id: '3', label: '3ª', horario: '10:20 – 11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15 – 11:45' },
  { id: '4', label: '4ª', horario: '11:45 – 12:40' },
  { id: '5', label: '5ª', horario: '12:40 – 13:35' },
  { id: '6', label: '6ª', horario: '13:35 – 14:30' },
];

function normHora(h) { return (h || '').toString().replace(/[aª]$/i, '').toLowerCase(); }

function diaSemanaEs(fecha) {
  return DIAS_ES[new Date(fecha + 'T12:00:00').getDay()];
}

function esCuadranteGeneral(c) {
  const n = (c || '').toUpperCase();
  return n.includes('GENERAL') || n.includes('ESO') || n.includes('BACHIL') || n.includes('BTO');
}

function nombreCorto(n) {
  if (!n) return '';
  const partes = n.split(',').map(p => p.trim());
  if (partes.length < 2) return n;
  return `${partes[0].split(' ')[0]}, ${partes[1].split(' ')[0]}`;
}

function pesoCuadrante(c) {
  const n = c.toUpperCase();
  if (n.includes('GENERAL')) return 9;
  if (n.includes('JEFATURA')) return 8;
  if (n.includes('ADMINIST')) return 7;
  if (n.includes('RECREO')) return 6;
  return 1;
}

function emojiCuadrante(c) {
  const n = (c || '').toUpperCase();
  if (n.includes('GENERAL')) return '🌐';
  if (n.includes('JEFATURA')) return '📋';
  if (n.includes('ADMINIST')) return '🏢';
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

// Formato español legible
function fechaLegible(fecha) {
  const d = new Date(fecha + 'T12:00:00');
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return d.toLocaleDateString('es-ES', opts);
}

// Sumar/restar días a una fecha ISO (YYYY-MM-DD)
function moverFecha(fecha, dias) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

export default function Guardias() {
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [cuadrantes, setCuadrantes] = useState([]);
  const [guardiasDia, setGuardiasDia] = useState({}); // {cuadrante: {hora: [nombresPdf]}}
  const [ausenciasPorCuadrante, setAusenciasPorCuadrante] = useState({}); // {cuadrante: {hora: [{profesor, grupo, materia, aula, instrucciones, archivo_url, archivo_nombre}]}}
  const [profesoresIndex, setProfesoresIndex] = useState({}); // nombre_pdf → {id, dep, apoyos}
  const [profesorNombre, setProfesorNombre] = useState('');
  const [esDirectivo, setEsDirectivo] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(null); // {cuadrante, hora}

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorNombre(sessionStorage.getItem('profesor_nombre') || '');
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    setEsDirectivo(['secretario', 'director', 'jefe_estudios'].includes(rol));
    cargarDia(fecha);
  }, []);

  async function cargarDia(fechaISO) {
    setCargando(true);
    setDetalleAbierto(null);
    const dia = diaSemanaEs(fechaISO);

    // Si fin de semana → mostrar vacío pero calcular igualmente si aplica
    // 1. Cargar horarios de guardia del día
    const { data: horarios } = await getSupabase()
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia, aula')
      .eq('curso_academico', '2025-2026')
      .eq('dia', dia);

    // 2. Cargar profesores para índice
    const { data: profes } = await getSupabase()
      .from('profesores')
      .select('id, nombre, apellidos, departamento, contador_apoyos');

    const idx = {};
    (profes || []).forEach(p => {
      const clave = `${p.apellidos}, ${p.nombre}`.toLowerCase();
      idx[clave] = p;
    });
    setProfesoresIndex(idx);

    // 3. Construir mapa de guardias del día
    const guardiasHoy = {};
    const clasesHoy = []; // para cruzar con ausencias
    (horarios || []).forEach(h => {
      const hora = normHora(h.hora_id);
      if (h.tipo === 'guardia') {
        const cuad = h.grupo?.trim() || h.materia?.trim() || 'Sin clasificar';
        if (!guardiasHoy[cuad]) guardiasHoy[cuad] = {};
        if (!guardiasHoy[cuad][hora]) guardiasHoy[cuad][hora] = [];
        guardiasHoy[cuad][hora].push(h.profesor_nombre_pdf);
      } else if (h.tipo === 'clase') {
        clasesHoy.push({ ...h, hora });
      }
    });

    // 4. Traer TODOS los cuadrantes (aunque no tengan guardia ese día concreto)
    const { data: todosCuadrantes } = await getSupabase()
      .from('horarios_profesores')
      .select('grupo, materia')
      .eq('curso_academico', '2025-2026')
      .eq('tipo', 'guardia');
    const setCuadrantes_ = new Set();
    (todosCuadrantes || []).forEach(g => {
      const c = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
      setCuadrantes_.add(c);
    });
    const cuadOrdenados = [...setCuadrantes_].sort((a, b) => {
      const pA = pesoCuadrante(a), pB = pesoCuadrante(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b);
    });
    setCuadrantes(cuadOrdenados);
    setGuardiasDia(guardiasHoy);

    // 5. Cargar ausencias + DLDs del día
    const { data: ausencias } = await getSupabase()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, motivo, horas')
      .lte('fecha_inicio', fechaISO)
      .gte('fecha_fin', fechaISO);

    const { data: dlds } = await getSupabase()
      .from('dld')
      .select('profesor_id, profesor_nombre, motivo, horas')
      .eq('fecha_solicitada', fechaISO)
      .eq('estado', 'aprobada');

    const todasFaltas = [
      ...(ausencias || []).map(a => ({ ...a, tipo_falta: 'ausencia' })),
      ...(dlds || []).map(d => ({ ...d, tipo_falta: 'dld' })),
    ];

    // 6. Para cada ausente, cruzar con las clases del día → determinar cuadrante afectado
    const ausenciasCuadrante = {}; // {cuadrante: {hora: [{...}]}}
    for (const falta of todasFaltas) {
      const { data: p } = await getSupabase()
        .from('profesores')
        .select('nombre, apellidos, departamento')
        .eq('id', falta.profesor_id);
      if (!p || p.length === 0) continue;
      const nombrePdf = `${p[0].apellidos}, ${p[0].nombre}`;
      const nombrePdfLc = nombrePdf.toLowerCase();

      // Sus clases HOY
      const clasesDelDia = clasesHoy.filter(c => (c.profesor_nombre_pdf || '').toLowerCase() === nombrePdfLc);

      // Determinar cuadrante del profesor ausente
      const cuadranteAusente = cuadranteDeProfesor(nombrePdf, todosCuadrantes || []);
      const esFP = cuadranteAusente && !esCuadranteGeneral(cuadranteAusente);

      clasesDelDia.forEach(clase => {
        const cuadranteDestino = esFP
          ? cuadranteAusente
          : (cuadOrdenados.find(c => c.toUpperCase().includes('GENERAL')) || 'GENERAL');

        const horasFalta = Array.isArray(falta.horas) ? falta.horas : [];
        const tarea = horasFalta.find(h => {
          if (!h) return false;
          const hn = normHora(h.hora_id) || normHora(h.hora) || '';
          const label = (h.hora || '').toLowerCase();
          return hn === clase.hora || label.includes(`${clase.hora}ª`) || label.includes(`${clase.hora}a`);
        });

        if (!ausenciasCuadrante[cuadranteDestino]) ausenciasCuadrante[cuadranteDestino] = {};
        if (!ausenciasCuadrante[cuadranteDestino][clase.hora]) ausenciasCuadrante[cuadranteDestino][clase.hora] = [];
        ausenciasCuadrante[cuadranteDestino][clase.hora].push({
          profesor: falta.profesor_nombre,
          tipoFalta: falta.tipo_falta,
          motivo: falta.motivo,
          grupo: clase.grupo,
          materia: clase.materia,
          aula: clase.aula,
          instrucciones: tarea?.instrucciones || null,
          archivo_url: tarea?.archivo_url || null,
          archivo_nombre: tarea?.archivo_nombre || null,
        });
      });
    }

    setAusenciasPorCuadrante(ausenciasCuadrante);
    setCargando(false);
  }

  // Ver a qué cuadrante FP pertenece un profesor
  function cuadranteDeProfesor(nombrePdf, todosCuadrantesRaw) {
    // Buscar en horarios el primer cuadrante NO general donde aparece
    const relacion = {};
    (todosCuadrantesRaw || []).forEach(g => {
      const c = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
      relacion[c] = c;
    });
    // No basta con eso: hay que buscar en la BD dónde aparece este profesor
    // Simplificación: como ya cargamos guardiasDia, podemos buscar solo ese día
    // Pero mejor: buscar en TODA la semana. Como no lo tenemos aquí, hacemos una consulta rápida.
    // Por rendimiento: si ya está en guardiasDia (hoy) lo usamos
    for (const c of Object.keys(guardiasDia)) {
      if (esCuadranteGeneral(c)) continue;
      const horas = guardiasDia[c] || {};
      for (const h of Object.keys(horas)) {
        if ((horas[h] || []).some(n => (n || '').toLowerCase() === nombrePdf.toLowerCase())) {
          return c;
        }
      }
    }
    return null;
  }

  const diaHoy = new Date().toISOString().split('T')[0];
  const esSemana = !['sábado', 'domingo'].includes(diaSemanaEs(fecha));

  const detalle = detalleAbierto
    ? {
      cuadrante: detalleAbierto.cuadrante,
      hora: detalleAbierto.hora,
      guardias: guardiasDia[detalleAbierto.cuadrante]?.[detalleAbierto.hora] || [],
      ausencias: ausenciasPorCuadrante[detalleAbierto.cuadrante]?.[detalleAbierto.hora] || [],
    }
    : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER */}
      <div style={{ backgroundColor: marron, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { window.location.href = esDirectivo ? '/gestion' : '/profesor'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🛡️ Guardias del día</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Curso 2025-2026</div>
        </div>
      </div>

      {/* NAVEGADOR DE FECHA */}
      <div style={{ backgroundColor: 'white', padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => { const f = moverFecha(fecha, -1); setFecha(f); cargarDia(f); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#555' }}>← Ayer</button>

        <div style={{ flex: 1, minWidth: 200, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: azul, textTransform: 'capitalize' }}>
            {fechaLegible(fecha)}
          </div>
          {fecha === diaHoy && <div style={{ fontSize: 11, color: verde, fontWeight: 700 }}>📍 HOY</div>}
        </div>

        <button onClick={() => { const f = moverFecha(fecha, 1); setFecha(f); cargarDia(f); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#555' }}>Mañana →</button>

        <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); cargarDia(e.target.value); }}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13 }} />

        {fecha !== diaHoy && (
          <button onClick={() => { setFecha(diaHoy); cargarDia(diaHoy); }}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: verde, color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>📍 Hoy</button>
        )}
      </div>

      {/* CONTENIDO */}
      {cargando ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>Cargando datos del día...
        </div>
      ) : !esSemana ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌴</div>
          <div style={{ fontWeight: 600 }}>Fin de semana</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>No hay guardias los sábados ni domingos.</div>
        </div>
      ) : cuadrantes.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div style={{ color: '#666' }}>No hay datos de guardias.</div>
        </div>
      ) : (
        <div style={{ padding: 12 }}>
          {/* RESUMEN */}
          <ResumenAusencias
            ausenciasPorCuadrante={ausenciasPorCuadrante}
            fecha={fecha}
          />

          {/* TABLA PRINCIPAL: horas × cuadrantes */}
          <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: cuadrantes.length * 130 + 100, fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...cabecera, position: 'sticky', left: 0, zIndex: 10, backgroundColor: marron }}>Hora</th>
                  {cuadrantes.map(c => (
                    <th key={c} style={cabecera}>
                      <div style={{ fontSize: 15 }}>{emojiCuadrante(c)}</div>
                      <div style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, marginTop: 2 }}>{c}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HORAS.map(h => (
                  <tr key={h.id}>
                    <td style={{ ...celdaHora, position: 'sticky', left: 0, zIndex: 5, backgroundColor: '#f9fafb' }}>
                      <div style={{ fontWeight: 800, color: azul, fontSize: 13 }}>{h.label}</div>
                      <div style={{ fontSize: 9, color: '#888' }}>{h.horario}</div>
                    </td>
                    {cuadrantes.map(c => {
                      const guardias = guardiasDia[c]?.[h.id] || [];
                      const ausencias = ausenciasPorCuadrante[c]?.[h.id] || [];
                      const hayAlgo = guardias.length > 0 || ausencias.length > 0;
                      const tieneAusencias = ausencias.length > 0;

                      return (
                        <td
                          key={c}
                          onClick={() => hayAlgo && setDetalleAbierto({ cuadrante: c, hora: h.id })}
                          style={{
                            ...celda,
                            cursor: hayAlgo ? 'pointer' : 'default',
                            backgroundColor: tieneAusencias ? '#fff7ed' : hayAlgo ? '#f0fdf4' : 'white',
                          }}
                        >
                          {guardias.length === 0 ? (
                            <span style={{ color: '#ccc', fontSize: 10, fontStyle: 'italic' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {guardias.map((g, i) => {
                                const esYo = g && profesorNombre && g.toLowerCase().includes((profesorNombre || '').toLowerCase().split(' ')[0]);
                                return (
                                  <span key={i} style={{
                                    display: 'inline-block',
                                    backgroundColor: esYo ? '#fef3c7' : '#dcfce7',
                                    color: esYo ? '#78350f' : '#166534',
                                    padding: '2px 6px',
                                    borderRadius: 4,
                                    fontSize: 10,
                                    fontWeight: 600,
                                    border: esYo ? '1px solid #fbbf24' : '1px solid #86efac',
                                  }}>{nombreCorto(g)}</span>
                                );
                              })}
                            </div>
                          )}
                          {tieneAusencias && (
                            <div style={{ marginTop: 4, padding: '2px 5px', backgroundColor: '#f59e0b', color: 'white', borderRadius: 4, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
                              ⚠️ {ausencias.length} ausen{ausencias.length !== 1 ? 'cias' : 'cia'}
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

          <div style={{ marginTop: 10, fontSize: 11, color: '#888', textAlign: 'center', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span>💡 Toca una celda para ver detalles</span>
            <span><span style={{ backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: 3 }}>amarillo</span> = tú</span>
            <span><span style={{ backgroundColor: '#fff7ed', padding: '1px 6px', borderRadius: 3, border: '1px solid #fdba74' }}>naranja</span> = con ausencias</span>
          </div>
        </div>
      )}

      {/* MODAL DETALLE */}
      {detalle && (
        <ModalDetalle detalle={detalle} onClose={() => setDetalleAbierto(null)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// COMPONENTES
// ═══════════════════════════════════════════════════

function ResumenAusencias({ ausenciasPorCuadrante, fecha }) {
  const total = Object.values(ausenciasPorCuadrante).reduce((acc, horas) =>
    acc + Object.values(horas).reduce((s, arr) => s + arr.length, 0), 0);

  if (total === 0) {
    return (
      <div style={{ padding: '10px 14px', backgroundColor: '#d1fae5', color: '#065f46', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
        ✅ No hay ausencias ni DLDs registrados para esta fecha
      </div>
    );
  }
  return (
    <div style={{ padding: '10px 14px', backgroundColor: '#fef3c7', color: '#78350f', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600, textAlign: 'center', border: '1px solid #fbbf24' }}>
      ⚠️ {total} clase{total !== 1 ? 's' : ''} por cubrir en esta fecha
    </div>
  );
}

function ModalDetalle({ detalle, onClose }) {
  const horaObj = HORAS.find(h => h.id === detalle.hora);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, padding: 0
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: 'white', borderRadius: '16px 16px 0 0', padding: 20,
        maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: azul, display: 'flex', alignItems: 'center', gap: 8 }}>
              {emojiCuadrante(detalle.cuadrante)} {detalle.cuadrante}
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>
              {horaObj?.label} · {horaObj?.horario}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>

        {/* Profesores de guardia */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 6 }}>🛡️ Profesores de guardia</div>
          {detalle.guardias.length === 0 ? (
            <div style={{ padding: 10, backgroundColor: '#f5f5f5', borderRadius: 8, color: '#888', fontSize: 13, fontStyle: 'italic' }}>
              Sin guardias asignadas esta hora
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {detalle.guardias.map((g, i) => (
                <span key={i} style={{ padding: '5px 10px', backgroundColor: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 13, fontWeight: 600, border: '1px solid #86efac' }}>
                  {nombreCorto(g)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Ausencias afectando este sector/hora */}
        {detalle.ausencias.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#78350f', marginBottom: 6 }}>⚠️ Clases por cubrir</div>
            {detalle.ausencias.map((a, i) => (
              <div key={i} style={{ padding: 12, backgroundColor: '#fff7ed', border: '1.5px solid #fdba74', borderRadius: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#78350f', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>👥 {a.grupo}</span>
                  {a.materia && <span style={{ color: '#92400e', fontWeight: 600 }}>· {a.materia}</span>}
                  {a.aula && (
                    <span style={{ padding: '2px 8px', backgroundColor: '#e0e7ff', color: '#3730a3', borderRadius: 12, fontSize: 11 }}>
                      📍 Aula {a.aula}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: '#78350f', marginTop: 4 }}>
                  {a.tipoFalta === 'dld' ? '📄 DLD' : '🏥 Ausencia'} de <strong>{a.profesor}</strong>
                </div>

                {(a.instrucciones || a.archivo_url) ? (
                  <div style={{ marginTop: 8, padding: '10px 12px', backgroundColor: 'white', borderRadius: 8, border: '1px solid #fcd34d' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#78350f', marginBottom: 4 }}>📝 Tarea para los alumnos</div>
                    {a.instrucciones && (
                      <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: a.archivo_url ? 8 : 0 }}>
                        {a.instrucciones}
                      </div>
                    )}
                    {a.archivo_url && (
                      <a href={a.archivo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', backgroundColor: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                        📎 {a.archivo_nombre || 'Descargar archivo'}
                      </a>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>
                    ⚠️ Sin tarea asignada
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const cabecera = {
  padding: '8px 6px',
  backgroundColor: marron,
  color: 'white',
  fontSize: 11,
  fontWeight: 700,
  textAlign: 'center',
  border: '1px solid #6b2a10',
  minWidth: 110,
};

const celdaHora = {
  padding: '6px 8px',
  border: '1px solid #eee',
  textAlign: 'center',
  minWidth: 70,
  whiteSpace: 'nowrap',
};

const celda = {
  padding: '5px 6px',
  border: '1px solid #eee',
  verticalAlign: 'top',
  minWidth: 110,
};
