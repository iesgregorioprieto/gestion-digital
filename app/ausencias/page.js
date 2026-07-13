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

const verde = '#1e6b2e';
const verdeClaro = '#f0fdf4';
const azul = '#1e3a5f';
const rojo = '#991b1b';

const HORAS = [
  { id: 'h1', label: '1ª hora' },
  { id: 'h2', label: '2ª hora' },
  { id: 'h3', label: '3ª hora' },
  { id: 'recreo', label: 'Recreo', soloGuardia: true },
  { id: 'h4', label: '4ª hora' },
  { id: 'h5', label: '5ª hora' },
  { id: 'h6', label: '6ª hora' },
];

const ETAPAS = {
  'ESO':    ['ESO-1AM','ESO-1AZ','ESO-1NA','ESO-1VE','ESO-2AM','ESO-2AZ','ESO-2VE','ESO-3AM','ESO-3AZ','ESO-3DIV','ESO-3NA','ESO-3VE','ESO-4AM','ESO-4AZ','ESO-4VE'],
  'BTO':    ['BTO-1CT','BTO-1HCS','BTO-2A','BTO-2B'],
  'GB':     ['GB-1CR','GB-1EE','GB-1MV','GB-1SC','GB-2CR','GB-2EE','GB-2MV','GB-2SC'],
  'GM':     ['GM-1ACC','GM-1AOV','GM-1CAR','GM-1COC','GM-1EVA.A','GM-1EVA.B','GM-1GAD','GM-1IEA','GM-1ITE','GM-1SMR.A','GM-1SMR.B','GM-2ACC','GM-2AOV','GM-2CAR','GM-2COC','GM-2EVA','GM-2GAD','GM-2IEA','GM-2ITE','GM-2SMR.A','GM-2SMR.B'],
  'GS':     ['GS-1AAD','GS-1AFI','GS-1ASIR','GS-1AUT','GS-1DAM','GS-1DAW','GS-1DDC','GS-1GVEC','GS-1SEA','GS-1STI','GS-1TLO','GS-1VIT','GS-2AFI','GS-2ASIR','GS-2AUT','GS-2DAM','GS-2DAW','GS-2DDC','GS-2GVEC','GS-2SEA','GS-2STI','GS-2TLO','GS-2VITI'],
  'CA':     ['CA-CFGS-A','CA-CFGS-B','CA-CFGS-C'],
  'FPPE':   ['FPPE-1JAR','FPPE-2JAR'],
  'GUARDIA':['Cuadrante general','Familias profesionales','Guardia de recreo','Otras situaciones'],
};

const ESTADOS = {
  pendiente:      { label: 'Pendiente',       bg: '#fef3c7', color: '#92400e', emoji: '⏳' },
  justificada:    { label: 'Justificada',      bg: '#d1fae5', color: '#065f46', emoji: '✅' },
  sin_justificar: { label: 'Sin justificar',   bg: '#fee2e2', color: '#991b1b', emoji: '❌' },
};

