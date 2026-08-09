'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getConfigCurso, esDiaLectivo, calcularAntiguedad, limiteDLD } from '@/lib/curso';
import CalendarioDLD from '@/components/CalendarioDLD';
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
  'ESO': {
    label: 'ESO', emoji: '📚',
    cursos: { 'ESO-1AM': null, 'ESO-1AZ': null, 'ESO-1NA': null, 'ESO-1VE': null, 'ESO-2AM': null, 'ESO-2AZ': null, 'ESO-2VE': null, 'ESO-3AM': null, 'ESO-3AZ': null, 'ESO-3DIV': null, 'ESO-3NA': null, 'ESO-3VE': null, 'ESO-4AM': null, 'ESO-4AZ': null, 'ESO-4VE': null },
  },
  'BTO': {
    label: 'Bachillerato', emoji: '🎓',
    cursos: { 'BTO-1CT': null, 'BTO-1HCS': null, 'BTO-2A': null, 'BTO-2B': null },
  },
  'GB': {
    label: 'FP Básica', emoji: '🔧',
    cursos: { 'GB-1CR': null, 'GB-1EE': null, 'GB-1MV': null, 'GB-1SC': null, 'GB-2CR': null, 'GB-2EE': null, 'GB-2MV': null, 'GB-2SC': null },
  },
  'GM': {
    label: 'Grado Medio', emoji: '🏭',
    cursos: { 'GM-1ACC': null, 'GM-1AOV': null, 'GM-1CAR': null, 'GM-1COC': null, 'GM-1EVA.A': null, 'GM-1EVA.B': null, 'GM-1GAD': null, 'GM-1IEA': null, 'GM-1ITE': null, 'GM-1SMR.A': null, 'GM-1SMR.B': null, 'GM-2ACC': null, 'GM-2AOV': null, 'GM-2CAR': null, 'GM-2COC': null, 'GM-2EVA': null, 'GM-2GAD': null, 'GM-2IEA': null, 'GM-2ITE': null, 'GM-2SMR.A': null, 'GM-2SMR.B': null },
  },
  'GS': {
    label: 'Grado Superior', emoji: '🏛️',
    cursos: { 'GS-1AAD': null, 'GS-1AFI': null, 'GS-1ASIR': null, 'GS-1AUT': null, 'GS-1DAM': null, 'GS-1DAW': null, 'GS-1DDC': null, 'GS-1GVEC': null, 'GS-1SEA': null, 'GS-1STI': null, 'GS-1TLO': null, 'GS-1VIT': null, 'GS-2AFI': null, 'GS-2ASIR': null, 'GS-2AUT': null, 'GS-2DAM': null, 'GS-2DAW': null, 'GS-2DDC': null, 'GS-2GVEC': null, 'GS-2SEA': null, 'GS-2STI': null, 'GS-2TLO': null, 'GS-2VITI': null },
  },
  'CA': {
    label: 'Cursos Espec.', emoji: '📋',
    cursos: { 'CA-CFGS-A': null, 'CA-CFGS-B': null, 'CA-CFGS-C': null },
  },
  'FPPE': {
    label: 'FP Permanente', emoji: '🌿',
    cursos: { 'FPPE-1JAR': null, 'FPPE-2JAR': null },
  },
  'GUARDIA': {
    label: 'Guardia', emoji: '🛡️',
    cursos: { 'Cuadrante general': null, 'Familias profesionales': null, 'Guardia de recreo': null, 'Otras situaciones': null },
  },
};
// =========================================================
// NORMATIVA DLD — Resolución 07/07/2026 (curso 26/27)
// =========================================================
const TIPOS_DLD = [
  { valor: 'no_lectivo',  emoji: '🌙', label: 'Moscoso en período no lectivo' },
  { valor: '1_lectivo',   emoji: '📚', label: '1º Moscoso en período lectivo' },
  { valor: '2_lectivo',   emoji: '📖', label: '2º Moscoso en período lectivo' },
  { valor: '3_lectivo',   emoji: '📗', label: '3º Moscoso en período lectivo' },
  { valor: 'canoso',      emoji: '🦳', label: 'CANOSO (+55 años o +18 años servicio)' },
];

// Días según tipo de contrato (Resolución 07/07/2026)
function calcularDiasDLD(tipoContrato, antiguedadCuerpo) {
  const tieneDerechoCanoso = antiguedadCuerpo >= 18;
  let moscosos = 0;
  if (tipoContrato === 'Funcionario de carrera' || tipoContrato === 'Interino con vacante') {
    moscosos = 3;
  } else if (tipoContrato === 'Interino sin vacante') {
    // Depende de meses trabajados — ponemos 2 como base (8+ meses)
    moscosos = 2;
  } else {
    moscosos = 1;
  }
  const canosos = tieneDerechoCanoso ? 1 : 0;
  return { moscosos, canosos, total: moscosos + canosos, tieneDerechoCanoso };
}

