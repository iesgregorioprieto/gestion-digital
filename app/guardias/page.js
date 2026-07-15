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

const HORAS = [
  { id: '1', label: '1ª', horario: '8:30 – 9:25' },
  { id: '2', label: '2ª', horario: '9:25 – 10:20' },
  { id: '3', label: '3ª', horario: '10:20 – 11:15' },
  { id: 'recreo', label: 'Recreo', horario: '11:15 – 11:45' },
  { id: '4', label: '4ª', horario: '11:45 – 12:40' },
  { id: '5', label: '5ª', horario: '12:40 – 13:35' },
  { id: '6', label: '6ª', horario: '13:35 – 14:30' },
];

function normHora(h) { return (h || '').toString().replace(/[aª]$/, '').toLowerCase(); }

function diaSemanaEs(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return dias[new Date(fecha + 'T12:00:00').getDay()];
}

function esCuadranteGeneral(cuadrante) {
  const n = (cuadrante || '').toUpperCase();
  return n.includes('GENERAL') || n.includes('ESO') || n.includes('BACHIL') || n.includes('BTO');
}

function pesoSector(nombre) {
  const n = nombre.toUpperCase();
  if (n.includes('GENERAL')) return 9;
  if (n.includes('JEFATURA')) return 8;
  if (n.includes('ADMINIST')) return 7;
  if (n.includes('RECREO')) return 6;
  return 1;
}

