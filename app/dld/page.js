'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const HORAS = [
  { id: '1', label: '1ª hora', emoji: '🕘' },
  { id: '2', label: '2ª hora', emoji: '🕙' },
  { id: '3', label: '3ª hora', emoji: '🕚' },
  { id: 'recreo', label: 'Recreo', emoji: '☕' },
  { id: '4', label: '4ª hora', emoji: '🕛' },
  { id: '5', label: '5ª hora', emoji: '🕐' },
  { id: '6', label: '6ª hora', emoji: '🕑' },
];

const GRUPOS_POR_ETAPA = {
  ESO: {
    emoji: '🏫', label: 'ESO',
    cursos: { 'ESO-1A': null, 'ESO-1B': null, 'ESO-1C': null, 'ESO-1D': null, 'ESO-2A': null, 'ESO-2B': null, 'ESO-2C': null, 'ESO-3A': null, 'ESO-3B': null, 'ESO-3C': null, 'ESO-3DIV': null, 'ESO-4A': null, 'ESO-4B': null, 'ESO-4C': null, 'ESO-4D': null, 'ESO-4DIV': null },
  },
  BACH: {
    emoji: '🎓', label: 'Bachillerato',
    cursos: { 'BTO-1CTA': null, 'BTO-1CTB': null, 'BTO-1HCS': null, 'BTO-2CT': null, 'BTO-2HU': null },
  },
  GB: {
    emoji: '🔰', label: 'Grado Básico',
    cursos: { 'GB-1CR': null, 'GB-1EE': null, 'GB-1MV': null, 'GB-1SC': null, 'GB-2CR': null, 'GB-2EE': null, 'GB-2MV': null, 'GB-2SC': null },
  },
  GM: {
    emoji: '🔧', label: 'FP Grado Medio',
    cursos: { 'GM-1ACC': null, 'GM-1AOV': null, 'GM-1CAR': null, 'GM-1COC': null, 'GM-1EVA.A': null, 'GM-1EVA.B': null, 'GM-1GAD': null, 'GM-1IEA': null, 'GM-1ITE': null, 'GM-1SMR.A': null, 'GM-1SMR.B': null, 'GM-2ACC': null, 'GM-2AOV': null, 'GM-2CAR': null, 'GM-2COC': null, 'GM-2EVA': null, 'GM-2GAD': null, 'GM-2IEA': null, 'GM-2ITE': null, 'GM-2SMR.A': null, 'GM-2SMR.B': null },
  },
  GS: {
    emoji: '🎯', label: 'FP Grado Superior',
    cursos: { 'GS-1AAD': null, 'GS-1AFI': null, 'GS-1ASIR': null, 'GS-1AUT': null, 'GS-1DAM': null, 'GS-1DAW': null, 'GS-1DDC': null, 'GS-1GVEC': null, 'GS-1SEA': null, 'GS-1STI': null, 'GS-1TLO': null, 'GS-1VITI': null, 'GS-2AAD': null, 'GS-2AFI': null, 'GS-2ASIR': null, 'GS-2AUT': null, 'GS-2DAM': null, 'GS-2DAW': null, 'GS-2DDC': null, 'GS-2GVEC': null, 'GS-2SEA': null, 'GS-2STI': null, 'GS-2TLO': null, 'GS-2VITI': null },
  },
  FPPE: {
    emoji: '🌱', label: 'PEFP',
    cursos: { 'FPPE-1JAR': null, 'FPPE-2JAR': null },
  },
  GUARDIA: {
    emoji: '🛡️', label: 'Guardia',
    cursos: { 'Cuadrante general': null, 'Familias profesionales': null, 'Guardia de recreo': null, 'Otras situaciones': null },
  },
};

const TIPOS_DLD = [
  { valor: 'no_lectivo', emoji: '🌙', label: 'DLD en período no lectivo' },
  { valor: '1_lectivo', emoji: '📚', label: '1º DLD en período lectivo' },
  { valor: '2_lectivo', emoji: '📖', label: '2º DLD en período lectivo' },
];

