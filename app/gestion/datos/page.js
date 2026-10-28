'use client'; // rebuild
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { consulta } from '@/lib/consulta';
import ConfigCurso from '@/components/ConfigCurso';
import CambioCurso from '@/components/CambioCurso';
import { getCursoActual } from '@/lib/curso';
import { leerTextoDelphos, parsearCsvDelphos, tipoFicheroDelphos, cruzarFicheros } from '@/lib/csvDelphos';
import { indiceProfesores, buscaProfesor } from '@/lib/asignacionGuardias';
// Nombre de sector comparable: sin tildes ni mayúsculas («HOSTELERÍA» = «Hosteleria»)
function claveSector(s) {
  const n = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  // «E. E.», «EE», «Electricidad»… son el mismo sector: E.E.
  return n.replace(/[\s.]/g, '') === 'EE' || n.startsWith('ELECTR') ? 'E.E.' : n;
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


export default function GestionDatos() {
  const [nombre, setNombre] = useState('');
  const [stats, setStats] = useState({ grupos: 0, alumnos: 0, horarios: 0, cursoActual: '' });
  const [grupos, setGrupos] = useState([]);
  const [, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [vistaTab, setVistaTab] = useState('alumnos');
  const [mostrarGuia, setMostrarGuia] = useState(true);
  const [cursoNuevo, setCursoNuevo] = useState(''); // lo escribe el secretario
  const [procesando, setProcesando] = useState(false);

  // Alumnos
  const [previewAlumnos, setPreviewAlumnos] = useState([]);
  const [ultimaImportacion, setUltimaImportacion] = useState(() => {
    try { return localStorage.getItem('ultima_importacion_alumnos') || ''; } catch { return ''; }
  });
  const [ultimaHorarios, setUltimaHorarios] = useState(() => {
    try { return localStorage.getItem('ultima_importacion_horarios') || ''; } catch { return ''; }
  });
  const [archivosGuardias, setArchivosGuardias] = useState([]);
  const [conflictosGuardias, setConflictosGuardias] = useState(null);
  const [ultimaGuardias, setUltimaGuardias] = useState(() => {
    try { return localStorage.getItem('ultima_importacion_guardias') || ''; } catch { return ''; }
  });
  const [pgaLista, setPgaLista] = useState([]);
  const [previewPGA, setPreviewPGA] = useState(null);
  const [modalAlumnos, setModalAlumnos] = useState(false);

  // Horarios
  const [previewHorarios, setPreviewHorarios] = useState(null);
  const [modalHorarios, setModalHorarios] = useState(false);
  const [progresoHorarios, setProgresoHorarios] = useState({ actual: 0, total: 0, mensaje: '' });
  const fileRefHorarios = useRef(null);

  // Calendario escolar oficial de la Consejería
  const [calendario, setCalendario] = useState(null);
  const [subiendoCal, setSubiendoCal] = useState(false);
  const fileRefCalendario = useRef(null);

  // Guardias
  const [previewGuardias, setPreviewGuardias] = useState([]);
  const [modalGuardias, setModalGuardias] = useState(false);
  // 'completo' = sustituye todo el cuadrante; 'sectores' = solo los sectores subidos
  const [modoGuardias, setModoGuardias] = useState('completo');
  const [cambiosGuardias, setCambiosGuardias] = useState(null);
  // 'completo' = sustituye todos los horarios; 'profesores' = solo los subidos
  const [modoHorarios, setModoHorarios] = useState('completo');
  const [cambiosHorarios, setCambiosHorarios] = useState(null);
  const [, setProgresoGuardias] = useState({ actual: 0, total: 0, mensaje: '' });
  const fileRefGuardias = useRef(null);

  // Profesorado

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || (rol !== 'jefe_estudios' && rol !== 'secretario' && rol !== 'director')) {
      window.location.href = '/login'; return;
    }
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
    cargarStats();
    cargarCalendario();

    // El curso de las importaciones se rellena solo con el que está
    // configurado en Datos del curso. Así, cada septiembre basta con
    // configurar el curso una vez y todo lo que se suba (horarios,
    // alumnado y grupos) queda marcado con el curso correcto.
    getCursoActual().then(cur => setCursoNuevo(prev => prev || cur));
  }, []);

  async function cargarCalendario() {
    try {
      const r = await fetch('/api/calendario');
      const d = await r.json();
      setCalendario(d.calendario || null);
    } catch (e) {
      console.warn('No se pudo cargar el calendario escolar:', e);
    }
  }

  async function subirCalendario(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const permitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!permitidos.includes(file.type)) {
      setMensaje({ tipo: 'error', texto: '❌ Solo se admite PDF o imagen (JPG, PNG o WEBP).' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMensaje({ tipo: 'error', texto: '❌ El archivo pesa más de 8 MB. Comprímelo o usa una imagen.' });
      return;
    }

    setSubiendoCal(true);
    setMensaje(null);
    try {
      const ext = file.name.split('.').pop().toLowerCase();

      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('carpeta', `calendario_${cursoNuevo || 'curso'}`);
      fd.append('bucket', 'calendario');
      const subResp = await fetch('/api/documento', { method: 'POST', body: fd });
      const subData = await subResp.json();
      if (!subData.url) throw new Error(subData.error || 'Error al subir');

      const pub = { publicUrl: subData.url };

      const r = await fetch('/api/calendario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curso: cursoNuevo,
          archivo_url: pub.publicUrl,
          nombre: file.name,
          tipo: file.type,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'no se pudo guardar');

      setMensaje({ tipo: 'ok', texto: '✅ Calendario publicado. Ya lo puede consultar el claustro.' });
      cargarCalendario();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: '❌ Error al subir: ' + err.message });
    }
    setSubiendoCal(false);
    if (fileRefCalendario.current) fileRefCalendario.current.value = '';
  }

  async function cargarStats() {
    setCargando(true);
    const [{ data: gs }, { data: als }, { data: hrs, count: nHorarios }, { data: profs }, { data: guards }] = await Promise.all([
      consulta('grupos').select('codigo, curso_academico').order('codigo'),
      fetch('/api/alumnos?recuento=1').then(r => r.json()).then(d => ({ data: d.alumnos || [] })),
      consulta('horarios_profesores').select('id', { count: 'exact', head: true }),
      consulta('profesores').select('id, estado'),
      consulta('horarios_profesores').select('grupo, profesor_nombre_pdf').eq('tipo', 'guardia'),
    ]);
    // El curso que más grupos tiene (no el primero: puede haber restos del año pasado)
    const cursoCounts = {};
    (gs || []).forEach(g => { if (g.curso_academico) cursoCounts[g.curso_academico] = (cursoCounts[g.curso_academico] || 0) + 1; });
    const curso = Object.entries(cursoCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || '—';
    // Contar solo los del curso principal
    const gruposDelCurso = (gs || []).filter(g => g.curso_academico === curso);
    setGrupos(gs || []);
    setStats({
      grupos: gruposDelCurso?.length || 0,
      alumnos: als?.length || 0,
      horarios: nHorarios ?? hrs?.length ?? 0,
      profesores: profs?.filter(p => p.estado === 'activo').length || 0,
      profesoresTotal: profs?.length || 0,
      guardias: guards?.length > 0,
      sectoresGuardia: Object.values((guards || []).reduce((m, g) => {
        const s = (m[g.grupo] ||= { sector: g.grupo, filas: 0, nombres: new Set() });
        s.filas++; s.nombres.add(g.profesor_nombre_pdf);
        return m;
      }, {})).map(s => ({ sector: s.sector, filas: s.filas, profesores: s.nombres.size }))
        .sort((a, b) => a.sector.localeCompare(b.sector)),
      cursoActual: curso,
    });
    cargarPGA();
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    // Los avisos salen arriba y estas pantallas son largas: sin esto,
    // un error puede quedarse fuera de la vista y parecer que el botón
    // no hace nada.
    if (tipo === 'error') {
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    }
    setTimeout(() => setMensaje(null), 6000);
  }

  // ===== IMPORTAR ALUMNOS =====

  // El resultado se queda escrito debajo de los botones: un mensaje que
  // aparece arriba y se va no sirve para comprobar nada.
  const [resultadoCarga, setResultadoCarga] = useState(null);

  /**
   * DOS FICHEROS DE DELPHOS, UNA SOLA CARGA
   *
   * datMatriculas dice quién está y en qué grupo; datAlumnos añade el DNI.
   * Se eligen los dos (o solo matrículas, si solo cambian grupos), se
   * cruzan aquí por el identificador ALUMNO y, antes de guardar nada, el
   * servidor dice qué va a cambiar: nuevos, cambios de grupo y quién estaba
   * cargado y ya no viene. Solo al confirmar se guarda, y siempre
   * actualizando: nunca se borra a nadie, así que el seguro escolar y las
   * autorizaciones se conservan.
   *
   * Da igual en qué orden o en qué casilla se suban: cada fichero se
   * reconoce por sus columnas.
   */
  const [ficheroMatriculas, setFicheroMatriculas] = useState(null);
  const [ficheroAlumnos, setFicheroAlumnos] = useState(null);
  const [revision, setRevision] = useState(null);

  async function elegirFicheroDelphos(archivo) {
    if (!archivo) return;
    try {
      const { cabecera, filas } = parsearCsvDelphos(await leerTextoDelphos(archivo));
      const tipo = tipoFicheroDelphos(cabecera);
      const info = { nombre: archivo.name, filas };
      if (tipo === 'matriculas') setFicheroMatriculas(info);
      else if (tipo === 'alumnos') setFicheroAlumnos(info);
      else mostrarMensaje('❌ «' + archivo.name + '» no es ni datMatriculas ni datAlumnos de Delphos: no tiene sus columnas.', 'error');
    } catch {
      mostrarMensaje('❌ No se ha podido leer «' + archivo.name + '».', 'error');
    }
  }

  async function revisarImportacion() {
    if (!ficheroMatriculas) return;
    if (!cursoNuevo) { mostrarMensaje('❌ Falta el curso académico.', 'error'); return; }
    setProcesando(true);
    const { lista, descartes, sinFicha } = cruzarFicheros({
      matriculas: ficheroMatriculas.filas,
      alumnos: ficheroAlumnos?.filas || null,
      curso: cursoNuevo,
      esGrupoValido: g => !!detectarFamilia(g),
    });
    const gruposSet = new Set();
    lista.forEach(a => gruposSet.add(JSON.stringify({ codigo: a.grupo, familia: detectarFamilia(a.grupo) })));
    const gruposNuevos = [...gruposSet].map(s => JSON.parse(s));

    const r = await fetch('/api/alumnos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'importar', simular: true, alumnos: lista }),
    });
    const d = await r.json().catch(() => ({}));
    setProcesando(false);
    if (!r.ok) {
      mostrarMensaje(r.status === 403
        ? '❌ Sin permisos: tu cuenta no está configurada como directivo.'
        : '❌ No se ha podido revisar: ' + (d.error || r.status), 'error');
      return;
    }
    setPreviewAlumnos({ alumnos: lista, grupos: gruposNuevos });
    setRevision({ ...d, descartes, sinFicha, conAlumnos: !!ficheroAlumnos });
    setModalAlumnos(true);
  }

  // ─── Actividades aprobadas en la PGA ───

  async function cargarPGA() {
    const { data } = await consulta('actividades_pga')
      .select('id, actividad, localidad, departamento, curso_academico')
      .order('actividad');
    setPgaLista(data || []);
  }

  async function procesarCSVPGA(e) {
    const file = e.target.files[0];
    if (!file) return;
    setProcesando(true);
    try {
      const buffer = await file.arrayBuffer();
      // Los CSV de Excel en español suelen venir en ISO-8859-1
      let texto = new TextDecoder('utf-8').decode(buffer);
      if (texto.includes('\uFFFD')) texto = new TextDecoder('iso-8859-1').decode(buffer);

      const sep = texto.includes(';') ? ';' : ',';
      const lineas = texto.split(/\r?\n/).filter(l => l.trim());
      if (lineas.length < 2) {
        mostrarMensaje('❌ El archivo no tiene filas de datos.', 'error');
        setProcesando(false); e.target.value = ''; return;
      }

      const limpia = c => (c || '').trim().replace(/^"|"$/g, '').trim();
      const cabecera = lineas[0].split(sep).map(c => limpia(c).toUpperCase());
      const iAct = cabecera.findIndex(c => c.startsWith('ACTIVIDAD') || c.startsWith('VISITA'));
      const iLoc = cabecera.findIndex(c => c.startsWith('LOCALIDAD') || c.startsWith('LUGAR'));
      const iDep = cabecera.findIndex(c => c.startsWith('DEPARTAMENTO') || c.startsWith('DPTO'));

      if (iAct === -1) {
        mostrarMensaje('❌ Falta la columna ACTIVIDAD (o VISITA) en la primera fila.', 'error');
        setProcesando(false); e.target.value = ''; return;
      }

      const vistas = new Set();
      const filas = [];
      for (let i = 1; i < lineas.length; i++) {
        const cols = lineas[i].split(sep).map(limpia);
        const actividad = cols[iAct];
        if (!actividad) continue;
        const localidad = iLoc !== -1 ? (cols[iLoc] || '') : '';
        const clave = `${actividad}|${localidad}`.toLowerCase();
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        filas.push({
          actividad, localidad,
          departamento: iDep !== -1 ? (cols[iDep] || null) : null,
          curso_academico: cursoNuevo || stats.cursoActual,
        });
      }

      if (filas.length === 0) {
        mostrarMensaje('❌ No se ha encontrado ninguna actividad en el archivo.', 'error');
        setProcesando(false); e.target.value = ''; return;
      }
      setPreviewPGA(filas);
    } catch (err) {
      mostrarMensaje('❌ No se ha podido leer el archivo.', 'error');
    }
    setProcesando(false);
    e.target.value = '';
  }

  async function confirmarPGA(reemplazar) {
    if (!previewPGA) return;
    const curso = previewPGA[0]?.curso_academico;
    if (!curso || curso === '—') {
      mostrarMensaje('❌ Indica antes el curso académico.', 'error');
      return;
    }
    setProcesando(true);

    if (reemplazar) {
      await fetch('/api/centro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: 'actividades_pga', accion: 'borrar', filtro: { curso_academico: curso } }),
      });
    }

    const r = await fetch('/api/centro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla: 'actividades_pga', accion: 'crear', lista: previewPGA }),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      mostrarMensaje('❌ Error: ' + (err.error || 'no se pudo guardar'), 'error');
    } else {
      mostrarMensaje(`✅ ${previewPGA.length} actividades guardadas.`, 'ok');
      setPreviewPGA(null);
      await cargarPGA();
    }
    setProcesando(false);
  }

  async function confirmarAlumnos() {
    const { alumnos: alumnosNuevos, grupos: gruposNuevos } = previewAlumnos;
    setProcesando(true);

    // Un solo endpoint hace todo en orden: vacía grupos y alumnos, inserta grupos nuevos
    const rGrupos = await fetch('/api/alumnos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'importar_grupos', grupos: gruposNuevos, curso: cursoNuevo }),
    });
    if (!rGrupos.ok) {
      const err = await rGrupos.json().catch(() => ({}));
      mostrarMensaje('❌ Error al importar grupos: ' + (err.error || rGrupos.status), 'error');
      setProcesando(false); setModalAlumnos(false); return;
    }

    // Actualizar e insertar alumnos. NO se borra nada.
    // La importación la hace el servidor: la tabla de alumnado ya no es
    // accesible desde el navegador.
    const respImp = await fetch('/api/alumnos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'importar',
        // NO se borra nada: se actualiza por el identificador de Delphos.
        // Un borrado se llevaría por delante los seguros escolares y las
        // autorizaciones que los tutores marcan uno a uno.
        alumnos: alumnosNuevos,
        curso: cursoNuevo,
      }),
    });
    if (!respImp.ok) {
      const err = await respImp.json().catch(() => ({}));
      const motivo = err.error === 'Sin permisos' || respImp.status === 403
        ? '❌ Sin permisos: tu cuenta no está configurada como directivo. Comprueba en /gestion/personal que el campo «Rol gestión» pone «director».'
        : '❌ Error al importar alumnos: ' + (err.error || respImp.status);
      mostrarMensaje(motivo, 'error');
      setProcesando(false); setModalAlumnos(false); return;
    }
    const resumen = await respImp.json().catch(() => ({}));
    const fechaImport = new Date().toLocaleString('es-ES', { dateStyle:'short', timeStyle:'short' });
    setProcesando(false);
    setModalAlumnos(false);
    setResultadoCarga((() => {
      const d = resumen || {};
      return {
        bien: true,
        titulo: `${(d.actualizados || 0) + (d.creados || 0)} alumnos cargados`,
        lineas: [
          `${d.actualizados || 0} ya estaban: se les ha puesto al día el grupo${ficheroAlumnos ? ' y el DNI' : ''}`,
          d.adoptados ? `${d.adoptados} reconocidos por su nombre` : null,
          `${d.creados || 0} son nuevos en el centro`,
          d.bajas ? `${d.bajas} pasan a baja: ya no salen en las listas (no se ha borrado nada)` : null,
          d.grupos_quitados ? `${d.grupos_quitados} grupos sin alumnos quitados de la lista` : null,
          `${gruposNuevos.length} grupos`,
        ].filter(Boolean),
        aviso: 'El seguro escolar y las autorizaciones no se han tocado. Compruébalo en Gestión de Autorizaciones.',
        nombres: [],
      };
    })());
    mostrarMensaje((() => {
      // Que se vea qué ha pasado de verdad: cuántos se han actualizado y
      // cuántos son nuevos. Si sale algún "sin identificador", ese fichero
      // no traía la columna ALUMNO y habría que revisarlo.
      const d = resumen || {};
      const partes = [];
      if (d.actualizados) partes.push(`${d.actualizados} actualizados`);
      if (d.adoptados) partes.push(`${d.adoptados} reconocidos por su nombre`);
      if (d.creados) partes.push(`${d.creados} nuevos`);
      if (d.sin_identificador) partes.push(`⚠️ ${d.sin_identificador} sin identificador`);
      return `✅ ${partes.join(' · ') || `${alumnosNuevos.length} alumnos`} `
        + `y ${gruposNuevos.length} grupos, curso ${cursoNuevo} — ${fechaImport}. `
        + `No se ha borrado nada: seguros y autorizaciones intactos.`;
    })(), 'ok');
    setPreviewAlumnos([]);
    setRevision(null);
    setFicheroMatriculas(null);
    setFicheroAlumnos(null);
    setUltimaImportacion(fechaImport);
    try { localStorage.setItem('ultima_importacion_alumnos', fechaImport); } catch {}
    cargarStats();
  }

  // La familia sale del propio código (ESO-, BTO-, GM-…): la tabla de
  // grupos no la trae en esta consulta y salían todos como «undefined».
  // Solo los del curso actual, para no mezclar restos del año pasado.
  const gruposPorFamilia = grupos
    .filter(g => !stats.cursoActual || g.curso_academico === stats.cursoActual)
    .reduce((acc, g) => {
      const fam = detectarFamilia(g.codigo) || 'Otros';
      if (!acc[fam]) acc[fam] = [];
      acc[fam].push(g.codigo);
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
    // «GUARDIA COMERCIO», «GUARDIA ACOMPAÑAMIENTO» del horario PERSONAL: se
    // guardan como texto informativo (complementaria). Las guardias que usa
    // el reparto salen del CUADRANTE; si estas entraran como guardia, el
    // motor vería sectores que no existen (ACOMPAÑAMIENTO, BIBLIOTECA).
    if (t.startsWith('GUARDIA')) return 'complementaria';
    if (t.includes('RECREO') || t.includes('MEDIOD')) return 'libre';
    if (t.startsWith('REUNI')) return 'complementaria';
    // Clase = lleva el aula entre paréntesis: «SISI-3094386 GS-1DAM (1 A007
    // INF)». Lo que no la lleva («EAPP», «OTRA», «LCEPE», «T», «CHLE»…) es
    // hora complementaria del profesor, sin alumnos (Luis Javier, oct. 2026).
    // Antes valía cualquier palabra en mayúsculas y las complementarias
    // entraban como clase y generaban guardia.
    if (/\([^)]*\)/.test(t)) return 'clase';
    return 'complementaria';
  }

  function extraerGrupoYMateria(textoCelda) {
    // Formato típico: "DASP-3087251\nGM-1IEA\n(1 A032 ELE)"
    const partes = textoCelda.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    let materia = '', grupo = '', aula = '';
    if (partes.length >= 3) {
      materia = partes[0].split('-')[0];
      grupo = partes[1];
      // El aula viene entre paréntesis: "(1 A032 ELE)" → "A032"
      const matchAula = partes[2].match(/\(([^)]+)\)/);
      if (matchAula) {
        // Extraer código de aula (segundo token si hay varios)
        const tokens = matchAula[1].trim().split(/\s+/);
        aula = tokens.length >= 2 ? tokens[1] : tokens[0];
      }
    } else if (partes.length === 2) {
      materia = partes[0].split('-')[0];
      grupo = partes[1];
    } else if (partes.length === 1) {
      grupo = partes[0];
    }
    return { grupo, materia, aula };
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
    // Si se suben pocos archivos (menos de la mitad del claustro), lo normal
    // es que sea una actualización de unos profesores: se propone esa opción.
    setModoHorarios(stats.horarios > 0 && profesoresParseados.length < (stats.profesores || 0) / 2 ? 'profesores' : 'completo');
    compararHorarios(profesoresParseados);
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
        let grupo = '', materia = '', aula = '';
        if (tipo === 'clase') {
          const extraido = extraerGrupoYMateria(textoCelda);
          grupo = extraido.grupo; materia = extraido.materia; aula = extraido.aula;
        } else if (tipo === 'guardia') {
          // El texto es "GUARDIA TMV/Carrocería" → el cuadrante es lo que va después de "GUARDIA "
          grupo = textoCelda.replace(/^GUARDIA\s*/i, '').trim();
        } else if (tipo === 'complementaria') {
          // Lo que pone Peñalara: «REUNIÓN ERASMUS FP», «ATENCIÓN A PADRES»,
          // «TUTORÍA»... Antes se tiraba y en Mi horario solo salía
          // «complementaria». Va en materia (grupo es para códigos de grupo).
          // Con los saltos de línea como espacios: «GUARDIA ACOMPAÑAMIENTO»,
          // no «GUARDIAACOMPAÑAMIENTO».
          const tmp = document.createElement('div');
          tmp.innerHTML = celda.innerHTML.replace(/<br\s*\/?>/gi, ' ');
          materia = limpiarTexto(tmp.textContent).slice(0, 80);
        }
        
        // Añadir a las columnas que ocupa (colspan)
        for (let c = 0; c < colspan && colDia < 5; c++) {
          horas.push({
            hora_id: horaId,
            dia: DIAS_HTML[colDia],
            tipo,
            grupo,
            materia,
            aula,
          });
          
          // Marcar ocupadas las filas siguientes por rowspan
          for (let r = 1; r < rowspan; r++) {
            ocupadas[`${filaIdx + r},${colDia}`] = { tipo, grupo, materia, aula };
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

  /**
   * QUÉ CAMBIA EN EL HORARIO DE CADA PROFESOR SUBIDO
   *
   * Compara cada archivo con lo cargado de esa persona (también lo que
   * se pasó a su sustituto) y avisa de dos cosas que la carga parcial
   * no arregla sola:
   *   · un nombre que no está cargado: si es la misma persona con el
   *     nombre cambiado, su horario viejo se quedaría duplicado;
   *   · una clase nueva a una hora en la que el cuadrante le pone
   *     guardia: hay que subir también ese sector del cuadrante.
   */
  async function compararHorarios(profesores) {
    setCambiosHorarios(null);
    if (!profesores.length || profesores.length > 60) { setCambiosHorarios({ omitido: true }); return; }
    try {
      const nombres = profesores.map(p => p.nombre);
      const leer = async (col) => {
        let todas = [];
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await consulta('horarios_profesores')
            .select('profesor_nombre_pdf, nombre_original_pdf, dia, hora_id, tipo, grupo, materia, aula')
            .eq('curso_academico', cursoNuevo).neq('tipo', 'guardia').in(col, nombres).range(desde, desde + 999);
          if (error) throw error;
          todas = todas.concat(data || []);
          if (!data || data.length < 1000) break;
        }
        return todas;
      };
      const [aSuNombre, prestadas, rp, guardias] = await Promise.all([
        leer('profesor_nombre_pdf'),
        leer('nombre_original_pdf'),
        fetch('/api/profesores').then(r => r.json()),
        (async () => {
          let todas = [];
          for (let desde = 0; ; desde += 1000) {
            const { data } = await consulta('horarios_profesores').select('profesor_nombre_pdf, nombre_original_pdf, grupo, dia, hora_id')
              .eq('tipo', 'guardia').eq('curso_academico', cursoNuevo).range(desde, desde + 999);
            todas = todas.concat(data || []);
            if (!data || data.length < 1000) break;
          }
          return todas;
        })(),
      ]);

      const hora = h => String(h || '').replace(/a$/, '');
      const clave = h => [h.dia, hora(h.hora_id), (h.tipo || '').toLowerCase(), h.grupo || '', h.materia || '', h.aula || ''].join('|');
      const delNombre = (n) => [
        ...aSuNombre.filter(h => h.profesor_nombre_pdf === n && !h.nombre_original_pdf),
        ...prestadas.filter(h => h.nombre_original_pdf === n),
      ];

      const indice = indiceProfesores(rp.profesores || []);
      const guardiasDe = new Map();
      for (const g of guardias) {
        const p = buscaProfesor(indice, g.nombre_original_pdf || g.profesor_nombre_pdf);
        if (!p) continue;
        if (!guardiasDe.has(p.id)) guardiasDe.set(p.id, []);
        guardiasDe.get(p.id).push(g);
      }

      const porProfesor = profesores.map(prof => {
        const antes = delNombre(prof.nombre);
        const mapaAntes = new Map(antes.map(h => [clave(h), h]));
        const mapaDespues = new Map(prof.horas.map(h => [clave(h), h]));
        const entran = [...mapaDespues].filter(([k]) => !mapaAntes.has(k)).map(([, v]) => v);
        const salen = [...mapaAntes].filter(([k]) => !mapaDespues.has(k)).map(([, v]) => v);
        const persona = buscaProfesor(indice, prof.nombre);
        const choques = persona ? (guardiasDe.get(persona.id) || []).filter(g =>
          g.hora_id !== 'recreo' && prof.horas.some(h =>
            (h.tipo || '').toLowerCase() === 'clase' && h.dia === g.dia && hora(h.hora_id) === hora(g.hora_id))) : [];
        return { nombre: prof.nombre, nuevo: antes.length === 0, entran, salen, choques };
      });
      setCambiosHorarios({ porProfesor });
    } catch { setCambiosHorarios({ error: true }); }
  }

  async function confirmarHorarios() {
    if (!previewHorarios) return;
    setProcesando(true);
    setProgresoHorarios({ actual: 0, total: previewHorarios.profesores.length, mensaje: 'Guardando...' });
    
    try {
      // 1. Borrar lo que se va a sustituir: todo el curso, o solo los
      // profesores subidos. El cuadrante de guardias no se toca nunca aquí.
      const parcial = modoHorarios === 'profesores';
      setProgresoHorarios(p => ({ ...p, mensaje: 'Borrando horarios anteriores...' }));
      const _b = await fetch('/api/horarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parcial
          ? { accion: 'reemplazar_profesores', curso: cursoNuevo, nombres: previewHorarios.profesores.map(p => p.nombre) }
          : { accion: 'borrar_curso', curso: cursoNuevo, excepto_guardias: true }),
      });
      if (!_b.ok) {
        const e = await _b.json().catch(() => ({}));
        throw new Error(`no se pudo borrar lo anterior (${e.error || 'error'}). No se ha cargado nada`);
      }
      
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
            aula: h.aula || '',
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
        const _r = await fetch('/api/horarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'insertar', lote }),
        });
        if (!_r.ok) {
          const e = await _r.json();
          throw new Error(`Error en lote ${i}: ${e.error || 'no se pudo guardar'}`);
        }
      }
      
      const tsHor = new Date().toLocaleString('es-ES', { dateStyle:'short', timeStyle:'short' });
      setUltimaHorarios(tsHor);
      try { localStorage.setItem('ultima_importacion_horarios', tsHor); } catch {}
      const sust = await reaplicarSustituciones();
      const ausAb = await recalcularAusenciasAbiertas();
      const reca = await recalcularProximos();
      const que = parcial ? ' Solo se han cambiado estos profesores; el resto de horarios sigue igual.' : '';
      setMensaje({ tipo: 'ok', texto: `✅ ${previewHorarios.totalProfesores} profesores y ${registros.length} horas cargadas correctamente — ${tsHor}.${que}${sust}${ausAb}${reca}` });
      setModalHorarios(false);
      setPreviewHorarios(null);
      setCambiosHorarios(null);
      cargarStats();
    } catch (err) {
      setMensaje({ tipo: 'error', texto: `❌ Error al guardar: ${err.message}` });
    }
    setProcesando(false);
  }

  // ═══════════════════════════════════════════════════════════════
  // PARSER CSV DE PROFESORES DE DELPHOS
  // ═══════════════════════════════════════════════════════════════
  

  // ═══════════════════════════════════════════════════════════════
  // PARSER HTML DE GUARDIAS DE DELPHOS
  // ═══════════════════════════════════════════════════════════════

  const MAPA_HORAS_GUARDIAS = {
    '8:30': '1', '9:25': '2', '10:20': '3',
    '11:15': 'recreo', '11:30': 'recreo', // recreo (según Delphos)
    '11:45': '4', '12:40': '5', '13:35': '6',
  };
  const DIAS_GUARDIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

  /**
   * ¿Hay alguien de guardia a una hora en la que su horario dice que tiene
   * clase? Es la señal de un cuadrante que no corresponde a los horarios
   * cargados (p. ej. el de verano con los horarios de septiembre).
   */
  /**
   * QUÉ CAMBIA RESPECTO A LO CARGADO
   *
   * Para cada sector que se sube: qué guardias entran y cuáles salen.
   * Las guardias ya pasadas a un sustituto se comparan con el nombre
   * original del cuadrante, para que no salgan como cambio sin serlo.
   */
  async function compararConCargado(registros) {
    setCambiosGuardias(null);
    try {
      let actuales = [];
      for (let desde = 0; ; desde += 1000) {
        const { data, error } = await consulta('horarios_profesores')
          .select('profesor_nombre_pdf, nombre_original_pdf, grupo, dia, hora_id, aula')
          .eq('tipo', 'guardia').eq('curso_academico', cursoNuevo).range(desde, desde + 999);
        if (error) throw error;
        actuales = actuales.concat(data || []);
        if (!data || data.length < 1000) break;
      }
      const hora = h => String(h || '').replace(/a$/, '');
      const clave = (sector, dia, h, nombre, aula) =>
        [claveSector(sector), dia, hora(h), String(nombre || '').trim(), h === 'recreo' ? String(aula || '').trim() : ''].join('|');
      const subidos = new Set(registros.map(g => claveSector(g.sector)));

      const antes = new Map();
      actuales.filter(a => subidos.has(claveSector(a.grupo))).forEach(a => {
        const nombre = a.nombre_original_pdf || a.profesor_nombre_pdf;
        antes.set(clave(a.grupo, a.dia, a.hora_id, nombre, a.aula), { sector: a.grupo, dia: a.dia, hora: hora(a.hora_id), nombre, aula: a.aula });
      });
      const despues = new Map();
      registros.forEach(g => {
        despues.set(clave(g.sector, g.dia, g.hora_id, g.nombre_abrev, g.aula), { sector: g.sector, dia: g.dia, hora: hora(g.hora_id), nombre: g.nombre_abrev, aula: g.aula });
      });

      const entran = [...despues].filter(([k]) => !antes.has(k)).map(([, v]) => v);
      const salen = [...antes].filter(([k]) => !despues.has(k)).map(([, v]) => v);
      const conGuardias = new Set(actuales.map(a => claveSector(a.grupo)));
      const nuevos = [...new Set(registros.map(g => g.sector))].filter(s => !conGuardias.has(claveSector(s)));
      const fuera = [...new Set(actuales.map(a => a.grupo))].filter(s => s && !subidos.has(claveSector(s)));
      setCambiosGuardias({ entran, salen, nuevos, fuera });
    } catch { setCambiosGuardias({ error: true }); }
  }

  async function comprobarConHorarios(registros) {
    setConflictosGuardias(null);
    try {
      const [rp, filas] = await Promise.all([
        fetch('/api/profesores').then(r => r.json()),
        (async () => {
          let todas = [];
          for (let desde = 0; ; desde += 1000) {
            const { data } = await consulta('horarios_profesores').select('profesor_nombre_pdf, dia, hora_id, tipo')
              .eq('tipo', 'clase').range(desde, desde + 999);
            todas = todas.concat(data || []);
            if (!data || data.length < 1000) break;
          }
          return todas;
        })(),
      ]);
      const indice = indiceProfesores(rp.profesores || []);
      const enClase = new Set();
      for (const h of filas) {
        const p = buscaProfesor(indice, h.profesor_nombre_pdf);
        if (p) enClase.add(`${p.id}|${h.dia}|${String(h.hora_id).replace(/a$/, '')}`);
      }
      const choques = [];
      for (const g of registros) {
        if (g.hora_id === 'recreo') continue;
        const p = buscaProfesor(indice, g.nombre_abrev);
        if (p && enClase.has(`${p.id}|${g.dia}|${g.hora_id}`)) choques.push(`${g.nombre_abrev} (${g.sector}, ${g.dia} ${g.hora_id}ª)`);
      }
      setConflictosGuardias({ lista: choques, horarios: filas.length });
    } catch { setConflictosGuardias({ error: true }); }
  }

  async function procesarCarpetaGuardias(e) {
    const archivos = Array.from(e.target.files || []).filter(f =>
      f.name.toLowerCase().match(/\.(htm|html)$/)
    );
    if (archivos.length === 0) {
      setMensaje({ tipo: 'error', texto: '❌ No se encontraron archivos HTM/HTML' });
      return;
    }
    // Dos archivos del mismo sector (p. ej. TMV.htm en dos subcarpetas):
    // el navegador los mete todos y entraba el que llegase último. Se para.
    {
      const porNombre = {};
      for (const f of archivos) (porNombre[f.name.toLowerCase()] ||= []).push(f.webkitRelativePath || f.name);
      const repetidos = Object.values(porNombre).filter(l => l.length > 1);
      if (repetidos.length) {
        setMensaje({ tipo: 'error', texto: `❌ La carpeta tiene archivos repetidos, seguramente en subcarpetas (un cuadrante viejo y otro nuevo): ${repetidos.map(l => l.join(' y ')).join(' · ')}. Deja en una carpeta solo los archivos buenos y vuelve a seleccionarla.` });
        if (fileRefGuardias.current) fileRefGuardias.current.value = '';
        return;
      }
    }
    setProcesando(true);
    setProgresoGuardias({ actual: 0, total: archivos.length, mensaje: 'Analizando...' });

    const registros = [];

    // Helper: extrae nombres de una celda usando <br> como separador
    function extraerNombres(celda) {
      const tmp = document.createElement('div');
      // Convertir <br> en salto de línea ANTES de asignar innerHTML
      tmp.innerHTML = celda.innerHTML.replace(/<br\s*\/?>/gi, '\n');
      return (tmp.textContent || '')
        .split('\n')
        .map(n => n.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(n => n.length > 2 && !/^[&\s]*$/.test(n));
    }

    // Helper: detecta si un th contiene una hora de guardia válida
    function horaDeGuardia(th) {
      // Ignorar th con colspan > 1 (son cabeceras de sector o días)
      const cs = parseInt(th.getAttribute('colspan') || '1');
      if (cs > 1) return null;
      const texto = th.textContent.replace(/\u00a0/g, '').trim();
      const m = texto.match(/(\d{1,2}:\d{2})/);
      if (!m) return null;
      return MAPA_HORAS_GUARDIAS[m[1]] || null;
    }

    const errores = [];

    /**
     * RECREOS (Peñalara, «GUARDIA 1er recreo, 11:15-11:45»)
     * Otra forma de tabla: las filas 1, 2, 3… son PUESTOS, no horas, y cada
     * celda lleva la zona entre paréntesis y un número al final:
     *   (RECREO S1) Her. V, G ~300072
     *   (BIBLIOTECA (Recreo)) Ant. T, AR ~38155
     * Todo es el mismo recreo: sector RECREO, hora «recreo» y la zona en el
     * aula, que es como lo espera el motor.
     */
    function zonaDeRecreo(txt) {
      let z = txt.replace(/\(recreo\)/i, '').replace(/^recreo\s+/i, '').trim();
      z = z.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());   // «EDIFICIO A» → «Edificio A»
      return z.replace(/\bA(\d{3})S\b/gi, 'A$1s').replace(/\bY\b/g, 'y');
    }
    function leerRecreos(doc) {
      const salida = [];
      for (const fila of Array.from(doc.querySelectorAll('tr'))) {
        const celdas = Array.from(fila.children);
        if (celdas.length < 6) continue;
        celdas.slice(1, 6).forEach((celda, c) => {
          const tmp = document.createElement('div');
          tmp.innerHTML = celda.innerHTML.replace(/<br\s*\/?>/gi, '\n');
          (tmp.textContent || '').split('\n').forEach(linea => {
            const t = linea.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
            // «(ZONA) Nombre ~número»; la zona puede llevar paréntesis dentro
            const m = t.match(/^\((.+)\)\s*([^()~]+?)\s*(?:~\s*\d+)?$/);
            if (!m || !/recreo|biblioteca/i.test(m[1])) return;
            salida.push({ sector: 'RECREO', dia: DIAS_GUARDIAS[c], hora_id: 'recreo', nombre_abrev: m[2].trim(), aula: zonaDeRecreo(m[1]) });
          });
        });
      }
      return salida;
    }

    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      setProgresoGuardias({ actual: i + 1, total: archivos.length, mensaje: `Leyendo ${archivo.name}...` });

      let buffer, html, doc;
      try {
        buffer = await archivo.arrayBuffer();
        // Intentar windows-1252, si falla usar utf-8
        try {
          html = new TextDecoder('windows-1252').decode(buffer);
        } catch {
          html = new TextDecoder('utf-8').decode(buffer);
        }
        doc = new DOMParser().parseFromString(html, 'text/html');
      } catch (err) {
        errores.push(archivo.name);
        continue;
      }

      // ¿Es el cuadrante de recreos? (el título habla de recreo)
      const titulo = Array.from(doc.querySelectorAll('th, td')).slice(0, 5).map(x => x.textContent).join(' ');
      if (/recreo/i.test(titulo) || /recreo/i.test(archivo.name)) {
        const deRecreo = leerRecreos(doc);
        if (deRecreo.length) { registros.push(...deRecreo); continue; }
      }

      // Nombre del sector: primer th con colspan >= 5
      // Fallback = nombre de archivo sin extensión (cubre casos de fallo en selector)
      let sector = archivo.name.replace(/\.(htm|html)$/i, '').toUpperCase();
      // Buscar th con colspan 5 o 6
      const allThs = Array.from(doc.querySelectorAll('th'));
      for (const th of allThs) {
        const cs = parseInt(th.getAttribute('colspan') || '1');
        if (cs >= 5) {
          // Usar textContent decodificado por el propio DOM (decodifica &nbsp; etc.)
          const txt = th.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
          if (txt && txt.length > 0) { sector = txt; break; }
        }
      }
      // Peñalara escribe «E. E.»: se guarda siempre como «E.E.».
      if (claveSector(sector) === 'E.E.') sector = 'E.E.';

      // Construir matriz de celdas con rowspan resuelto
      // Usamos un enfoque de "grid virtual" para evitar bugs con rowspan
      const filas = Array.from(doc.querySelectorAll('tr'));
      // grid[fi][colDia] = { nombres, horaId }  — sólo cols 1-5 (días)
      const grid = {}; // "fi-col" -> nombres ya asignadas

      filas.forEach((fila, fi) => {
        // Buscar el th de hora en esta fila
        const ths = Array.from(fila.querySelectorAll('th'));
        let horaId = null;
        for (const th of ths) {
          const h = horaDeGuardia(th);
          if (h) { horaId = h; break; }
        }
        if (!horaId) return; // fila sin hora válida (cabecera, recreo, mediodía...)

        // Recorrer las celdas td de la fila
        const tds = Array.from(fila.querySelectorAll('td'));
        let col = 0;   // columna lógica 0-4 (lunes-viernes)
        let tdIdx = 0;

        while (col < 5) {
          const key = `${fi}-${col}`;
          if (grid[key] !== undefined) {
            // Esta celda ya fue rellenada por el rowspan de una fila anterior
            const nombres = grid[key];
            nombres.forEach(n => registros.push({ sector, dia: DIAS_GUARDIAS[col], hora_id: horaId, nombre_abrev: n }));
            col++;
            continue;
          }

          const td = tds[tdIdx];
          if (!td) { col++; continue; }
          tdIdx++;

          const colspan = parseInt(td.getAttribute('colspan') || '1');
          const rowspan = parseInt(td.getAttribute('rowspan') || '1');
          const nombres = extraerNombres(td);

          for (let c = 0; c < colspan && col < 5; c++) {
            // Registrar esta hora/día
            nombres.forEach(n => registros.push({ sector, dia: DIAS_GUARDIAS[col], hora_id: horaId, nombre_abrev: n }));
            // Propagar rowspan a filas siguientes
            for (let r = 1; r < rowspan; r++) {
              grid[`${fi + r}-${col}`] = [...nombres];
            }
            col++;
          }
        }
      });
    }

    setArchivosGuardias(archivos.map(f => ({ nombre: f.webkitRelativePath || f.name, fecha: f.lastModified })));
    comprobarConHorarios(registros);
    // Si se suben menos sectores de los que hay cargados, lo normal es que
    // sea una actualización de unos pocos: se propone «solo estos sectores».
    {
      const cargados = new Set((stats.sectoresGuardia || []).map(s => claveSector(s.sector)));
      const subidos = new Set(registros.map(g => claveSector(g.sector)));
      setModoGuardias(cargados.size > 0 && subidos.size < cargados.size ? 'sectores' : 'completo');
    }
    compararConCargado(registros);
    setPreviewGuardias(registros);
    setModalGuardias(true);
    setProcesando(false);
    if (fileRefGuardias.current) fileRefGuardias.current.value = '';
    if (errores.length > 0) {
      setMensaje({ tipo: 'aviso', texto: `⚠️ No se pudieron leer ${errores.length} archivos: ${errores.join(', ')}` });
    }
  }

  // Peñalara trae el horario a nombre del titular aunque esté de baja: tras
  // cada carga se vuelven a pasar a cada sustituto las horas de su titular.
  async function reaplicarSustituciones() {
    try {
      const r = await fetch('/api/horarios', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'reaplicar_sustituciones', curso: cursoNuevo }) });
      const d = await r.json();
      if (!r.ok) return ` ⚠️ No se pudieron pasar los horarios a los sustitutos (${d.error || 'error'}): hazlo desde cada baja.`;
      if (!d.sustituciones) return '';
      const lista = (d.detalle || []).filter(x => x.horas).map(x => `${x.sustituto} (${x.horas} h de ${x.titular})`);
      return lista.length ? ` 🔄 Pasado a sus sustitutos: ${lista.join(' · ')}.` : ' 🔄 Sustitutos al día.';
    } catch { return ' ⚠️ No se pudieron pasar los horarios a los sustitutos: hazlo desde cada baja.'; }
  }

  // Las ausencias que aún no han terminado guardan sus horas día a día
  // calculadas con el horario que había al registrarlas. Con horarios
  // nuevos hay que rehacerlas, o el reparto cubriría horas que ya no son.
  async function recalcularAusenciasAbiertas() {
    try {
      const r = await fetch('/api/ausencias', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'recalcular_dias', datos: { todas: true } }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return ` ⚠️ No se pudieron actualizar las ausencias abiertas (${d.error || 'error'}).`;
      const mal = (d.fallidas || []).length;
      return ` 📅 Ausencias abiertas actualizadas al horario nuevo: ${d.rehechas} de ${d.total}${mal ? ` (⚠️ ${mal} con error)` : ''}.`;
    } catch { return ' ⚠️ No se pudieron actualizar las ausencias abiertas.'; }
  }

  // Tras subir horarios o cuadrante, rehacer ya el reparto de guardias de
  // hoy y el siguiente día lectivo. Si no, lo ya asignado seguía con el
  // horario viejo (o una regla anterior) hasta el recálculo de las 7:00.
  async function recalcularProximos() {
    try {
      const d = new Date();
      const hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const r = await fetch('/api/guardias/preasignar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: hoy }) });
      return r.ok ? ' 🛡️ Guardias de hoy y del próximo día lectivo recalculadas.' : ' ⚠️ No se pudieron recalcular las guardias: pulsa «Recalcular» en Gestión de guardias.';
    } catch { return ' ⚠️ No se pudieron recalcular las guardias: pulsa «Recalcular» en Gestión de guardias.'; }
  }

  async function confirmarGuardias() {
    if (!previewGuardias.length) return;
    setProcesando(true);

    // Cuadrante completo = se borran TODAS las guardias anteriores (recreos
    // incluidos) y se cargan estas. Solo sectores = se borran únicamente
    // los sectores que vienen en la subida. Si no se puede borrar, no se carga.
    const parcial = modoGuardias === 'sectores';
    const rb = await fetch('/api/horarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parcial
        ? { accion: 'reemplazar_sectores', curso: cursoNuevo, sectores: [...new Set(previewGuardias.map(g => g.sector))] }
        : { accion: 'borrar_todas_las_guardias' }),
    });
    if (!rb.ok) {
      const e = await rb.json().catch(() => ({}));
      setMensaje({ tipo: 'error', texto: `❌ No se pudo preparar la carga: ${e.error || 'error'}` });
      setProcesando(false); return;
    }

    // Insertar en lotes
    const LOTE = 200;
    for (let i = 0; i < previewGuardias.length; i += LOTE) {
      const lote = previewGuardias.slice(i, i + LOTE).map(g => ({
        profesor_nombre_pdf: g.nombre_abrev,
        hora_id: g.hora_id === 'recreo' ? 'recreo' : g.hora_id + 'a',
        dia: g.dia,
        tipo: 'guardia',
        grupo: g.sector,
        materia: '',
        aula: g.aula || '',
        curso_academico: cursoNuevo,
      }));
      setProgresoGuardias({ actual: i + LOTE, total: previewGuardias.length, mensaje: `Guardando ${i}/${previewGuardias.length}...` });
      const _rg = await fetch('/api/horarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'insertar', lote }),
      });
      if (!_rg.ok) {
        const e = await _rg.json();
        setMensaje({ tipo: 'error', texto: `❌ Error: ${e.error || 'no se pudo guardar'}` });
        setProcesando(false); return;
      }
    }

    const tsGua = new Date().toLocaleString('es-ES', { dateStyle:'short', timeStyle:'short' });
    setUltimaGuardias(tsGua);
    try { localStorage.setItem('ultima_importacion_guardias', tsGua); } catch {}
    const sust = await reaplicarSustituciones();
    // Las ausencias abiertas guardan también sus horas de guardia: con el
    // cuadrante nuevo hay que rehacerlas (antes solo se hacía al subir horarios).
    const ausAb = await recalcularAusenciasAbiertas();
    const reca = await recalcularProximos();
    const que = parcial ? `Sectores actualizados: ${[...new Set(previewGuardias.map(g => g.sector))].join(', ')}. El resto del cuadrante no se ha tocado` : 'Cuadrante completo sustituido';
    setMensaje({ tipo: 'ok', texto: `✅ ${previewGuardias.length} registros de guardias cargados — ${tsGua}. ${que}.${sust}${ausAb}${reca}` });
    setModalGuardias(false);
    setPreviewGuardias([]);
    setCambiosGuardias(null);
    setProcesando(false);
    cargarStats();
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { window.location.href = '/gestion'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>📊</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Gestión de Datos del Centro</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre} · Inicio de curso</div>
        </div>
      </div>

      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : mensaje.tipo === 'aviso' ? '#fef3c7' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : mensaje.tipo === 'aviso' ? '#92400e' : '#991b1b', fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* PANEL ARRANQUE DE CURSO */}
        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 18, marginBottom: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', border: '1.5px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, color: azul, fontWeight: 800 }}>🎓 Panel de arranque de curso</h2>
            <button onClick={() => setMostrarGuia(!mostrarGuia)} style={{ background: 'none', border: 'none', fontSize: 13, cursor: 'pointer', color: azul, fontWeight: 600 }}>
              {mostrarGuia ? '▲ Ocultar' : '▼ Desplegar'}
            </button>
          </div>

          {/* CURSO ACADÉMICO */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: mostrarGuia ? 16 : 0 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>📅 Curso:</label>
            <input value={cursoNuevo} onChange={e => setCursoNuevo(e.target.value)} placeholder="2026-2027" style={{ padding: '7px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, width: 130 }} />
            <span style={{ fontSize: 11, color: '#888' }}>Grupos cargados: <strong>{stats.cursoActual || '—'}</strong></span>
          </div>

          {mostrarGuia && (
            <>
              {/* PASOS */}
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                {[
                  {
                    paso: 1,
                    titulo: 'Alumnado de Delphos (datMatriculas + datAlumnos)',
                    descripcion: 'Delphos → Alumnado → Matrículas y Alumnos → Exportar CSV',
                    tab: 'alumnos',
                    emoji: '👥',
                    completado: stats.alumnos > 0,
                    detalle: stats.alumnos > 0 ? `${stats.alumnos} alumnos en ${stats.grupos} grupos${ultimaImportacion ? ' · ' + ultimaImportacion : ''}` : 'Sin cargar',
                  },
                  {
                    paso: 2,
                    titulo: 'Carpeta de horarios HTML',
                    descripcion: 'Peñalara → horarios del profesorado en HTML (carpeta Profesores/)',
                    tab: 'horarios',
                    emoji: '🕐',
                    completado: stats.horarios > 0,
                    detalle: stats.horarios > 0 ? `${stats.horarios} registros de horarios${ultimaHorarios ? ' · ' + ultimaHorarios : ''}` : 'Sin cargar',
                  },
                  {
                    paso: 3,
                    titulo: 'Cuadrante de guardias',
                    descripcion: 'Peñalara → cuadrante de guardias en HTML (una carpeta, un archivo por sector)',
                    tab: 'guardias',
                    emoji: '🛡️',
                    completado: stats.guardias,
                    detalle: stats.guardias ? `Cuadrante cargado${ultimaGuardias ? ' · ' + ultimaGuardias : ''}` : 'Sin cargar (opcional al inicio)',
                  },
                ].map(p => (
                  <div key={p.paso} onClick={() => setVistaTab(p.tab)} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                    borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                    backgroundColor: p.completado ? '#f0fdf4' : '#fefce8',
                    border: `1.5px solid ${p.completado ? '#86efac' : '#fde68a'}`,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: p.completado ? '#22c55e' : '#f59e0b', color: 'white', fontWeight: 800, fontSize: 14,
                    }}>
                      {p.completado ? '✓' : p.paso}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937' }}>{p.emoji} {p.titulo}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{p.descripcion}</div>
                    </div>
                    <div style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                      backgroundColor: p.completado ? '#dcfce7' : '#fef9c3',
                      color: p.completado ? '#166534' : '#854d0e',
                    }}>
                      {p.detalle}
                    </div>
                  </div>
                ))}
              </div>

              {/* RESUMEN */}
              {(() => {
                const completados = [stats.alumnos > 0, stats.horarios > 0].filter(Boolean).length;
                const total = 2;
                const pct = Math.round((completados / total) * 100);
                return (
                  <div style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Progreso arranque de curso</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? '#16a34a' : '#d97706' }}>{completados}/{total} obligatorios</span>
                    </div>
                    <div style={{ height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct === 100 ? '#22c55e' : '#f59e0b', borderRadius: 4, transition: 'width 0.5s' }} />
                    </div>
                    {pct === 100 && (
                      <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600, textAlign: 'center' }}>
                        🎉 ¡Datos del curso listos! El portal está preparado para funcionar.
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { id: 'curso', label: '📅 Datos del curso' },
            { id: 'alumnos', label: '👥 Alumnos y Grupos' },
            { id: 'horarios', label: '🕐 Horarios' },
            { id: 'guardias', label: '🛡️ Guardias' },
            { id: 'calendario', label: '📆 Calendario escolar' },
            { id: 'pga', label: '🚌 Actividades PGA' },
            { id: 'cambio', label: '🔄 Cambio de curso' },
          ].map(t => (
            <button key={t.id} onClick={() => setVistaTab(t.id)} style={{ padding: '9px 16px', borderRadius: 10, border: `2px solid ${vistaTab === t.id ? azul : '#ddd'}`, backgroundColor: vistaTab === t.id ? azul : 'white', color: vistaTab === t.id ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== ACTIVIDADES APROBADAS EN LA PGA ===== */}
        {vistaTab === 'pga' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, color: azul }}>🚌 Actividades aprobadas en la PGA</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>
              Las actividades que los departamentos propusieron y que aprobó el Consejo Escolar.
              Una vez subidas, el profesorado las elige de una lista al proponer una salida,
              sin tener que pedir autorización a dirección.
            </p>

            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 18, fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
              <strong>El archivo debe ser un CSV</strong> con la primera fila de títulos y dos columnas:
              <br />· <strong>ACTIVIDAD</strong> — qué se visita (obligatoria)
              <br />· <strong>LOCALIDAD</strong> — dónde (opcional)
              <br />· <strong>DEPARTAMENTO</strong> — qué departamento la propone (opcional, pero
              ayuda: el profesorado las verá agrupadas)
              <br /><span style={{ color: '#94a3b8' }}>En Excel: Archivo → Guardar como → CSV.</span>
            </div>

            {pgaLista.length > 0 && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: 16, marginBottom: 18 }}>
                <div style={{ fontWeight: 800, color: '#166534', marginBottom: 8, fontSize: 15 }}>
                  ✅ {pgaLista.length} actividades cargadas
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 13, color: '#333' }}>
                  {pgaLista.map(a => (
                    <div key={a.id} style={{ padding: '5px 0', borderBottom: '1px solid #dcfce7' }}>
                      {a.actividad}{a.localidad ? <span style={{ color: '#666' }}> · {a.localidad}</span> : null}
                      {a.departamento ? <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>{a.departamento}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewPGA ? (
              <div style={{ border: '1.5px solid #fde68a', backgroundColor: '#fffbeb', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 8, fontSize: 15 }}>
                  Se van a guardar {previewPGA.length} actividades — curso {previewPGA[0]?.curso_academico}
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13, marginBottom: 14, backgroundColor: 'white', borderRadius: 8, padding: 10 }}>
                  {previewPGA.map((a, i) => (
                    <div key={i} style={{ padding: '4px 0' }}>
                      {a.actividad}{a.localidad ? <span style={{ color: '#666' }}> · {a.localidad}</span> : null}
                      {a.departamento ? <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>· {a.departamento}</span> : null}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => confirmarPGA(false)} disabled={procesando}
                    style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: '#166534', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    ➕ Añadir a las existentes
                  </button>
                  <button onClick={() => confirmarPGA(true)} disabled={procesando}
                    style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: '#b45309', color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    🔄 Reemplazar las de este curso
                  </button>
                  <button onClick={() => setPreviewPGA(null)} disabled={procesando}
                    style={{ padding: '10px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ borderTop: '1px solid #eee', paddingTop: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#333' }}>
                  Subir el listado de la PGA
                </div>

                {/* El selector de archivo del navegador pasa desapercibido,
                    así que va oculto detrás de un botón normal. */}
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 10,
                  padding: '14px 26px', borderRadius: 10, cursor: procesando ? 'wait' : 'pointer',
                  backgroundColor: procesando ? '#94a3b8' : azul, color: 'white',
                  fontWeight: 800, fontSize: 15, boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                }}>
                  <span style={{ fontSize: 19 }}>📂</span>
                  {procesando ? 'Leyendo el archivo...' : 'Elegir archivo CSV'}
                  <input type="file" accept=".csv,text/csv" onChange={procesarCSVPGA} disabled={procesando}
                    style={{ display: 'none' }} />
                </label>

                <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 12, lineHeight: 1.55 }}>
                  Se guardarán para el curso <strong>{cursoNuevo || stats.cursoActual || '—'}</strong>.
                  Podrás revisarlas antes de confirmar.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== CAMBIO DE CURSO ===== */}
        {vistaTab === 'calendario' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, color: azul }}>📆 Calendario escolar del curso</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>
              El cartel oficial de la Consejería. Una vez subido, todo el claustro puede
              consultarlo desde su panel, sin salir de la aplicación.
            </p>

            {calendario ? (
              <div style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: 16, marginBottom: 18 }}>
                <div style={{ fontWeight: 800, color: '#166534', marginBottom: 6, fontSize: 15 }}>
                  ✅ Publicado — curso {calendario.curso}
                </div>
                <div style={{ fontSize: 13, color: '#555', marginBottom: 12 }}>
                  {calendario.nombre} · subido el {new Date(calendario.created_at).toLocaleDateString('es-ES')}
                </div>
                <a href={calendario.archivo_url} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 9, backgroundColor: '#166534', color: 'white', textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>
                  👁️ Ver el calendario
                </a>
              </div>
            ) : (
              <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: 16, marginBottom: 18, fontSize: 13.5, color: '#92400e' }}>
                ⚠️ Todavía no hay calendario publicado para este curso.
              </div>
            )}

            <div style={{ borderTop: '1px solid #eee', paddingTop: 18 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: '#333' }}>
                {calendario ? 'Sustituir por otro archivo' : 'Subir el calendario'}
              </div>
              <div style={{ fontSize: 12.5, color: '#777', marginBottom: 12, lineHeight: 1.6 }}>
                Se admite <strong>PDF o imagen</strong> (JPG, PNG o WEBP), hasta 8 MB.
                Una imagen se ve mejor en el móvil: se abre directa y se amplía con los dedos.
                <br />
                Se publicará para el curso <strong>{cursoNuevo || '—'}</strong>. Si no es el correcto,
                cámbialo arriba en el panel de arranque antes de subirlo.
              </div>

              <input ref={fileRefCalendario} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={subirCalendario} style={{ display: 'none' }} disabled={subiendoCal} />

              <button onClick={() => fileRefCalendario.current?.click()} disabled={subiendoCal}
                style={{ padding: '11px 22px', borderRadius: 10, border: 'none', backgroundColor: subiendoCal ? '#94a3b8' : azul, color: 'white', fontWeight: 700, fontSize: 14, cursor: subiendoCal ? 'default' : 'pointer' }}>
                {subiendoCal ? '⏳ Subiendo...' : '📤 Seleccionar archivo'}
              </button>
            </div>
          </div>
        )}

        {vistaTab === 'cambio' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <CambioCurso />
          </div>
        )}

        {/* ===== DATOS DEL CURSO ===== */}
        {vistaTab === 'curso' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <ConfigCurso />
          </div>
        )}

        {/* ===== ALUMNOS Y GRUPOS ===== */}
        {vistaTab === 'alumnos' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>📊 Alumnado y grupos desde Delphos</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.5 }}>
                Sube los <strong>dos ficheros</strong> que exporta Delphos. Se cruzan por el número de
                alumno, se te enseña qué va a cambiar y solo al confirmar se guarda.
                <strong> Nunca se borra a nadie:</strong> el seguro escolar y las autorizaciones se conservan.
              </div>

              <div style={{ fontSize: 12.5, backgroundColor: '#f0f7ff', padding: '10px 14px', borderRadius: 8, color: '#1e3a8a', marginBottom: 14, lineHeight: 1.6 }}>
                <div><strong>datMatriculas</strong> — Delphos › Alumnado › Matrículas › Exportar. <strong>Obligatorio:</strong> dice quién está y en qué grupo.</div>
                <div><strong>datAlumnos</strong> — Delphos › Alumnado › Alumnos › Exportar. Recomendado: añade el DNI.</div>
                <div style={{ marginTop: 6, fontSize: 11.5 }}>
                  Durante el curso, si solo han cambiado grupos o hay matrículas nuevas, basta con datMatriculas.
                  Las matrículas anuladas, trasladadas y con título obtenido no se cargan.
                </div>
                <div style={{ color: '#7f1d1d', fontWeight: 600, marginTop: 6 }}>
                  ⚠️ Haz antes la copia de seguridad.
                </div>
              </div>

              {[
                { clave: 'matriculas', fichero: ficheroMatriculas, quitar: () => setFicheroMatriculas(null),
                  titulo: 'datMatriculas', icono: '📊', color: '#1e40af', fondo: '#f0f7ff', borde: '#93c5fd',
                  detalle: f => `${f.filas.length} matrículas` },
                { clave: 'alumnos', fichero: ficheroAlumnos, quitar: () => setFicheroAlumnos(null),
                  titulo: 'datAlumnos', icono: '🪪', color: '#166534', fondo: '#f0fdf4', borde: '#86efac',
                  detalle: f => `${f.filas.filter(x => x.ALUMNO).length} fichas` },
              ].map(c => (
                <div key={c.clave} style={{ marginBottom: 10 }}>
                  {c.fichero ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10,
                      border: `2px solid ${c.borde}`, backgroundColor: c.fondo, color: c.color }}>
                      <span style={{ fontSize: 24 }}>✅</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.titulo}</div>
                        <div style={{ fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.fichero.nombre} · {c.detalle(c.fichero)}
                        </div>
                      </div>
                      <button type="button" onClick={c.quitar} disabled={procesando}
                        style={{ border: 'none', background: 'none', color: c.color, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 18px', borderRadius: 10,
                      border: `2.5px dashed ${c.borde}`, backgroundColor: c.fondo, color: c.color, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                      <span style={{ fontSize: 26 }}>{c.icono}</span>
                      <div>Elegir {c.titulo}{c.clave === 'alumnos' ? ' (recomendado)' : ''}</div>
                      <input type="file" accept=".csv,.txt" multiple disabled={procesando}
                        onChange={async e => {
                          // Si se eligen los dos a la vez en cualquier casilla,
                          // cada uno va a su sitio por sus columnas.
                          for (const f of Array.from(e.target.files || [])) await elegirFicheroDelphos(f);
                          e.target.value = '';
                        }}
                        style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              ))}

              <button type="button" onClick={revisarImportacion} disabled={!ficheroMatriculas || procesando}
                style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', marginTop: 4,
                  backgroundColor: ficheroMatriculas ? azul : '#cbd5e1', color: 'white', fontWeight: 800, fontSize: 15,
                  cursor: ficheroMatriculas ? 'pointer' : 'not-allowed' }}>
                {procesando ? '⏳ Revisando…' : ficheroMatriculas ? '🔍 Revisar cambios antes de cargar' : 'Elige al menos datMatriculas'}
              </button>

              {/* El resultado se queda aquí, debajo de los botones, hasta
                  que se haga otra carga. Es lo único que permite comprobar
                  que ha ido bien. */}
              {resultadoCarga && (
                <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10,
                  backgroundColor: '#f0fdf4', border: '1.5px solid #86efac' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#166534' }}>
                    ✅ Carga terminada — {resultadoCarga.titulo}
                  </div>
                  <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 13, color: '#166534', lineHeight: 1.7 }}>
                    {resultadoCarga.lineas.map((l, i) => <li key={i}>{l}</li>)}
                  </ul>
                  {resultadoCarga.aviso && (
                    <div style={{ marginTop: 9, fontSize: 12.5, color: '#1e3a8a',
                      backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
                      borderRadius: 7, padding: '8px 10px' }}>
                      👉 {resultadoCarga.aviso}
                    </div>
                  )}
                  {resultadoCarga.nombres?.length > 0 && (
                    <details style={{ marginTop: 9, fontSize: 12.5, color: '#78350f' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                        Ver los {resultadoCarga.nombres.length} que todavía no estaban
                      </summary>
                      <div style={{ marginTop: 6, lineHeight: 1.6 }}>
                        {resultadoCarga.nombres.join(' · ')}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Grupos cargados */}
            {Object.keys(gruposPorFamilia).length > 0 && (
              <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 12 }}>
                  📚 Grupos cargados — curso {stats.cursoActual} ({stats.grupos} grupos · {stats.alumnos} alumnos){ultimaImportacion ? ` · Actualizado: ${ultimaImportacion}` : ''}
                </div>
                {Object.entries(gruposPorFamilia).sort(([x], [y]) => { const o = Object.keys(FAMILIAS); const i = k => (o.indexOf(k) + 1) || 99; return i(x) - i(y); }).map(([familia, gs]) => (
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
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>🗂️ Horarios del profesorado (HTML de Peñalara)</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6, lineHeight: 1.5 }}>
                Peñalara genera una carpeta llamada <strong>Profesores/</strong> con un archivo HTML por cada profesor. Selecciona esa carpeta completa y el sistema procesará todos los horarios automáticamente.
              </div>
              <div style={{ fontSize: 12, backgroundColor: '#f0fdf4', padding: '8px 12px', borderRadius: 7, color: '#065f46', marginBottom: 16 }}>
                🖥️ <strong>Peñalara:</strong> exporta los horarios del profesorado en HTML. Si te lo entrega comprimido, descomprímelo y selecciona la carpeta <strong>Profesores/</strong>. El archivo índice (Profesores.html) se descarta solo: el aviso «no se pudo extraer datos» sobre él es normal.
              </div>

              {/* ESTADO ACTUAL */}
              <div style={{ backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, color: azul, marginBottom: 8, fontSize: 14 }}>📋 Estado actual de horarios</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{stats.horarios > 0 ? '✅' : '❌'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: stats.horarios > 0 ? '#065f46' : '#991b1b' }}>
                      {stats.horarios > 0 ? `Horarios cargados: ${stats.horarios.toLocaleString('es-ES')} horas${ultimaHorarios ? ' · ' + ultimaHorarios : ''}` : 'No hay horarios cargados'}
                    </div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {stats.horarios > 0 ? 'DLD y Ausencias cargarán el horario automáticamente' : 'Sin horarios, los profesores deberán rellenar manualmente'}
                    </div>
                    {stats.horarios > 0 && (
                      <button type="button" disabled={procesando} onClick={async () => {
                        setProcesando(true);
                        const t = await reaplicarSustituciones();
                        setMensaje({ tipo: t.includes('⚠️') ? 'error' : 'ok', texto: t.trim() || 'No hay ninguna sustitución vigente.' });
                        setProcesando(false);
                      }} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', color: azul, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        🔄 Pasar a los sustitutos el horario de sus titulares
                      </button>
                    )}
                    {stats.horarios > 0 && (
                      <button type="button" disabled={procesando} onClick={async () => {
                        setProcesando(true);
                        const a = await recalcularAusenciasAbiertas();
                        const g = await recalcularProximos();
                        setMensaje({ tipo: a.includes('⚠️') || g.includes('⚠️') ? 'error' : 'ok', texto: (a + g).trim() });
                        setProcesando(false);
                      }} style={{ marginTop: 8, marginLeft: 8, padding: '6px 12px', borderRadius: 7, border: '1px solid #cbd5e1', background: 'white', color: azul, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        📅 Recalcular ausencias abiertas
                      </button>
                    )}
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
                  placeholder="2026-2027" 
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

              {/* ALTERNATIVA: subir archivos HTML sueltos */}
              <div style={{ textAlign: 'center', margin: '10px 0', fontSize: 12, color: '#aaa' }}>— o, para actualizar solo a algunos profesores, sus archivos sueltos —</div>
              <label style={{ display: 'block', cursor: procesando ? 'not-allowed' : 'pointer' }}>
                <input
                  type="file"
                  accept=".html,.htm"
                  multiple
                  onChange={procesarCarpetaHorarios}
                  style={{ display: 'none' }}
                  disabled={procesando}
                />
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  backgroundColor: procesando ? '#f5f5f5' : '#f0fdf4',
                  color: procesando ? '#999' : verde,
                  fontWeight: 700, fontSize: 13, textAlign: 'center',
                  cursor: procesando ? 'not-allowed' : 'pointer',
                  border: `2px dashed ${procesando ? '#ddd' : verde}`,
                }}>
                  {procesando ? '⏳ Procesando...' : '📄 Seleccionar archivos HTML sueltos (uno o varios profesores)'}
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


      {/* PESTAÑA GUARDIAS */}
      {vistaTab === 'guardias' && (
        <div style={{ padding: '0 16px 24px' }}>
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>🛡️ Cuadrante de Guardias (HTML de Peñalara)</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12, lineHeight: 1.6 }}>
              Selecciona la <strong>carpeta</strong> con los archivos HTM de guardias que genera Peñalara. Cada archivo es un sector (TMV, FOL, Recreo...).
              Antes de guardar podrás elegir: sustituir el <strong>cuadrante completo</strong>, o actualizar <strong>solo los sectores que subes</strong> (por ejemplo, solo INFORMÁTICA si a alguien le han cambiado las guardias), dejando el resto como está. Verás qué guardias entran y salen antes de confirmar.
            </div>

            <div style={{ backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: azul, marginBottom: 8, fontSize: 14 }}>
                📋 Estado actual del cuadrante{ultimaGuardias ? <span style={{ fontWeight: 500, color: '#64748b', fontSize: 12 }}> · última carga {ultimaGuardias}</span> : null}
              </div>
              {(stats.sectoresGuardia || []).length === 0 ? (
                <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>❌ No hay cuadrante de guardias cargado</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {stats.sectoresGuardia.map(s => (
                      <div key={s.sector} style={{ padding: '6px 10px', borderRadius: 7, backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', fontSize: 12 }}>
                        <strong style={{ color: '#6d28d9' }}>✅ {s.sector}</strong>
                        <span style={{ color: '#64748b' }}> · {s.profesores} prof. · {s.filas} horas</span>
                      </div>
                    ))}
                  </div>
                  {!stats.sectoresGuardia.some(s => /recreo/i.test(s.sector)) && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>⚠️ No hay recreos cargados. Sube solo el archivo de recreos y elige «Solo estos sectores».</div>
                  )}
                </>
              )}
            </div>
            <label style={{ display: 'block', cursor: procesando ? 'not-allowed' : 'pointer' }}>
              <input ref={fileRefGuardias} type="file" webkitdirectory="" directory="" multiple onChange={procesarCarpetaGuardias} style={{ display: 'none' }} disabled={procesando} />
              <div style={{ padding: '16px', borderRadius: 10, backgroundColor: procesando ? '#f5f5f5' : '#7c3aed', color: procesando ? '#999' : 'white', fontWeight: 700, fontSize: 14, textAlign: 'center', cursor: procesando ? 'not-allowed' : 'pointer' }}>
                {procesando ? '⏳ Procesando...' : '📁 Seleccionar carpeta de Guardias'}
              </div>
            </label>
            <div style={{ textAlign: 'center', fontSize: 12, color: '#94a3b8', margin: '8px 0' }}>— o, más seguro, elige los archivos uno a uno —</div>
            <label style={{ display: 'block', cursor: procesando ? 'not-allowed' : 'pointer' }}>
              <input type="file" accept=".htm,.html" multiple onChange={procesarCarpetaGuardias} style={{ display: 'none' }} disabled={procesando} />
              <div style={{ padding: '12px', borderRadius: 10, border: '2px dashed #7c3aed', color: '#6d28d9', backgroundColor: '#faf5ff', fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
                📄 Seleccionar archivos HTM sueltos (uno o varios sectores)
              </div>
            </label>
          </div>
        </div>
      )}
      </div>

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
            
            {/* QUÉ SE SUSTITUYE */}
            <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
              {[
                { valor: 'profesores', titulo: 'Solo estos profesores', texto: `Se sustituye el horario de ${previewHorarios.totalProfesores === 1 ? 'este profesor' : `estos ${previewHorarios.totalProfesores} profesores`}. Los demás horarios y el cuadrante de guardias se quedan como están.` },
                { valor: 'completo', titulo: 'Todos los horarios', texto: `Se borran todos los horarios del curso ${cursoNuevo} y quedan solo los de esta subida (el cuadrante de guardias no se toca).` },
              ].map(op => {
                const activo = modoHorarios === op.valor;
                return (
                  <label key={op.valor} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${activo ? verde : '#e2e8f0'}`, backgroundColor: activo ? '#f0fdf4' : 'white' }}>
                    <input type="radio" name="modoHorarios" checked={activo} onChange={() => setModoHorarios(op.valor)} disabled={procesando} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: activo ? verde : '#334155' }}>{op.titulo}</div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{op.texto}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            {modoHorarios === 'completo' && previewHorarios.totalProfesores < (stats.profesores || 0) / 2 && (
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 12, padding: '10px 12px', backgroundColor: '#fee2e2', border: '1.5px solid #ef4444', borderRadius: 8 }}>
                ⚠️ <strong>Solo subes {previewHorarios.totalProfesores} horarios</strong> y con esta opción el resto del profesorado se quedaría sin horario. Si solo querías actualizar a estos, elige «Solo estos profesores».
              </div>
            )}

            {/* CAMBIOS POR PROFESOR (solo tiene sentido en la parcial) */}
            {modoHorarios === 'profesores' && (
              <div style={{ marginBottom: 12 }}>
                {cambiosHorarios === null && <div style={{ fontSize: 12, color: '#64748b' }}>⏳ Comparando con lo cargado…</div>}
                {cambiosHorarios?.error && <div style={{ fontSize: 12, color: '#92400e' }}>⚠️ No se ha podido comparar con lo cargado.</div>}
                {cambiosHorarios?.porProfesor && (() => {
                  const dia3 = d => (d || '').substring(0, 3);
                  const linea = h => `${dia3(h.dia)} ${String(h.hora_id || '').replace(/a$/, '')}ª · ${(h.tipo || '').toLowerCase()}${h.grupo ? ` ${h.grupo}` : ''}${h.materia ? ` (${h.materia})` : ''}`;
                  return (
                    <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', maxHeight: 300, overflowY: 'auto' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>🔍 Qué cambia</div>
                      {cambiosHorarios.porProfesor.map((p, i) => (
                        <div key={i} style={{ marginBottom: 10, fontSize: 12, lineHeight: 1.55 }}>
                          <div style={{ fontWeight: 700, color: azul }}>{p.nombre}</div>
                          {p.nuevo && (
                            <div style={{ color: '#92400e' }}>⚠️ No tenía horario cargado con este nombre. Si es alguien nuevo, bien. Si es la misma persona con el nombre escrito distinto, su horario viejo se quedaría también: avísame antes de confirmar.</div>
                          )}
                          {!p.nuevo && !p.entran.length && !p.salen.length && <div style={{ color: '#475569' }}>＝ Sin cambios</div>}
                          {!p.nuevo && p.salen.map((h, j) => <div key={'s' + j} style={{ color: '#991b1b' }}>➖ {linea(h)}</div>)}
                          {!p.nuevo && p.entran.map((h, j) => <div key={'e' + j} style={{ color: '#166534' }}>➕ {linea(h)}</div>)}
                          {p.choques.length > 0 && (
                            <div style={{ color: '#991b1b', marginTop: 4, fontWeight: 600 }}>
                              ⚠️ Tiene clase a una hora en la que el cuadrante le pone guardia: {p.choques.map(g => `${dia3(g.dia)} ${String(g.hora_id).replace(/a$/, '')}ª (${g.grupo})`).join(', ')}. Sube también {[...new Set(p.choques.map(g => g.grupo))].join(', ')} en la pestaña de Guardias.
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}
            
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
              <button onClick={() => { setModalHorarios(false); setPreviewHorarios(null); setCambiosHorarios(null); }} disabled={procesando} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: procesando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* REVISIÓN ANTES DE CARGAR EL ALUMNADO */}
      {modalAlumnos && revision && (() => {
        const lista = (titulo, items, color, render) => items.length > 0 && (
          <details style={{ marginBottom: 8, fontSize: 13 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, color }}>{titulo} ({items.length})</summary>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6 }}>
              {items.map((x, i) => (
                <div key={i} style={{ padding: '5px 10px', borderRadius: 6, backgroundColor: '#f8f8f8', marginBottom: 3, fontSize: 12.5 }}>
                  {render(x)}
                </div>
              ))}
            </div>
          </details>
        );
        const cifra = (n, texto, fondo, color) => (
          <div style={{ flex: '1 1 110px', padding: '10px 8px', borderRadius: 9, backgroundColor: fondo, color, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{n}</div>
            <div style={{ fontSize: 11.5, fontWeight: 600 }}>{texto}</div>
          </div>
        );
        const d = revision.descartes || {};
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 22, maxWidth: 600, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 4 }}>🔍 Qué va a cambiar</div>
              <div style={{ fontSize: 12.5, color: '#666', marginBottom: 14 }}>
                Curso <strong>{cursoNuevo}</strong> · {previewAlumnos.alumnos?.length} alumnos en {previewAlumnos.grupos?.length} grupos.
                Todavía no se ha guardado nada.
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {cifra(revision.nuevos.length, 'nuevos', '#ecfdf5', '#065f46')}
                {cifra(revision.cambian.length, 'cambian de grupo', '#eff6ff', '#1e40af')}
                {cifra(revision.iguales, 'sin cambios', '#f8fafc', '#475569')}
                {cifra(revision.no_aparecen.length, 'pasan a baja', '#fff7ed', '#9a3412')}
              </div>

              {lista('🆕 Nuevos en el centro', revision.nuevos, '#065f46', x => <><strong>{x.nombre}</strong> · {x.grupo}</>)}
              {lista('🔄 Cambian de grupo', revision.cambian, '#1e40af', x => <><strong>{x.nombre}</strong> · {x.de} → {x.a}</>)}
              {lista('📤 Ya no vienen en el fichero: pasan a baja', revision.no_aparecen, '#9a3412', x => <><strong>{x.nombre}</strong> · {x.grupo}</>)}
              {revision.no_aparecen.length > 0 && (
                <div style={{ fontSize: 11.5, color: '#9a3412', margin: '-2px 0 10px' }}>
                  No se borran: dejan de salir en las listas de los tutores y conservan su seguro y sus
                  autorizaciones. Si vuelven a venir en un fichero, se les quita la baja solos.
                </div>
              )}
              {lista('🗂️ Grupos que se quedan sin alumnos: se quitan de la lista de grupos', revision.grupos_vacios || [], '#64748b', x => x)}
              {lista('⚠️ Matrícula vigente sin grupo: no se cargan', d.sinGrupo || [], '#b45309', x => x)}
              {lista('ℹ️ Grupos modulares u otros que no se cargan', d.otrosGrupos || [], '#64748b', x => x)}

              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: '10px 0 16px', padding: '8px 10px', backgroundColor: '#f8fafc', borderRadius: 7 }}>
                Descartadas del fichero: {d.anuladas || 0} anuladas · {d.trasladadas || 0} trasladadas · {d.tituladas || 0} con título obtenido.
                {revision.conAlumnos
                  ? <> DNI: {revision.dni_nuevos} se añaden o corrigen.{revision.sinFicha ? ` ${revision.sinFicha} matrículas sin ficha en datAlumnos.` : ''}</>
                  : <> Sin datAlumnos: no se actualiza ningún DNI.</>}
                {revision.adoptados ? ` ${revision.adoptados} reconocidos por DNI o nombre (no tenían número de Delphos).` : ''}
                {revision.vuelven ? ` ${revision.vuelven} estaban de baja y vuelven.` : ''}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={confirmarAlumnos} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  {procesando ? '⏳ Cargando...' : '✅ Confirmar y cargar'}
                </button>
                <button onClick={() => { setModalAlumnos(false); setPreviewAlumnos([]); setRevision(null); }} disabled={procesando} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* MODAL GUARDIAS */}
      {modalGuardias && previewGuardias.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 12 }}>🛡️ Vista previa de guardias</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              <strong>{previewGuardias.length}</strong> registros detectados en {[...new Set(previewGuardias.map(g => g.sector))].length} sectores.
            </div>

            {/* FECHA DE CADA ARCHIVO: para no subir por error una carpeta vieja */}
            {archivosGuardias.length > 0 && (() => {
              const inicioCurso = new Date(new Date().getMonth() >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1, 8, 1).getTime();
              const viejos = archivosGuardias.filter(a => a.fecha < inicioCurso);
              return (
                <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, border: `1.5px solid ${viejos.length ? '#ef4444' : '#e2e8f0'}`, backgroundColor: viejos.length ? '#fef2f2' : '#f8fafc' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: viejos.length ? '#991b1b' : '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📁 Archivos y su fecha{viejos.length ? ` — ⚠️ ${viejos.length} de antes de septiembre: ¿es la carpeta buena?` : ''}
                  </div>
                  {archivosGuardias.map(a => (
                    <div key={a.nombre} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: a.fecha < inicioCurso ? '#b91c1c' : '#334155', fontWeight: a.fecha < inicioCurso ? 700 : 400 }}>
                      <span>{a.nombre}</span>
                      <span>{new Date(a.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* CRUCE CON LOS HORARIOS CARGADOS */}
            {conflictosGuardias === null && (
              <div style={{ marginBottom: 14, fontSize: 12, color: '#64748b' }}>⏳ Comprobando el cuadrante con los horarios…</div>
            )}
            {conflictosGuardias && !conflictosGuardias.error && conflictosGuardias.horarios > 0 && (
              conflictosGuardias.lista.length === 0 ? (
                <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', fontSize: 12.5, color: '#166534', fontWeight: 600 }}>
                  ✅ Cuadrante coherente con los horarios: nadie sale de guardia a una hora en la que tiene clase.
                </div>
              ) : (
                <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, backgroundColor: '#fef2f2', border: '1.5px solid #ef4444', fontSize: 12.5, color: '#991b1b', lineHeight: 1.5 }}>
                  <strong>⚠️ {conflictosGuardias.lista.length} guardias caen en horas en las que esa persona tiene clase.</strong>{' '}
                  {conflictosGuardias.lista.length > 5 ? 'Casi seguro es un cuadrante que no corresponde a estos horarios (¿uno viejo?). Revisa la carpeta antes de confirmar.' : 'Revísalas antes de confirmar.'}
                  <div style={{ marginTop: 6, fontSize: 11.5, maxHeight: 90, overflowY: 'auto' }}>{conflictosGuardias.lista.slice(0, 30).join(' · ')}{conflictosGuardias.lista.length > 30 ? ' …' : ''}</div>
                </div>
              )
            )}

            {/* DESGLOSE POR DÍA - detecta días vacíos */}
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>📅 Reparto por día</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {['lunes','martes','miercoles','jueves','viernes'].map(d => {
                  const count = previewGuardias.filter(g => g.dia === d).length;
                  const vacio = count === 0;
                  return (
                    <div key={d} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 6, backgroundColor: vacio ? '#fee2e2' : 'white', border: `1.5px solid ${vacio ? '#ef4444' : '#e2e8f0'}` }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: vacio ? '#991b1b' : '#64748b', textTransform: 'capitalize' }}>{d.substring(0,3)}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: vacio ? '#991b1b' : '#0f172a', marginTop: 2 }}>{count}</div>
                      {vacio && <div style={{ fontSize: 9, color: '#991b1b', marginTop: 2 }}>⚠️ VACÍO</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              {[...new Set(previewGuardias.map(g => g.sector))].map(sector => (
                <div key={sector} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 6, backgroundColor: '#f5f3ff', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ fontWeight: 600, color: '#7c3aed' }}>🛡️ {sector}</span>
                  <span style={{ color: '#666' }}>{previewGuardias.filter(g => g.sector === sector).length} registros</span>
                </div>
              ))}
            </div>
            {/* QUÉ SE SUSTITUYE */}
            <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
              {[
                { valor: 'sectores', titulo: 'Solo estos sectores', texto: `Se sustituyen ${[...new Set(previewGuardias.map(g => g.sector))].join(', ')}. El resto del cuadrante (recreos incluidos) se queda como está.` },
                { valor: 'completo', titulo: 'Cuadrante completo', texto: 'Se borran todas las guardias anteriores, recreos incluidos, y quedan solo las de esta subida.' },
              ].map(op => {
                const activo = modoGuardias === op.valor;
                return (
                  <label key={op.valor} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `2px solid ${activo ? '#7c3aed' : '#e2e8f0'}`, backgroundColor: activo ? '#faf5ff' : 'white' }}>
                    <input type="radio" name="modoGuardias" checked={activo} onChange={() => setModoGuardias(op.valor)} disabled={procesando} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: activo ? '#6d28d9' : '#334155' }}>{op.titulo}</div>
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{op.texto}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {modoGuardias === 'completo' && cambiosGuardias?.fuera?.length > 0 && (
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 12, padding: '10px 12px', backgroundColor: '#fef2f2', border: '1.5px solid #ef4444', borderRadius: 8, lineHeight: 1.5 }}>
                ⚠️ <strong>Estos sectores no vienen en la subida y se quedarán sin guardias:</strong> {cambiosGuardias.fuera.join(', ')}. Si solo querías actualizar algunos sectores, elige «Solo estos sectores».
              </div>
            )}

            {/* CAMBIOS RESPECTO A LO CARGADO */}
            {cambiosGuardias === null && (
              <div style={{ marginBottom: 12, fontSize: 12, color: '#64748b' }}>⏳ Comparando con el cuadrante cargado…</div>
            )}
            {cambiosGuardias?.error && (
              <div style={{ marginBottom: 12, fontSize: 12, color: '#92400e' }}>⚠️ No se ha podido comparar con el cuadrante cargado.</div>
            )}
            {cambiosGuardias && !cambiosGuardias.error && (() => {
              const { entran, salen, nuevos } = cambiosGuardias;
              const dia3 = d => (d || '').substring(0, 3);
              const linea = (g) => `${g.nombre} · ${g.sector} · ${dia3(g.dia)} ${g.hora === 'recreo' ? `recreo${g.aula ? ` (${g.aula})` : ''}` : `${g.hora}ª`}`;
              if (!entran.length && !salen.length) {
                return (
                  <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12.5, color: '#475569' }}>
                    ＝ Estos sectores son idénticos a lo que ya está cargado: no cambia ninguna guardia.
                  </div>
                );
              }
              return (
                <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>🔍 Qué cambia en estos sectores</div>
                  {nuevos.length > 0 && (
                    <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>⚠️ Sector que no estaba cargado: <strong>{nuevos.join(', ')}</strong>. Si debería existir ya, revisa que el nombre del archivo sea el de siempre.</div>
                  )}
                  <div style={{ maxHeight: 220, overflowY: 'auto', fontSize: 12, lineHeight: 1.6 }}>
                    {salen.length > 0 && <div style={{ fontWeight: 700, color: '#991b1b' }}>➖ Salen ({salen.length})</div>}
                    {salen.slice(0, 80).map((g, i) => <div key={'s' + i} style={{ color: '#991b1b' }}>{linea(g)}</div>)}
                    {salen.length > 80 && <div style={{ color: '#991b1b' }}>… y {salen.length - 80} más</div>}
                    {entran.length > 0 && <div style={{ fontWeight: 700, color: '#166534', marginTop: salen.length ? 8 : 0 }}>➕ Entran ({entran.length})</div>}
                    {entran.slice(0, 80).map((g, i) => <div key={'e' + i} style={{ color: '#166534' }}>{linea(g)}</div>)}
                    {entran.length > 80 && <div style={{ color: '#166534' }}>… y {entran.length - 80} más</div>}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirmarGuardias} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: '#7c3aed', color: 'white', fontWeight: 700, fontSize: 14, cursor: procesando ? 'not-allowed' : 'pointer' }}>
                {procesando ? '⏳ Guardando...' : `✅ Confirmar (${previewGuardias.length} registros)`}
              </button>
              <button onClick={() => { setModalGuardias(false); setPreviewGuardias([]); setCambiosGuardias(null); }} disabled={procesando} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: procesando ? 'not-allowed' : 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