function emojiSector(nombre) {
  const n = nombre.toUpperCase();
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

function abreviarSector(nombre) {
  // Acorta nombres largos para las cabeceras de tabla
  const n = nombre.trim();
  if (n.length <= 14) return n;
  return n.substring(0, 12) + '…';
}

function nombreCorto(nombreCompleto) {
  if (!nombreCompleto) return '';
  const partes = nombreCompleto.split(',').map(p => p.trim());
  if (partes.length < 2) return nombreCompleto;
  const primerApellido = partes[0].split(' ')[0];
  const primerNombre = partes[1].split(' ')[0];
  return `${primerApellido}, ${primerNombre}`;
}

function fechaLegible(fecha) {
  const d = new Date(fecha + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

export default function Guardias() {
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [sectores, setSectores] = useState([]);
  const [horarioGuardias, setHorarioGuardias] = useState({}); // {sector: {dia: {hora: [prof]}}}
  const [horariosClase, setHorariosClase] = useState([]);
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [rolGestion, setRolGestion] = useState('');
  const [esDirectivo, setEsDirectivo] = useState(false);
  const [ausenciasDia, setAusenciasDia] = useState([]); // [{profesor, tipo, motivo, cuadranteAusente, horas: [{hora, grupo, materia, aula, instrucciones, archivo_url, archivo_nombre}]}]
  const [cargandoDia, setCargandoDia] = useState(false);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setProfesorNombre(sessionStorage.getItem('profesor_nombre') || '');
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    setRolGestion(rol);
    setEsDirectivo(['secretario', 'director', 'jefe_estudios'].includes(rol));
    cargarBase();
  }, []);

  // Cuando cambia fecha, recalcular ausencias/DLDs
  useEffect(() => {
    if (!cargando) cargarAusenciasYDld(fecha);
  }, [fecha, cargando]);

  async function cargarBase() {
    setCargando(true);
    const { data: horarios } = await getSupabase()
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia, aula')
      .eq('curso_academico', '2025-2026');

    if (!horarios) { setCargando(false); return; }
    setHorariosClase(horarios);

    const guardias = horarios.filter(h => h.tipo === 'guardia');
    const porSector = {};
    guardias.forEach(g => {
      const sector = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
      const horaNorm = normHora(g.hora_id);
      const dia = (g.dia || '').toLowerCase();
      if (!porSector[sector]) porSector[sector] = {};
      if (!porSector[sector][dia]) porSector[sector][dia] = {};
      if (!porSector[sector][dia][horaNorm]) porSector[sector][dia][horaNorm] = [];
      porSector[sector][dia][horaNorm].push(g.profesor_nombre_pdf);
    });

    const nombres = Object.keys(porSector).sort((a, b) => {
      const pA = pesoSector(a), pB = pesoSector(b);
      if (pA !== pB) return pA - pB;
      return a.localeCompare(b);
    });

    setSectores(nombres);
    setHorarioGuardias(porSector);
    setCargando(false);
  }

  function cuadranteDeProfesor(nombrePdf, listaSectores, horarios) {
    if (!nombrePdf) return null;
    const lcName = nombrePdf.toLowerCase();
    for (const s of listaSectores) {
      if (esCuadranteGeneral(s)) continue;
      const datos = horarios[s] || {};
      for (const d of Object.keys(datos)) {
        for (const h of Object.keys(datos[d])) {
          if ((datos[d][h] || []).some(p => (p || '').toLowerCase() === lcName)) return s;
        }
      }
    }
    // Si no está en FP, buscar en general
    for (const s of listaSectores) {
      if (!esCuadranteGeneral(s)) continue;
      const datos = horarios[s] || {};
      for (const d of Object.keys(datos)) {
        for (const h of Object.keys(datos[d])) {
          if ((datos[d][h] || []).some(p => (p || '').toLowerCase() === lcName)) return s;
        }
      }
    }
    return null;
  }

  async function cargarAusenciasYDld(f) {
    setCargandoDia(true);
    setAusenciasDia([]);

    const diaSem = diaSemanaEs(f);
    if (diaSem === 'sábado' || diaSem === 'domingo') {
      setCargandoDia(false);
      return;
    }

    const { data: ausencias } = await getSupabase()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, motivo, horas')
      .lte('fecha_inicio', f).gte('fecha_fin', f);

    const { data: dlds } = await getSupabase()
      .from('dld')
      .select('profesor_id, profesor_nombre, motivo, horas')
      .eq('fecha_solicitada', f).eq('estado', 'aprobada');

    const todas = [
      ...(ausencias || []).map(a => ({ ...a, tipo_falta: 'ausencia' })),
      ...(dlds || []).map(d => ({ ...d, tipo_falta: 'dld' })),
    ];

    const resultado = [];
    for (const falta of todas) {
      const { data: prof } = await getSupabase()
        .from('profesores').select('nombre, apellidos, departamento').eq('id', falta.profesor_id);
      if (!prof || prof.length === 0) continue;
      const p = prof[0];
      const nombrePdf = `${p.apellidos}, ${p.nombre}`;
      const cuadranteAus = cuadranteDeProfesor(nombrePdf, sectores, horarioGuardias);

      // Sus clases ese día de la semana
      const clases = horariosClase.filter(h =>
        h.tipo === 'clase' &&
        (h.dia || '').toLowerCase() === diaSem &&
        (h.profesor_nombre_pdf || '').toLowerCase() === nombrePdf.toLowerCase()
      );

      const horasFalta = Array.isArray(falta.horas) ? falta.horas : [];
      const horasEnriquecidas = clases.map(c => {
        const horaN = normHora(c.hora_id);
        const tarea = horasFalta.find(h => {
          if (!h) return false;
          const hn = normHora(h.hora_id) || normHora(h.hora) || '';
          const label = (h.hora || '').toLowerCase();
          return hn === horaN || label.includes(`${horaN}ª`) || label.includes(`${horaN}a`);
        });
        return {
          hora: horaN,
          grupo: c.grupo,
          materia: c.materia,
          aula: c.aula,
          instrucciones: tarea?.instrucciones || null,
          archivo_url: tarea?.archivo_url || null,
          archivo_nombre: tarea?.archivo_nombre || null,
        };
      });

      resultado.push({
        profesor: falta.profesor_nombre,
        nombrePdf,
        tipo: falta.tipo_falta,
        motivo: falta.motivo,
        cuadranteAusente: cuadranteAus,
        horas: horasEnriquecidas,
      });
    }

    setAusenciasDia(resultado);
    setCargandoDia(false);
  }

  const diaSem = diaSemanaEs(fecha);
  const esFinde = diaSem === 'sábado' || diaSem === 'domingo';
  const totalAusencias = ausenciasDia.filter(a => a.tipo === 'ausencia').length;
  const totalDld = ausenciasDia.filter(a => a.tipo === 'dld').length;

  // Contador de huecos por sector para esta fecha
  function huecosPorSector(sector) {
    return ausenciasDia.filter(a => a.cuadranteAusente === sector).length;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* HEADER */}
      <div style={{ backgroundColor: marron, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { window.location.href = esDirectivo ? '/gestion' : '/profesor'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🛡️ Guardias</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Curso 2025-2026 · {sectores.length} sectores</div>
        </div>
      </div>

      {/* SELECTOR DE FECHA */}
      <div style={{ padding: 16 }}>
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setFecha(sumarDias(fecha, -1))} style={btnNav}>← Anterior</button>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: 14, flex: 1, minWidth: 150 }} />
          <button onClick={() => setFecha(sumarDias(fecha, 1))} style={btnNav}>Siguiente →</button>
          <button onClick={() => setFecha(new Date().toISOString().split('T')[0])} style={{ ...btnNav, backgroundColor: marron, color: 'white', border: 'none' }}>📅 Hoy</button>
        </div>

        <div style={{ marginTop: 10, padding: '10px 14px', backgroundColor: 'white', borderRadius: 10, fontSize: 13, color: azul, fontWeight: 600, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 15 }}>📆 {fechaLegible(fecha)}</span>
          {esFinde ? (
            <span style={{ color: '#888', fontWeight: 500 }}>· Fin de semana, no hay guardias</span>
          ) : (
            <>
              <span style={{ padding: '3px 10px', backgroundColor: '#fef3c7', color: '#78350f', borderRadius: 20, fontSize: 12 }}>🏥 {totalAusencias} ausencia{totalAusencias !== 1 ? 's' : ''}</span>
              <span style={{ padding: '3px 10px', backgroundColor: '#dbeafe', color: '#1e40af', borderRadius: 20, fontSize: 12 }}>📄 {totalDld} DLD</span>
            </>
          )}
        </div>
      </div>

      {cargando ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>Cargando datos...
        </div>
      ) : esFinde ? (
        <div style={{ padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 40, textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏖️</div>
            <div>Este día es fin de semana. Selecciona un día laborable.</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 16px 16px' }}>

          {/* TABLA GRANDE: horas × sectores */}
          <div style={{ backgroundColor: 'white', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={cabeceraFija}>Hora</th>
                    {sectores.map(s => {
                      const huecos = huecosPorSector(s);
                      return (
                        <th key={s} style={{ ...cabeceraSector }}>
                          <div style={{ fontSize: 16, marginBottom: 2 }}>{emojiSector(s)}</div>
                          <div style={{ fontSize: 11, fontWeight: 700 }} title={s}>{abreviarSector(s)}</div>
                          {huecos > 0 && (
                            <div style={{ marginTop: 3, fontSize: 10, backgroundColor: '#fef3c7', color: '#78350f', padding: '1px 6px', borderRadius: 8, fontWeight: 700, display: 'inline-block' }}>
                              {huecos} ausente{huecos !== 1 ? 's' : ''}
                            </div>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HORAS.map(h => (
                    <tr key={h.id}>
                      <td style={celdaHora}>
                        <div style={{ fontWeight: 700, color: azul }}>{h.label}</div>
                        <div style={{ fontSize: 10, color: '#888' }}>{h.horario}</div>
                      </td>
                      {sectores.map(s => {
                        const profs = horarioGuardias[s]?.[diaSem]?.[h.id] || [];
                        const ausentesSector = ausenciasDia.filter(a =>
                          a.cuadranteAusente === s && a.horas.some(hh => hh.hora === h.id)
                        );
                        return (
                          <td key={s} style={celda}>
                            {profs.length === 0 && ausentesSector.length === 0 ? (
                              <span style={{ color: '#ccc', fontSize: 10 }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {profs.map((p, i) => {
                                  const esYo = p && profesorNombre && p.toLowerCase().includes((profesorNombre || '').toLowerCase().split(' ')[0]);
                                  return (
                                    <span key={i} style={{
                                      display: 'inline-block', backgroundColor: esYo ? '#fef3c7' : '#f0fdf4',
                                      color: esYo ? '#78350f' : '#065f46', padding: '2px 6px', borderRadius: 5,
                                      fontSize: 10, fontWeight: 600, border: esYo ? '1px solid #fbbf24' : '1px solid #d1fae5',
                                      lineHeight: 1.3
                                    }}>{nombreCorto(p)}</span>
                                  );
                                })}
                                {ausentesSector.map((a, i) => (
                                  <span key={`aus-${i}`} style={{
                                    display: 'inline-block', backgroundColor: a.tipo === 'dld' ? '#dbeafe' : '#fee2e2',
                                    color: a.tipo === 'dld' ? '#1e40af' : '#991b1b', padding: '2px 6px', borderRadius: 5,
                                    fontSize: 10, fontWeight: 600, border: `1px solid ${a.tipo === 'dld' ? '#93c5fd' : '#fca5a5'}`,
                                    lineHeight: 1.3
                                  }} title={`Ausente: ${a.profesor}`}>
                                    {a.tipo === 'dld' ? '📄' : '🏥'} {nombreCorto(a.nombrePdf)}
                                  </span>
                                ))}
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
          </div>

          {/* LEYENDA */}
          <div style={{ marginBottom: 14, padding: '10px 14px', backgroundColor: 'white', borderRadius: 10, fontSize: 11, color: '#666', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><span style={pill('#f0fdf4', '#065f46', '#d1fae5')}>Verde</span> Guardia asignada</span>
            <span><span style={pill('#fef3c7', '#78350f', '#fbbf24')}>Amarillo</span> Tú</span>
            <span><span style={pill('#fee2e2', '#991b1b', '#fca5a5')}>Rojo</span> Ausencia</span>
            <span><span style={pill('#dbeafe', '#1e40af', '#93c5fd')}>Azul</span> DLD</span>
          </div>

          {/* AUSENCIAS DEL DÍA (detalle) */}
          {cargandoDia ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 13 }}>⏳ Cargando ausencias...</div>
          ) : ausenciasDia.length === 0 ? (
            <div style={{ padding: 20, backgroundColor: '#d1fae5', borderRadius: 10, textAlign: 'center', color: '#065f46', fontWeight: 600 }}>
              ✅ Sin ausencias ni DLDs para este día
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 800, color: azul, marginBottom: 10, fontSize: 15 }}>
                📋 Detalle de ausencias del día
              </div>
              {ausenciasDia.map((a, i) => (
                <div key={i} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${a.tipo === 'dld' ? '#3b82f6' : '#f59e0b'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: azul }}>{a.profesor}</div>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {a.tipo === 'dld' ? '📄 DLD' : '🏥 Ausencia'}
                        {a.cuadranteAusente && ` · ${emojiSector(a.cuadranteAusente)} ${a.cuadranteAusente}`}
                        {a.motivo && ` · ${a.motivo}`}
                      </div>
                    </div>
                    <span style={{ padding: '3px 10px', backgroundColor: '#f3f4f6', color: '#555', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                      {a.horas.length} clase{a.horas.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {a.horas.map((h, j) => (
                    <div key={j} style={{ padding: '10px 12px', backgroundColor: '#fafafa', borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: (h.instrucciones || h.archivo_url) ? 8 : 0 }}>
                        <span style={{ padding: '3px 8px', backgroundColor: azul, color: 'white', borderRadius: 5, fontWeight: 700, minWidth: 34, textAlign: 'center' }}>
                          {h.hora === 'recreo' ? 'R' : h.hora + 'ª'}
                        </span>
                        <span style={{ fontWeight: 700 }}>{h.grupo}</span>
                        {h.materia && <span style={{ color: '#888' }}>· {h.materia}</span>}
                        {h.aula && (
                          <span style={{ padding: '2px 8px', backgroundColor: '#e0e7ff', color: '#3730a3', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                            📍 {h.aula}
                          </span>
                        )}
                      </div>
                      {(h.instrucciones || h.archivo_url) ? (
                        <div style={{ padding: '8px 10px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#78350f', marginBottom: 4 }}>📝 Tarea para los alumnos</div>
                          {h.instrucciones && (
                            <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: h.archivo_url ? 6 : 0 }}>
                              {h.instrucciones}
                            </div>
                          )}
                          {h.archivo_url && (
                            <a href={h.archivo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 10px', backgroundColor: 'white', color: '#78350f', border: '1px solid #fcd34d', borderRadius: 6, textDecoration: 'none', fontWeight: 600 }}>
                              📎 {h.archivo_nombre || 'Descargar archivo'}
                            </a>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: '#aaa', fontStyle: 'italic' }}>⚠️ Sin tarea asignada</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const btnNav = { padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e0e0e0', backgroundColor: 'white', color: '#555', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const cabeceraFija = { padding: '8px 6px', backgroundColor: marron, color: 'white', fontSize: 11, fontWeight: 700, textAlign: 'center', border: '1px solid #6b2a10', position: 'sticky', left: 0, zIndex: 2, minWidth: 60 };
const cabeceraSector = { padding: '8px 6px', backgroundColor: marron, color: 'white', fontSize: 11, fontWeight: 700, textAlign: 'center', border: '1px solid #6b2a10', minWidth: 100, maxWidth: 130 };
const celdaHora = { padding: '6px 8px', backgroundColor: '#fafafa', border: '1px solid #eee', textAlign: 'center', minWidth: 60, whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1 };
const celda = { padding: '5px 6px', border: '1px solid #eee', verticalAlign: 'top', minWidth: 100, maxWidth: 130 };

const pill = (bg, color, borderColor) => ({
  display: 'inline-block', backgroundColor: bg, color, padding: '1px 6px',
  borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1px solid ${borderColor}`
});
