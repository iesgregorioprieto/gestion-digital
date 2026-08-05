'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import ResolverDiaDLD from '@/components/ResolverDiaDLD';
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEMANA = ['L','M','X','J','V','S','D'];
const azul = '#1a3a6b';
const verde = '#1e6b2e';

function etiquetaTipoDLD(tipo) {
  if (tipo === 'no_lectivo') return '🌙 Moscoso no lectivo';
  if (tipo === '1_lectivo') return '📚 1º Moscoso lectivo';
  if (tipo === '2_lectivo') return '📖 2º Moscoso lectivo';
  if (tipo === '3_lectivo') return '📗 3º Moscoso lectivo';
  if (tipo === 'canoso') return '🦳 Canoso (+55 años o +18 años servicio)';
  return tipo;
}

// Calcular días DLD según normativa 07/07/2026
function calcularDiasDLD(tipoContrato, antiguedadCuerpo) {
  const tieneDerechoCanoso = (antiguedadCuerpo || 0) >= 18;
  let moscosos = 0;
  if (tipoContrato === 'Funcionario de carrera' || tipoContrato === 'Interino con vacante') {
    moscosos = 3;
  } else if (tipoContrato === 'Interino sin vacante') {
    moscosos = 2;
  } else {
    moscosos = 1;
  }
  return { moscosos, canosos: tieneDerechoCanoso ? 1 : 0, tieneDerechoCanoso };
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
  const colores = {
    rojo:     { bg: '#fef2f2', border: '#fca5a5', color: '#b91c1c' },
    amarillo: { bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
    verde:    { bg: '#f0fdf4', border: '#86efac', color: '#166534' },
    info:     { bg: '#eff6ff', border: '#93c5fd', color: '#1d4ed8' },
  };

  return (
    <>
      {alertas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#1e3a5f', marginBottom: 8, fontSize: 15 }}>🔔 Alertas y avisos</div>
          {alertas.map((a, i) => {
            const c = colores[a.tipo] || colores.info;
            return (
              <div key={i} style={{ fontSize: 13, color: c.color, marginBottom: 6, padding: '8px 12px', backgroundColor: c.bg, borderRadius: 8, border: `1px solid ${c.border}` }}>
                {a.texto}
              </div>
            );
          })}
        </div>
      )}
      {prelacion && prelacion.length > 0 && (
        <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8, fontSize: 15 }}>📊 Prelación ese día — Criterios normativa 07/07/2026</div>
          <div style={{ fontSize: 11, color: '#92400e', marginBottom: 10, fontStyle: 'italic' }}>
            Orden: a) Causa sobrevenida → b) Menos días usados → c) Mayor antigüedad en centro → d) Mayor antigüedad en cuerpo
          </div>
          {prelacion.map((p, i) => (
            <div key={i} style={{
              fontSize: 13, color: '#555', marginBottom: 8, padding: '10px 12px',
              backgroundColor: p.esPrincipal ? '#fef3c7' : 'white',
              borderRadius: 8, border: p.esPrincipal ? '2px solid #f59e0b' : '1px solid #e5e7eb',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <span style={{ fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: p.esPrincipal ? '#78350f' : '#1e293b', marginBottom: 3 }}>
                  {p.nombre} {p.esPrincipal && <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 800 }}>← ESTA SOLICITUD</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {p.causa_sobrevenida && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}>⚠️ Causa sobrevenida</span>
                  )}
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#f3f4f6', color: '#555' }}>
                    {p.dias_disfrutados} días usados
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#f3f4f6', color: '#555' }}>
                    {p.antiguedad_centro}a en centro
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#f3f4f6', color: '#555' }}>
                    {p.antiguedad_cuerpo}a en cuerpo
                  </span>
                  {p.tipo_contrato && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#dbeafe', color: '#1e40af' }}>
                      {p.tipo_contrato}
                    </span>
                  )}
                  {p.tipo_dld && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, backgroundColor: '#f0fdf4', color: '#166534' }}>
                      {p.tipo_dld === 'canoso' ? '🦳 Canoso' : p.tipo_dld.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
export default function PanelDirector() {
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [revocando, setRevocando] = useState(null);   // solicitud a revocar
  const [motivoRevoca, setMotivoRevoca] = useState('');
  const [todasSolicitudes, setTodasSolicitudes] = useState([]);
  const [totalProfesores, setTotalProfesores] = useState(150); // Se carga dinámicamente de la BD
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
    const [{ data }, { data: profData, count }] = await Promise.all([
      getSupabase().from('dld').select('*').order('created_at', { ascending: false }),
      getSupabase().from('profesores').select('id, titular_id', { count: 'exact' }).eq('estado', 'activo'),
    ]);
    setTodasSolicitudes(data || []);
    // Contar profesores activos excluyendo sustitutos (sustituto + titular = 1, según petición del director)
    if (profData) {
      const sustitutos = profData.filter(p => p.titular_id).length;
      setTotalProfesores(profData.length - sustitutos);
    } else if (count) {
      setTotalProfesores(count);
    }
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

  // Total profesores activos — cargado dinámicamente de la BD
  const TOTAL_PROFESORES = totalProfesores;

  function calcularAlertas(solicitud) {
    const alertas = [];
    const fecha = solicitud.fecha_solicitada;
    const grupos = Array.isArray(solicitud.grupos_afectados) ? solicitud.grupos_afectados : [];

    // Solicitudes ese mismo día (excluir rechazadas y canceladas)
    const mismaFecha = todasSolicitudes.filter(s =>
      s.id !== solicitud.id && s.fecha_solicitada === fecha &&
      s.estado !== 'rechazada' && s.estado !== 'cancelada'
    );

    // === LÍMITE DE PROFESORES POR DÍA (Resolución 18/07/2024 — punto 9) ===
    const esNoLectivo = solicitud.tipo_dld === 'no_lectivo';
    
    // Lectivos: según tamaño del centro
    // Hasta 20 prof → 1 | 21-40 → 2 | 41-60 → 3 | +60 → 4
    const maxLectivo = TOTAL_PROFESORES > 60 ? 4 : TOTAL_PROFESORES > 40 ? 3 : TOTAL_PROFESORES > 20 ? 2 : 1;
    
    // No lectivos: no más de 1/3 de la plantilla
    const maxNoLectivo = Math.floor(TOTAL_PROFESORES / 3);
    
    const maxPermitidos = esNoLectivo ? maxNoLectivo : maxLectivo;
    
    const aprobadosEseDia = todasSolicitudes.filter(s =>
      s.id !== solicitud.id && s.fecha_solicitada === fecha && s.estado === 'aprobada'
    ).length;
    const porcentajeOcupacion = Math.round(((aprobadosEseDia + 1) / TOTAL_PROFESORES) * 100);

    if (esNoLectivo) {
      alertas.push({ tipo: 'info', texto: `ℹ️ Período NO LECTIVO — límite: 1/3 de plantilla = ${maxNoLectivo} prof. (${aprobadosEseDia} aprobados hoy)` });
    } else {
      alertas.push({ tipo: 'info', texto: `ℹ️ Período LECTIVO — límite: ${maxLectivo} prof/día para centro de ${TOTAL_PROFESORES} prof. (${aprobadosEseDia} aprobados hoy)` });
    }

    if (aprobadosEseDia >= maxPermitidos) {
      alertas.push({ tipo: 'rojo', texto: `🔴 LÍMITE ALCANZADO: ${aprobadosEseDia}/${maxPermitidos} ese día. Solo conceder por causas excepcionales (punto 9 resolución).` });
      // Detectar quién sería desplazado (el último aprobado por prelación)
      if (esNoLectivo) {
        const aprobadosOrdenados = todasSolicitudes
          .filter(s => s.id !== solicitud.id && s.fecha_solicitada === fecha && s.estado === 'aprobada')
          .sort((a, b) => {
            // Prelación: mayor antigüedad cuerpo > mayor antigüedad centro
            if ((a.antiguedad_cuerpo || 0) !== (b.antiguedad_cuerpo || 0)) return (a.antiguedad_cuerpo || 0) - (b.antiguedad_cuerpo || 0);
            return (a.antiguedad_centro || 0) - (b.antiguedad_centro || 0);
          });
        if (aprobadosOrdenados.length > 0) {
          const desplazable = aprobadosOrdenados[0];
          alertas.push({ tipo: 'rojo', texto: `⚠️ DESPLAZAMIENTO: Si se aprueba, podría desplazar a ${desplazable.profesor_nombre} (antigüedad cuerpo: ${desplazable.antiguedad_cuerpo || '—'}, centro: ${desplazable.antiguedad_centro || '—'}).` });
        }
      }
    } else if (aprobadosEseDia === maxPermitidos - 1) {
      alertas.push({ tipo: 'amarillo', texto: `🟡 CUPO CASI LLENO: ${aprobadosEseDia}/${maxPermitidos} aprobados ese día. Si se aprueba esta solicitud, se alcanza el límite.` });
    }

    // % de profesores ese día
    alertas.push({ tipo: 'info', texto: `📊 Con esta solicitud: ${aprobadosEseDia + 1} prof. ausentes ese día (${porcentajeOcupacion}% del claustro)` });

    // Otras solicitudes pendientes ese día
    if (mismaFecha.filter(s => s.estado === 'pendiente').length > 0) {
      alertas.push({ tipo: 'amarillo', texto: `🟡 Hay ${mismaFecha.filter(s => s.estado === 'pendiente').length} solicitud(es) más pendientes ese mismo día` });
    }

    // === CONFLICTO POR GRUPO ===
    // Dos profesores nunca coinciden a la misma hora en el mismo grupo.
    // El problema real es ACUMULATIVO: si entre varios permisos el grupo
    // se queda sin profesor en muchas o todas sus horas del día.
    grupos.forEach(g => {
      const nombreGrupo = typeof g === 'object' ? g.grupo : g;
      const nombreNorm = normalizarGrupo(nombreGrupo);
      if (!nombreNorm) return;
      const horasEste = horasDeGrupo(g);

      // Recopilar TODAS las horas que ese grupo perdería ese día (esta solicitud + las demás)
      const horasPerdidasAprobadas = [];
      const horasPerdidasPendientes = [];

      mismaFecha.forEach(s => {
        const otrosGrupos = Array.isArray(s.grupos_afectados) ? s.grupos_afectados : [];
        otrosGrupos.forEach(og => {
          const otroNombre = typeof og === 'object' ? og.grupo : og;
          if (normalizarGrupo(otroNombre) !== nombreNorm) return;
          const otrasHoras = horasDeGrupo(og);
          if (s.estado === 'aprobada') {
            otrasHoras.forEach(h => { if (!horasPerdidasAprobadas.includes(h)) horasPerdidasAprobadas.push(h); });
          } else if (s.estado === 'pendiente') {
            otrasHoras.forEach(h => { if (!horasPerdidasPendientes.includes(h)) horasPerdidasPendientes.push(h); });
          }
        });
      });

      const ordenarHoras = arr => arr.slice().sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));

      // Total de horas sin profesor si se aprueba esta solicitud
      const totalSinProfesor = [...new Set([...horasEste, ...horasPerdidasAprobadas])];

      if (horasPerdidasAprobadas.length > 0) {
        alertas.push({
          tipo: 'rojo',
          texto: `🔴 GRUPO ${nombreGrupo} SE QUEDA SIN CLASE: ya hay otro permiso aprobado que cubre ${ordenarHoras(horasPerdidasAprobadas).join(', ')}. Si apruebas esta (${ordenarHoras(horasEste).join(', ')}), el grupo perdería ${totalSinProfesor.length} hora(s) del día: ${ordenarHoras(totalSinProfesor).join(', ')}.`
        });
      }

      if (horasPerdidasPendientes.length > 0) {
        const totalPotencial = [...new Set([...horasEste, ...horasPerdidasAprobadas, ...horasPerdidasPendientes])];
        alertas.push({
          tipo: 'amarillo',
          texto: `🟡 GRUPO ${nombreGrupo}: hay otra(s) solicitud(es) pendiente(s) que afectan a ${ordenarHoras(horasPerdidasPendientes).join(', ')}. Si se aprobaran todas, el grupo perdería ${totalPotencial.length} hora(s): ${ordenarHoras(totalPotencial).join(', ')}. Valora conceder solo una.`
        });
      }
    });

    // Días disfrutados vs derecho
    const { moscosos: maxMoscosos, canosos: maxCanosos } = calcularDiasDLD(solicitud.tipo_contrato, solicitud.antiguedad_cuerpo);
    const totalMax = maxMoscosos + maxCanosos;
    const diasDisfrutados = todasSolicitudes.filter(s =>
      s.profesor_id === solicitud.profesor_id && s.id !== solicitud.id && s.estado === 'aprobada'
    ).length;
    const esCanoso = solicitud.tipo_dld === 'canoso';
    const canososDisfrutados = todasSolicitudes.filter(s =>
      s.profesor_id === solicitud.profesor_id && s.id !== solicitud.id && s.estado === 'aprobada' && s.tipo_dld === 'canoso'
    ).length;

    if (esCanoso && maxCanosos === 0) {
      alertas.push({ tipo: 'rojo', texto: '🔴 NO tiene derecho al CANOSO (menos de 18 años de servicio)' });
    } else if (esCanoso && canososDisfrutados >= maxCanosos) {
      alertas.push({ tipo: 'rojo', texto: `🔴 Ya ha disfrutado el CANOSO este curso` });
    } else if (diasDisfrutados >= totalMax) {
      alertas.push({ tipo: 'rojo', texto: `🔴 Ya ha agotado todos sus días (${diasDisfrutados}/${totalMax})` });
    } else {
      alertas.push({ tipo: 'info', texto: `ℹ️ Ha usado ${diasDisfrutados} de ${totalMax} días este curso` });
    }

    // === CONFLICTO POR DEPARTAMENTO (mismo día, mismo departamento) ===
    const mismoDepto = mismaFecha.filter(s =>
      s.departamento && solicitud.departamento &&
      s.departamento.toUpperCase().trim() === solicitud.departamento.toUpperCase().trim()
    );
    if (mismoDepto.length > 0) {
      const aprobadosDepto = mismoDepto.filter(s => s.estado === 'aprobada').length;
      const pendientesDepto = mismoDepto.filter(s => s.estado === 'pendiente').length;
      const total = aprobadosDepto + pendientesDepto;
      alertas.push({
        tipo: 'info',
        texto: `ℹ️ Departamento ${solicitud.departamento}: ${total} docente(s) más con solicitud ese día (${aprobadosDepto} aprobada(s), ${pendientesDepto} pendiente(s)). Revisa arriba si afecta a los mismos grupos.`
      });
    }

    // Causa sobrevenida
    if (solicitud.causa_sobrevenida) {
      alertas.push({ tipo: 'verde', texto: `✅ CAUSA SOBREVENIDA: tiene prioridad máxima en prelación (art. 12 Resolución)` });
    }

    return alertas;
  }

  // Genera el texto de motivación del rechazo según normativa (anonimizado)
  function generarMotivoAutomatico(solicitud) {
    const fecha = solicitud.fecha_solicitada;
    const maxLectivo = TOTAL_PROFESORES > 60 ? 4 : TOTAL_PROFESORES > 40 ? 3 : TOTAL_PROFESORES > 20 ? 2 : 1;
    const esNoLectivo = solicitud.tipo_dld === 'no_lectivo';
    const maxNoLectivo = Math.floor(TOTAL_PROFESORES / 3);
    const maxPermitidos = esNoLectivo ? maxNoLectivo : maxLectivo;

    const aprobadosEseDia = todasSolicitudes.filter(s =>
      s.id !== solicitud.id && s.fecha_solicitada === fecha && s.estado === 'aprobada'
    ).length;

    // Detectar grupos en conflicto (mismo grupo con permiso ya aprobado ese día)
    const gruposEste = Array.isArray(solicitud.grupos_afectados) ? solicitud.grupos_afectados : [];
    const gruposEnConflicto = [];
    gruposEste.forEach(g => {
      const nombreGrupo = typeof g === 'object' ? g.grupo : g;
      const nombreNorm = normalizarGrupo(nombreGrupo);
      if (!nombreNorm) return;
      const hayConflicto = todasSolicitudes.some(s =>
        s.id !== solicitud.id && s.fecha_solicitada === fecha && s.estado === 'aprobada' &&
        (Array.isArray(s.grupos_afectados) ? s.grupos_afectados : []).some(og => {
          const otroNombre = typeof og === 'object' ? og.grupo : og;
          return normalizarGrupo(otroNombre) === nombreNorm;
        })
      );
      if (hayConflicto && !gruposEnConflicto.includes(nombreGrupo)) gruposEnConflicto.push(nombreGrupo);
    });

    const motivos = [];

    if (aprobadosEseDia >= maxPermitidos) {
      motivos.push(`Se ha alcanzado el número máximo de permisos concedidos para ese día (${aprobadosEseDia} de ${maxPermitidos} permitidos según el punto 9 de la Resolución de 18/07/2024 para centros de más de 60 docentes).`);
    }

    if (gruposEnConflicto.length > 0) {
      motivos.push(`Ya se ha concedido permiso para esa fecha a otro docente que imparte en ${gruposEnConflicto.length === 1 ? 'el mismo grupo' : 'los mismos grupos'} (${gruposEnConflicto.join(', ')}). De autorizarse esta solicitud, dicho alumnado quedaría sin actividad lectiva durante la mayor parte o la totalidad de la jornada.`);
    }

    const diasDisfrutados = todasSolicitudes.filter(s =>
      s.profesor_id === solicitud.profesor_id && s.id !== solicitud.id && s.estado === 'aprobada'
    ).length;
    const { moscosos, canosos } = calcularDiasDLD(solicitud.tipo_contrato, solicitud.antiguedad_cuerpo);
    if (diasDisfrutados >= moscosos + canosos) {
      motivos.push(`Ha agotado los días de libre disposición que le corresponden en el presente curso escolar (${diasDisfrutados} de ${moscosos + canosos}).`);
    }

    if (solicitud.tipo_dld === 'canoso' && canosos === 0) {
      motivos.push(`No reúne los requisitos para el día adicional (CANOSO): se requiere tener más de 55 años o acreditar más de 18 años de servicio como funcionario docente.`);
    }

    if (motivos.length === 0) {
      motivos.push('Por causas organizativas excepcionales relacionadas con las necesidades del centro y la atención al alumnado.');
    }

    return motivos.join('\n\n') + '\n\nEsta resolución se dicta conforme a la Resolución de 07/07/2026 y la Resolución de 18/07/2024 de la Dirección General de Recursos Humanos.';
  }

  function calcularPrelacion(solicitud) {
    const mismaFecha = todasSolicitudes.filter(s =>
      s.id !== solicitud.id && s.fecha_solicitada === solicitud.fecha_solicitada && s.estado === 'pendiente'
    );
    if (!mismaFecha.length) return null;

    // Construir lista con TODOS los criterios de desempate (normativa 07/07/2026):
    // a) Causas sobrevenidas  b) Menos días disfrutados  c) Antigüedad en centro  d) Antigüedad en cuerpo
    const lista = [
      {
        nombre: solicitud.profesor_nombre,
        causa_sobrevenida: solicitud.causa_sobrevenida,
        tipo_dld: solicitud.tipo_dld,
        tipo_contrato: solicitud.tipo_contrato,
        dias_disfrutados: todasSolicitudes.filter(x => x.profesor_id === solicitud.profesor_id && x.estado === 'aprobada').length,
        antiguedad_centro: solicitud.antiguedad_centro || 0,
        antiguedad_cuerpo: solicitud.antiguedad_cuerpo || 0,
        esPrincipal: true,
      },
      ...mismaFecha.map(s => ({
        nombre: s.profesor_nombre,
        causa_sobrevenida: s.causa_sobrevenida,
        tipo_dld: s.tipo_dld,
        tipo_contrato: s.tipo_contrato,
        dias_disfrutados: todasSolicitudes.filter(x => x.profesor_id === s.profesor_id && x.estado === 'aprobada').length,
        antiguedad_centro: s.antiguedad_centro || 0,
        antiguedad_cuerpo: s.antiguedad_cuerpo || 0,
        esPrincipal: false,
      })),
    ];

    // Ordenar por prelación
    lista.sort((a, b) => {
      if (a.causa_sobrevenida !== b.causa_sobrevenida) return b.causa_sobrevenida ? 1 : -1;
      if (a.dias_disfrutados !== b.dias_disfrutados) return a.dias_disfrutados - b.dias_disfrutados;
      if (a.antiguedad_centro !== b.antiguedad_centro) return b.antiguedad_centro - a.antiguedad_centro;
      return b.antiguedad_cuerpo - a.antiguedad_cuerpo;
    });

    return lista;
  }

  async function aprobar(id) {
    setProcesando(true);
    await getSupabase().from('dld').update({ estado: 'aprobada', resuelto_at: new Date().toISOString(), resuelto_por: nombreUsuario }).eq('id', id);
    mostrarMensaje('✅ Solicitud aprobada', 'ok');

    // Email al profesor aprobado
    try {
      const rows = await getSupabase().from('dld').select('profesor_id,fecha_solicitada,tipo_dld').eq('id', id);
      const sol = (rows.data || [])[0];
      if (sol) {
        const pRows = await getSupabase().from('profesores').select('nombre,apellidos,email').eq('id', sol.profesor_id);
        const prof = (pRows.data || [])[0];
        if (prof?.email) {
          await fetch('/api/enviar-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'dld_aprobada', datos: { nombre: prof.nombre + ' ' + prof.apellidos, email: prof.email, fecha_solicitada: sol.fecha_solicitada, tipo_dld: sol.tipo_dld } })
          });
        }
        // Push al profesor
        try {
          await fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accion: 'enviar',
              profesor_id: sol.profesor_id,
              titulo: '✅ DLD aprobado',
              cuerpo: `Tu solicitud para el ${sol.fecha_solicitada} ha sido aprobada.`,
              url: '/dld',
            }),
          });
        } catch(e) { console.error('Push DLD aprobada:', e); }

        // Comprobar si esta aprobación desplaza a alguien (no lectivos, límite 1/3)
        const fecha = sol.fecha_solicitada;
        const aprobadosHoy = todasSolicitudes.filter(s =>
          s.id !== id && s.fecha_solicitada === fecha && s.estado === 'aprobada'
        );
        const maxNoLectivo = Math.floor(totalProfesores / 3);
        if (sol.tipo_dld === 'no_lectivo' && aprobadosHoy.length >= maxNoLectivo) {
          // Buscar al desplazable (menor prelación)
          const ordenados = aprobadosHoy.sort((a, b) => {
            if ((a.antiguedad_cuerpo || 0) !== (b.antiguedad_cuerpo || 0)) return (a.antiguedad_cuerpo || 0) - (b.antiguedad_cuerpo || 0);
            return (a.antiguedad_centro || 0) - (b.antiguedad_centro || 0);
          });
          const desplazado = ordenados[0];
          if (desplazado) {
            // Revocar DLD del desplazado
            await getSupabase().from('dld').update({
              estado: 'rechazada',
              resuelto_at: new Date().toISOString(),
              resuelto_por: nombreUsuario,
              motivo_rechazo: `Desplazado por ${prof.nombre} ${prof.apellidos} (mayor prelación según normativa).`
            }).eq('id', desplazado.id);

            // Email al desplazado
            const dRows = await getSupabase().from('profesores').select('nombre,apellidos,email').eq('id', desplazado.profesor_id);
            const profDesplazado = (dRows.data || [])[0];
            if (profDesplazado?.email) {
              await fetch('/api/enviar-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tipo: 'dld_rechazada',
                  datos: {
                    nombre: profDesplazado.nombre + ' ' + profDesplazado.apellidos,
                    email: profDesplazado.email,
                    fecha_solicitada: fecha,
                    motivo_rechazo: 'Tu DLD ha sido revocado porque otro compañero/a con mayor prelación ha solicitado el mismo día. Puedes consultar los detalles en el portal.'
                  }
                })
              });
            }
            // Push al desplazado
            try {
              await fetch('/api/push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  accion: 'enviar',
                  profesor_id: desplazado.profesor_id,
                  titulo: '⚠️ DLD revocado',
                  cuerpo: `Tu DLD del ${fecha} ha sido revocado por prelación. Consulta el portal.`,
                  url: '/dld',
                }),
              });
            } catch(e) { console.error('Push DLD revocada:', e); }
          }
        }
      }
    } catch(e) { console.error('Email DLD aprobada:', e); }
    setSolicitudAbierta(null);
    cargarSolicitudes();
    setProcesando(false);
  }

  async function rechazar(id) {
    if (!motivoRechazo.trim()) { alert('Debes indicar el motivo del rechazo'); return; }
    setProcesando(true);
    await getSupabase().from('dld').update({ estado: 'rechazada', resuelto_at: new Date().toISOString(), resuelto_por: nombreUsuario, motivo_rechazo: motivoRechazo }).eq('id', id);
    mostrarMensaje('❌ Solicitud rechazada', 'error');
    // Email al profesor
    try {
      const rows = await getSupabase().from('dld').select('profesor_id,fecha_solicitada').eq('id', id);
      const sol = (rows.data || [])[0];
      if (sol) {
        const pRows = await getSupabase().from('profesores').select('nombre,apellidos,email').eq('id', sol.profesor_id);
        const prof = (pRows.data || [])[0];
        if (prof?.email) {
          await fetch('/api/enviar-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: 'dld_rechazada', datos: { nombre: prof.nombre + ' ' + prof.apellidos, email: prof.email, fecha_solicitada: sol.fecha_solicitada, motivo_rechazo: motivoRechazo } })
          });
        }
        // Push al profesor
        try {
          await fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accion: 'enviar',
              profesor_id: sol.profesor_id,
              titulo: '❌ DLD denegado',
              cuerpo: `Tu solicitud para el ${sol.fecha_solicitada} no ha sido aprobada. Consulta el motivo en el portal.`,
              url: '/dld',
            }),
          });
        } catch(e) { console.error('Push DLD rechazada:', e); }
      }
    } catch(e) { console.error('Email DLD rechazada:', e); }
    setSolicitudAbierta(null);
    setMotivoRechazo('');
    cargarSolicitudes();
    setProcesando(false);
  }

  // Revocar un DLD ya concedido, dejando constancia del motivo
  async function revocar() {
    if (!revocando) return;
    if (!motivoRevoca.trim()) { mostrarMensaje('Indica el motivo de la revocación', 'error'); return; }

    setProcesando(true);
    const s = revocando;

    const motivoCompleto =
      `REVOCACIÓN DE PERMISO YA CONCEDIDO. ${motivoRevoca.trim()}` +
      `\n\nConforme al punto 11 de la Resolución de 18/07/2024, la Dirección puede revocar ` +
      `un permiso concedido cuando concurran necesidades sobrevenidas del servicio.`;

    await getSupabase().from('dld').update({
      estado: 'rechazada',
      motivo_rechazo: motivoCompleto,
      resuelto_at: new Date().toISOString(),
      resuelto_por: nombreUsuario,
    }).eq('id', s.id);

    mostrarMensaje('⚠️ Permiso revocado', 'ok');

    // Avisar al profesor por email
    try {
      const rows = await getSupabase().from('profesores').select('nombre,apellidos,email').eq('id', s.profesor_id);
      const prof = (rows.data || [])[0];
      if (prof?.email) {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'dld_rechazada', datos: {
            nombre: prof.nombre + ' ' + prof.apellidos,
            email: prof.email,
            fecha_solicitada: s.fecha_solicitada,
            motivo_rechazo: motivoCompleto,
          }})
        });
      }
    } catch(e) { console.error('Email revocacion:', e); }

    // Notificación push
    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'enviar',
          profesor_id: s.profesor_id,
          titulo: '⚠️ DLD revocado',
          cuerpo: `Tu permiso del ${s.fecha_solicitada} ha sido revocado. Consulta el motivo en el portal.`,
          url: '/dld',
        }),
      });
    } catch(e) { console.error('Push revocacion:', e); }

    setRevocando(null);
    setMotivoRevoca('');
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
          <button onClick={() => setVista('resolver')} style={{ padding: '10px 20px', borderRadius: 10, border: `1.5px solid ${vista === 'resolver' ? verde : '#ddd'}`, backgroundColor: vista === 'resolver' ? verde : 'white', color: vista === 'resolver' ? 'white' : '#555', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>⚖️ Resolver día</button>
        </div>

        {/* RESOLVER DÍA COMPLETO */}
        {vista === 'resolver' && (
          <div style={{ marginBottom: 24 }}>
            <ResolverDiaDLD
              totalProfesores={totalProfesores}
              nombreUsuario={nombreUsuario}
              onTerminado={cargarSolicitudes}
            />
          </div>
        )}

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
                          {s.estado === 'aprobada' && (
                            <button onClick={() => { setRevocando(s); setMotivoRevoca(''); }} disabled={procesando} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #fbbf24', backgroundColor: '#fffbeb', color: '#b45309', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>⚠️ Revocar</button>
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
                      {s.estado === 'aprobada' && (
                        <button onClick={() => { setRevocando(s); setMotivoRevoca(''); }} disabled={procesando} style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fbbf24', backgroundColor: '#fffbeb', color: '#b45309', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>⚠️ Revocar permiso</button>
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
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 16 }}>{solicitudAbierta.profesor_nombre} ha solicitado el {new Date(solicitudAbierta.fecha_solicitada).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} como {etiquetaTipoDLD(solicitudAbierta.tipo_dld)}.</div>
            </div>
            
            <AlertasPanel alertas={calcularAlertas(solicitudAbierta)} prelacion={calcularPrelacion(solicitudAbierta)} />
            
            <details style={{ marginBottom: 20 }}>
              <summary style={{ fontSize: 14, color: '#3b82f6', cursor: 'pointer' }}>Ver detalles</summary>
              <div style={{ marginTop: 10, fontSize: 13, color: '#374151' }}>
                <div><strong>Tipo de DLD:</strong> {etiquetaTipoDLD(solicitudAbierta.tipo_dld)}</div>
                <div><strong>Fecha:</strong> {new Date(solicitudAbierta.fecha_solicitada).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                {solicitudAbierta.causa_sobrevenida && (
                  <div style={{ marginTop: 8, padding: 10, backgroundColor: '#fffbeb', borderRadius: 8 }}>
                    ⚠️ <strong>Causa sobrevenida:</strong> {solicitudAbierta.descripcion_causa || 'Sin descripción'}
                  </div>  
                )}
              </div>
            </details>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>Motivo de rechazo (obligatorio si rechazas)</label>
                <button
                  onClick={() => setMotivoRechazo(generarMotivoAutomatico(solicitudAbierta))}
                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #93c5fd', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  ✨ Generar motivo según normativa
                </button>
              </div>
              <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} placeholder="Indica el motivo del rechazo según la normativa, o pulsa el botón para generarlo automáticamente..." rows={5} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                ℹ️ El motivo se le mostrará al profesor. No se incluyen nombres de otros compañeros (anonimizado).
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => aprobar(solicitudAbierta.id)} disabled={procesando} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', backgroundColor: '#065f46', color: 'white', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15 }}>✅ Aprobar</button>
              <button onClick={() => rechazar(solicitudAbierta.id)} disabled={procesando} style={{ flex: 1, padding: 13, borderRadius: 10, border: 'none', backgroundColor: '#b91c1c', color: 'white', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15 }}>❌ Rechazar</button>
              <button onClick={() => eliminar(solicitudAbierta.id)} disabled={procesando} style={{ padding: '13px 16px', borderRadius: 10, border: '1.5px solid #fca5a5', backgroundColor: '#fff5f5', color: '#b91c1c', fontWeight: 700, cursor: procesando ? 'not-allowed' : 'pointer', fontSize: 15 }}>🗑️</button>
            </div>
          </div>
        </div>
      )}

      {/* ═════════ MODAL REVOCAR PERMISO CONCEDIDO ═════════ */}
      {revocando && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, zIndex: 10000,
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: 14, padding: 26,
            maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>⚠️</div>
            <h3 style={{ color: '#b45309', textAlign: 'center', margin: '0 0 8px', fontSize: 19 }}>
              Revocar permiso concedido
            </h3>
            <p style={{ color: '#666', fontSize: 13.5, textAlign: 'center', lineHeight: 1.6, margin: '0 0 18px' }}>
              Vas a revocar un DLD ya aprobado de<br />
              <strong style={{ color: '#333' }}>{revocando.profesor_nombre}</strong> para el
              <strong style={{ color: '#333' }}> {revocando.fecha_solicitada}</strong>.
            </p>

            <div style={{
              backgroundColor: '#fffbeb', border: '1px solid #fde68a', color: '#78350f',
              borderRadius: 10, padding: '12px 16px', fontSize: 12.5, lineHeight: 1.6, marginBottom: 16,
            }}>
              El profesor recibirá un correo y una notificación con el motivo que escribas.
              La solicitud quedará registrada como rechazada, conservando el historial.
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#555', marginBottom: 6 }}>
              Motivo de la revocación *
            </label>
            <textarea
              value={motivoRevoca}
              onChange={e => setMotivoRevoca(e.target.value)}
              placeholder="Ej: Necesidades sobrevenidas del servicio por ausencia imprevista de otros compañeros ese día."
              rows={4}
              style={{
                width: '100%', padding: '11px 13px', borderRadius: 8,
                border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box',
                fontFamily: 'system-ui, sans-serif', resize: 'vertical', marginBottom: 8,
              }}
            />

            <div style={{ fontSize: 11.5, color: '#999', marginBottom: 16, lineHeight: 1.5 }}>
              Se añadirá automáticamente la referencia al punto 11 de la Resolución de 18/07/2024.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={revocar}
                disabled={procesando}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                  backgroundColor: '#b45309', color: 'white', fontWeight: 700, fontSize: 14,
                  cursor: procesando ? 'not-allowed' : 'pointer', opacity: procesando ? 0.7 : 1,
                }}
              >
                {procesando ? '⏳ Revocando...' : '⚠️ Revocar permiso'}
              </button>
              <button
                onClick={() => { setRevocando(null); setMotivoRevoca(''); }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  border: '1.5px solid #ddd', backgroundColor: 'white',
                  color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

  function generarMotivoAutomatico(solicitud) {
    const alertas = calcularAlertas(solicitud);
    const prelacion = calcularPrelacion(solicitud);

    if (alertas.some(a => a.tipo === 'rojo')) {
      return 'Tu solicitud no puede ser aprobada porque se supera el límite diario permitido por la normativa vigente.';
    }
    
    if (prelacion.length > 1 && prelacion[0].esPrincipal === false) {
      return 'Tu solicitud no puede ser aprobada porque hay compañeros con mayor prelación según los criterios de la normativa (art. 2.3): mayor antigüedad en el cuerpo, mayor antigüedad en el centro, y menor número de días disfrutados en lo que va de curso.';
    }
    
    const mismoGrupo = alertas.find(a => a.texto.includes('mismo grupo'));
    if (mismoGrupo) {
      return 'Tu solicitud no puede ser aprobada porque ya hay una ausencia de otro profesor en uno de los grupos a los que das clase ese día, y la normativa no permite más de una ausencia simultánea por grupo (art. 3.5).';
    }
    
    return 'Tu solicitud no puede ser aprobada en este momento por no cumplir con los requisitos de la normativa vigente sobre Días de Libre Disposición.';
  }