export default function DLD() {
  const [vista, setVista] = useState('historial'); // 'historial' | 'nueva'
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [antiguedadCentro, setAntiguedadCentro] = useState(0);
  const [antiguedadCuerpo, setAntiguedadCuerpo] = useState(0);
  const [departamento, setDepartamento] = useState('');
  const [misSolicitudes, setMisSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [esDirectivo, setEsDirectivo] = useState(false); // 🔑 aviso panel dirección

  // horario[horaId] = { tipo: 'clase'|'guardia'|'libre', grupo: '' }
  const [horario, setHorario] = useState({});
  const [infoDia, setInfoDia] = useState({ lectivo: true, motivo: null });
  const [horaEditando, setHoraEditando] = useState(null);
  const [etapaSeleccionada, setEtapaSeleccionada] = useState('');
  const [textoOtro, setTextoOtro] = useState('');
  const [nombrePdf, setNombrePdf] = useState('');
  const [cargandoHorario, setCargandoHorario] = useState(false);
  const DIAS_SEMANA = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

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
    const rolGestion = sessionStorage.getItem('profesor_rol_gestion') || '';
    setEsDirectivo(['secretario', 'director', 'jefe_estudios'].includes(rolGestion));
    setProfesorId(id);
    setProfesorNombre(nombre || '');
    cargarDatos(id);
  }, []);

  async function cargarDatos(id) {
    setCargando(true);
    const { data: profRows } = await getSupabase().from('profesores').select('tipo_contrato, antiguedad_centro, antiguedad_cuerpo, anio_centro, anio_cuerpo, departamento').eq('id', id);
    const prof = profRows?.[0];
    if (prof) {
      setTipoContrato(prof.tipo_contrato || '');
      setDepartamento(prof.departamento || '');
      // La antigüedad se calcula desde el año de incorporación (si lo tiene);
      // si no, se usa el valor antiguo en años.
      const cfg = await getConfigCurso();
      setAntiguedadCentro(calcularAntiguedad(prof.anio_centro, prof.antiguedad_centro, cfg));
      setAntiguedadCuerpo(calcularAntiguedad(prof.anio_cuerpo, prof.antiguedad_cuerpo, cfg));
    }
    const { data: sols } = await getSupabase().from('dld').select('*').eq('profesor_id', id).order('created_at', { ascending: false });
    setMisSolicitudes(sols || []);
    setCargando(false);
  }

  function diasCorrespondientes() {
    const { total } = calcularDiasDLD(tipoContrato, antiguedadCuerpo);
    return total;
  }

  function tieneDerecho(tipoDld) {
    const { moscosos, tieneDerechoCanoso } = calcularDiasDLD(tipoContrato, antiguedadCuerpo);
    if (tipoDld === 'canoso') return tieneDerechoCanoso;
    // 3º moscoso solo para carrera/vacante
    if (tipoDld === '3_lectivo') return tipoContrato === 'Funcionario de carrera' || tipoContrato === 'Interino con vacante';
    // 2º moscoso: carrera/vacante y sin vacante con 8+ meses
    if (tipoDld === '2_lectivo') return tipoContrato !== '';
    return true;
  }

  const diasAprobados = misSolicitudes.filter(s => s.estado === 'aprobada').length;
  const { moscosos: maxMoscosos, canosos: maxCanosos, tieneDerechoCanoso } = calcularDiasDLD(tipoContrato, antiguedadCuerpo);
  const canososUsados = misSolicitudes.filter(s => s.estado === 'aprobada' && s.tipo_dld === 'canoso').length;
  const moscososUsados = diasAprobados - canososUsados;
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

  async function cargarHorarioDelDia(fecha) {
    if (!fecha) return;
    const diaSemana = DIAS_SEMANA[new Date(fecha + 'T12:00:00').getDay()];
    if (!diaSemana || diaSemana === 'sabado' || diaSemana === 'domingo') {
      setError('⚠️ La fecha seleccionada es fin de semana. Elige un día lectivo.');
      return;
    }
    setCargandoHorario(true);
    setError('');
    let nPdf = nombrePdf;
    if (!nPdf) {
      const id = sessionStorage.getItem('profesor_id');
      const { data: rows0 } = await getSupabase().from('profesores').select('nombre, apellidos').eq('id', id);
      if (rows0?.[0]) {
        const { nombre, apellidos } = rows0[0];
        // Usar función SQL unaccent para ignorar acentos
        const { data: fnResult } = await getSupabase()
          .rpc('buscar_profesor_horario', { p_nombre: nombre.split(' ')[0], p_apellido: apellidos.split(' ')[0] });
        if (fnResult) {
          nPdf = fnResult;
          setNombrePdf(nPdf);
        }
      }
    }
    if (!nPdf) {
      setError('ℹ️ No se encontró tu horario en la base de datos. Rellena el horario manualmente abajo.');
      setCargandoHorario(false);
      return;
    }
    const { data: horas } = await getSupabase().from('horarios_profesores').select('hora_id, tipo, grupo, materia').eq('profesor_nombre_pdf', nPdf).eq('dia', diaSemana).eq('curso_academico', '2025-2026');
    if (horas?.length > 0) {
      const nuevoHorario = {};
      horas.forEach(h => { 
        // Normalizar hora_id: "1a" → "1", "2a" → "2", etc.
        const horaIdNorm = h.hora_id.replace(/a$/, '').replace(/ª$/, '');
        nuevoHorario[horaIdNorm] = { tipo: h.tipo === 'complementaria' ? 'guardia' : h.tipo, grupo: h.grupo || '', materia: h.materia || '', instrucciones: '', archivo: null, archivoNombre: '', precargado: true }; 
      });
      setHorario(nuevoHorario);
      setError('');
    } else {
      setError(`ℹ️ No se encontró horario para el ${diaSemana}. Rellena manualmente abajo.`);
    }
    setCargandoHorario(false);
  }

  function construirGruposAfectados(horarioParam) {
    const h = horarioParam || horario;
    const grupos = {};
    Object.entries(h).forEach(([horaId, val]) => {
      if (val.tipo === 'clase' && val.grupo) {
        if (!grupos[val.grupo]) grupos[val.grupo] = [];
        const hora = HORAS.find(hr => hr.id === horaId);
        if (hora) grupos[val.grupo].push({ hora: hora.label, instrucciones: val.instrucciones || '', archivoUrl: val.archivoUrl || '', archivoNombre: val.archivoNombre || '' });
      }
    });
    return Object.entries(grupos).map(([grupo, horas]) => ({ grupo, horas }));
  }

  // Construye el campo 'horas' con el mismo formato que usa el módulo de ausencias,
  // para que el cuadrante de guardias pueda leer los DLD igual que las ausencias.
  function construirHorasCuadrante(horarioParam) {
    const h = horarioParam || horario;
    const filas = [];
    Object.entries(h).forEach(([horaId, val]) => {
      if (!val || !val.tipo) return;
      const hora = HORAS.find(x => x.id === horaId);
      if (!hora) return;
      filas.push({
        hora: hora.label,
        tipo: val.tipo,
        grupo: val.grupo || null,
        materia: val.materia || null,
        aula: val.aula || null,
        instrucciones: val.instrucciones?.trim() || null,
        archivo_url: val.archivoUrl || null,
        archivo_nombre: val.archivoNombre || null,
      });
    });
    return filas;
  }

  function construirGuardiasHorario(horarioParam) {
    const h = horarioParam || horario;
    const guardias = [];
    Object.entries(h).forEach(([horaId, val]) => {
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

    // Validar tareas obligatorias en horas de clase (solo en días lectivos)
    const horasClaseSinTarea = !infoDia.lectivo ? [] : Object.entries(horario)
      .filter(([_, v]) => v.tipo === 'clase' && v.grupo && !v.instrucciones?.trim() && !v.archivoNombre);
    if (horasClaseSinTarea.length > 0) {
      const labels = horasClaseSinTarea.map(([id]) => HORAS.find(h => h.id === id)?.label || id).join(', ');
      setError(`⚠️ Faltan tareas en: ${labels}. Es obligatorio dejar tarea para cada grupo (normativa DLD).`);
      return;
    }

    // Avisar si ese día ya está al límite.
    // El límite sale del mismo sitio que usa el equipo directivo (lib/curso),
    // para que profesor y director vean siempre el mismo número.
    try {
      const { data: aprobados } = await getSupabase().from('dld')
        .select('id')
        .eq('fecha_solicitada', form.fecha_solicitada)
        .eq('estado', 'aprobada');

      const cfg = await getConfigCurso();
      const { limite, esLectivo } = limiteDLD(form.fecha_solicitada, cfg, form.tipo_dld);
      const numAprobados = (aprobados || []).length;

      if (numAprobados >= limite) {
        const continuar = confirm(
          `⚠️ AVISO: ya hay ${numAprobados} DLD concedidos para esa fecha.\n\n` +
          `El límite del centro para un día ${esLectivo ? 'lectivo' : 'no lectivo'} es de ${limite} profesores.\n\n` +
          `Puedes enviar la solicitud igualmente, pero es probable que se deniegue ` +
          `salvo que tengas mayor prelación o causa sobrevenida.\n\n` +
          `¿Quieres continuar?`
        );
        if (!continuar) return;
      }
    } catch(e) { console.error('Error comprobando cupo DLD:', e); }

    setEnviando(true);
    try {
      // 📎 SUBIR ARCHIVOS ADJUNTOS al Storage
      const horarioConUrls = { ...horario };
      for (const [horaId, val] of Object.entries(horarioConUrls)) {
        if (val.archivo instanceof File) {
          const ext = val.archivo.name.split('.').pop();
          const nombreArchivo = `dld_${profesorId}_${Date.now()}_${horaId}.${ext}`;
          const { data: uploadData, error: uploadError } = await getSupabase().storage
            .from('dld-archivos')
            .upload(nombreArchivo, val.archivo);
          if (uploadError) {
            setError(`⚠️ Error al subir el archivo de ${horaId}: ${uploadError.message}`);
            setEnviando(false);
            return;
          }
          const { data: urlData } = getSupabase().storage.from('dld-archivos').getPublicUrl(nombreArchivo);
          horarioConUrls[horaId] = {
            ...val,
            archivo: null, // no guardar el File en la BD
            archivoUrl: urlData.publicUrl,
            archivoNombre: val.archivoNombre,
          };
        }
      }
      const gruposAfectados = construirGruposAfectados(horarioConUrls);
      const guardiasHorario = construirGuardiasHorario(horarioConUrls);
      const horasCuadrante = construirHorasCuadrante(horarioConUrls);
      const { error: err } = await getSupabase().from('dld').insert([{
        profesor_id: profesorId,
        profesor_nombre: profesorNombre,
        tipo_contrato: tipoContrato,
        tipo_dld: form.tipo_dld,
        fecha_solicitada: form.fecha_solicitada,
        grupos_afectados: gruposAfectados,
        guardias_horario: guardiasHorario,
        horas: horasCuadrante,
        tipo_guardia: form.tipo_guardia,
        causa_sobrevenida: form.causa_sobrevenida,
        descripcion_causa: form.descripcion_causa.trim(),
        estado: 'pendiente',
        antiguedad_centro: antiguedadCentro,
        antiguedad_cuerpo: antiguedadCuerpo,
        departamento: departamento,
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


  // El profesor puede retirar una solicitud que aún no se ha resuelto.
  // Importante: una pendiente olvidada ocupa plaza en el cupo del día
  // y puede impedir que un compañero pida ese día.
  async function cancelarSolicitud(s) {
    const fecha = new Date(s.fecha_solicitada + 'T12:00:00')
      .toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    if (!confirm(`¿Retirar tu solicitud del ${fecha}?\n\nEl día volverá a quedar libre para ti y para tus compañeros.`)) return;

    const { error } = await getSupabase()
      .from('dld')
      .update({
        estado: 'cancelada',
        resuelto_at: new Date().toISOString(),
        resuelto_por: 'Retirada por el solicitante',
      })
      .eq('id', s.id);

    if (error) { mostrarMensaje('No se pudo retirar: ' + error.message, 'error'); return; }
    mostrarMensaje('Solicitud retirada', 'ok');
    cargarSolicitudes();
  }

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

        {/* AVISO DIRECTIVO */}
        {esDirectivo && (
          <div style={{ padding: '10px 14px', borderRadius: 10, backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', color: '#1e3a5f', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>ℹ️ Aquí solicitas <strong>tus propios</strong> DLD. Para gestionar los del centro entra en el panel de dirección.</span>
            <button onClick={() => window.location.href = '/director'} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', backgroundColor: '#1e3a5f', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              👔 Ir a Gestión
            </button>
          </div>
        )}

        {/* RESUMEN DÍAS */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', borderLeft: `5px solid ${verde}` }}>
          <div style={{ fontWeight: 700, color: verde, fontSize: 15, marginBottom: 10 }}>📊 Mis días de libre disposición</div>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>{tipoContrato} → <strong>{diasCorrespondientes()} días</strong> correspondientes</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {/* MOSCOSOS */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>🌙 MOSCOSOS ({moscososUsados}/{maxMoscosos})</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {Array(maxMoscosos).fill(null).map((_, i) => (
                <div key={i} style={{ flex: 1, height: 10, borderRadius: 4, backgroundColor: i < moscososUsados ? verde : '#e0e0e0' }} />
              ))}
            </div>
          </div>
          {/* CANOSO */}
          {tieneDerechoCanoso && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>🦳 CANOSO ({canososUsados}/{maxCanosos})</div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {Array(maxCanosos).fill(null).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 10, borderRadius: 4, backgroundColor: i < canososUsados ? '#7c3aed' : '#e0e0e0' }} />
                ))}
              </div>
            </div>
          )}
          {!tieneDerechoCanoso && (
            <div style={{ fontSize: 11, color: '#bbb', marginBottom: 4 }}>
              🦳 CANOSO: No tienes derecho aún ({'<'}18 años de servicio)
            </div>
          )}
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => setVista('historial')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${vista === 'historial' ? verde : '#ddd'}`, backgroundColor: vista === 'historial' ? verde : 'white', color: vista === 'historial' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📋 Mis solicitudes
          </button>
          <button onClick={() => !sinDias && setVista('nueva')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${vista === 'nueva' ? verde : sinDias ? '#ddd' : '#ddd'}`, backgroundColor: vista === 'nueva' ? verde : sinDias ? '#f5f5f5' : 'white', color: vista === 'nueva' ? 'white' : sinDias ? '#bbb' : '#555', cursor: sinDias ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 13 }}>
            {sinDias ? '🚫 Sin días' : '+ Nueva solicitud'}
          </button>
          <button onClick={() => setVista('calendario')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${vista === 'calendario' ? verde : '#ddd'}`, backgroundColor: vista === 'calendario' ? verde : 'white', color: vista === 'calendario' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📆 Calendario
          </button>
          <button onClick={() => setVista('normativa')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1.5px solid ${vista === 'normativa' ? '#1d4ed8' : '#ddd'}`, backgroundColor: vista === 'normativa' ? '#1d4ed8' : 'white', color: vista === 'normativa' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            📖 Normativa
          </button>
        </div>

        {/* ═══ CALENDARIO DE CARGA ═══ */}
        {vista === 'calendario' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <CalendarioDLD
              profesorId={profesorId}
              onElegirFecha={fecha => {
                if (sinDias) return;
                setVista('nueva');
                setForm(f => ({ ...f, fecha_solicitada: fecha }));
                setHorario({});
                (async () => {
                  const cfg = await getConfigCurso();
                  const info = esDiaLectivo(fecha, cfg);
                  setInfoDia(info);
                  if (info.lectivo) cargarHorarioDelDia(fecha);
                })();
              }}
            />
          </div>
        )}

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
                      {s.tipo_dld === 'canoso' ? '🦳 CANOSO' :
                       s.tipo_dld === 'no_lectivo' ? '🌙 Moscoso no lectivo' :
                       s.tipo_dld === '1_lectivo' ? '📚 1º Moscoso lectivo' :
                       s.tipo_dld === '2_lectivo' ? '📖 2º Moscoso lectivo' :
                       s.tipo_dld === '3_lectivo' ? '📗 3º Moscoso lectivo' : s.tipo_dld}
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
                      <div style={{ marginTop: 10, backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#b91c1c', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          📋 RESOLUCIÓN DENEGATORIA
                        </div>
                        <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {s.motivo_rechazo}
                        </div>
                        {s.resuelto_por && (
                          <div style={{ fontSize: 10, color: '#991b1b', marginTop: 8, fontStyle: 'italic' }}>
                            Resuelto por {s.resuelto_por}
                            {s.resuelto_at && ' el ' + new Date(s.resuelto_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    )}
                    {s.estado === 'pendiente' && (
                      <button
                        onClick={() => cancelarSolicitud(s)}
                        style={{
                          marginTop: 12, padding: '8px 16px', borderRadius: 8,
                          border: '1.5px solid #d1d5db', backgroundColor: 'white',
                          color: '#6b7280', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
                        }}
                      >
                        🚫 Retirar solicitud
                      </button>
                    )}
                    {s.estado === 'aprobada' && (
                      <div style={{ marginTop: 10, backgroundColor: '#dcfce7', border: '1.5px solid #86efac', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                          ✅ PERMISO CONCEDIDO
                        </div>
                        {s.resuelto_por && (
                          <div style={{ fontSize: 10, color: '#166534', marginTop: 4, fontStyle: 'italic' }}>
                            Autorizado por {s.resuelto_por}
                            {s.resuelto_at && ' el ' + new Date(s.resuelto_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#166534', marginTop: 6 }}>
                          ℹ️ Recuerda entregar el plan de actividades a Jefatura de Estudios con antelación.
                        </div>
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
              <input type="date" value={form.fecha_solicitada} onChange={async e => {
                const fecha = e.target.value;
                setForm(f => ({ ...f, fecha_solicitada: fecha }));
                setHorario({});
                if (!fecha) { setInfoDia({ lectivo: true, motivo: null }); return; }

                // ¿Ese día hay clase? Si no, no hace falta horario ni tareas
                const cfg = await getConfigCurso();
                const info = esDiaLectivo(fecha, cfg);
                setInfoDia(info);

                if (info.lectivo) {
                  await new Promise(r => setTimeout(r, 50));
                  cargarHorarioDelDia(fecha);
                }
              }} style={{ ...inputEstilo, marginTop: 8 }} />

              {form.fecha_solicitada && !infoDia.lectivo && (
                <div style={{
                  marginTop: 10, padding: '12px 16px', borderRadius: 10,
                  backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0',
                  color: '#166534', fontSize: 13.5, lineHeight: 1.6,
                }}>
                  🌙 <strong>Día no lectivo{infoDia.motivo ? ` — ${infoDia.motivo}` : ''}.</strong><br />
                  No hay clases que cubrir, así que no tienes que indicar
                  horario ni dejar tareas.
                </div>
              )}
            </div>

            {/* HORARIO DEL DÍA — solo si ese día hay clase */}
            {infoDia.lectivo && (
            <>
            <div style={{ marginBottom: 24 }}>
              <label style={{ ...labelEstilo, fontSize: 15 }}>🕐 ¿Qué tienes en cada hora ese día?</label>

              {cargandoHorario && (
                <div style={{ padding: '10px 14px', backgroundColor: '#eff6ff', borderRadius: 8, fontSize: 13, color: '#1e40af', marginBottom: 10 }}>⏳ Cargando tu horario del día...</div>
              )}
              {!cargandoHorario && Object.values(horario).some(h => h.precargado) && (
                <div style={{ padding: '10px 14px', backgroundColor: '#d1fae5', borderRadius: 8, fontSize: 13, color: '#065f46', marginBottom: 10 }}>
                  ✅ Horario cargado automáticamente. Añade las tareas para cada clase.
                </div>
              )}

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

                    {/* TAREA OBLIGATORIA para horas de clase */}
                    {horario[hora.id]?.tipo === 'clase' && horario[hora.id]?.grupo && (
                      <div style={{ padding: '10px 14px', backgroundColor: '#fffbeb', border: '1.5px solid #fbbf24', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                          📝 Tarea para {horario[hora.id].grupo} <span style={{ color: '#ef4444' }}>* obligatoria</span>
                        </div>
                        <textarea
                          value={horario[hora.id].instrucciones || ''}
                          onChange={e => setHorario(h => ({ ...h, [hora.id]: { ...h[hora.id], instrucciones: e.target.value } }))}
                          placeholder="Ej: Página 45, ejercicios 1-5..."
                          rows={2}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: `1.5px solid ${!horario[hora.id].instrucciones?.trim() && !horario[hora.id].archivoNombre ? '#fca5a5' : '#ddd'}`, fontSize: 12, boxSizing: 'border-box', resize: 'vertical', marginBottom: 6 }}
                        />
                        {!horario[hora.id].archivoNombre ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 6, border: '2px dashed #fbbf24', backgroundColor: 'white', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                            <span>📎</span><span>Adjuntar archivo (examen, ficha...)</span>
                            <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => { const f = e.target.files[0]; if (f) setHorario(h => ({ ...h, [hora.id]: { ...h[hora.id], archivo: f, archivoNombre: f.name } })); }} style={{ display: 'none' }} />
                          </label>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', backgroundColor: '#d1fae5', borderRadius: 6 }}>
                            <span>✅</span>
                            <span style={{ fontSize: 12, color: '#065f46', fontWeight: 600, flex: 1 }}>📎 {horario[hora.id].archivoNombre}</span>
                            <button onClick={() => setHorario(h => ({ ...h, [hora.id]: { ...h[hora.id], archivo: null, archivoNombre: '' } }))} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>✕</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ENLACE MANUAL */}
            {Object.values(horario).some(h => h.precargado) && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <button onClick={() => setHorario({})} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                  ¿Tu horario no es correcto? Rellenar manualmente
                </button>
              </div>
            )}
            </>
            )}

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
      {/* ═══ NORMATIVA ═══ */}
        {vista === 'normativa' && (
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#333' }}>

            {/* FUENTES */}
            <div style={{ backgroundColor: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>📌 Fuentes oficiales</div>
              <div>• <strong>Resolución de 07/07/2026</strong>, DGRH — Regulación DLD personal docente no universitario (curso 26/27)</div>
              <div>• <strong>Resolución de 18/07/2024</strong>, DGRH — Regulación DLD (base)</div>
              <div style={{ marginTop: 4 }}>
                <a href="https://docm.jccm.es/docm/verArchivoHtml.do?ruta=2026/07/14/html/2026_5281.html&tipo=rutaDocm" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', fontSize: 11 }}>
                  → Ver Resolución 07/07/2026 en DOCM
                </a>
              </div>
            </div>

            {/* DÍAS A LOS QUE TIENES DERECHO */}
            <div style={{ backgroundColor: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: verde, fontSize: 15, marginBottom: 12 }}>🗓️ ¿A cuántos días tienes derecho? (curso 26/27)</div>
              
              {[
                {
                  tipo: 'Funcionario de carrera / Interino con vacante',
                  moscosos: 3, canoso: true,
                  nota: 'Un moscoso obligatoriamente en periodo no lectivo (1-5 sept. o 18-30 jun.). Los otros dos y el canoso pueden ser en cualquier momento.',
                  color: '#166534', bg: '#dcfce7', border: '#86efac',
                },
                {
                  tipo: 'Interino sin vacante (≥ 8 meses trabajados)',
                  moscosos: 2, canoso: true,
                  nota: 'Para el cómputo de 8 meses cuentan todos los contratos del curso (incluso parciales, festivos y fines de semana).',
                  color: '#1e40af', bg: '#dbeafe', border: '#93c5fd',
                },
                {
                  tipo: 'Interino sin vacante (≥ 87 días trabajados)',
                  moscosos: 1, canoso: true,
                  nota: 'Solo 1 moscoso, pero con derecho a canoso si cumples los requisitos.',
                  color: '#78350f', bg: '#fef3c7', border: '#fcd34d',
                },
                {
                  tipo: 'Interino sin vacante (< 87 días)',
                  moscosos: 0, canoso: true,
                  nota: 'Sin moscosos, pero con derecho a canoso si tienes +55 años o +18 años de servicio.',
                  color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db',
                },
              ].map((t, i) => (
                <div key={i} style={{ backgroundColor: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: t.color, fontSize: 13, marginBottom: 6 }}>{t.tipo}</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    {t.moscosos > 0 && (
                      <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, backgroundColor: 'white', border: `1px solid ${t.border}`, fontWeight: 700, color: t.color }}>
                        🌙 {t.moscosos} moscoso{t.moscosos > 1 ? 's' : ''}
                      </span>
                    )}
                    <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, backgroundColor: 'white', border: '1px solid #c4b5fd', fontWeight: 700, color: '#6d28d9' }}>
                      🦳 + 1 canoso (si +55 años o +18 años servicio)
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: t.color, opacity: 0.8 }}>ℹ️ {t.nota}</div>
                </div>
              ))}

              <div style={{ backgroundColor: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: 8, padding: '10px 14px', marginTop: 4 }}>
                <div style={{ fontWeight: 700, color: '#6d28d9', fontSize: 13, marginBottom: 4 }}>🦳 ¿Qué es el CANOSO? (novedad curso 26/27)</div>
                <div style={{ fontSize: 12, color: '#5b21b6' }}>
                  Un día adicional de libre disposición para quien cumpla <strong>al menos uno</strong> de estos requisitos:<br/>
                  • Tener <strong>más de 55 años</strong>, O<br/>
                  • Acreditar <strong>más de 18 años de servicio efectivo</strong> como funcionario docente no universitario.<br/>
                  <strong>Se puede disfrutar desde el momento en que se genera el derecho</strong> (no hay que esperar al curso siguiente).
                </div>
              </div>
            </div>

            {/* CUÁNDO SE PUEDE DISFRUTAR */}
            <div style={{ backgroundColor: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: verde, fontSize: 15, marginBottom: 10 }}>📅 ¿Cuándo se pueden disfrutar?</div>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontWeight: 700, color: '#166534' }}>✅ SÍ se puede:</span>
                <ul style={{ margin: '6px 0 0 16px', fontSize: 13 }}>
                  <li>Lunes, viernes, vísperas de festivos o después de festivos</li>
                  <li>En el mismo semestre (dos seguidos si quieres)</li>
                  <li>Prolongar fines de semana, vacaciones o constituir puentes</li>
                  <li>Varios moscosos en periodo no lectivo (novedad 26/27)</li>
                </ul>
              </div>
              <div>
                <span style={{ fontWeight: 700, color: '#b91c1c' }}>❌ NO se puede:</span>
                <ul style={{ margin: '6px 0 0 16px', fontSize: 13 }}>
                  <li>En periodo no lectivo cuando haya jornada de asistencia obligatoria (claustro, evaluaciones...)</li>
                  <li>Acumular días de un curso para el siguiente</li>
                </ul>
              </div>
            </div>

            {/* PLAZOS */}
            <div style={{ backgroundColor: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: verde, fontSize: 15, marginBottom: 10 }}>⏱️ Plazos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { emoji: '📤', label: 'Solicitud', texto: 'Con antelación mínima de 2 días hábiles y máxima de 30 días hábiles.' },
                  { emoji: '📋', label: 'Plan de actividades', texto: 'Debes entregar a Jefatura las tareas para tus grupos con la debida antelación.' },
                  { emoji: '✅', label: 'Resolución del director', texto: 'Máximo 3 días hábiles desde la solicitud. Si es denegado, debe ser por escrito y motivado.' },
                  { emoji: '⚠️', label: 'Causas sobrevenidas', texto: 'En caso de enfermedad, hospitalización o fallecimiento de familiar (hasta 2º grado consanguinidad, 1º afinidad), los plazos se flexibilizan.' },
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: 8 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{item.emoji}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{item.label}</div>
                      <div style={{ fontSize: 12, color: '#555' }}>{item.texto}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* LÍMITES Y CONCESIÓN */}
            <div style={{ backgroundColor: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: verde, fontSize: 15, marginBottom: 10 }}>🏫 Límites de concesión en el centro</div>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                El director puede conceder como máximo al mismo tiempo:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {[
                  ['Días lectivos — Centro hasta 20 prof.', '1 permiso/día'],
                  ['Días lectivos — Centro 21-40 prof.', '2 permisos/día'],
                  ['Días lectivos — Centro 41-60 prof.', '3 permisos/día'],
                  ['Días lectivos — Centro +60 prof. (el nuestro)', '4 permisos/día'],
                  ['Días no lectivos (cualquier centro)', '1/3 de la plantilla'],
                ].map(([tipo, limite], i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 8,
                    backgroundColor: i === 3 ? '#dcfce7' : '#f9fafb',
                    border: i === 3 ? '1.5px solid #86efac' : '1px solid #e5e7eb',
                  }}>
                    <span style={{ fontSize: 12, color: i === 3 ? '#166534' : '#555', fontWeight: i === 3 ? 700 : 400 }}>{tipo}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: i === 3 ? '#166534' : '#374151' }}>{limite}</span>
                  </div>
                ))}
              </div>
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#78350f' }}>
                ⚠️ Estos límites <strong>pueden superarse de forma excepcional</strong> si el director aprecia que no afecta a la atención del alumnado. Y aunque no se superen los límites, <strong>el director puede denegar si hay causas organizativas excepcionales</strong>.
              </div>
            </div>

            {/* CRITERIOS DE DESEMPATE */}
            <div style={{ backgroundColor: 'white', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: verde, fontSize: 15, marginBottom: 10 }}>⚖️ Criterios de desempate (orden de prioridad)</div>
              <div style={{ fontSize: 13, color: '#555', marginBottom: 10 }}>
                Si hay más solicitudes de las permitidas para un día, el director aplica este orden:
              </div>
              {[
                { orden: 'a)', texto: 'Causas sobrevenidas (enfermedad, hospitalización, fallecimiento de familiar)', color: '#b91c1c', bg: '#fef2f2' },
                { orden: 'b)', texto: 'Haber disfrutado de menos días de permiso con anterioridad en el curso escolar', color: '#78350f', bg: '#fffbeb' },
                { orden: 'c)', texto: 'Mayor antigüedad en el centro del solicitante', color: '#065f46', bg: '#ecfdf5' },
                { orden: 'd)', texto: 'Mayor antigüedad en el cuerpo del solicitante', color: '#1e40af', bg: '#eff6ff' },
              ].map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', backgroundColor: c.bg, borderRadius: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 900, color: c.color, fontSize: 16, flexShrink: 0 }}>{c.orden}</span>
                  <span style={{ fontSize: 13, color: c.color }}>{c.texto}</span>
                </div>
              ))}
            </div>

            {/* REVOCACIÓN */}
            <div style={{ backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: 14, marginBottom: 6 }}>⚠️ El director puede revocar un permiso ya concedido</div>
              <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                Si surgen causas organizativas excepcionales y sobrevenidas relacionadas con el derecho a la educación del alumnado o las necesidades del centro, el permiso puede ser denegado o revocado aunque ya estuviera aprobado.
              </div>
            </div>

            {/* FOOTER LEGAL */}
            <div style={{ textAlign: 'center', fontSize: 11, color: '#aaa', padding: '12px 0', borderTop: '1px solid #e5e7eb' }}>
              Información basada en la <strong>Resolución 07/07/2026</strong> y <strong>Resolución 18/07/2024</strong> de la DGRH de Castilla-La Mancha.<br/>
              Fuente: <a href="https://educacion.fespugtclm.es/moscosos-y-canoso/" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8' }}>UGT Enseñanza CLM</a> · En caso de duda, consulta con la dirección del centro.
            </div>

          </div>
        )}

      </div>
    </div>
  );
}

const labelEstilo = { display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 };
const inputEstilo = { width: '100%', padding: '11px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none', fontFamily: 'system-ui, sans-serif' };