'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

const azul = '#1e3a5f';
const verde = '#1e6b2e';

const FAMILIAS = {
  'ESO': 'ESO', 'BTO': 'Bachillerato', 'GB': 'FP Básica',
  'GM': 'Grado Medio', 'GS': 'Grado Superior',
  'CA': 'Cursos Espec.', 'FPPE': 'FP Permanente',
};

function detectarFamilia(grupo) {
  if (!grupo) return null;
  const g = grupo.trim().toUpperCase();
  if (g.includes('MOD') || g.startsWith('2GM') || g.startsWith('PL-')) return null;
  for (const prefijo of Object.keys(FAMILIAS)) {
    if (g.startsWith(prefijo + '-') || g.startsWith(prefijo + ' ')) return prefijo;
  }
  return null;
}

const PASOS_INICIO_CURSO = [
  {
    num: 1,
    emoji: '📊',
    titulo: 'CSV de matrículas (Delphos)',
    desc: 'Exporta desde Delphos el listado de matrículas en formato CSV. Este archivo carga los grupos y alumnos del centro.',
    como: 'Delphos → Alumnado → Matrículas → Exportar CSV',
    tab: 'alumnos',
    color: '#1e40af',
    bg: '#dbeafe',
  },
  {
    num: 2,
    emoji: '🗂️',
    titulo: 'RAR de horarios del profesorado (Delphos)',
    desc: 'Exporta desde Delphos los horarios en formato HTML. Genera un documento índice y carpetas con los horarios de cada profesor.',
    como: 'Delphos → Horarios → Exportar → HTML indexado',
    tab: 'horarios',
    color: '#065f46',
    bg: '#d1fae5',
  },
];