export default function Ausencias() {
  const [profesorId, setProfesorId] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [nombrePdf, setNombrePdf] = useState(''); // nombre en horarios_profesores
  const [esDirectivo, setEsDirectivo] = useState(false); // 🔑 aviso de acceso a panel completo
  const [vista, setVista] = useState('formulario');
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [cargandoHorario, setCargandoHorario] = useState(false);
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tipo, setTipo] = useState('');
  const [horario, setHorario] = useState({});
  const [horaEditando, setHoraEditando] = useState(null);
  const [etapaSeleccionada, setEtapaSeleccionada] = useState('');
  const [ausenciaJustificando, setAusenciaJustificando] = useState(null);
  const [gruposUnicos, setGruposUnicos] = useState([]); // para ausencias largas (3+ días)
  const [tareasBloque, setTareasBloque] = useState({}); // {grupo_materia: {instrucciones, archivo, archivoNombre}}
  const [justTexto, setJustTexto] = useState('');
  const [justArchivo, setJustArchivo] = useState(null);
  const [justArchNombre, setJustArchNombre] = useState('');
  const [enviandoJust, setEnviandoJust] = useState(false);

  // Días de la semana
  const DIAS_SEMANA = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

  async function buscarNombrePdf(id) {
    const { data: rows0 } = await getSupabase().from('profesores').select('nombre, apellidos').eq('id', id);
    if (!rows0?.[0]) return null;
    const { nombre, apellidos } = rows0[0];
    // Usar función SQL unaccent para ignorar acentos en la búsqueda
    const { data: fnResult } = await getSupabase()
      .rpc('buscar_profesor_horario', { p_nombre: nombre.split(' ')[0], p_apellido: apellidos.split(' ')[0] });
    return fnResult || null;
  }

  function calcularDiasAusencia(inicio, fin) {
    if (!inicio || !fin) return 0;
    const d1 = new Date(inicio + 'T12:00:00');
    const d2 = new Date(fin + 'T12:00:00');
    return Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  }

  async function cargarGruposUnicos(nPdf) {
    if (!nPdf) return;
    const { data } = await getSupabase()
      .from('horarios_profesores')
      .select('grupo, materia, tipo')
      .eq('profesor_nombre_pdf', nPdf)
      .eq('tipo', 'clase')
      .eq('curso_academico', '2025-2026');
    if (!data) return;
    // Grupos únicos por grupo+materia
    const vistos = new Set();
    const unicos = [];
    data.forEach(h => {
      if (!h.grupo) return;
      const key = `${h.grupo}|${h.materia || ''}`;
      if (!vistos.has(key)) {
        vistos.add(key);
        unicos.push({ grupo: h.grupo, materia: h.materia || '' });
      }
    });
    setGruposUnicos(unicos);
    // Inicializar tareasBloque
    const bloque = {};
    unicos.forEach(u => { bloque[`${u.grupo}|${u.materia}`] = { instrucciones: '', archivo: null, archivoNombre: '' }; });
    setTareasBloque(bloque);
  }

  async function cargarHorarioDelDia(fecha, nPdfParam) {
    if (!fecha || !profesorId) return;
    const diaSemana = DIAS_SEMANA[new Date(fecha + 'T12:00:00').getDay()];
    if (!diaSemana || diaSemana === 'sabado' || diaSemana === 'domingo') return;

    setCargandoHorario(true);
    // Buscar nombre en PDF si no lo tenemos
    let nPdf = nombrePdf;
    if (!nPdf) {
      nPdf = await buscarNombrePdf(profesorId);
      if (nPdf) setNombrePdf(nPdf);
    }

    if (!nPdf) { setCargandoHorario(false); return; }

    const { data: horas } = await getSupabase()
      .from('horarios_profesores')
      .select('hora_id, hora_label, tipo, grupo, materia')
      .eq('profesor_nombre_pdf', nPdf)
      .eq('dia', diaSemana)
      .eq('curso_academico', '2025-2026');

    if (!horas || horas.length === 0) { setCargandoHorario(false); return; }

    // Precargar el horario
    const nuevoHorario = {};
    horas.forEach(h => {
      // Normalizar hora_id: "1a" → "1", "2a" → "2", etc.
      const horaIdNorm = h.hora_id.replace(/a$/, '').replace(/ª$/, '');
      nuevoHorario[horaIdNorm] = {
        tipo: h.tipo,
        grupo: h.grupo || '',
        materia: h.materia || '',
        instrucciones: '',
        archivo: null,
        archivoNombre: '',
        archivoUrl: null,
        precargado: true,
      };
    });
    setHorario(nuevoHorario);
    setCargandoHorario(false);
  }

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    const rolGestion = sessionStorage.getItem('profesor_rol_gestion') || '';
    setEsDirectivo(['secretario', 'director', 'jefe_estudios'].includes(rolGestion));
    setProfesorId(id);
    setProfesorNombre(sessionStorage.getItem('profesor_nombre') || '');
    getSupabase().from('profesores').select('departamento').eq('id', id).then(({ data }) => {
      if (data?.[0]) setDepartamento(data[0].departamento || '');
    });
    cargarHistorial(id);
  }, []);

  async function cargarHistorial(id) {
    setCargando(true);
    const { data } = await getSupabase().from('ausencias').select('*').eq('profesor_id', id).order('created_at', { ascending: false });
    setHistorial(data || []);
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setMensaje(null), tipo === 'error' ? 10000 : 5000);
  }

  // ===== HORARIO =====
  function setHoraTipo(horaId, tipo) {
    setHorario(h => ({ ...h, [horaId]: { tipo, grupo: '', instrucciones: '', archivo: null, archivoNombre: '', archivoUrl: null } }));
    setHoraEditando(horaId);
    setEtapaSeleccionada(tipo === 'guardia' ? 'GUARDIA' : '');
  }

  function limpiarHora(horaId) {
    setHorario(h => { const n = { ...h }; delete n[horaId]; return n; });
    if (horaEditando === horaId) setHoraEditando(null);
  }

  function setGrupo(horaId, grupo) {
    setHorario(h => ({ ...h, [horaId]: { ...h[horaId], grupo } }));
    setHoraEditando(null);
    setEtapaSeleccionada('');
  }

  function setInstrucciones(horaId, instrucciones) {
    setHorario(h => ({ ...h, [horaId]: { ...h[horaId], instrucciones } }));
  }

  function setArchivoHora(horaId, archivo) {
    setHorario(h => ({ ...h, [horaId]: { ...h[horaId], archivo, archivoNombre: archivo?.name || '' } }));
  }

  // ===== SUBIR ARCHIVO =====
  async function subirArchivo(archivo, carpeta) {
    if (!archivo) return null;
    const ext = archivo.name.split('.').pop();
    const nombre = `${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await getSupabase().storage.from('ausencias-docs').upload(nombre, archivo);
    if (error) return null;
    const { data } = getSupabase().storage.from('ausencias-docs').getPublicUrl(nombre);
    return data.publicUrl;
  }

  // ===== ENVIAR AUSENCIA =====
  async function enviar() {
    if (!fechaInicio) { mostrarMensaje('Indica la fecha de inicio.', 'error'); return; }
    if (!fechaFin) { mostrarMensaje('Indica la fecha de fin.', 'error'); return; }
    if (!motivo.trim()) { mostrarMensaje('Explica el motivo de la ausencia.', 'error'); return; }
    if (!tipo) { mostrarMensaje('Indica si es prevista o imprevista.', 'error'); return; }

    const diasAusencia = calcularDiasAusencia(fechaInicio, fechaFin);
    const esAusenciaLarga = diasAusencia >= 3;

    if (esAusenciaLarga) {
      // Validar que todos los grupos tienen tarea
      const sinTarea = gruposUnicos.filter(u => {
        const key = `${u.grupo}|${u.materia}`;
        const t = tareasBloque[key];
        return !t?.instrucciones?.trim() && !t?.archivoNombre;
      });
      if (sinTarea.length > 0) {
        const labels = sinTarea.map(u => `${u.grupo}${u.materia ? ` (${u.materia})` : ''}`).join(', ');
        mostrarMensaje(`⚠️ Faltan tareas en: ${labels}.`, 'error');
        return;
      }
    } else {
      // Validar horas de clase con tarea
      const horasClase = Object.entries(horario).filter(([_, v]) => v.tipo === 'clase');
      const sinTarea = horasClase.filter(([_, v]) => !v.instrucciones?.trim() && !v.archivo);
      if (sinTarea.length > 0) {
        const labels = sinTarea.map(([id]) => HORAS.find(h => h.id === id)?.label || id).join(', ');
        mostrarMensaje(`⚠️ Faltan tareas en: ${labels}. Añade instrucciones o adjunta un archivo.`, 'error');
        return;
      }
    }

    setEnviando(true);

    let horasConUrl;

    if (esAusenciaLarga) {
      // Subir archivos de tareas en bloque
      horasConUrl = await Promise.all(
        gruposUnicos.map(async u => {
          const key = `${u.grupo}|${u.materia}`;
          const tarea = tareasBloque[key] || {};
          let archivoUrl = null;
          if (tarea.archivo) archivoUrl = await subirArchivo(tarea.archivo, 'tareas');
          return {
            hora: 'Ausencia larga',
            tipo: 'clase',
            grupo: u.grupo,
            materia: u.materia || null,
            instrucciones: tarea.instrucciones?.trim() || null,
            archivo_url: archivoUrl,
            archivo_nombre: tarea.archivoNombre || null,
          };
        })
      );
    } else {
      // Subir archivos de cada hora
      horasConUrl = await Promise.all(
        Object.entries(horario).map(async ([horaId, val]) => {
          let archivoUrl = null;
          if (val.archivo) archivoUrl = await subirArchivo(val.archivo, 'tareas');
          return {
            hora: HORAS.find(h => h.id === horaId)?.label || horaId,
            tipo: val.tipo,
            grupo: val.grupo || null,
            materia: val.materia || null,
            instrucciones: val.instrucciones?.trim() || null,
            archivo_url: archivoUrl,
            archivo_nombre: val.archivoNombre || null,
          };
        })
      );
    }

    const { error } = await getSupabase().from('ausencias').insert([{
      profesor_id: profesorId,
      profesor_nombre: profesorNombre,
      departamento,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      motivo: motivo.trim(),
      tipo,
      horas: horasConUrl,
    }]);

    setEnviando(false);
    if (error) { mostrarMensaje(`Error: ${error.message} (${error.code || ''} ${error.details || ''})`, 'error'); return; }

    mostrarMensaje('✅ Ausencia notificada correctamente. Recuerda justificarla en un plazo de 3 días.', 'ok');
    setFechaInicio(''); setFechaFin(''); setMotivo(''); setTipo(''); setHorario({});
    setGruposUnicos([]); setTareasBloque({});
    cargarHistorial(profesorId);
    setTimeout(() => setVista('historial'), 2000);
  }

  // ===== JUSTIFICAR =====
  async function justificar() {
    if (!justTexto.trim() && !justArchivo) {
      mostrarMensaje('Añade una explicación o adjunta un documento.', 'error'); return;
    }
    setEnviandoJust(true);
    let url = null;
    if (justArchivo) url = await subirArchivo(justArchivo, 'justificantes');
    await getSupabase().from('ausencias').update({
      estado: 'justificada',
      justificacion_texto: justTexto.trim() || null,
      justificacion_url: url,
    }).eq('id', ausenciaJustificando.id);
    setEnviandoJust(false);
    setAusenciaJustificando(null);
    setJustTexto(''); setJustArchivo(null); setJustArchNombre('');
    mostrarMensaje('✅ Ausencia justificada correctamente.', 'ok');
    cargarHistorial(profesorId);
  }

  // Días restantes para justificar
  function diasParaJustificar(createdAt) {
    const limite = new Date(createdAt);
    limite.setDate(limite.getDate() + 3);
    const hoy = new Date();
    const diff = Math.ceil((limite - hoy) / (1000 * 60 * 60 * 24));
    return diff;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: '#7c2d12', color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🏥</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Notifica una Ausencia</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{profesorNombre} · {departamento}</div>
        </div>
      </div>

      {/* MENSAJE */}
      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : rojo, fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      {/* AVISO DIRECTIVO */}
      {esDirectivo && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', borderRadius: 10, backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', color: '#1e3a5f', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span>ℹ️ Aquí registras <strong>tus propias</strong> ausencias. Para gestionar las del centro entra en el panel de jefatura.</span>
          <button onClick={() => window.location.href = '/jefe-estudios/ausencias'} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: '#1e3a5f', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🏥 Ir a Gestión
          </button>
        </div>
      )}

      {/* TABS */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0' }}>
        {[{ id: 'formulario', label: '🏥 Nueva ausencia' }, { id: 'historial', label: `📋 Mis ausencias (${historial.length})` }].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)} style={{ padding: '9px 18px', borderRadius: 10, border: `2px solid ${vista === t.id ? '#7c2d12' : '#ddd'}`, backgroundColor: vista === t.id ? '#7c2d12' : 'white', color: vista === t.id ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>

        {/* ===== FORMULARIO ===== */}
        {vista === 'formulario' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>

            {/* AVISO */}
            <div style={{ backgroundColor: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
              ⚠️ <strong>Importante:</strong> Tienes <strong>3 días</strong> para justificar tu ausencia tras notificarla. Las horas de clase requieren tarea obligatoria.
            </div>

            {/* FECHAS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>📅 Fecha inicio *</label>
                <input type="date" value={fechaInicio} onChange={async e => {
                const nuevaFechaInicio = e.target.value;
                setFechaInicio(nuevaFechaInicio);
                if (!fechaFin) setFechaFin(nuevaFechaInicio);
                const dias = calcularDiasAusencia(nuevaFechaInicio, fechaFin || nuevaFechaInicio);
                if (dias >= 3) {
                  setHorario({});
                  let nPdf = nombrePdf;
                  if (!nPdf) nPdf = await buscarNombrePdf(profesorId);
                  if (nPdf) cargarGruposUnicos(nPdf);
                } else {
                  setGruposUnicos([]);
                  setHorario({});
                  let nPdf1 = nombrePdf; if (!nPdf1) nPdf1 = await buscarNombrePdf(profesorId); if (nPdf1) cargarHorarioDelDia(nuevaFechaInicio, nPdf1);
                }
              }} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>📅 Fecha fin *</label>
                <input type="date" value={fechaFin} min={fechaInicio} onChange={async e => {
                const nuevaFechaFin = e.target.value;
                setFechaFin(nuevaFechaFin);
                const dias = calcularDiasAusencia(fechaInicio, nuevaFechaFin);
                if (dias >= 3) {
                  setHorario({});
                  let nPdf = nombrePdf;
                  if (!nPdf) nPdf = await buscarNombrePdf(profesorId);
                  if (nPdf) cargarGruposUnicos(nPdf);
                } else {
                  setGruposUnicos([]);
                  setHorario({});
                  let nPdf2 = nombrePdf; if (!nPdf2) nPdf2 = await buscarNombrePdf(profesorId); if (fechaInicio && nPdf2) cargarHorarioDelDia(fechaInicio, nPdf2);
                }
              }} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* TIPO */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 8 }}>⚠️ Tipo de ausencia *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[{ valor: 'prevista', emoji: '📆', label: 'Prevista', desc: 'Conocida con antelación' }, { valor: 'imprevista', emoji: '🚨', label: 'Imprevista', desc: 'Enfermedad u otras causas' }].map(t => (
                  <div key={t.valor} onClick={() => setTipo(t.valor)} style={{ padding: 12, borderRadius: 10, border: `2px solid ${tipo === t.valor ? '#7c2d12' : '#e0e0e0'}`, backgroundColor: tipo === t.valor ? '#fff7ed' : 'white', cursor: 'pointer' }}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{t.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: tipo === t.valor ? '#7c2d12' : '#333' }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* MOTIVO */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>📝 Motivo de la ausencia *</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe brevemente el motivo de tu ausencia..." rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>

            {/* HORARIO / GRUPOS EN BLOQUE */}

              {/* ===== AUSENCIA LARGA: grupos en bloque ===== */}
              {gruposUnicos.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ backgroundColor: '#fef3c7', border: '1.5px solid #fbbf24', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
                    📅 Ausencia de varios días — indica las tareas por módulo/grupo:
                  </div>
                  {gruposUnicos.map(u => {
                    const key = `${u.grupo}|${u.materia}`;
                    const tarea = tareasBloque[key] || {};
                    return (
                      <div key={key} style={{ backgroundColor: '#fffbeb', borderRadius: 10, border: '1.5px solid #fbbf24', padding: 14, marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#3730a3', backgroundColor: '#e0e7ff', padding: '4px 12px', borderRadius: 20 }}>{u.grupo}</span>
                          {u.materia && <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e', backgroundColor: '#fef3c7', padding: '3px 10px', borderRadius: 20 }}>{u.materia}</span>}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: rojo, marginBottom: 6 }}>📝 Tarea * (obligatoria)</div>
                        <textarea
                          value={tarea.instrucciones || ''}
                          onChange={e => setTareasBloque(t => ({ ...t, [key]: { ...t[key], instrucciones: e.target.value } }))}
                          placeholder="Ej: Unidad 5, páginas 80-85. Actividades 1, 2 y 3..."
                          rows={3}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${!tarea.instrucciones?.trim() && !tarea.archivoNombre ? '#fca5a5' : '#ddd'}`, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
                        />
                        {!tarea.archivoNombre ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: '2px dashed #fbbf24', backgroundColor: 'white', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <span style={{ fontSize: 18 }}>📎</span>
                            <span>Adjuntar archivo (examen, ficha, PDF...)</span>
                            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => {
                              const f = e.target.files[0];
                              if (f) setTareasBloque(t => ({ ...t, [key]: { ...t[key], archivo: f, archivoNombre: f.name } }));
                            }} style={{ display: 'none' }} />
                          </label>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', backgroundColor: '#d1fae5', borderRadius: 7 }}>
                            <span>✅</span>
                            <span style={{ fontSize: 12, color: verde, fontWeight: 600, flex: 1 }}>📎 {tarea.archivoNombre}</span>
                            <button onClick={() => setTareasBloque(t => ({ ...t, [key]: { ...t[key], archivo: null, archivoNombre: '' } }))} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>✕</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ===== AUSENCIA CORTA: horario hora por hora ===== */}
              {gruposUnicos.length === 0 && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 4 }}>🕐 Horario afectado</label>

                  {cargandoHorario && (
                    <div style={{ padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af', marginBottom: 10 }}>
                      ⏳ Cargando tu horario del día...
                    </div>
                  )}

              {!cargandoHorario && Object.values(horario).some(h => h.precargado) && (
                <div style={{ padding: '10px 14px', backgroundColor: '#d1fae5', borderRadius: 8, fontSize: 13, color: '#065f46', marginBottom: 10 }}>
                  ✅ Horario cargado automáticamente. Revisa y añade las tareas.
                </div>
              )}

              <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>Las horas de clase requieren tarea obligatoria.</div>

              {HORAS.map(hora => {
                const val = horario[hora.id];
                const esRecreo = hora.id === 'recreo';
                const esEditando = horaEditando === hora.id;
                const hayPrecarga = Object.values(horario).some(h => h.precargado);

                // ===== VISTA PRECARGADA =====
                if (hayPrecarga) {
                  if (!val) {
                    return (
                      <div key={hora.id} style={{ borderRadius: 10, border: '1.5px solid #e0e0e0', marginBottom: 8, padding: '10px 14px', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#bbb', minWidth: 70 }}>{hora.label}</span>
                        <span style={{ fontSize: 12, color: '#ccc' }}>— Libre</span>
                      </div>
                    );
                  }
                  const colorBg = val.tipo === 'clase' ? '#fffbeb' : val.tipo === 'guardia' ? '#eff6ff' : '#f5f0ff';
                  const colorBorder = val.tipo === 'clase' ? '#fbbf24' : val.tipo === 'guardia' ? '#93c5fd' : '#a78bfa';
                  const colorText = val.tipo === 'clase' ? '#92400e' : val.tipo === 'guardia' ? '#1e40af' : '#6d28d9';
                  const labelTipo = val.tipo === 'clase' ? '📚 Clase' : val.tipo === 'guardia' ? '🛡️ Guardia' : '📋 Complementaria';
                  return (
                    <div key={hora.id} style={{ borderRadius: 10, border: `1.5px solid ${colorBorder}`, marginBottom: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', backgroundColor: colorBg, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', minWidth: 70 }}>{hora.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: colorText, backgroundColor: 'white', padding: '3px 10px', borderRadius: 20, border: `1px solid ${colorBorder}` }}>{labelTipo}</span>
                        {val.grupo && <span style={{ fontSize: 12, backgroundColor: '#e0e7ff', color: '#3730a3', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>{val.grupo}{val.materia ? ` · ${val.materia}` : ''}</span>}
                      </div>
                      {val.tipo === 'clase' && (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #eee', backgroundColor: '#fffbeb' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>📝 Tarea para {val.grupo}{val.materia ? ` (${val.materia})` : ''} * (obligatoria)</div>
                          <textarea value={val.instrucciones || ''} onChange={e => setInstrucciones(hora.id, e.target.value)} placeholder="Ej: Página 45, ejercicios 1-5..." rows={2} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${!val.instrucciones?.trim() && !val.archivo ? '#fca5a5' : '#ddd'}`, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }} />
                          {!val.archivoNombre ? (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: '2px dashed #fbbf24', backgroundColor: 'white', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                              <span style={{ fontSize: 18 }}>📎</span><span>Adjuntar archivo (examen, ficha, PDF...)</span>
                              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => { if (e.target.files[0]) setArchivoHora(hora.id, e.target.files[0]); }} style={{ display: 'none' }} />
                            </label>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', backgroundColor: '#d1fae5', borderRadius: 7 }}>
                              <span>✅</span><span style={{ fontSize: 12, color: '#1e6b2e', fontWeight: 600, flex: 1 }}>📎 {val.archivoNombre}</span>
                              <button onClick={() => setArchivoHora(hora.id, null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>✕</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                // ===== VISTA MANUAL =====
                return (
                  <div key={hora.id} style={{ borderRadius: 10, border: `1.5px solid ${val ? (val.tipo === 'clase' ? '#fbbf24' : '#93c5fd') : '#e0e0e0'}`, marginBottom: 8, overflow: 'hidden' }}>
                    {/* FILA PRINCIPAL */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', backgroundColor: val ? (val.tipo === 'clase' ? '#fffbeb' : '#eff6ff') : 'white' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: azul, minWidth: 60 }}>{hora.label}</span>
                      <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                        {!esRecreo && (
                          <button onClick={() => val?.tipo === 'clase' ? limpiarHora(hora.id) : setHoraTipo(hora.id, 'clase')}
                            style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${val?.tipo === 'clase' ? '#fbbf24' : '#e0e0e0'}`, backgroundColor: val?.tipo === 'clase' ? '#fef3c7' : 'white', color: val?.tipo === 'clase' ? '#92400e' : '#555', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            📚 Clase
                          </button>
                        )}
                        <button onClick={() => val?.tipo === 'guardia' ? limpiarHora(hora.id) : setHoraTipo(hora.id, 'guardia')}
                          style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${val?.tipo === 'guardia' ? '#93c5fd' : '#e0e0e0'}`, backgroundColor: val?.tipo === 'guardia' ? '#dbeafe' : 'white', color: val?.tipo === 'guardia' ? '#1e40af' : '#555', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          🛡️ Guardia
                        </button>
                        {!esRecreo && (
                          <button onClick={() => val?.tipo === 'complementaria' ? limpiarHora(hora.id) : setHoraTipo(hora.id, 'complementaria')}
                            style={{ padding: '5px 12px', borderRadius: 7, border: `1.5px solid ${val?.tipo === 'complementaria' ? '#a78bfa' : '#e0e0e0'}`, backgroundColor: val?.tipo === 'complementaria' ? '#ede9fe' : 'white', color: val?.tipo === 'complementaria' ? '#6d28d9' : '#555', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            📋 Complementaria
                          </button>
                        )}
                      </div>
                      {val && <button onClick={() => limpiarHora(hora.id)} style={{ background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}>✕</button>}
                    </div>

                    {/* SELECTOR DE GRUPO */}
                    {esEditando && val && (
                      <div style={{ padding: '12px 14px', backgroundColor: '#f8f8f8', borderTop: '1px solid #eee' }}>
                        {!etapaSeleccionada ? (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#666', marginBottom: 8 }}>Selecciona la etapa:</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {Object.keys(ETAPAS).filter(e => val.tipo === 'guardia' ? e === 'GUARDIA' : e !== 'GUARDIA').map(etapa => (
                                <button key={etapa} onClick={() => setEtapaSeleccionada(etapa)} style={{ padding: '6px 14px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: azul }}>
                                  {etapa}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <button onClick={() => setEtapaSeleccionada('')} style={{ fontSize: 12, color: '#888', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8 }}>← Cambiar etapa</button>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {ETAPAS[etapaSeleccionada].map(g => (
                                <button key={g} onClick={() => setGrupo(hora.id, g)} style={{ padding: '6px 12px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: 'white', cursor: 'pointer', fontSize: 12, color: '#333', fontWeight: 500 }}>
                                  {g}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* GRUPO SELECCIONADO + TAREA */}
                    {val && val.grupo && !esEditando && (
                      <div style={{ padding: '10px 14px', borderTop: '1px solid #eee', backgroundColor: '#fafafa' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: val.tipo === 'clase' ? 10 : 0 }}>
                          <span style={{ fontSize: 12, backgroundColor: '#e0e7ff', color: '#3730a3', padding: '3px 10px', borderRadius: 20, fontWeight: 700 }}>{val.grupo}</span>
                          <button onClick={() => { setHoraEditando(hora.id); setEtapaSeleccionada(''); }} style={{ fontSize: 11, color: '#888', background: 'none', border: 'none', cursor: 'pointer' }}>Cambiar</button>
                        </div>

                        {/* TAREA (solo para clase) */}
                        {val.tipo === 'clase' && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: rojo, marginBottom: 6 }}>📝 Tarea para el alumnado * (obligatoria)</div>
                            <textarea value={val.instrucciones || ''} onChange={e => setInstrucciones(hora.id, e.target.value)} placeholder="Ej: Página 45, ejercicios 1-5. Copiar en el cuaderno..." rows={2} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: `1.5px solid ${!val.instrucciones?.trim() && !val.archivo ? '#fca5a5' : '#ddd'}`, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }} />
                            {!val.archivoNombre ? (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, border: '2px dashed #fbbf24', backgroundColor: '#fffbeb', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                <span style={{ fontSize: 18 }}>📎</span>
                                <span>Adjuntar archivo (examen, ficha, PDF...)</span>
                                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => { if (e.target.files[0]) setArchivoHora(hora.id, e.target.files[0]); }} style={{ display: 'none' }} />
                              </label>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', backgroundColor: '#d1fae5', borderRadius: 7 }}>
                                <span>✅</span>
                                <span style={{ fontSize: 12, color: verde, fontWeight: 600, flex: 1 }}>📎 {val.archivoNombre}</span>
                                <button onClick={() => setArchivoHora(hora.id, null)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>✕</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* GRUPO SIN SELECCIONAR AÚN */}
                    {val && !val.grupo && !esEditando && (
                      <div style={{ padding: '8px 14px', borderTop: '1px solid #eee', fontSize: 12, color: '#888' }}>
                        <button onClick={() => { setHoraEditando(hora.id); setEtapaSeleccionada(val.tipo === 'guardia' ? 'GUARDIA' : ''); }} style={{ color: '#1e40af', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>
                          + Seleccionar grupo →
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              )}

              {/* ===== AUSENCIA CORTA: horario hora por hora ===== */}
              {gruposUnicos.length === 0 && (
                <div style={{ marginBottom: 20 }}>

              </div>
              )}

            {/* ENLACE MANUAL */}
            {gruposUnicos.length === 0 && Object.values(horario).some(h => h.precargado) && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <button onClick={() => setHorario({})} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                  ¿Tu horario no es correcto? Rellenar manualmente
                </button>
              </div>
            )}

            {/* BOTÓN ENVIAR */}
            <button onClick={enviar} disabled={enviando} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', backgroundColor: '#7c2d12', color: 'white', fontWeight: 800, fontSize: 15, cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
              {enviando ? '⏳ Enviando...' : '🏥 Notificar ausencia'}
            </button>
          </div>
        )}

        {/* ===== HISTORIAL ===== */}
        {vista === 'historial' && (
          <div>
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
            ) : historial.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🏥</div>
                <div>No has notificado ninguna ausencia</div>
              </div>
            ) : historial.map(a => {
              const est = ESTADOS[a.estado] || ESTADOS.pendiente;
              const dias = diasParaJustificar(a.created_at);
              const horas = Array.isArray(a.horas) ? a.horas : [];
              const horasClase = horas.filter(h => h.tipo === 'clase');
              return (
                <div key={a.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${est.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>
                        {a.fecha_inicio === a.fecha_fin
                          ? new Date(a.fecha_inicio + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
                          : `${new Date(a.fecha_inicio + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} — ${new Date(a.fecha_fin + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {a.tipo === 'prevista' ? '📆 Prevista' : '🚨 Imprevista'} · {horas.length} hora{horas.length !== 1 ? 's' : ''} afectada{horas.length !== 1 ? 's' : ''}
                      </div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{a.motivo}</div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 20, backgroundColor: est.bg, color: est.color, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{est.emoji} {est.label}</span>
                  </div>

                  {/* Horas */}
                  {horas.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {horas.map((h, i) => (
                        <div key={i} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 20, backgroundColor: h.tipo === 'clase' ? '#fef3c7' : h.tipo === 'guardia' ? '#dbeafe' : '#ede9fe', color: h.tipo === 'clase' ? '#92400e' : h.tipo === 'guardia' ? '#1e40af' : '#6d28d9', fontWeight: 600 }}>
                            {h.hora} · {h.grupo || h.tipo}
                          </div>
                          {/* Mostrar tarea e instrucciones para horas de clase */}
                          {h.tipo === 'clase' && (h.instrucciones || h.archivo_url) && (
                            <div style={{ marginTop: 4, marginLeft: 8, padding: '6px 10px', backgroundColor: '#fffbeb', borderRadius: 7, border: '1px solid #fcd34d', fontSize: 12 }}>
                              {h.instrucciones && <div style={{ color: '#92400e', marginBottom: h.archivo_url ? 4 : 0 }}>📝 {h.instrucciones}</div>}
                              {h.archivo_url && (
                                <a href={h.archivo_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#1e40af', fontWeight: 600, textDecoration: 'none' }}>
                                  📎 Ver archivo adjunto
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Aviso justificación */}
                  {a.estado === 'pendiente' && (
                    <div style={{ marginTop: 10 }}>
                      {dias > 0 ? (
                        <div style={{ fontSize: 12, color: dias <= 1 ? rojo : '#92400e', backgroundColor: dias <= 1 ? '#fee2e2' : '#fef3c7', padding: '6px 12px', borderRadius: 7, marginBottom: 8 }}>
                          ⏰ Te quedan <strong>{dias} día{dias !== 1 ? 's' : ''}</strong> para justificar esta ausencia
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: rojo, backgroundColor: '#fee2e2', padding: '6px 12px', borderRadius: 7, marginBottom: 8 }}>
                          ❌ Plazo de justificación vencido
                        </div>
                      )}
                      <button onClick={() => { setAusenciaJustificando(a); setJustTexto(''); setJustArchivo(null); setJustArchNombre(''); }} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        📄 Justificar ausencia
                      </button>
                    </div>
                  )}

                  {/* Ya justificada */}
                  {a.estado === 'justificada' && (a.justificacion_texto || a.justificacion_url) && (
                    <div style={{ marginTop: 10, padding: '8px 12px', backgroundColor: verdeClaro, borderRadius: 8, fontSize: 13 }}>
                      <strong>Justificación:</strong> {a.justificacion_texto}
                      {a.justificacion_url && <a href={a.justificacion_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: verde, fontWeight: 600 }}>📎 Ver documento</a>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL JUSTIFICACIÓN */}
      {ausenciaJustificando && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={e => e.target === e.currentTarget && setAusenciaJustificando(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: azul }}>📄 Justificar ausencia</div>
              <button onClick={() => setAusenciaJustificando(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
              {new Date(ausenciaJustificando.fecha_inicio + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} · {ausenciaJustificando.motivo}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: azul, display: 'block', marginBottom: 6 }}>📝 Explicación</label>
              <textarea value={justTexto} onChange={e => setJustTexto(e.target.value)} placeholder="Explica el motivo justificado de tu ausencia..." rows={4} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              {!justArchNombre ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, border: '2px dashed #93c5fd', backgroundColor: '#f0f7ff', color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <span style={{ fontSize: 20 }}>📎</span>
                  <span>Adjuntar documento justificante</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { const f = e.target.files[0]; if (f) { setJustArchivo(f); setJustArchNombre(f.name); }}} style={{ display: 'none' }} />
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: '#d1fae5', borderRadius: 8 }}>
                  <span>✅</span>
                  <span style={{ fontSize: 13, color: verde, fontWeight: 600, flex: 1 }}>📎 {justArchNombre}</span>
                  <button onClick={() => { setJustArchivo(null); setJustArchNombre(''); }} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>✕</button>
                </div>
              )}
            </div>
            <button onClick={justificar} disabled={enviandoJust} style={{ width: '100%', padding: 13, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 800, fontSize: 15, cursor: enviandoJust ? 'not-allowed' : 'pointer', opacity: enviandoJust ? 0.7 : 1 }}>
              {enviandoJust ? '⏳ Enviando...' : '✅ Enviar justificación'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
