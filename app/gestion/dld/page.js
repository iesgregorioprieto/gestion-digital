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

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['L','M','X','J','V','S','D'];
const azul = '#1a3a6b';
const verde = '#1e6b2e';

function etiquetaTipoDLD(tipo) {
  if (tipo === 'no_lectivo') return '🌙 No lectivo';
  if (tipo === '1_lectivo') return '📚 1º Lectivo';
  if (tipo === '2_lectivo') return '📖 2º Lectivo';
  return tipo;
}

function Fila({ label, valor }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #e8ecf4' }}>
      <span style={{ width: 150, fontWeight: 600, color: '#555', fontSize: 13, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#222' }}>{valor}</span>
    </div>
  );
}

function GruposAfectados({ grupos }) {
  if (!grupos || !grupos.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: azul, marginBottom: 8, fontSize: 15 }}>👥 Grupos y horas afectadas</div>
      {grupos.map((g, i) => {
        const nombre = typeof g === 'object' ? g.grupo : g;
        const horas = typeof g === 'object' && g.horas ? g.horas : [];
        return (
          <div key={i} style={{ backgroundColor: '#f8fdf8', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: '1px solid #c8e6c9' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: verde, marginBottom: 4 }}>📚 {nombre}</div>
            {horas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {horas.map(h => (
                  <span key={h} style={{ fontSize: 11, backgroundColor: verde, color: 'white', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{h}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GuardiasHorario({ guardias }) {
  if (!guardias || !guardias.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 8, fontSize: 15 }}>🛡️ Guardias ese día</div>
      {guardias.map((g, i) => (
        <div key={i} style={{ backgroundColor: '#eff6ff', borderRadius: 8, padding: '8px 12px', marginBottom: 6, border: '1px solid #93c5fd', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, backgroundColor: '#1e40af', color: 'white', padding: '2px 10px', borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>{g.hora}</span>
          <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>{g.tipo_guardia}</span>
        </div>
      ))}
    </div>
  );
}

function HorarioCompleto({ grupos, guardias }) {
  const HORAS = ['1ª hora','2ª hora','3ª hora','Recreo','4ª hora','5ª hora','6ª hora'];
  const mapaClases = {};
  if (Array.isArray(grupos)) {
    grupos.forEach(g => {
      const nombre = typeof g === 'object' ? g.grupo : g;
      const horas = typeof g === 'object' && g.horas ? g.horas : [];
      horas.forEach(h => { mapaClases[h] = nombre; });
    });
  }
  const mapaGuardias = {};
  if (Array.isArray(guardias)) {
    guardias.forEach(g => { mapaGuardias[g.hora] = g.tipo_guardia; });
  }
  const tieneAlgo = HORAS.some(h => mapaClases[h] || mapaGuardias[h]);
  if (!tieneAlgo) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: azul, marginBottom: 8, fontSize: 15 }}>🕐 Horario del día</div>
      <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
        {HORAS.map((hora, i) => {
          const clase = mapaClases[hora];
          const guardia = mapaGuardias[hora];
          const esRecreo = hora === 'Recreo';
          const bgColor = clase ? '#e8f5e9' : guardia ? '#eff6ff' : esRecreo ? '#fafafa' : '#fafafa';
          const borderColor = clase ? '#c8e6c9' : guardia ? '#93c5fd' : '#f0f0f0';
          return (
            <div key={hora} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px', backgroundColor: bgColor, borderBottom: i < HORAS.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
              <span style={{ width: 70, fontSize: 12, fontWeight: 700, color: esRecreo ? '#92400e' : '#555', flexShrink: 0 }}>
                {esRecreo ? '☕ Recreo' : hora}
              </span>
              {clase && <span style={{ fontSize: 13, color: verde, fontWeight: 700 }}>📚 {clase}</span>}
              {guardia && <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 700 }}>🛡️ {guardia}</span>}
              {!clase && !guardia && <span style={{ fontSize: 12, color: '#ccc' }}>— libre —</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AlertasPanel({ alertas, prelacion }) {
  return (
    <>
      {alertas.length > 0 && (
        <div style={{ backgroundColor: '#fff5f5', border: '1.5px solid #fca5a5', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 8, fontSize: 15 }}>⚠️ Alertas informativas</div>
          {alertas.map((a, i) => (
            <div key={i} style={{ fontSize: 13, color: a.tipo === 'rojo' ? '#b91c1c' : '#92400e', marginBottom: 4 }}>{a.texto}</div>
          ))}
        </div>
      )}
      {prelacion && prelacion.length > 0 && (
        <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8, fontSize: 15 }}>📊 Otros solicitantes ese día</div>
          {prelacion.map((p, i) => (
            <div key={i} style={{ fontSize: 13, color: '#555', marginBottom: 6, padding: '6px 10px', backgroundColor: 'white', borderRadius: 8 }}>
              <strong>{p.nombre}</strong>
              {p.causa_sobrevenida && <span style={{ color: '#b91c1c' }}> · ⚠️ Causa sobrevenida</span>}
              {' · '}Días: {p.dias_disfrutados} · Centro: {p.antiguedad_centro}a · Cuerpo: {p.antiguedad_cuerpo}a
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function PanelDirector() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [todasSolicitudes, setTodasSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('calendario');
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [mesActual, setMesActual] = useState(new Date());
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [solicitudAbierta, setSolicitudAbierta] = useState(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [diasVistos, setDiasVistos] = useState(new Set());

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) { window.location.href = '/login'; return; }
    if (rol !== 'director' && rol !== 'secretario' && rol !== 'jefe_estudios') { window.location.href = '/gestion'; return; }
    setNombreUsuario(nombre || '');
    cargarSolicitudes();
  }, []);

  useEffect(() => {
    if (vista === 'lista') cargarSolicitudes();
  }, [filtroEstado]);

  async function cargarSolicitudes() {
    setCargando(true);
    const { data } = await getSupabase().from('dld').select('*').order('created_at', { ascending: false });
    setTodasSolicitudes(data || []);
    setCargando(false);
  }

  function normalizarGrupo(nombre) {
    // Iguala "GM-2CAR", "gm-2car", "2º CAR", "2 CAR", "2ºCAR" → "2CAR"
    if (!nombre) return '';
    return String(nombre)
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
      .replace(/[^A-Z0-9]/g, '') // quita todo lo no alfanumérico (º, -, espacios, .)
      .replace(/^(GM|GS|ESO|BACH|FPPE|FPBAS)/, ''); // quita prefijos de etapa
  }

  function horasDeGrupo(g) {
    if (typeof g !== 'object' || !g) return [];
    return Array.isArray(g.horas) ? g.horas : [];
  }

  function calcularAlertas(solicitud) {
    const alertas = [];
    const fecha = solicitud.fecha_solicitada;
    const grupos = Array.isArray(solicitud.grupos_afectados) ? solicitud.grupos_afectados : [];
    const mismaFecha = todasSolicitudes.filter(s =>
      s.id !== solicitud.id && s.fecha_solicitada === fecha &&
      s.estado !== 'rechazada' && s.estado !== 'cancelada'
    );
    if (mismaFecha.length + 1 > 4) {
      alertas.push({ tipo: 'rojo', texto: `⚠️ Hay ${mismaFecha.length + 1} solicitudes ese día` });
    }
    // Aviso general: hay más de una solicitud ese día (aunque no choquen grupos)
    if (mismaFecha.length > 0 && mismaFecha.length + 1 <= 4) {
      alertas.push({ tipo: 'amarillo', texto: `🟡 Hay ${mismaFecha.length + 1} profesores solicitando ese mismo día` });
    }
    // Conflictos por grupo (comparando nombres normalizados) y por hora
    grupos.forEach(g => {
      const nombreGrupo = typeof g === 'object' ? g.grupo : g;
      const nombreNorm = normalizarGrupo(nombreGrupo);
      if (!nombreNorm) return;
      const horasEste = horasDeGrupo(g);
      mismaFecha.forEach(s => {
        const otrosGrupos = Array.isArray(s.grupos_afectados) ? s.grupos_afectados : [];
        otrosGrupos.forEach(og => {
          const otroNombre = typeof og === 'object' ? og.grupo : og;
          if (normalizarGrupo(otroNombre) !== nombreNorm) return;
          const otrasHoras = horasDeGrupo(og);
          // Si alguno no tiene horas guardadas, avisar en amarillo (posible solape)
          if (!horasEste.length || !otrasHoras.length) {
            alertas.push({ tipo: 'amarillo', texto: `🟡 ${nombreGrupo}: también solicitado por ${s.profesor_nombre}` });
            return;
          }
          // Ver si comparten alguna hora
          const horasComunes = horasEste.filter(h => otrasHoras.includes(h));
          if (horasComunes.length > 0) {
            alertas.push({ tipo: 'rojo', texto: `🔴 ${nombreGrupo}: choca con ${s.profesor_nombre} en ${horasComunes.join(', ')}` });
          } else {
            alertas.push({ tipo: 'amarillo', texto: `🟡 ${nombreGrupo}: también lo solicita ${s.profesor_nombre} (otras horas)` });
          }
        });
      });
    });
    const diasDisfrutados = todasSolicitudes.filter(s =>
      s.profesor_id === solicitud.profesor_id && s.id !== solicitud.id && s.estado === 'aprobada'
    ).length;
    const diasMax = solicitud.tipo_contrato === 'Funcionario de carrera' || solicitud.tipo_contrato === 'Interino con vacante' ? 3 :
      solicitud.tipo_contrato === 'Interino sin vacante' ? 2 : 1;
    if (diasDisfrutados >= diasMax) {
      alertas.push({ tipo: 'rojo', texto: `🔴 Ya ha disfrutado ${diasDisfrutados} de ${diasMax} días` });
    } else if (diasDisfrutados > 0) {
      alertas.push({ tipo: 'amarillo', texto: `🟡 Ha disfrutado ${diasDisfrutados} de ${diasMax} días` });
    }
    return alertas;
  }

  function calcularPrelacion(solicitud) {
    const mismaFecha = todasSolicitudes.filter(s =>
      s.id !== solicitud.id && s.fecha_solicitada === solicitud.fecha_solicitada && s.estado === 'pendiente'
    );
    if (!mismaFecha.length) return null;
    return mismaFecha.map(s => ({
      nombre: s.profesor_nombre,
      causa_sobrevenida: s.causa_sobrevenida,
      dias_disfrutados: todasSolicitudes.filter(x => x.profesor_id === s.profesor_id && x.estado === 'aprobada').length,
      antiguedad_centro: s.antiguedad_centro || 0,
      antiguedad_cuerpo: s.antiguedad_cuerpo || 0,
    }));
  }

  async function aprobar(id) {
    setProcesando(true);
    await getSupabase().from('dld').update({ estado: 'aprobada', resuelto_at: new Date().toISOString(), resuelto_por: nombreUsuario }).eq('id', id);
    mostrarMensaje('✅ Solicitud aprobada', 'ok');
    setSolicitudAbierta(null);
    cargarSolicitudes();
    setProcesando(false);
  }

  async function rechazar(id) {
    if (!motivoRechazo.trim()) { alert('Debes indicar el motivo del rechazo'); return; }
    setProcesando(true);
    await getSupabase().from('dld').update({ estado: 'rechazada', resuelto_at: new Date().toISOString(), resuelto_por: nombreUsuario, motivo_rechazo: motivoRechazo }).eq('id', id);
    mostrarMensaje('❌ Solicitud rechazada', 'error');
    setSolicitudAbierta(null);
    setMotivoRechazo('');
    cargarSolicitudes();
    setProcesando(false);
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return;
    setProcesando(true);
    await getSupabase().from('dld').delete().eq('id', id);
    mostrarMensaje('🗑️ Solicitud eliminada', 'ok');
    setSolicitudAbierta(null);
    setDiaSeleccionado(null);
    cargarSolicitudes();
    setProcesando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  function cerrarSesion() { sessionStorage.clear(); window.location.href = '/login'; }

  function getSolicitudesDia(dia) {
    const year = mesActual.getFullYear();
    const month = String(mesActual.getMonth() + 1).padStart(2, '0');
    const diaStr = String(dia).padStart(2, '0');
    const fecha = `${year}-${month}-${diaStr}`;
    return todasSolicitudes.filter(s => s.fecha_solicitada === fecha);
  }

  function getColorDia(sols) {
    if (!sols.length) return null;
    const tieneConflicto = sols.some(s => calcularAlertas(s).some(a => a.tipo === 'rojo'));
    const tienePendientes = sols.some(s => s.estado === 'pendiente');
    if (tieneConflicto) return { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' };
    if (tienePendientes) return { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' };
    return { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' };
  }

  const year = mesActual.getFullYear();
  const month = mesActual.getMonth();
  const primerDia = new Date(year, month, 1).getDay();
  const diasEnMes = new Date(year, month + 1, 0).getDate();
  const offset = primerDia === 0 ? 6 : primerDia - 1;

  const contadores = {
    pendiente: todasSolicitudes.filter(s => s.estado === 'pendiente').length,
    aprobada: todasSolicitudes.filter(s => s.estado === 'aprobada').length,
    rechazada: todasSolicitudes.filter(s => s.estado === 'rechazada').length,
  };

  const solicitudesFiltradas = todasSolicitudes.filter(s => s.estado === filtroEstado);
  const solicitudesDiaSeleccionado = diaSeleccionado ? getSolicitudesDia(diaSeleccionado) : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>📄 Gestión de Días Libres</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {nombreUsuario}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
          <button onClick={cerrarSesion} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.4)', backgroundColor: 'transparent', color: 'white', cursor: 'pointer', fontSize: 13 }}>🚪 Salir</button>
        </div>
      </div>

      {mensaje && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, backgroundColor: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', color: 'white', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: 15 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* ACCESO A PANEL GESTIÓN */}
        <div style={{ marginBottom: 20 }}>
          <a href="/gestion" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', backgroundColor: '#e0e7ff', border: '2px solid #6366f1', borderRadius: 10, textDecoration: 'none', fontWeight: 700, color: '#4f46e5', fontSize: 14 }}>
            ← Volver a Panel de Gestión
          </a>
        </div>

        {/* SECCIÓN DLD */}
        <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 12 }}>📄 Gestión de DLD</div>

        {/* CONTADORES */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { estado: 'pendiente', emoji: '⏳', label: 'Pendientes', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
            { estado: 'aprobada', emoji: '✅', label: 'Aprobadas', bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
            { estado: 'rechazada', emoji: '❌', label: 'Rechazadas', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
          ].map(c => (
            <div key={c.estado} style={{ backgroundColor: c.bg, border: `2px solid ${c.border}`, borderRadius: 12, padding: '16px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>{c.emoji}</div>
              <div style={{ fontSize: 32, fontWeight: 800, color: c.color }}>{contadores[c.estado]}</div>
              <div style={{ fontSize: 13, color: '#666', fontWeight: 600 }}>{c.label}</div>
            </div>
          ))}
        </div>

        {/* TOGGLE VISTA */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button onClick={() => setVista('calendario')} style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${vista === 'calendario' ? azul : '#ddd'}`, backgroundColor: vista === 'calendario' ? azul : 'white', color: vista === 'calendario' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>📅 Calendario</button>
          <button onClick={() => setVista('lista')} style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${vista === 'lista' ? azul : '#ddd'}`, backgroundColor: vista === 'lista' ? azul : 'white', color: vista === 'lista' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>📋 Lista</button>
        </div>

        {/* CALENDARIO */}
        {vista === 'calendario' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => setMesActual(new Date(year, month - 1))} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 18 }}>‹</button>
              <div style={{ fontWeight: 700, fontSize: 18, color: azul }}>{MESES[month]} {year}</div>
              <button onClick={() => setMesActual(new Date(year, month + 1))} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 18 }}>›</button>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              {[{ bg: '#fee2e2', color: '#b91c1c', label: 'Con conflictos' }, { bg: '#fef3c7', color: '#92400e', label: 'Pendientes' }, { bg: '#d1fae5', color: '#065f46', label: 'Resueltas' }].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666' }}>
                  <div style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: l.bg, border: `1px solid ${l.color}` }} />
                  {l.label}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {DIAS_SEMANA.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#888', padding: '4px 0' }}>{d}</div>)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array(offset).fill(null).map((_, i) => <div key={`e${i}`} />)}
              {Array(diasEnMes).fill(null).map((_, i) => {
                const dia = i + 1;
                const sols = getSolicitudesDia(dia);
                const colorDia = getColorDia(sols);
                const esHoy = new Date().getDate() === dia && new Date().getMonth() === month && new Date().getFullYear() === year;
                const seleccionado = diaSeleccionado === dia;
                const tienePendientes = sols.some(s => s.estado === 'pendiente');
                const fechaKey = `${year}-${String(month+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
                const yaVisto = diasVistos.has(fechaKey);
                const parpadeante = tienePendientes && !yaVisto && !seleccionado;
                return (
                  <div key={dia} onClick={() => {
                    if (sols.length) {
                      setDiasVistos(prev => new Set([...prev, fechaKey]));
                      setDiaSeleccionado(seleccionado ? null : dia);
                    }
                  }} style={{
                    aspectRatio: '1', borderRadius: 8, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', position: 'relative',
                    cursor: sols.length ? 'pointer' : 'default',
                    backgroundColor: seleccionado ? azul : colorDia ? colorDia.bg : esHoy ? '#f0f4ff' : 'white',
                    border: `2px solid ${seleccionado ? azul : colorDia ? colorDia.border : esHoy ? '#93c5fd' : '#f0f0f0'}`,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: esHoy ? 800 : 400, color: seleccionado ? 'white' : colorDia ? colorDia.color : '#333' }}>{dia}</div>
                    {sols.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: seleccionado ? 'white' : colorDia.color }}>{sols.length}</div>}
                    {parpadeante && (
                      <div style={{
                        position: 'absolute', top: 3, right: 3,
                        width: 8, height: 8, borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        animation: 'parpadeo 1s ease-in-out infinite',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>

            {diaSeleccionado && solicitudesDiaSeleccionado.length > 0 && (
              <div style={{ marginTop: 20, borderTop: '1.5px solid #e5e7eb', paddingTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: azul, marginBottom: 12 }}>
                  📅 {diaSeleccionado} de {MESES[month]} — {solicitudesDiaSeleccionado.length} solicitud{solicitudesDiaSeleccionado.length > 1 ? 'es' : ''}
                </div>
                {solicitudesDiaSeleccionado.map(s => {
                  const alertas = calcularAlertas(s);
                  const grupos = Array.isArray(s.grupos_afectados) ? s.grupos_afectados : [];
                  const badgeColor = s.estado === 'aprobada' ? { bg: '#d1fae5', color: '#065f46' } : s.estado === 'rechazada' ? { bg: '#fee2e2', color: '#991b1b' } : { bg: '#fef3c7', color: '#92400e' };
                  return (
                    <div key={s.id} style={{ backgroundColor: '#f8faff', borderRadius: 10, padding: 14, marginBottom: 10, border: `1.5px solid ${alertas.some(a => a.tipo === 'rojo') ? '#fca5a5' : '#e0e7ff'}`, borderLeft: `4px solid ${alertas.some(a => a.tipo === 'rojo') ? '#ef4444' : s.estado === 'aprobada' ? '#10b981' : '#f59e0b'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>{s.profesor_nombre}</div>
                          <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{etiquetaTipoDLD(s.tipo_dld)} · {s.tipo_contrato}</div>
                          {grupos.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {grupos.map((g, i) => {
                                const nombre = typeof g === 'object' ? g.grupo : g;
                                const horas = typeof g === 'object' && g.horas ? g.horas.join(', ') : '';
                                return <span key={i} style={{ fontSize: 11, backgroundColor: '#e8f0fe', color: '#1a56db', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{nombre}{horas ? ` (${horas})` : ''}</span>;
                              })}
                            </div>
                          )}
                          {s.causa_sobrevenida && <div style={{ marginTop: 4, fontSize: 12, color: '#92400e', fontWeight: 600 }}>⚠️ Causa sobrevenida</div>}
                          {alertas.map((a, i) => <div key={i} style={{ fontSize: 12, color: a.tipo === 'rojo' ? '#b91c1c' : '#92400e', marginTop: 2 }}>{a.texto}</div>)}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                          <span style={{ fontSize: 11, backgroundColor: badgeColor.bg, color: badgeColor.color, padding: '2px 10px', borderRadius: 10, fontWeight: 700 }}>
                            {s.estado === 'pendiente' ? '⏳ Pendiente' : s.estado === 'aprobada' ? '✅ Aprobada' : '❌ Rechazada'}
                          </span>
                          {s.estado === 'pendiente' && (
                            <button onClick={() => { setSolicitudAbierta(s); setMotivoRechazo(''); }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>📋 Revisar</button>
                          )}
                          <button onClick={() => eliminar(s.id)} disabled={procesando} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', backgroundColor: '#fff5f5', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>🗑️ Eliminar</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {diaSeleccionado && solicitudesDiaSeleccionado.length === 0 && (
              <div style={{ marginTop: 16, textAlign: 'center', color: '#aaa', fontSize: 14 }}>No hay solicitudes para este día</div>
            )}
          </div>
        )}

        {/* LISTA */}
        {vista === 'lista' && (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {['pendiente', 'aprobada', 'rechazada'].map(e => (
                <button key={e} onClick={() => setFiltroEstado(e)} style={{ padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${filtroEstado === e ? azul : '#ddd'}`, backgroundColor: filtroEstado === e ? azul : 'white', color: filtroEstado === e ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                  {e === 'pendiente' ? '⏳ Pendiente' : e === 'aprobada' ? '✅ Aprobada' : '❌ Rechazada'}
                </button>
              ))}
            </div>
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
            ) : solicitudesFiltradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa', backgroundColor: 'white', borderRadius: 12 }}>No hay solicitudes</div>
            ) : solicitudesFiltradas.map(s => {
              const alertas = calcularAlertas(s);
              const grupos = Array.isArray(s.grupos_afectados) ? s.grupos_afectados : [];
              return (
                <div key={s.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 18, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: `4px solid ${alertas.length > 0 ? '#ef4444' : filtroEstado === 'aprobada' ? '#10b981' : filtroEstado === 'rechazada' ? '#6b7280' : '#f59e0b'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: azul }}>{s.profesor_nombre}</div>
                      <div style={{ fontSize: 13, color: '#555' }}>📅 {new Date(s.fecha_solicitada + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                      <div style={{ fontSize: 13, color: '#555' }}>{etiquetaTipoDLD(s.tipo_dld)} · {s.tipo_contrato}</div>
                      {grupos.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {grupos.map((g, i) => {
                            const nombre = typeof g === 'object' ? g.grupo : g;
                            const horas = typeof g === 'object' && g.horas ? g.horas.join(', ') : '';
                            return <span key={i} style={{ fontSize: 12, backgroundColor: '#e8f0fe', color: '#1a56db', padding: '2px 8px', borderRadius: 10, fontWeight: 600 }}>{nombre}{horas ? ` (${horas})` : ''}</span>;
                          })}
                        </div>
                      )}
                      {s.causa_sobrevenida && <div style={{ marginTop: 6, fontSize: 12, backgroundColor: '#fffbeb', color: '#92400e', padding: '3px 10px', borderRadius: 10, display: 'inline-block', fontWeight: 600 }}>⚠️ Causa sobrevenida</div>}
                      {alertas.map((a, i) => <div key={i} style={{ fontSize: 12, color: a.tipo === 'rojo' ? '#b91c1c' : '#92400e', marginTop: 2 }}>{a.texto}</div>)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                      <div style={{ fontSize: 12, color: '#888' }}>{new Date(s.created_at).toLocaleDateString('es-ES')}</div>
                      {filtroEstado === 'pendiente' && (
                        <button onClick={() => { setSolicitudAbierta(s); setMotivoRechazo(''); }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>📋 Revisar</button>
                      )}
                      <button onClick={() => eliminar(s.id)} disabled={procesando} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', backgroundColor: '#fff5f5', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>🗑️ Eliminar</button>
                      {filtroEstado === 'rechazada' && s.motivo_rechazo && <div style={{ fontSize: 12, color: '#888', maxWidth: 200, textAlign: 'right' }}>{s.motivo_rechazo}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* MODAL */}
      {solicitudAbierta && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={e => e.target === e.currentTarget && setSolicitudAbierta(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 28, maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, color: azul }}>📋 Revisión de solicitud</h2>
              <button onClick={() => setSolicitudAbierta(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ backgroundColor: '#f0f4ff', borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, color: azul, marginBottom: 10, fontSize: 15 }}>👤 Datos del solicitante</div>
              <Fila label="Nombre" valor={solicitudAbierta.profesor_nombre} />
              <Fila label="Contrato" valor={solicitudAbierta.tipo_contrato} />
              <Fila label="Tipo DLD" valor={etiquetaTipoDLD(solicitudAbierta.tipo_dld)} />
              <Fila label="Fecha" valor={new Date(solicitudAbierta.fecha_solicitada + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
              <Fila label="Antigüedad centro" valor={`${solicitudAbierta.antiguedad_centro || 0} años`} />
              <Fila label="Antigüedad cuerpo" valor={`${solicitudAbierta.antiguedad_cuerpo || 0} años`} />
              {solicitudAbierta.causa_sobrevenida && (
                <div style={{ marginTop: 8, padding: 10, backgroundColor: '#fffbeb', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
                  ⚠️ <strong>Causa sobrevenida:</strong> {solicitudAbierta.descripcion_causa || 'Sin descripción'}
                </div>
              )}
            </div>
            <GruposAfectados grupos={solicitudAbierta.grupos_afectados} />
            <GuardiasHorario guardias={solicitudAbierta.guardias_horario} />
            <HorarioCompleto grupos={solicitudAbierta.grupos_afectados} guardias={solicitudAbierta.guardias_horario} />
            <AlertasPanel alertas={calcularAlertas(solicitudAbierta)} prelacion={calcularPrelacion(solicitudAbierta)} />
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Motivo de rechazo (obligatorio si rechazas)</label>
              <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Indica el motivo del rechazo según la normativa..." rows={3} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => aprobar(solicitudAbierta.id)} disabled={procesando} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', backgroundColor: '#065f46', color: 'white', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15 }}>✅ Aprobar</button>
              <button onClick={() => rechazar(solicitudAbierta.id)} disabled={procesando} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', backgroundColor: '#b91c1c', color: 'white', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15 }}>❌ Rechazar</button>
              <button onClick={() => eliminar(solicitudAbierta.id)} disabled={procesando} style={{ padding: '13px 16px', borderRadius: 10, border: '1.5px solid #fca5a5', backgroundColor: '#fff5f5', color: '#b91c1c', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15 }}>🗑️</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}