export default function GestionDatos() {
  const [nombre, setNombre] = useState('');
  const [stats, setStats] = useState({ grupos: 0, alumnos: 0, horarios: 0, cursoActual: '' });
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [vistaTab, setVistaTab] = useState('guia');
  const [cursoNuevo, setCursoNuevo] = useState('2025-2026');
  const [procesando, setProcesando] = useState(false);

  // Alumnos
  const [previewAlumnos, setPreviewAlumnos] = useState([]);
  const [modalAlumnos, setModalAlumnos] = useState(false);
  const fileRefAlumnos = useRef(null);

  // Horarios
  const [previewHorarios, setPreviewHorarios] = useState(null);
  const [modalHorarios, setModalHorarios] = useState(false);
  const [progresoHorarios, setProgresoHorarios] = useState({ actual: 0, total: 0, mensaje: '' });
  const fileRefHorarios = useRef(null);

  // Profesorado
  const [previewProfesores, setPreviewProfesores] = useState([]);
  const [modalProfesores, setModalProfesores] = useState(false);
  const [progresoProfesores, setProgresoProfesores] = useState({ actual: 0, total: 0, mensaje: '' });
  const fileRefProfesores = useRef(null);
  const [statsProfesores, setStatsProfesores] = useState({ total: 0, nuevos: 0, actualizados: 0 });

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || (rol !== 'jefe_estudios' && rol !== 'secretario' && rol !== 'director')) {
      window.location.href = '/login'; return;
    }
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
    cargarStats();
  }, []);

  async function cargarStats() {
    setCargando(true);
    const [{ data: gs }, { data: als }, { data: hrs }] = await Promise.all([
      getSupabase().from('grupos').select('codigo, curso_academico').order('codigo'),
      getSupabase().from('alumnos').select('id, grupo'),
      getSupabase().from('horarios_profesores').select('id').limit(1),
    ]);
    const curso = gs?.[0]?.curso_academico || '—';
    setGrupos(gs || []);
    setStats({
      grupos: gs?.length || 0,
      alumnos: als?.length || 0,
      horarios: hrs?.length > 0 ? '✅' : '❌',
      cursoActual: curso,
    });
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 6000);
  }

  // ===== IMPORTAR ALUMNOS =====
  async function procesarCSVAlumnos(e) {
    const file = e.target.files[0];
    if (!file) return;
    setProcesando(true);
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder('iso-8859-1');
    const texto = decoder.decode(buffer);
    const sep = texto.includes(';') ? ';' : ',';
    const lineas = texto.split('\n').filter(l => l.trim());
    const cabecera = lineas[0].split(sep).map(c => c.trim().replace(/"/g, '').toUpperCase());
    const idx = {
      nombre: cabecera.findIndex(c => c === 'NOMBRE'),
      apellidos: cabecera.findIndex(c => c === 'APELLIDOS'),
      grupo: cabecera.findIndex(c => c === 'GRUPO'),
      numExp: cabecera.findIndex(c => c === 'NUM_EXP_CENTRO'),
    };
    if (idx.nombre === -1 || idx.apellidos === -1 || idx.grupo === -1) {
      mostrarMensaje('❌ El CSV debe tener columnas NOMBRE, APELLIDOS y GRUPO.', 'error');
      setProcesando(false); return;
    }
    const alumnosNuevos = [];
    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(sep).map(c => c.trim().replace(/"/g, ''));
      const grupo = cols[idx.grupo]?.trim();
      if (!detectarFamilia(grupo)) continue;
      alumnosNuevos.push({
        nombre: cols[idx.nombre] || '',
        apellidos: cols[idx.apellidos] || '',
        grupo,
        num_expediente: idx.numExp !== -1 ? cols[idx.numExp] : null,
        curso_academico: cursoNuevo,
      });
    }
    // También cargar grupos
    const gruposSet = new Set();
    alumnosNuevos.forEach(a => {
      const fam = detectarFamilia(a.grupo);
      if (fam) gruposSet.add(JSON.stringify({ codigo: a.grupo, familia: fam }));
    });
    const gruposNuevos = [...gruposSet].map(s => JSON.parse(s));

    setPreviewAlumnos({ alumnos: alumnosNuevos, grupos: gruposNuevos });
    setModalAlumnos(true);
    setProcesando(false);
    e.target.value = '';
  }

  async function confirmarAlumnos() {
    const { alumnos: alumnosNuevos, grupos: gruposNuevos } = previewAlumnos;
    setProcesando(true);

    // Borrar e insertar grupos
    await getSupabase().from('grupos').delete().eq('curso_academico', cursoNuevo);
    await getSupabase().from('grupos').insert(gruposNuevos.map(g => ({ ...g, curso_academico: cursoNuevo })));

    // Borrar e insertar alumnos en lotes
    await getSupabase().from('alumnos').delete().eq('curso_academico', cursoNuevo);
    const LOTE = 200;
    for (let i = 0; i < alumnosNuevos.length; i += LOTE) {
      const { error } = await getSupabase().from('alumnos').insert(alumnosNuevos.slice(i, i + LOTE));
      if (error) { mostrarMensaje('❌ Error: ' + error.message, 'error'); setProcesando(false); setModalAlumnos(false); return; }
    }
    setProcesando(false);
    setModalAlumnos(false);
    mostrarMensaje(`✅ ${alumnosNuevos.length} alumnos y ${gruposNuevos.length} grupos importados para ${cursoNuevo}`, 'ok');
    setPreviewAlumnos([]);
    cargarStats();
  }

  const gruposPorFamilia = grupos.reduce((acc, g) => {
    if (!acc[g.familia]) acc[g.familia] = [];
    acc[g.familia].push(g.codigo);
    return acc;
  }, {});

  // ═══════════════════════════════════════════════════════════════
  // PARSER HTML DE DELPHOS — Extrae horario de un profesor
  // ═══════════════════════════════════════════════════════════════
  
  // Mapeo hora inicio → hora_id de nuestra BD
  const MAPA_HORAS = {
    '8:30': '1a', '9:25': '2a', '10:20': '3a',
    '11:45': '4a', '12:40': '5a', '13:35': '6a',
    '14:30': '7a', // extraordinaria (poca gente)
    '16:00': 'tarde1', '16:55': 'tarde2', '17:50': 'tarde3',
    '19:00': 'noche1', '19:55': 'noche2', '20:50': 'noche3',
  };
  
  const DIAS_HTML = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

  function limpiarTexto(txt) {
    return (txt || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectarTipoHora(textoCelda) {
    if (!textoCelda || textoCelda.length === 0) return 'libre';
    const t = textoCelda.toUpperCase();
    if (t.startsWith('GUARDIA')) return 'guardia';
    if (t.includes('RECREO') || t.includes('MEDIOD')) return 'libre';
    if (t.startsWith('REUNI')) return 'complementaria';
    // Si tiene formato MATERIA-CODIGO<br>GRUPO<br>(aula) → clase
    if (t.match(/^[A-Z]+-?\d+/) || t.match(/[A-Z]{2,}/)) return 'clase';
    return 'complementaria';
  }

  function extraerGrupoYMateria(textoCelda) {
    // Formato típico: "DASP-3087251\nGM-1IEA\n(1 A032 ELE)"
    const partes = textoCelda.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    let materia = '', grupo = '';
    if (partes.length >= 2) {
      materia = partes[0].split('-')[0]; // "DASP-3087251" → "DASP"
      grupo = partes[1]; // "GM-1IEA"
    } else if (partes.length === 1) {
      grupo = partes[0];
    }
    return { grupo, materia };
  }

  async function procesarCarpetaHorarios(e) {
    const archivos = Array.from(e.target.files || []).filter(f => 
      f.name.toLowerCase().endsWith('.html') && 
      !f.name.toLowerCase().startsWith('index')
    );
    if (archivos.length === 0) {
      setMensaje({ tipo: 'error', texto: '❌ No se encontraron archivos HTML válidos en la carpeta' });
      return;
    }
    
    setProcesando(true);
    setProgresoHorarios({ actual: 0, total: archivos.length, mensaje: 'Iniciando análisis...' });
    
    const profesoresParseados = [];
    const errores = [];
    
    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      setProgresoHorarios({ actual: i + 1, total: archivos.length, mensaje: `Leyendo ${archivo.name}...` });
      
      try {
        // Leer como Latin-1 (Delphos usa ese encoding)
        const buffer = await archivo.arrayBuffer();
        const decoder = new TextDecoder('windows-1252');
        const html = decoder.decode(buffer);
        
        const resultado = parsearHTMLProfesor(html);
        if (resultado && resultado.nombre) {
          profesoresParseados.push(resultado);
        } else {
          errores.push(`${archivo.name}: no se pudo extraer datos`);
        }
      } catch (err) {
        errores.push(`${archivo.name}: ${err.message}`);
      }
    }
    
    // Contar totales
    const totalRegistros = profesoresParseados.reduce((sum, p) => sum + p.horas.length, 0);
    
    setPreviewHorarios({
      profesores: profesoresParseados,
      totalProfesores: profesoresParseados.length,
      totalRegistros,
      errores,
    });
    setModalHorarios(true);
    setProcesando(false);
    if (fileRefHorarios.current) fileRefHorarios.current.value = '';
  }

  function parsearHTMLProfesor(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 1. Extraer nombre del profesor (th colspan=6)
    const thNombre = doc.querySelector('th[colspan="6"]');
    if (!thNombre) return null;
    let nombreCompleto = limpiarTexto(thNombre.textContent);
    // Quitar abreviación entre paréntesis: "Castelo Cordoba, Enrique (Cas. C, E)" → "Castelo Cordoba, Enrique"
    nombreCompleto = nombreCompleto.replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (!nombreCompleto) return null;
    
    // 2. Extraer filas de horas (tr)
    const filas = Array.from(doc.querySelectorAll('tr'));
    const horas = [];
    
    // Matriz para tracking de rowspans: si celda[fila][col] está ocupada
    const ocupadas = {}; // key: "fila,col"
    
    filas.forEach((fila, filaIdx) => {
      // Buscar la hora en el th de esa fila
      const th = fila.querySelector('th');
      if (!th) return;
      const textoTh = limpiarTexto(th.textContent);
      // Formato hora: "8:309:25" o "8:30 9:25" (los <br> se juntan)
      const matchHora = textoTh.match(/(\d{1,2}:\d{2})/);
      if (!matchHora) return;
      const horaInicio = matchHora[1];
      const horaId = MAPA_HORAS[horaInicio];
      if (!horaId) return; // ignorar horas no reconocidas
      
      // Iterar celdas <td> de esa fila
      const celdas = Array.from(fila.querySelectorAll('td'));
      let colDia = 0; // índice de día (0=lunes, 4=viernes)
      let celdaIdx = 0;
      
      while (colDia < 5) {
        // Si esta columna está ocupada por un rowspan anterior, avanzar
        while (ocupadas[`${filaIdx},${colDia}`]) {
          const info = ocupadas[`${filaIdx},${colDia}`];
          // Añadir la hora del rowspan
          horas.push({
            hora_id: horaId,
            dia: DIAS_HTML[colDia],
            tipo: info.tipo,
            grupo: info.grupo,
            materia: info.materia,
          });
          colDia++;
          if (colDia >= 5) break;
        }
        if (colDia >= 5) break;
        
        const celda = celdas[celdaIdx];
        if (!celda) break;
        
        const colspan = parseInt(celda.getAttribute('colspan') || '1', 10);
        const rowspan = parseInt(celda.getAttribute('rowspan') || '1', 10);
        const textoCelda = limpiarTexto(celda.textContent);
        
        // Detectar tipo
        const tipo = detectarTipoHora(textoCelda);
        const { grupo, materia } = tipo === 'clase' ? extraerGrupoYMateria(textoCelda) : { grupo: '', materia: '' };
        
        // Añadir a las columnas que ocupa (colspan)
        for (let c = 0; c < colspan && colDia < 5; c++) {
          horas.push({
            hora_id: horaId,
            dia: DIAS_HTML[colDia],
            tipo,
            grupo,
            materia,
          });
          
          // Marcar ocupadas las filas siguientes por rowspan
          for (let r = 1; r < rowspan; r++) {
            ocupadas[`${filaIdx + r},${colDia}`] = { tipo, grupo, materia };
          }
          colDia++;
        }
        celdaIdx++;
      }
    });
    
    // Filtrar horas "libre" para no cargar la BD (solo guardamos ocupadas)
    const horasOcupadas = horas.filter(h => h.tipo !== 'libre' && (h.grupo || h.tipo === 'guardia' || h.tipo === 'complementaria'));
    
    return {
      nombre: nombreCompleto,
      horas: horasOcupadas,
    };
  }

  async function confirmarHorarios() {
    if (!previewHorarios) return;
    setProcesando(true);
    setProgresoHorarios({ actual: 0, total: previewHorarios.profesores.length, mensaje: 'Guardando...' });
    
    try {
      // 1. Borrar horarios del curso actual (para reemplazar)
      setProgresoHorarios(p => ({ ...p, mensaje: 'Borrando horarios anteriores...' }));
      await getSupabase().from('horarios_profesores').delete().eq('curso_academico', cursoNuevo);
      
      // 2. Insertar los nuevos en lotes de 500
      const registros = [];
      previewHorarios.profesores.forEach(prof => {
        prof.horas.forEach(h => {
          registros.push({
            profesor_nombre_pdf: prof.nombre,
            hora_id: h.hora_id,
            dia: h.dia,
            tipo: h.tipo,
            grupo: h.grupo || '',
            materia: h.materia || '',
            curso_academico: cursoNuevo,
          });
        });
      });
      
      const TAMANO_LOTE = 500;
      for (let i = 0; i < registros.length; i += TAMANO_LOTE) {
        const lote = registros.slice(i, i + TAMANO_LOTE);
        setProgresoHorarios({ 
          actual: Math.min(i + TAMANO_LOTE, registros.length), 
          total: registros.length, 
          mensaje: `Guardando registro ${i + 1}-${Math.min(i + TAMANO_LOTE, registros.length)} de ${registros.length}...` 
        });
        const { error } = await getSupabase().from('horarios_profesores').insert(lote);
        if (error) throw new Error(`Error en lote ${i}: ${error.message}`);
      }
      
      setMensaje({ tipo: 'ok', texto: `✅ ${previewHorarios.totalProfesores} profesores y ${registros.length} horas cargadas correctamente` });
      setModalHorarios(false);
      setPreviewHorarios(null);
      cargarStats();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: `❌ Error al guardar: ${err.message}` });
    }
    setProcesando(false);
  }

  // ═══════════════════════════════════════════════════════════════
  // PARSER CSV DE PROFESORES DE DELPHOS
  // ═══════════════════════════════════════════════════════════════
  
  function parsearLineaCSV(linea) {
    // Parser robusto que respeta comillas dobles
    const resultado = [];
    let campo = '';
    let dentroCom = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (c === '"') {
        if (dentroCom && linea[i+1] === '"') { campo += '"'; i++; }
        else { dentroCom = !dentroCom; }
      } else if (c === ',' && !dentroCom) {
        resultado.push(campo.trim());
        campo = '';
      } else {
        campo += c;
      }
    }
    resultado.push(campo.trim());
    return resultado;
  }

  async function procesarCSVProfesores(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setProcesando(true);
    const buffer = await archivo.arrayBuffer();
    const decoder = new TextDecoder('windows-1252');
    const texto = decoder.decode(buffer);
    const lineas = texto.split('\n').filter(l => l.trim());
    const datos = [];
    for (let i = 1; i < lineas.length; i++) {
      // Limpiar ;; al final y comillas externas
      const lineaLimpia = lineas[i].replace(/;;$/, '').replace(/;$/, '').trim();
      if (!lineaLimpia) continue;
      const partes = parsearLineaCSV(lineaLimpia);
      if (partes.length < 20) continue;
      const emailCorp = partes[20]?.replace(/"/g, '').replace(/;+$/, '').trim() || '';
      const apellidos = partes[1]?.replace(/"/g, '').trim() || '';
      const nombre = partes[2]?.replace(/"/g, '').trim() || '';
      const dni = partes[4]?.replace(/"/g, '').trim() || '';
      const departamento = partes[16]?.replace(/"/g, '').replace(/DEPARTAMENTO DE /g, '').trim() || '';
      if (!emailCorp || !apellidos || !nombre) continue;
      datos.push({ nombre, apellidos, email: emailCorp.toLowerCase(), email_corporativo: emailCorp.toLowerCase(), departamento, dni, autorizado: true });
    }

    // ═══ Comparar con BD actual ═══
    const { data: existentesBD } = await getSupabase()
      .from('profesores')
      .select('id, email, nombre, apellidos, autorizado, estado')
      .eq('autorizado', true);

    const emailsCSV = new Set(datos.map(d => d.email));
    const emailsBD = new Set((existentesBD || []).map(p => (p.email || '').toLowerCase()));

    const nuevos = datos.filter(d => !emailsBD.has(d.email));
    const seMantienen = datos.filter(d => emailsBD.has(d.email));
    const bajas = (existentesBD || []).filter(p => !emailsCSV.has((p.email || '').toLowerCase()));

    setPreviewProfesores({ nuevos, seMantienen, bajas, todos: datos });
    setModalProfesores(true);
    setProcesando(false);
    if (fileRefProfesores.current) fileRefProfesores.current.value = '';
  }

  async function confirmarProfesores() {
    if (!previewProfesores || !previewProfesores.todos) return;
    const { nuevos, bajas } = previewProfesores;
    const total = nuevos.length + bajas.length;
    if (total === 0) {
      setMensaje({ tipo: 'ok', texto: '✅ Sin cambios: el listado ya está sincronizado' });
      setModalProfesores(false);
      setPreviewProfesores([]);
      return;
    }
    setProcesando(true);
    setProgresoProfesores({ actual: 0, total, mensaje: 'Iniciando...' });
    let contadorNuevos = 0, contadorBajas = 0, procesados = 0;

    // ═══ Añadir nuevos ═══
    for (const prof of nuevos) {
      procesados++;
      setProgresoProfesores({ actual: procesados, total, mensaje: `Añadiendo ${prof.nombre} ${prof.apellidos}...` });
      const { error } = await getSupabase().from('profesores').insert({
        nombre: prof.nombre,
        apellidos: prof.apellidos,
        email: prof.email,
        email_corporativo: prof.email_corporativo,
        departamento: prof.departamento,
        autorizado: true,
        estado: 'pendiente',
        rol: ['profesor'],
        password_hash: '',
      });
      if (error) {
        console.error('Error insertando', prof.email, error.message);
      } else { contadorNuevos++; }
    }

    // ═══ Marcar bajas como inactivos ═══
    for (const prof of bajas) {
      procesados++;
      setProgresoProfesores({ actual: procesados, total, mensaje: `Dando de baja ${prof.nombre} ${prof.apellidos}...` });
      const { error } = await getSupabase().from('profesores').update({
        autorizado: false,
        estado: 'inactivo',
      }).eq('id', prof.id);
      if (error) {
        console.error('Error bajando', prof.email, error.message);
      } else { contadorBajas++; }
    }

    setMensaje({ tipo: 'ok', texto: `✅ ${contadorNuevos} nuevos añadidos · ${contadorBajas} bajas · datos preservados` });
    setModalProfesores(false);
    setPreviewProfesores([]);
    setProcesando(false);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { const r = sessionStorage.getItem('profesor_rol_gestion'); window.location.href = '/gestion'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>📊</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Gestión de Datos del Centro</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre} · Inicio de curso</div>
        </div>
      </div>

      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Grupos', valor: stats.grupos, emoji: '📚', color: azul },
            { label: 'Alumnos', valor: stats.alumnos, emoji: '👥', color: verde },
            { label: 'Horarios', valor: stats.horarios, emoji: '🕐', color: '#7c2d12' },
            { label: 'Curso', valor: stats.cursoActual, emoji: '📅', color: '#6d28d9' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px 12px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontSize: 18 }}>{s.emoji}</div>
              <div style={{ fontSize: s.label === 'Curso' || s.label === 'Horarios' ? 14 : 20, fontWeight: 800, color: s.color }}>{s.valor || '—'}</div>
              <div style={{ fontSize: 10, color: '#888' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* CURSO */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 6 }}>📅 Curso académico</label>
          <input value={cursoNuevo} onChange={e => setCursoNuevo(e.target.value)} placeholder="2025-2026" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Asocia los datos importados a este curso. Al reimportar se borran los anteriores del mismo curso.</div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'guia', label: '📋 Guía inicio de curso' },
            { id: 'alumnos', label: '👥 Alumnos y Grupos' },
            { id: 'horarios', label: '🕐 Horarios' },
            { id: 'profesorado', label: '👨‍🏫 Profesorado' },
          ].map(t => (
            <button key={t.id} onClick={() => setVistaTab(t.id)} style={{ padding: '9px 16px', borderRadius: 10, border: `2px solid ${vistaTab === t.id ? azul : '#ddd'}`, backgroundColor: vistaTab === t.id ? azul : 'white', color: vistaTab === t.id ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== GUÍA INICIO DE CURSO ===== */}
        {vistaTab === 'guia' && (
          <div>
            <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fbbf24', borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#92400e', marginBottom: 8 }}>⚠️ Al inicio de cada curso debes subir estos 2 archivos</div>
              <div style={{ fontSize: 13, color: '#92400e' }}>Hazlo en el orden indicado. Sin estos datos el portal no funcionará correctamente.</div>
            </div>

            {PASOS_INICIO_CURSO.map(paso => (
              <div key={paso.num} style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: `2px solid ${paso.bg}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ minWidth: 44, height: 44, borderRadius: 22, backgroundColor: paso.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                    {paso.emoji}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'white', backgroundColor: paso.color, padding: '2px 10px', borderRadius: 20 }}>PASO {paso.num}</span>
                      <span style={{ fontWeight: 800, fontSize: 15, color: azul }}>{paso.titulo}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#555', marginBottom: 8, lineHeight: 1.5 }}>{paso.desc}</div>
                    <div style={{ fontSize: 12, backgroundColor: '#f8f8f8', padding: '6px 12px', borderRadius: 7, color: '#666', marginBottom: 12 }}>
                      🖥️ <strong>Cómo obtenerlo:</strong> {paso.como}
                    </div>
                    <button onClick={() => setVistaTab(paso.tab)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: paso.color, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      📤 Ir a subir este archivo →
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #6ee7b7', borderRadius: 12, padding: 14, fontSize: 13, color: '#065f46' }}>
              ✅ <strong>Una vez subidos ambos archivos:</strong> los tutores podrán rellenar las autorizaciones, y todos los módulos (DLD, Ausencias) cargarán los horarios automáticamente.
            </div>
          </div>
        )}

        {/* ===== ALUMNOS Y GRUPOS ===== */}
        {vistaTab === 'alumnos' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>📊 Subir CSV de matrículas de Delphos</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
                Este archivo carga <strong>simultáneamente</strong> los grupos y los alumnos del centro. Formato: CSV exportado desde Delphos.
              </div>
              <div style={{ fontSize: 12, backgroundColor: '#f0f7ff', padding: '8px 12px', borderRadius: 7, color: '#1e40af', marginBottom: 14 }}>
                🖥️ <strong>Delphos:</strong> Alumnado → Matrículas → Exportar CSV · Columnas necesarias: <strong>NOMBRE, APELLIDOS, GRUPO</strong>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px 20px', borderRadius: 10, border: '2.5px dashed #93c5fd', backgroundColor: '#f0f7ff', color: '#1e40af', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                <span style={{ fontSize: 28 }}>📊</span>
                <div>
                  <div>{procesando ? '⏳ Procesando...' : 'Toca aquí para subir el CSV de matrículas'}</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Formato: .csv exportado desde Delphos</div>
                </div>
                <input ref={fileRefAlumnos} type="file" accept=".csv,.txt" onChange={procesarCSVAlumnos} style={{ display: 'none' }} disabled={procesando} />
              </label>
            </div>

            {/* Grupos cargados */}
            {Object.keys(gruposPorFamilia).length > 0 && (
              <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 12 }}>
                  📚 Grupos cargados — curso {stats.cursoActual} ({stats.grupos} grupos · {stats.alumnos} alumnos)
                </div>
                {Object.entries(gruposPorFamilia).sort().map(([familia, gs]) => (
                  <div key={familia} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>{FAMILIAS[familia] || familia} ({gs.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {gs.sort().map(g => (
                        <span key={g} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>{g}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== HORARIOS ===== */}
        {vistaTab === 'horarios' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>🗂️ Horarios del profesorado (HTML de Delphos)</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
                Delphos genera una carpeta llamada <strong>Profesores/</strong> con un archivo HTML por cada profesor. Selecciona esa carpeta completa y el sistema procesará todos los horarios automáticamente.
              </div>
              <div style={{ fontSize: 12, backgroundColor: '#f0fdf4', padding: '8px 12px', borderRadius: 7, color: '#065f46', marginBottom: 16 }}>
                🖥️ <strong>Delphos:</strong> Horarios → Imprimir/Exportar → HTML indexado → Se generará un RAR con carpeta <strong>Profesores/</strong>. Descomprime el RAR y selecciona la carpeta <strong>Profesores/</strong>.
              </div>

              {/* ESTADO ACTUAL */}
              <div style={{ backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: azul, marginBottom: 8, fontSize: 14 }}>📋 Estado actual de horarios</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{stats.horarios === '✅' ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: stats.horarios === '✅' ? '#065f46' : '#991b1b' }}>
                      {stats.horarios === '✅' ? 'Horarios cargados correctamente' : 'No hay horarios cargados'}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {stats.horarios === '✅' ? 'DLD y Ausencias cargarán el horario automáticamente' : 'Sin horarios, los profesores deberán rellenar manualmente'}
                    </div>
                  </div>
                </div>
              </div>

              {/* CURSO ACADÉMICO */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 }}>Curso académico</label>
                <input 
                  type="text" 
                  value={cursoNuevo} 
                  onChange={e => setCursoNuevo(e.target.value)} 
                  placeholder="2025-2026" 
                  disabled={procesando}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} 
                />
              </div>

              {/* BOTÓN SUBIR CARPETA */}
              <label style={{ display: 'block', cursor: procesando ? 'not-allowed' : 'pointer' }}>
                <input 
                  ref={fileRefHorarios} 
                  type="file" 
                  webkitdirectory=""
                  directory=""
                  multiple 
                  onChange={procesarCarpetaHorarios} 
                  style={{ display: 'none' }} 
                  disabled={procesando}
                />
                <div style={{ 
                  padding: '16px', 
                  borderRadius: 10, 
                  backgroundColor: procesando ? '#f5f5f5' : verde, 
                  color: procesando ? '#999' : 'white', 
                  fontWeight: 700, 
                  fontSize: 14, 
                  textAlign: 'center',
                  cursor: procesando ? 'not-allowed' : 'pointer',
                }}>
                  {procesando ? '⏳ Procesando...' : '📁 Seleccionar carpeta Profesores/'}
                </div>
              </label>

              {/* PROGRESO */}
              {procesando && progresoHorarios.total > 0 && (
                <div style={{ marginTop: 16, padding: '12px 16px', backgroundColor: '#eff6ff', borderRadius: 8, fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: '#1e3a5f', marginBottom: 6 }}>
                    {progresoHorarios.mensaje}
                  </div>
                  <div style={{ backgroundColor: '#dbeafe', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                    <div style={{ 
                      backgroundColor: '#2563eb', 
                      height: '100%', 
                      width: `${(progresoHorarios.actual / progresoHorarios.total) * 100}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'right' }}>
                    {progresoHorarios.actual} / {progresoHorarios.total}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== PROFESORADO ===== */}
        {vistaTab === 'profesorado' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>👨‍🏫 Carga de profesorado desde Delphos</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.6 }}>
                Exporta el listado de profesores desde Delphos en formato CSV y súbelo aquí. El sistema creará las cuentas autorizadas para que cada profesor pueda registrarse con su email corporativo.
              </div>
              <div style={{ fontSize: 12, backgroundColor: '#f0fdf4', padding: '8px 12px', borderRadius: 7, color: '#065f46', marginBottom: 20 }}>
                🖥️ <strong>Delphos:</strong> Personal → Profesores → Exportar CSV
              </div>

              <label style={{ display: 'block', cursor: procesando ? 'not-allowed' : 'pointer' }}>
                <input ref={fileRefProfesores} type="file" accept=".csv,.txt" onChange={procesarCSVProfesores} style={{ display: 'none' }} disabled={procesando} />
                <div style={{ padding: '16px', borderRadius: 10, backgroundColor: procesando ? '#f5f5f5' : azul, color: 'white', fontWeight: 700, fontSize: 14, textAlign: 'center', cursor: procesando ? 'not-allowed' : 'pointer' }}>
                  {procesando ? '⏳ Procesando...' : '📤 Seleccionar CSV de profesores'}
                </div>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* MODAL PREVIEW PROFESORES */}
      {modalProfesores && previewProfesores && previewProfesores.todos && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 6 }}>👨‍🏫 Sincronizar con CSV</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              Se han detectado <strong>{previewProfesores.todos.length}</strong> profesores en el CSV. Comparando con la BD:
            </div>

            {/* RESUMEN */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div style={{ backgroundColor: '#d1fae5', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#065f46' }}>{previewProfesores.nuevos.length}</div>
                <div style={{ fontSize: 11, color: '#065f46', fontWeight: 600 }}>➕ Nuevos</div>
              </div>
              <div style={{ backgroundColor: '#e0e7ff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#3730a3' }}>{previewProfesores.seMantienen.length}</div>
                <div style={{ fontSize: 11, color: '#3730a3', fontWeight: 600 }}>🔒 Sin cambios</div>
              </div>
              <div style={{ backgroundColor: '#fee2e2', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#991b1b' }}>{previewProfesores.bajas.length}</div>
                <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>➖ Bajas</div>
              </div>
            </div>

            {/* NUEVOS */}
            {previewProfesores.nuevos.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 6 }}>➕ Nuevos ({previewProfesores.nuevos.length})</div>
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #d1fae5', borderRadius: 8, backgroundColor: '#f0fdf4' }}>
                  {previewProfesores.nuevos.slice(0, 20).map((p, i) => (
                    <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid #d1fae5', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: '#065f46' }}>{p.apellidos}, {p.nombre}</span>
                      <span style={{ color: '#666', marginLeft: 6 }}>· {p.email}</span>
                    </div>
                  ))}
                  {previewProfesores.nuevos.length > 20 && <div style={{ padding: 8, fontSize: 11, color: '#065f46', textAlign: 'center' }}>... y {previewProfesores.nuevos.length - 20} más</div>}
                </div>
              </div>
            )}

            {/* BAJAS */}
            {previewProfesores.bajas.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>➖ Bajas — no vienen en el nuevo CSV ({previewProfesores.bajas.length})</div>
                <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #fecaca', borderRadius: 8, backgroundColor: '#fef2f2' }}>
                  {previewProfesores.bajas.slice(0, 20).map((p, i) => (
                    <div key={i} style={{ padding: '8px 12px', borderBottom: '1px solid #fecaca', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: '#991b1b' }}>{p.apellidos}, {p.nombre}</span>
                      <span style={{ color: '#666', marginLeft: 6 }}>· {p.email}</span>
                    </div>
                  ))}
                  {previewProfesores.bajas.length > 20 && <div style={{ padding: 8, fontSize: 11, color: '#991b1b', textAlign: 'center' }}>... y {previewProfesores.bajas.length - 20} más</div>}
                </div>
                <div style={{ fontSize: 11, color: '#991b1b', marginTop: 6 }}>
                  Se marcarán como <strong>inactivos</strong> (no se borran, se conservan sus registros históricos).
                </div>
              </div>
            )}

            {/* PROGRESO */}
            {procesando && (
              <div style={{ marginBottom: 12, padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{progresoProfesores.mensaje}</div>
                <div style={{ backgroundColor: '#dbeafe', borderRadius: 4, height: 6 }}>
                  <div style={{ backgroundColor: '#2563eb', height: '100%', borderRadius: 4, width: `${(progresoProfesores.actual / (progresoProfesores.total || 1)) * 100}%`, transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 11, color: '#888', marginTop: 4, textAlign: 'right' }}>{progresoProfesores.actual} / {progresoProfesores.total}</div>
              </div>
            )}

            <div style={{ fontSize: 12, color: '#3730a3', marginBottom: 12, padding: '10px 12px', backgroundColor: '#e0e7ff', borderRadius: 8 }}>
              🔒 Los profesores que ya existen <strong>NO se modifican</strong> — se conservan todos sus datos personales, contraseñas, roles y tutorías.
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmarProfesores} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: procesando ? 'not-allowed' : 'pointer' }}>
                {procesando ? '⏳ Procesando...' : `✅ Aplicar cambios (${previewProfesores.nuevos.length + previewProfesores.bajas.length})`}
              </button>
              <button onClick={() => { setModalProfesores(false); setPreviewProfesores([]); }} disabled={procesando} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: procesando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {modalHorarios && previewHorarios && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 600, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 6 }}>🗂️ Vista previa de horarios</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              <strong>{previewHorarios.totalProfesores}</strong> profesores y <strong>{previewHorarios.totalRegistros}</strong> horas de clase detectadas para el curso <strong>{cursoNuevo}</strong>.
            </div>
            
            {previewHorarios.errores.length > 0 && (
              <div style={{ marginBottom: 12, padding: '10px 12px', backgroundColor: '#fef3c7', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                ⚠️ {previewHorarios.errores.length} archivos con problemas:
                <div style={{ maxHeight: 100, overflowY: 'auto', marginTop: 6 }}>
                  {previewHorarios.errores.slice(0, 5).map((e, i) => (
                    <div key={i} style={{ fontSize: 11, marginTop: 2 }}>• {e}</div>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16, border: '1px solid #eee', borderRadius: 8 }}>
              {previewHorarios.profesores.slice(0, 20).map((p, i) => (
                <div key={i} style={{ padding: '10px 14px', borderBottom: '1px solid #eee', fontSize: 13 }}>
                  <div style={{ fontWeight: 700, color: azul }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{p.horas.length} horas</div>
                </div>
              ))}
              {previewHorarios.profesores.length > 20 && (
                <div style={{ padding: 12, fontSize: 12, color: '#666', textAlign: 'center' }}>
                  ... y {previewHorarios.profesores.length - 20} profesores más
                </div>
              )}
            </div>
            
            <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 12, padding: '10px 12px', backgroundColor: '#fee2e2', borderRadius: 8 }}>
              ⚠️ <strong>Atención:</strong> Al confirmar, se BORRARÁN todos los horarios existentes del curso {cursoNuevo} y se sustituirán por estos.
            </div>
            
            {/* PROGRESO DE GUARDADO */}
            {procesando && (
              <div style={{ marginBottom: 12, padding: '10px 12px', backgroundColor: '#eff6ff', borderRadius: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{progresoHorarios.mensaje}</div>
                <div style={{ backgroundColor: '#dbeafe', borderRadius: 4, height: 6 }}>
                  <div style={{ backgroundColor: '#2563eb', height: '100%', width: `${(progresoHorarios.actual / (progresoHorarios.total || 1)) * 100}%`, borderRadius: 4 }} />
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmarHorarios} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: procesando ? 'not-allowed' : 'pointer' }}>
                {procesando ? '⏳ Guardando...' : '✅ Confirmar y guardar'}
              </button>
              <button onClick={() => { setModalHorarios(false); setPreviewHorarios(null); }} disabled={procesando} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: procesando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW ALUMNOS */}
      {modalAlumnos && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 6 }}>👥 Vista previa</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              <strong>{previewAlumnos.alumnos?.length}</strong> alumnos y <strong>{previewAlumnos.grupos?.length}</strong> grupos detectados para el curso <strong>{cursoNuevo}</strong>.
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {previewAlumnos.alumnos?.slice(0, 30).map((a, i) => (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 6, backgroundColor: '#f8f8f8', marginBottom: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>{a.apellidos}</strong>, {a.nombre}</span>
                  <span style={{ fontSize: 11, color: '#888', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{a.grupo}</span>
                </div>
              ))}
              {previewAlumnos.alumnos?.length > 30 && <div style={{ textAlign: 'center', color: '#888', fontSize: 12, padding: 8 }}>...y {previewAlumnos.alumnos.length - 30} más</div>}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmarAlumnos} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {procesando ? '⏳ Importando...' : `✅ Importar ${previewAlumnos.alumnos?.length} alumnos`}
              </button>
              <button onClick={() => { setModalAlumnos(false); setPreviewAlumnos([]); }} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