export default function DLD() {
  const [vista, setVista] = useState('historial'); // 'historial' | 'nueva'
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [antiguedadCentro, setAntiguedadCentro] = useState(0);
  const [antiguedadCuerpo, setAntiguedadCuerpo] = useState(0);
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);

  // horario[horaId] = { tipo: 'clase'|'guardia'|'libre', grupo: '' }
  const [horario, setHorario] = useState({});
  const [horaEditando, setHoraEditando] = useState(null);
  const [etapaSeleccionada, setEtapaSeleccionada] = useState('');
  const [textoOtro, setTextoOtro] = useState('');

  const [form, setForm] = useState({
    tipo_dld: '',
    fecha_solicitada: '',
    tipo_guardia: '',
    causa_sobrevenida: false,
    descripcion_causa: '',
  });

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setProfesorNombre(nombre || '');
    cargarDatos(id);
  }, []);

  async function cargarDatos(id) {
    setCargando(true);
    const { data: prof } = await getSupabase().from('profesores').select('tipo_contrato, antiguedad_centro, antiguedad_cuerpo').eq('id', id).single();
    if (prof) { setTipoContrato(prof.tipo_contrato || ''); setAntiguedadCentro(prof.antiguedad_centro || 0); setAntiguedadCuerpo(prof.antiguedad_cuerpo || 0); }
    const { data: sols } = await getSupabase().from('dld').select('*').eq('profesor_id', id).order('created_at', { ascending: false });
    setMisSolicitudes(sols || []);
    setCargando(false);
  }

  function diasCorrespondientes() {
    if (tipoContrato === 'Funcionario de carrera' || tipoContrato === 'Interino con vacante') return 3;
    if (tipoContrato === 'Interino sin vacante') return 2;
    return 1;
  }

  const diasAprobados = misSolicitudes.filter(s => s.estado === 'aprobada').length;
  const diasRestantes = diasCorrespondientes() - diasAprobados;
  const sinDias = diasRestantes <= 0;

  function setHoraTipo(horaId, tipo) {
    setHorario(h => ({ ...h, [horaId]: { tipo, grupo: tipo === 'clase' ? '' : tipo } }));
    if (tipo === 'clase') setHoraEditando(horaId);
    else setHoraEditando(null);
    setEtapaSeleccionada('');
    setTextoOtro('');
  }

  function asignarGrupo(horaId, grupo) {
    setHorario(h => ({ ...h, [horaId]: { tipo: 'clase', grupo } }));
    setHoraEditando(null);
    setEtapaSeleccionada('');
    setTextoOtro('');
  }

  function limpiarHora(horaId) {
    setHorario(h => { const nuevo = { ...h }; delete nuevo[horaId]; return nuevo; });
    if (horaEditando === horaId) setHoraEditando(null);
  }

  function construirGruposAfectados() {
    const grupos = {};
    Object.entries(horario).forEach(([horaId, val]) => {
      if (val.tipo === 'clase' && val.grupo) {
        if (!grupos[val.grupo]) grupos[val.grupo] = [];
        const hora = HORAS.find(h => h.id === horaId);
        if (hora) grupos[val.grupo].push(hora.label);
      }
    });
    return Object.entries(grupos).map(([grupo, horas]) => ({ grupo, horas }));
  }

  function construirGuardiasHorario() {
    const guardias = [];
    Object.entries(horario).forEach(([horaId, val]) => {
      if (val.tipo === 'guardia') {
        const hora = HORAS.find(h => h.id === horaId);
        if (hora) guardias.push({ hora: hora.label, tipo_guardia: val.grupo || 'Sin especificar' });
      }
    });
    return guardias;
  }

  async function enviar() {
    setError('');
    if (!form.tipo_dld) { setError('Selecciona el tipo de DLD.'); return; }
    if (!form.fecha_solicitada) { setError('Indica la fecha solicitada.'); return; }

    setEnviando(true);
    try {
      const gruposAfectados = construirGruposAfectados();
      const guardiasHorario = construirGuardiasHorario();
      const { error: err } = await getSupabase().from('dld').insert([{
        profesor_id: profesorId,
        profesor_nombre: profesorNombre,
        tipo_contrato: tipoContrato,
        tipo_dld: form.tipo_dld,
        fecha_solicitada: form.fecha_solicitada,
        grupos_afectados: gruposAfectados,
        guardias_horario: guardiasHorario,
        tipo_guardia: form.tipo_guardia,
        causa_sobrevenida: form.causa_sobrevenida,
        descripcion_causa: form.descripcion_causa.trim(),
        estado: 'pendiente',
        antiguedad_centro: antiguedadCentro,
        antiguedad_cuerpo: antiguedadCuerpo,
      }]);
      if (err) { setError('Error al enviar: ' + err.message); }
      else {
        setVista('historial');
        setForm({ tipo_dld: '', fecha_solicitada: '', tipo_guardia: '', causa_sobrevenida: false, descripcion_causa: '' });
        setHorario({});
        cargarDatos(profesorId);
      }
    } catch (e) { setError('Error inesperado: ' + e.message); }
    setEnviando(false);
  }

  const verde = '#1e6b2e';
  const verdeClaro = '#e8f5e9';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>📄 Días de Libre Disposición</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {profesorNombre}</div>
        </div>
        <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Volver</a>
      </div>

      <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px' }}>

        {/* RESUMEN DÍAS */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: `5px solid ${verde}` }}>
          <div style={{ fontWeight: 700, color: verde, fontSize: 15, marginBottom: 10 }}>📊 Mis días de libre disposición</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>{tipoContrato} → <strong>{diasCorrespondientes()} días</strong> correspondientes</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {Array(diasCorrespondientes()).fill(null).map((_, i) => (
              <div key={i} style={{ flex: 1, height: 12, borderRadius: 6, backgroundColor: i < diasAprobados ? verde : '#e0e0e0' }} />
            ))}
          </div>
          <div style={{ fontSize: 13, color: '#555' }}>
            <span style={{ color: verde, fontWeight: 700 }}>{diasAprobados} aprobado{diasAprobados !== 1 ? 's' : ''}</span>
            {' · '}
            <span style={{ color: diasRestantes > 0 ? '#555' : '#b91c1c', fontWeight: diasRestantes === 0 ? 700 : 400 }}>
              {diasRestantes > 0 ? `${diasRestantes} restante${diasRestantes !== 1 ? 's' : ''}` : 'Sin días disponibles'}
            </span>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setVista('historial')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${vista === 'historial' ? verde : '#ddd'}`, backgroundColor: vista === 'historial' ? verde : 'white', color: vista === 'historial' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
            📋 Mis solicitudes
          </button>
          <button onClick={() => !sinDias && setVista('nueva')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${vista === 'nueva' ? verde : sinDias ? '#ddd' : '#ddd'}`, backgroundColor: vista === 'nueva' ? verde : sinDias ? '#f5f5f5' : 'white', color: vista === 'nueva' ? 'white' : sinDias ? '#bbb' : '#555', cursor: sinDias ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14 }}>
            {sinDias ? '🚫 Sin días disponibles' : '+ Nueva solicitud'}
          </button>
        </div>

        {/* ═══ HISTORIAL ═══ */}
        {vista === 'historial' && (
          cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
          ) : misSolicitudes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa', backgroundColor: 'white', borderRadius: 12 }}>
              No tienes solicitudes aún.<br />
              <button onClick={() => !sinDias && setVista('nueva')} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 10, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>+ Crear primera solicitud</button>
            </div>
          ) : misSolicitudes.map(s => {
            const badge = s.estado === 'aprobada' ? { bg: '#d1fae5', color: '#065f46', texto: '✅ Aprobada' } :
              s.estado === 'rechazada' ? { bg: '#fee2e2', color: '#991b1b', texto: '❌ Rechazada' } :
              s.estado === 'cancelada' ? { bg: '#f3f4f6', color: '#6b7280', texto: '🚫 Cancelada' } :
              { bg: '#fef3c7', color: '#92400e', texto: '⏳ Pendiente' };
            const grupos = Array.isArray(s.grupos_afectados) ? s.grupos_afectados : [];
            return (
              <div key={s.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderLeft: `4px solid ${s.estado === 'aprobada' ? '#10b981' : s.estado === 'rechazada' ? '#ef4444' : '#f59e0b'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#222', marginBottom: 4 }}>
                      {s.tipo_dld === 'no_lectivo' ? '🌙' : '📚'} {s.tipo_dld === 'no_lectivo' ? 'No lectivo' : s.tipo_dld === '1_lectivo' ? '1º Lectivo' : '2º Lectivo'}
                    </div>
                    <div style={{ fontSize: 13, color: '#555' }}>📅 {new Date(s.fecha_solicitada + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                    {grupos.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {grupos.map((g, i) => {
                          const nombre = typeof g === 'object' ? g.grupo : g;
                          const horas = typeof g === 'object' && g.horas ? g.horas.join(', ') : '';
                          return <div key={i} style={{ fontSize: 12, color: '#555', marginTop: 2 }}>📚 {nombre} — {horas}</div>;
                        })}
                      </div>
                    )}
                    {s.estado === 'rechazada' && s.motivo_rechazo && (
                      <div style={{ marginTop: 6, fontSize: 12, backgroundColor: '#fee2e2', color: '#b91c1c', padding: '6px 10px', borderRadius: 8 }}>
                        Motivo: {s.motivo_rechazo}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Solicitado: {new Date(s.created_at).toLocaleDateString('es-ES')}</div>
                  </div>
                  <span style={{ fontSize: 12, backgroundColor: badge.bg, color: badge.color, padding: '4px 12px', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>{badge.texto}</span>
                </div>
              </div>
            );
          })
        )}

        {/* ═══ NUEVA SOLICITUD ═══ */}
        {vista === 'nueva' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>

            {/* TIPO DLD */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...labelEstilo, fontSize: 15 }}>🌙 Tipo de DLD *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                {TIPOS_DLD.map(t => {
                  const yaUsado = misSolicitudes.some(s => s.tipo_dld === t.valor && s.estado === 'aprobada');
                  return (
                    <div key={t.valor} onClick={() => !yaUsado && setForm(f => ({ ...f, tipo_dld: t.valor }))} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10,
                      border: `2px solid ${form.tipo_dld === t.valor ? verde : yaUsado ? '#ddd' : '#e0e0e0'}`,
                      backgroundColor: form.tipo_dld === t.valor ? verdeClaro : yaUsado ? '#f5f5f5' : 'white',
                      cursor: yaUsado ? 'not-allowed' : 'pointer', opacity: yaUsado ? 0.6 : 1,
                    }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${form.tipo_dld === t.valor ? verde : '#ccc'}`, backgroundColor: form.tipo_dld === t.valor ? verde : 'white', flexShrink: 0 }} />
                      <span style={{ fontSize: 20 }}>{t.emoji}</span>
                      <span style={{ fontSize: 14, fontWeight: form.tipo_dld === t.valor ? 700 : 400, color: form.tipo_dld === t.valor ? verde : '#444' }}>{t.label}</span>
                      {yaUsado && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>Ya utilizado</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* FECHA */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...labelEstilo, fontSize: 15 }}>📅 Día solicitado *</label>
              <input type="date" value={form.fecha_solicitada} onChange={e => setForm(f => ({ ...f, fecha_solicitada: e.target.value }))} style={{ ...inputEstilo, marginTop: 8 }} />
            </div>

            {/* HORARIO DEL DÍA */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...labelEstilo, fontSize: 15 }}>🕐 ¿Qué tienes en cada hora ese día?</label>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 12 }}>Indica para cada hora si tienes clase, guardia o estás libre</div>

              {HORAS.map(hora => {
                const asignacion = horario[hora.id];
                const esRecreo = hora.id === 'recreo';
                return (
                  <div key={hora.id} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, backgroundColor: asignacion ? (asignacion.tipo === 'clase' ? verdeClaro : asignacion.tipo === 'guardia' ? '#dbeafe' : '#f5f5f5') : '#fafafa', border: `1.5px solid ${asignacion ? (asignacion.tipo === 'clase' ? verde : asignacion.tipo === 'guardia' ? '#93c5fd' : '#ddd') : '#e0e0e0'}` }}>
                      <span style={{ fontSize: 18 }}>{hora.emoji}</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#333', width: 80, flexShrink: 0 }}>{hora.label}</span>

                      {asignacion ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, color: asignacion.tipo === 'clase' ? verde : asignacion.tipo === 'guardia' ? '#1e40af' : '#888', fontWeight: 600 }}>
                            {asignacion.tipo === 'clase' ? `📚 ${asignacion.grupo}` : asignacion.tipo === 'guardia' ? `🛡️ ${asignacion.grupo}` : '⬜ Libre'}
                          </span>
                          <button onClick={() => limpiarHora(hora.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 16 }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                          {!esRecreo && (
                            <button onClick={() => setHoraTipo(hora.id, 'clase')} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #c8e6c9', backgroundColor: 'white', color: verde, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>📚 Clase</button>
                          )}
                          <button onClick={() => { setHoraTipo(hora.id, 'clase'); setEtapaSeleccionada('GUARDIA'); }} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #93c5fd', backgroundColor: 'white', color: '#1e40af', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🛡️ Guardia</button>
                          <button onClick={() => setHoraTipo(hora.id, 'libre')} style={{ padding: '5px 12px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#888', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>⬜ Libre</button>
                        </div>
                      )}
                    </div>

                    {/* Selector de grupo para esta hora */}
                    {horaEditando === hora.id && (
                      <div style={{ backgroundColor: '#f8fdf8', borderRadius: 10, padding: 14, marginTop: 4, border: '1.5px solid #c8e6c9' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: verde, marginBottom: 10 }}>¿Qué tienes en {hora.label}?</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                          {Object.entries(GRUPOS_POR_ETAPA)
                            .filter(([key]) => esRecreo ? key === 'GUARDIA' : true)
                            .map(([key, val]) => (
                            <button key={key} onClick={() => setEtapaSeleccionada(key)} style={{
                              padding: '7px 4px', borderRadius: 7,
                              border: `1.5px solid ${etapaSeleccionada === key ? (key === 'GUARDIA' ? '#93c5fd' : verde) : '#ddd'}`,
                              backgroundColor: etapaSeleccionada === key ? (key === 'GUARDIA' ? '#dbeafe' : verdeClaro) : 'white',
                              color: etapaSeleccionada === key ? (key === 'GUARDIA' ? '#1e40af' : verde) : '#555',
                              cursor: 'pointer', fontSize: 11, fontWeight: 600
                            }}>{val.emoji} {val.label}</button>
                          ))}
                        </div>
                        {etapaSeleccionada && etapaSeleccionada !== 'OTRO' && (
                          <select onChange={e => {
                            if (!e.target.value) return;
                            if (etapaSeleccionada === 'GUARDIA') {
                              setHorario(h => ({ ...h, [hora.id]: { tipo: 'guardia', grupo: e.target.value } }));
                              setHoraEditando(null); setEtapaSeleccionada(''); setTextoOtro('');
                            } else {
                              asignarGrupo(hora.id, e.target.value);
                            }
                          }} defaultValue="" style={{ ...inputEstilo, marginBottom: 8 }}>
                            <option value="">{etapaSeleccionada === 'GUARDIA' ? '— Tipo de guardia —' : '— Selecciona grupo —'}</option>
                            {Object.keys(GRUPOS_POR_ETAPA[etapaSeleccionada].cursos).map(c => <option key={c} value={c}>{c}</option>)}
                            {etapaSeleccionada !== 'GUARDIA' && <option value="__otro__">📝 Otro...</option>}
                          </select>
                        )}
                        {(etapaSeleccionada === 'OTRO' || textoOtro) && (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input type="text" value={textoOtro} onChange={e => setTextoOtro(e.target.value)} placeholder="Escribe el grupo..." style={{ ...inputEstilo, flex: 1 }} />
                            <button onClick={() => textoOtro.trim() && asignarGrupo(hora.id, textoOtro.trim())} style={{ padding: '0 14px', borderRadius: 8, border: 'none', backgroundColor: verde, color: 'white', cursor: 'pointer', fontWeight: 700 }}>OK</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* CAUSA SOBREVENIDA */}
            <div style={{ marginBottom: 24, backgroundColor: '#fffbeb', borderRadius: 10, padding: 16, border: '1.5px solid #fcd34d' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                <input type="checkbox" checked={form.causa_sobrevenida} onChange={e => setForm(f => ({ ...f, causa_sobrevenida: e.target.checked }))} style={{ width: 18, height: 18, accentColor: verde }} />
                ⚠️ Es una causa sobrevenida
              </label>
              {form.causa_sobrevenida && (
                <textarea value={form.descripcion_causa} onChange={e => setForm(f => ({ ...f, descripcion_causa: e.target.value }))} placeholder="Describe la causa sobrevenida..." rows={3} style={{ ...inputEstilo, marginTop: 12, resize: 'vertical' }} />
              )}
            </div>

            {error && <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 16, color: '#b91c1c', fontSize: 14 }}>⚠️ {error}</div>}

            <button onClick={enviar} disabled={enviando} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 16, cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
              {enviando ? 'Enviando...' : '📨 Enviar solicitud'}
            </button>
            <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 10 }}>Mínimo 2 días hábiles de antelación · Resolución en máximo 3 días hábiles</div>
          </div>
        )}
      </div>
    </div>
  );
}

const labelEstilo = { display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 };
const inputEstilo = { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'system-ui, sans-serif' };