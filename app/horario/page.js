"use client";
import { consulta, consultaRpc } from '@/lib/consulta';
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getCursoActual } from '@/lib/curso';

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

function horaActual() {
  const t = new Date().getHours() * 60 + new Date().getMinutes();
  if (t < 565) return '1';
  if (t < 615) return '2';
  if (t < 675) return '3';
  if (t < 705) return 'R';
  if (t < 760) return '4';
  if (t < 815) return '5';
  return '6';
}

function HorarioContenido() {
  const searchParams = useSearchParams();
  const vistaParam = searchParams.get('vista');

  const [horario, setHorario] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [vista, setVista] = useState(vistaParam === 'hoy' ? 'hoy' : 'semana');
  const [busqueda, setBusqueda] = useState('');
  const [companyeros, setCompanyeros] = useState([]);
  const [profVista, setProfVista] = useState(null); // null = el mío propio

  const verde = '#0f766e';
  const azul = '#1e3a5f';
  const hoyIdx = new Date().getDay();
  const hoyDia = DIAS[hoyIdx - 1] || '';
  const horaAct = horaActual();

  useEffect(() => {
    cargarHorario();
    // Cargar lista de profesores para el buscador
    consulta('profesores').select('id, nombre, apellidos, departamento')
      .eq('estado', 'activo').order('apellidos').then(({ data }) => setCompanyeros(data || []));
  }, []);

  /**
   * Busca el nombre exacto en horarios_profesores usando primero el nombre
   * completo (nombre + ambos apellidos) para desambiguar homónimos de primer
   * apellido. Si no hay coincidencia exacta, cae al primer apellido solo.
   */
  async function buscarNombrePDF(nombre, apellidos) {
    const primerNombre = nombre.split(' ')[0];
    const primerApellido = apellidos.split(' ')[0];
    const segundoApellido = apellidos.split(' ')[1] || '';

    // Intento 1: RPC estándar con primer nombre + primer apellido
    const { data: nPdf1 } = await consultaRpc('buscar_profesor_horario', {
      p_nombre: primerNombre,
      p_apellido: primerApellido,
    });

    if (!nPdf1) return null;

    // Si hay segundo apellido, verificar que el resultado lo contiene.
    // Así "Jiménez Jiménez" y "Jiménez Núñez" no se confunden aunque
    // la RPC devuelva el mismo primero en la lista.
    if (segundoApellido) {
      const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (norm(nPdf1).includes(norm(segundoApellido))) return nPdf1;

      // El resultado no tiene el segundo apellido correcto: buscar en
      // el listado de horarios por las dos primeras letras del segundo apellido
      const { data: candidatos } = await consulta('horarios_profesores')
        .select('profesor_nombre_pdf')
        .ilike('profesor_nombre_pdf', '%' + primerApellido + '%')
        .limit(20);

      const match = (candidatos || []).find(c =>
        norm(c.profesor_nombre_pdf).includes(norm(primerNombre)) &&
        norm(c.profesor_nombre_pdf).includes(norm(segundoApellido))
      );
      if (match) return match.profesor_nombre_pdf;
    }

    return nPdf1;
  }

  async function verHorarioProf(prof) {
    setProfVista(prof);
    setBusqueda('');
    setCargando(true);
    const nPdf = await buscarNombrePDF(prof.nombre, prof.apellidos);
    if (!nPdf) { setHorario([]); setNombre(prof.apellidos + ', ' + prof.nombre); setCargando(false); return; }
    const { data } = await consulta('horarios_profesores')
      .select('dia, hora_id, tipo, grupo, materia, aula')
      .eq('profesor_nombre_pdf', nPdf)
      .eq('curso_academico', await getCursoActual());
    setHorario(data || []);
    setNombre(prof.apellidos + ', ' + prof.nombre);
    setCargando(false);
  }

  async function cargarHorario() {
    setCargando(true);
    const nombreCompleto = sessionStorage.getItem('profesor_nombre') || '';
    const profId = sessionStorage.getItem('profesor_id');
    setNombre(nombreCompleto);

    if (!profId) {
      setError('No se ha identificado al profesor. Vuelve al panel e inicia sesión.');
      setCargando(false);
      return;
    }

    try {
      const { data: profRows } = await consulta('profesores')
        .select('nombre, apellidos')
        .eq('id', profId);
      const prof = (profRows || [])[0];

      if (!prof) { setError('No se encontró tu perfil. Contacta con secretaría.'); setCargando(false); return; }

      setNombre(prof.apellidos + ', ' + prof.nombre);
      const nPdf = await buscarNombrePDF(prof.nombre, prof.apellidos);

      if (!nPdf) { setError('No se encontró tu horario. Contacta con secretaría.'); setCargando(false); return; }

      const { data } = await consulta('horarios_profesores')
        .select('dia, hora_id, tipo, grupo, materia, aula')
        .eq('profesor_nombre_pdf', nPdf)
        .eq('curso_academico', await getCursoActual());

      setHorario(data || []);
    } catch (e) {
      console.error('Error horario:', e);
      setError('Error al cargar el horario.');
    }
    setCargando(false);
  }

  // Organizar en grid
  const grid = {};
  for (const h of horario) {
    const dia = (h.dia || '').toLowerCase();
    const hora = (h.hora_id || '').toString().replace(/[aª]/g, '');
    const key = `${dia}-${hora}`;
    if (!grid[key]) grid[key] = [];
    grid[key].push(h);
  }

  function renderCelda(celdas, esAhora) {
    if (celdas.length === 0) return <span style={{ fontSize: 10, color: '#ccc' }}>—</span>;
    return celdas.map((c, i) => {
      const esGuardia = (c.tipo || '').toLowerCase().includes('guardia') || (c.actividad || '').toLowerCase().includes('guardia');
      return (
        <div key={i} style={{
          padding: '6px 8px', borderRadius: 8, marginBottom: i < celdas.length - 1 ? 4 : 0,
          backgroundColor: esGuardia ? '#fef3c7' : '#eff6ff',
          border: `1px solid ${esGuardia ? '#fcd34d' : '#bfdbfe'}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: esGuardia ? '#92400e' : '#1e40af' }}>
            {c.actividad || c.materia || c.tipo || '—'}
          </div>
          {c.grupo && <div style={{ fontSize: 11, color: '#555' }}>{c.grupo}</div>}
          {c.aula && <div style={{ fontSize: 10, color: '#888' }}>📍 {c.aula}</div>}
        </div>
      );
    });
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0fdfa', fontFamily: 'system-ui, sans-serif' }}>

      {/* BUSCADOR DE COMPAÑERO */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #d1fae5', padding: '10px 16px', position: 'relative' }}>
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔍 Buscar horario de un compañero/a..."
          style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #a7f3d0',
            fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
        />
        {profVista && (
          <button onClick={() => { setProfVista(null); cargarHorario(); }}
            style={{ marginTop: 6, background: 'none', border: 'none', color: verde,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            ← Ver mi horario
          </button>
        )}
        {busqueda.length >= 2 && (
          <div style={{ position: 'absolute', top: '100%', left: 16, right: 16, zIndex: 100,
            backgroundColor: 'white', border: '1.5px solid #a7f3d0', borderRadius: 10,
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)', maxHeight: 260, overflowY: 'auto' }}>
            {companyeros
              .filter(c => (c.apellidos + ' ' + c.nombre).toLowerCase().includes(busqueda.toLowerCase()))
              .slice(0, 12)
              .map(c => (
                <div key={c.id} onClick={() => verHorarioProf(c)}
                  style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: '1px solid #f0fdf4',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{c.apellidos}, {c.nombre}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{c.departamento || ''}</span>
                </div>
              ))}
            {companyeros.filter(c => (c.apellidos + ' ' + c.nombre).toLowerCase().includes(busqueda.toLowerCase())).length === 0 && (
              <div style={{ padding: 14, color: '#888', fontSize: 13 }}>Sin resultados</div>
            )}
          </div>
        )}
      </div>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
          <span style={{ fontSize: 22 }}>🕐</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{profVista ? profVista.apellidos + ', ' + profVista.nombre : 'Mi Horario'}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre}</div>
          </div>
        </div>
        {/* SELECTOR HOY / SEMANA */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.4)' }}>
          <button onClick={() => setVista('hoy')} style={{
            padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            backgroundColor: vista === 'hoy' ? 'white' : 'transparent',
            color: vista === 'hoy' ? verde : 'white',
          }}>📅 Hoy</button>
          <button onClick={() => setVista('semana')} style={{
            padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
            backgroundColor: vista === 'semana' ? 'white' : 'transparent',
            color: vista === 'semana' ? verde : 'white',
          }}>📋 Semana</button>
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
          <p>No se ha encontrado tu horario.</p>
        </div>
      ) : vista === 'hoy' ? (

        /* ═══ VISTA HOY ═══ */
        <div style={{ padding: 16, maxWidth: 500, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: verde, textTransform: 'capitalize' }}>
              {DIAS_LABEL[hoyDia] || 'Fin de semana'}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {!hoyDia ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>
              <div style={{ fontSize: 50 }}>🏖️</div>
              <p style={{ fontSize: 15 }}>¡Es fin de semana!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {HORAS.map(h => {
                const celdas = grid[`${hoyDia}-${h.id}`] || [];
                const esAhora = h.id === horaAct;
                const esRecreo = h.id === 'R';

                return (
                  <div key={h.id} style={{
                    backgroundColor: 'white', borderRadius: 12, padding: '12px 14px',
                    border: esAhora ? `2.5px solid ${verde}` : '1.5px solid #e2e8f0',
                    boxShadow: esAhora ? `0 2px 12px rgba(15,118,110,0.15)` : '0 1px 4px rgba(0,0,0,0.04)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    {/* HORA */}
                    <div style={{
                      width: 50, textAlign: 'center', flexShrink: 0,
                    }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: esAhora ? verde : '#374151' }}>{h.label}</div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{h.rango}</div>
                      {esAhora && <div style={{ fontSize: 8, color: verde, fontWeight: 700, marginTop: 2 }}>AHORA</div>}
                    </div>

                    {/* CONTENIDO */}
                    <div style={{ flex: 1 }}>
                      {esRecreo && celdas.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#94a3b8' }}>☕ Recreo</div>
                      ) : celdas.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#cbd5e1' }}>Libre</div>
                      ) : (
                        renderCelda(celdas, esAhora)
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      ) : (

        /* ═══ VISTA SEMANAL ═══ */
        <div style={{ padding: 12, overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 8px', backgroundColor: azul, color: 'white', fontSize: 12, fontWeight: 700, textAlign: 'center', width: 70 }}>Hora</th>
                  {DIAS.map(d => (
                    <th key={d} style={{
                      padding: '10px 8px',
                      backgroundColor: d === hoyDia ? verde : azul,
                      color: 'white', fontSize: 12, fontWeight: 700, textAlign: 'center',
                    }}>
                      {DIAS_LABEL[d]}{d === hoyDia ? ' 📍' : ''}
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

                      return (
                        <td key={d} style={{
                          padding: 4, textAlign: 'center', borderBottom: '1px solid #e2e8f0',
                          backgroundColor: esAhora ? '#ccfbf1' : (celdas.length > 0 ? 'white' : '#f8fafc'),
                          border: esAhora ? `2px solid ${verde}` : '1px solid #e2e8f0',
                          verticalAlign: 'top',
                        }}>
                          {esRecreo && celdas.length === 0 ? (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>☕</span>
                          ) : (
                            <div style={{ padding: 2 }}>{renderCelda(celdas, esAhora)}</div>
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
            {[
              { bg: '#eff6ff', border: '#bfdbfe', label: 'Clase' },
              { bg: '#fef3c7', border: '#fcd34d', label: 'Guardia' },
              { bg: '#ccfbf1', border: '#14b8a6', label: 'Ahora' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: l.bg, border: `1px solid ${l.border}` }} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HorarioPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⏳ Cargando...</div>}>
      <HorarioContenido />
    </Suspense>
  );
}
