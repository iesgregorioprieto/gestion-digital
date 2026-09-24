'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { resolverGrupo } from '@/lib/grupos';
import { getSupabase } from '@/lib/supabase';
import { consulta, consultaRpc } from '@/lib/consulta';
const azul = '#1e3a5f';
const verde = '#1e6b2e';
const rojo = '#991b1b';

// Las 5 autorizaciones del formulario real del IES
const AUTORIZACIONES = [
  {
    key: 'auth_imagenes',
    emoji: '📸',
    label: 'Imágenes (menor 14)',
    detalle: '1ª — Consentimiento grabación/difusión de imágenes',
    quien: 'Tutores legales si <14 años / Alumno/a si >14',
    seccion: 'menor',
  },
  {
    key: 'auth_salidas',
    emoji: '🚪',
    label: 'Salidas recreo/última hora',
    detalle: '2ª — Salir del centro en recreo y última hora sin profesor',
    quien: 'Solo alumnos de 16 ó 17 años — tutores legales',
    seccion: 'menor',
  },
  {
    key: 'auth_actividades',
    emoji: '🎒',
    label: 'Actividades extracurriculares',
    detalle: '3ª — Participar en actividades fuera del centro',
    quien: 'Todos los tutores legales',
    seccion: 'menor',
  },
  {
    // Esto no es una autorización, es situación académica, pero vive en
    // la misma pantalla porque lo marca la misma persona —el tutor— y
    // sobre la misma lista de alumnos.
    key: 'modulos_convalidados',
    emoji: '📘',
    label: 'Permitir la salida del centro en materias convalidadas',
    detalle: 'Puede salir del centro en las horas de los módulos que tiene convalidados',
    quien: 'Tutor del grupo o equipo directivo',
    seccion: 'academico',
  },
  {
    key: 'auth_informar_progeni',
    emoji: '📊',
    label: 'Informar a progenitores',
    detalle: '1ª — Informar a progenitores de datos académicos',
    quien: 'Solo alumnos mayores de edad',
    seccion: 'mayor',
  },
  {
    key: 'auth_imagenes_mayor',
    emoji: '📸',
    label: 'Imágenes (mayor de edad)',
    detalle: '2ª — Consentimiento grabación/difusión de imágenes',
    quien: 'Solo alumnos mayores de edad',
    seccion: 'mayor',
  },
];

export default function GestionAutorizaciones() {
  const [profesorNombre, setProfesorNombre] = useState('');
  const [rolGestion, setRolGestion] = useState('');
  const [esTutor, setEsTutor] = useState(false);
  const [grupoTutor, setGrupoTutor] = useState('');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState('');
  const [grupos, setGrupos] = useState([]);
  const [generandoInforme, setGenerandoInforme] = useState(false);
  const [panel, setPanel] = useState(null);
  const [cargandoPanel, setCargandoPanel] = useState(false);
  const [precioSeguro, setPrecioSeguro] = useState(1.12);

  /**
   * PANEL DE SEGUROS ESCOLARES.
   *
   * Los mismos números que el informe descargable, pero a la vista al
   * entrar en la pantalla. Cuenta pagados, exentos y pendientes; separa
   * transferencia y metálico; identifica los pagos sin forma anotada; y
   * detecta a los alumnos de 1º y 2º de ESO que están como pendientes
   * cuando les corresponde ser exentos por edad.
   */
  async function cargarPanel() {
    if (!esDirectivo || grupos.length === 0) return;
    setCargandoPanel(true);
    try {
      const filas = [];
      for (const g of grupos) {
        const { alumnos: delGrupo } = await fetch(
          `/api/alumnos?grupo=${encodeURIComponent(g)}`).then(r => r.json());
        (delGrupo || []).forEach(a => filas.push({ grupo: g, ...a }));
      }
      const pagados = filas.filter(a => a.seguro_pagado);
      const transf  = pagados.filter(a => a.seguro_forma_pago === 'transferencia').length;
      const metal   = pagados.filter(a => a.seguro_forma_pago === 'metalico').length;
      const sinForma = pagados.filter(a => !a.seguro_forma_pago || !a.seguro_forma_pago.trim());
      const exentos = filas.filter(a => a.seguro_exento).length;
      const esEsoBaja = a => (a.grupo || '').startsWith('ESO-1') || (a.grupo || '').startsWith('ESO-2');
      const eso12PorMarcar = filas.filter(a => esEsoBaja(a) && !a.seguro_exento && !a.seguro_pagado).length;
      setPanel({
        total: filas.length,
        pagados: pagados.length,
        exentos,
        pendientes: filas.length - pagados.length - exentos,
        transf, metal,
        sinForma: sinForma.map(a => ({ grupo: a.grupo, nombre: `${a.apellidos}, ${a.nombre}`, fecha: a.seguro_fecha || '' })),
        eso12PorMarcar,
      });
    } finally {
      setCargandoPanel(false);
    }
  }
  // Se carga cuando hay grupos disponibles. La comprobación de rol la
  // hace la propia función: si no es directivo, no hace nada.
  // (No se puede referenciar esDirectivo aquí porque se declara más abajo.)
  const [alumnos, setAlumnos] = useState([]);
  const [cambios, setCambios] = useState({}); // {id: {auth_imagenes: true/false, dni: ''}}
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [alumnoExpandido, setAlumnoExpandido] = useState(null);

  const esDirectivo = ['jefe_estudios', 'secretario', 'director'].includes(rolGestion);

  // Cargar el panel de seguros cuando ya sepamos si es directivo y haya grupos.
  useEffect(() => { cargarPanel(); }, [esDirectivo, grupos.length]);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }

    const nombre = sessionStorage.getItem('profesor_nombre') || '';
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    const roles = JSON.parse(sessionStorage.getItem('profesor_roles') || '[]');
    const tutor = roles.includes('tutor');

    setProfesorNombre(nombre);
    setRolGestion(rol);
    setEsTutor(tutor);

    const esDirectivoLocal = ['jefe_estudios', 'secretario', 'director'].includes(rol);

    if (!tutor && !esDirectivoLocal) {
      window.location.href = '/gestion';
      return;
    }

    cargarGrupos();

    // Si es tutor, cargar su grupo automáticamente
    if (tutor && !esDirectivoLocal) {
      // El grupo de la ficha del tutor puede estar escrito de otra forma
      // que en el listado de alumnado ("2º DDC" frente a "2DDC"). Se
      // traduce al nombre real antes de pedir nada, o el tutor se queda
      // mirando una pantalla vacía sin saber por qué.
      Promise.all([
        consulta('profesores').select('grupo_tutoria').eq('id', id),
        fetch('/api/alumnos?grupos=1').then(r => r.json()),
      ]).then(([{ data }, { grupos: existentes }]) => {
        const suyo = data?.[0]?.grupo_tutoria;
        if (!suyo) return;
        const real = resolverGrupo(suyo, existentes || []) || suyo;
        setGrupoTutor(real);
        setGrupoSeleccionado(real);
        cargarAlumnos(real);
      });
    }
  }, []);

  async function cargarGrupos() {
    const { grupos: data } = await fetch('/api/alumnos?grupos=1').then(r => r.json());
    if (data) {
      const gs = [...data].sort();
      setGrupos(gs);
    }
  }

  async function cargarAlumnos(grupo) {
    if (!grupo) return;
    setCargando(true);
    setAlumnos([]);
    setCambios({});
    const { alumnos: data } = await fetch(`/api/alumnos?grupo=${encodeURIComponent(grupo)}`)
      .then(r => r.json());
    setAlumnos(data || []);
    setCargando(false);
  }

  /**
   * DESCARGAS PARA ADMINISTRACIÓN
   *
   * Lo que se marca aquí hay que grabarlo después en Delphos, y eso lo
   * hacen los administrativos a mano. Necesitan el listado por grupos, no
   * la pantalla.
   *
   * Y una copia de seguridad de todo, porque son 314 seguros y más de mil
   * autorizaciones marcadas una a una por los tutores: si se pierden, se
   * pierde el trabajo de un trimestre.
   *
   * Se separa por punto y coma para que Excel en español lo abra en
   * columnas, y con la marca del principio para que respete las tildes.
   */
  const CABECERA = ['Grupo', 'Apellidos', 'Nombre', 'DNI', 'Seguro escolar', 'Exento de seguro',
    'Forma de pago', 'Fecha pago', 'Imágenes (menor)', 'Salidas recreo',
    'Actividades extraescolares', 'Informar progenitores', 'Imágenes (mayor)',
    'Salida en convalidadas'];

  const filaDe = a => [
    a.grupo || '', a.apellidos || '', a.nombre || '', a.dni || '',
    a.seguro_pagado ? 'SÍ' : 'NO', a.seguro_exento ? 'SÍ' : 'NO',
    a.seguro_forma_pago || '', a.seguro_fecha || '',
    a.auth_imagenes ? 'SÍ' : 'NO',
    a.auth_salidas ? 'SÍ' : 'NO',
    a.auth_actividades ? 'SÍ' : 'NO',
    a.auth_informar_progeni ? 'SÍ' : 'NO',
    a.auth_imagenes_mayor ? 'SÍ' : 'NO',
    a.modulos_convalidados ? 'SÍ' : 'NO',
  ];

  function bajarCsv(filas, nombre) {
    const csv = [CABECERA, ...filas]
      .map(f => f.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  function descargarGrupo() {
    if (!grupoSeleccionado || alumnos.length === 0) return;
    bajarCsv(alumnos.map(filaDe),
      `autorizaciones_${grupoSeleccionado.replace(/[^\w.-]/g, '_')}.csv`);
  }

  const [copiando, setCopiando] = useState(false);

  async function copiaDeSeguridad() {
    setCopiando(true);
    try {
      const filas = [];
      for (const g of grupos) {
        const { alumnos: data } = await fetch(`/api/alumnos?grupo=${encodeURIComponent(g)}`)
          .then(r => r.json()).catch(() => ({ alumnos: [] }));
        (data || []).forEach(a => filas.push(filaDe(a)));
      }
      const hoy = new Date().toISOString().slice(0, 10);
      bajarCsv(filas, `copia-autorizaciones-${hoy}.csv`);
      alert(
        `Copia descargada: ${filas.length} alumnos de ${grupos.length} grupos.\n\n` +
        `Guárdala en la carpeta de copias del centro:\n` +
        `Equipo Directivo › Curso 26-27 › APrieto › Copias de Seguridad`
      );
    } catch {
      alert('No se ha podido completar la copia. Inténtalo de nuevo.');
    }
    setCopiando(false);
  }

  /**
   * RESTAURAR UNA COPIA
   *
   * Una copia que no se puede recargar no sirve de nada. Esto lee el CSV
   * que genera el botón de copia de seguridad y devuelve a cada alumno lo
   * que tenía marcado: el seguro y las cinco autorizaciones.
   *
   * No crea ni borra alumnos: solo repone lo marcado en los que ya están,
   * emparejando por apellidos y nombre. Si alguien de la copia ya no está
   * en la aplicación, se cuenta y se dice, pero no se toca nada más.
   */
  const [restaurando, setRestaurando] = useState(false);

  async function restaurarCopia(archivo) {
    if (!archivo) return;
    const texto = await archivo.text();
    const lineas = texto.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
    const sep = lineas[0].includes(';') ? ';' : ',';
    const parte = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
    const cab = parte(lineas[0]);
    const col = n => cab.findIndex(c => c.toLowerCase() === n.toLowerCase());

    const iAp = col('Apellidos'), iNo = col('Nombre');
    if (iAp === -1 || iNo === -1) {
      alert('Ese archivo no parece una copia de autorizaciones: faltan las columnas Apellidos y Nombre.');
      return;
    }
    const si = v => String(v).trim().toUpperCase() === 'SÍ' || String(v).trim().toUpperCase() === 'SI';
    const campos = [
      ['Seguro escolar', 'seguro_pagado'],
      ['Exento de seguro', 'seguro_exento'],
      ['Imágenes (menor)', 'auth_imagenes'],
      ['Salidas recreo', 'auth_salidas'],
      ['Actividades extraescolares', 'auth_actividades'],
      ['Informar progenitores', 'auth_informar_progeni'],
      ['Imágenes (mayor)', 'auth_imagenes_mayor'],
      ['Salida en convalidadas', 'modulos_convalidados'],
    ].filter(([c]) => col(c) !== -1);

    const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();

    const copia = new Map();
    for (let i = 1; i < lineas.length; i++) {
      const c = parte(lineas[i]);
      if (!c[iAp]) continue;
      const datos = {};
      campos.forEach(([cab2, campo]) => { datos[campo] = si(c[col(cab2)]); });
      copia.set(norm(c[iAp]) + '|' + norm(c[iNo]), datos);
    }

    if (!confirm(
      `La copia trae ${copia.size} alumnos.\n\n` +
      `Se les devolverá lo que tenían marcado: seguro y autorizaciones.\n` +
      `NO se crea ni se borra ningún alumno.\n\n` +
      `¿Continuar?`
    )) return;

    setRestaurando(true);
    let repuestos = 0, noEstan = 0;
    try {
      for (const g of grupos) {
        const { alumnos: data } = await fetch(`/api/alumnos?grupo=${encodeURIComponent(g)}`)
          .then(r => r.json()).catch(() => ({ alumnos: [] }));
        for (const a of (data || [])) {
          const guardado = copia.get(norm(a.apellidos) + '|' + norm(a.nombre));
          if (!guardado) continue;
          const r = await fetch('/api/alumnos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accion: 'actualizar', id: a.id, datos: guardado }),
          });
          if (r.ok) { repuestos++; copia.delete(norm(a.apellidos) + '|' + norm(a.nombre)); }
        }
      }
      noEstan = copia.size;
      alert(
        `Restauración terminada.\n\n` +
        `${repuestos} alumnos con sus datos repuestos.\n` +
        (noEstan ? `${noEstan} de la copia ya no están en la aplicación: no se ha tocado nada suyo.` : '')
      );
      if (grupoSeleccionado) cargarAlumnos(grupoSeleccionado);
    } catch {
      alert('La restauración se ha interrumpido. Vuelve a intentarlo: repetirla no hace daño.');
    }
    setRestaurando(false);
  }

  function toggleAuth(alumnoId, campo) {
    const alumno = alumnos.find(a => a.id === alumnoId);
    const valorActual = cambios[alumnoId]?.[campo] !== undefined
      ? cambios[alumnoId][campo]
      : alumno[campo];
    setCambios(c => ({
      ...c,
      [alumnoId]: { ...c[alumnoId], [campo]: !valorActual }
    }));
  }

  function setDni(alumnoId, dni) {
    setCambios(c => ({ ...c, [alumnoId]: { ...c[alumnoId], dni } }));
  }

  function getValor(alumno, campo) {
    if (cambios[alumno.id]?.[campo] !== undefined) return cambios[alumno.id][campo];
    return alumno[campo];
  }

  function hayPendientes() {
    return Object.keys(cambios).length > 0;
  }

  async function guardarCambios() {
    if (!hayPendientes()) return;
    setGuardando(true);
    let errores = 0;
    for (const [id, datos] of Object.entries(cambios)) {
      const resp = await fetch('/api/alumnos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'actualizar', id, datos }),
      });
      const error = resp.ok ? null : await resp.json();
      if (error) errores++;
    }
    setGuardando(false);
    if (errores > 0) {
      mostrarMensaje(`⚠️ ${errores} errores al guardar`, 'error');
    } else {
      mostrarMensaje(`✅ ${Object.keys(cambios).length} alumnos actualizados`, 'ok');
      setCambios({});
      cargarAlumnos(grupoSeleccionado);
    }
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  // Contar restricciones de un alumno
  /**
   * Informe de seguros escolares de todos los grupos.
   *
   * Se pide grupo por grupo porque la API entrega el alumnado filtrado
   * por grupo; son pocas peticiones y así no hace falta un endpoint nuevo.
   */
  async function descargarInformeSeguros() {
    setGenerandoInforme(true);
    try {
      const filas = [];
      for (const g of grupos) {
        const { alumnos: delGrupo } = await fetch(
          `/api/alumnos?grupo=${encodeURIComponent(g)}`).then(r => r.json());
        (delGrupo || []).forEach(a => filas.push({ grupo: g, ...a }));
      }

      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const formaTexto = f =>
        f === 'transferencia' ? 'Transferencia' : f === 'metalico' ? 'Metálico' : '';

      const lineas = [
        // "Situación" en vez de "Pagado": un exento no es alguien que no
        // ha pagado, es alguien a quien no le corresponde. Mezclarlos en
        // el mismo NO hacía que pareciera que faltaba cobrar a quien no
        // debe nada.
        ['Grupo', 'Apellidos', 'Nombre', 'DNI', 'Situación', 'Forma de pago', 'Fecha']
          .map(esc).join(';'),
        ...filas
          .sort((a, b) =>
            (a.grupo || '').localeCompare(b.grupo || '', 'es')
            || (a.apellidos || '').localeCompare(b.apellidos || '', 'es'))
          .map(a => [
            a.grupo, a.apellidos, a.nombre, a.dni || '',
            a.seguro_exento ? 'EXENTO' : (a.seguro_pagado ? 'PAGADO' : 'PENDIENTE'),
            formaTexto(a.seguro_forma_pago),
            a.seguro_fecha || '',
          ].map(esc).join(';')),
      ];

      // BOM para que Excel abra bien las tildes
      const blob = new Blob(['\ufeff' + lineas.join('\n')],
        { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seguros-escolares-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      const pagados = filas.filter(x => x.seguro_pagado).length;
      const exentos = filas.filter(x => x.seguro_exento).length;
      const pendientes = filas.length - pagados - exentos;
      mostrarMensaje(
        `✅ Informe descargado · ${pagados} pagados · ${exentos} exentos · ${pendientes} pendientes`,
        'ok');
    } catch (e) {
      mostrarMensaje('No se ha podido generar el informe', 'error');
    }
    setGenerandoInforme(false);
  }

  function contarRestricciones(alumno) {
    // Las convalidaciones no son una autorización: no faltan, se tienen
    // o no se tienen. No cuentan como pendiente.
    return AUTORIZACIONES.filter(a => a.seccion !== 'academico' && !getValor(alumno, a.key)).length;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { const r = sessionStorage.getItem('profesor_rol_gestion'); window.location.href = '/gestion'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>📋</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Gestión de Autorizaciones</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {profesorNombre} · {esTutor && !esDirectivo ? `Tutor/a ${grupoTutor}` : 'Jefatura / Dirección'}
          </div>
        </div>
      </div>

      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : rojo, fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* PANEL DE SEGUROS ESCOLARES — solo directivos */}
        {esDirectivo && panel && (() => {
          const p = panel;
          const num = n => (n * (precioSeguro || 0)).toLocaleString('es-ES',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
          return (
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16,
              boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: azul }}>
                  🛡️ Seguros escolares — resumen
                </div>
                <button onClick={cargarPanel} disabled={cargandoPanel}
                  style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1',
                    backgroundColor: 'white', color: '#475569', fontSize: 11.5, cursor: 'pointer' }}>
                  {cargandoPanel ? 'Actualizando…' : '↻ Actualizar'}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>{p.pagados}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>han pagado</div>
                </div>
                <div style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#075985' }}>{p.exentos}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>exentos marcados</div>
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#991b1b' }}>{p.pendientes}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>pendientes</div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '11px 13px' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#b45309' }}>{p.eso12PorMarcar}</div>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>de 1º-2º ESO por marcar exentos</div>
                </div>
              </div>

              {p.eso12PorMarcar > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 9,
                  padding: '9px 11px', fontSize: 12.5, color: '#78350f', marginBottom: 12 }}>
                  Si esos <strong>{p.eso12PorMarcar}</strong> alumnos se marcan como exentos, los
                  pendientes reales bajan a <strong>{p.pendientes - p.eso12PorMarcar}</strong>.
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                marginBottom: 10, flexWrap: 'wrap' }}>
                <label>Importe por alumno:</label>
                <input type="number" step="0.01" min="0" value={precioSeguro}
                  onChange={e => setPrecioSeguro(parseFloat(e.target.value) || 0)}
                  style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1',
                    fontSize: 13 }} /> €
                <span style={{ color: '#94a3b8' }}>— cámbialo si el vuestro es otro</span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#64748b', fontSize: 11.5, textTransform: 'uppercase' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Forma de pago</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Alumnos</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={{ padding: '6px 8px' }}>🏦 Transferencia</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.transf}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{num(p.transf)}</td></tr>
                    <tr><td style={{ padding: '6px 8px' }}>💵 Metálico</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.metal}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{num(p.metal)}</td></tr>
                    <tr><td style={{ padding: '6px 8px' }}>❓ Sin forma anotada</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.sinForma.length}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{num(p.sinForma.length)}</td></tr>
                    <tr style={{ fontWeight: 800, background: '#f8fafc' }}>
                      <td style={{ padding: '6px 8px' }}>Total cobrado</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{p.pagados}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{num(p.pagados)}</td></tr>
                  </tbody>
                </table>
              </div>

              {p.sinForma.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#b45309', fontWeight: 700 }}>
                    ⚠️ Ver los {p.sinForma.length} pagados sin forma anotada
                  </summary>
                  <div style={{ marginTop: 6, fontSize: 12.5, color: '#334155', lineHeight: 1.7 }}>
                    {p.sinForma.map((x, i) => (
                      <div key={i}>{x.grupo} — {x.nombre}{x.fecha ? ` · ${x.fecha}` : ''}</div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })()}

        {/* INFORME DE SEGUROS — solo directivos */}
        {esDirectivo && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: azul }}>🛡️ Seguros escolares</div>
                <div style={{ fontSize: 11.5, color: '#666', marginTop: 2 }}>
                  Todos los grupos, con quién ha pagado y cómo. Se abre con Excel.
                </div>
              </div>
              <button onClick={descargarInformeSeguros} disabled={generandoInforme || grupos.length === 0}
                style={{ padding: '10px 18px', borderRadius: 9, border: 'none',
                  backgroundColor: generandoInforme ? '#94a3b8' : '#166534', color: 'white',
                  fontWeight: 700, fontSize: 13.5, cursor: generandoInforme ? 'default' : 'pointer' }}>
                {generandoInforme ? 'Generando…' : '📥 Descargar informe'}
              </button>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', width: '100%' }}>
                <button onClick={descargarGrupo} disabled={!grupoSeleccionado || alumnos.length === 0}
                  title="Listado del grupo que estás viendo, para pasárselo a administración"
                  style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 8,
                    border: `1.5px solid ${grupoSeleccionado ? azul : '#ddd'}`, backgroundColor: 'white',
                    color: grupoSeleccionado ? azul : '#aaa', fontSize: 13, fontWeight: 700,
                    cursor: grupoSeleccionado ? 'pointer' : 'default' }}>
                  📄 Descargar este grupo
                </button>
                <button onClick={copiaDeSeguridad} disabled={copiando || grupos.length === 0}
                  title="Todos los grupos con TODO lo marcado: seguro y las autorizaciones"
                  style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 8,
                    border: '1.5px solid #64748b', backgroundColor: 'white', color: '#475569',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {copiando ? '⏳ Preparando…' : '💾 Copia de seguridad'}
                </button>
                <label style={{ flex: '1 1 180px', padding: '9px 12px', borderRadius: 8,
                  border: '1.5px solid #b45309', backgroundColor: 'white', color: '#b45309',
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                  {restaurando ? '⏳ Restaurando…' : '♻️ Restaurar una copia'}
                  <input type="file" accept=".csv" disabled={restaurando}
                    onChange={e => { restaurarCopia(e.target.files?.[0]); e.target.value = ''; }}
                    style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ fontSize: 11.5, color: '#888', marginTop: 6, width: '100%' }}>
                La copia lleva el seguro Y las autorizaciones de todos los grupos.
                Guárdala antes de actualizar las listas de alumnado.
              </div>
            </div>
          </div>
        )}

        {/* SELECTOR DE GRUPO — solo para directivos */}
        {esDirectivo && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 8 }}>📚 Selecciona el grupo</label>
            <select value={grupoSeleccionado} onChange={e => { setGrupoSeleccionado(e.target.value); cargarAlumnos(e.target.value); }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }}>
              <option value="">— Selecciona un grupo —</option>
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}

        {/* GRUPO DEL TUTOR */}
        {esTutor && !esDirectivo && grupoTutor && (
          <div style={{ backgroundColor: '#dbeafe', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🤝</span>
            <div>
              <div style={{ fontWeight: 700, color: azul, fontSize: 14 }}>Tu grupo de tutoría</div>
              <div style={{ fontSize: 13, color: '#1e40af' }}>{grupoTutor}</div>
            </div>
          </div>
        )}

        {/* BOTÓN GUARDAR */}
        {hayPendientes() && (
          <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: '#1e3a5f', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: 'white', fontSize: 13, fontWeight: 600 }}>
              ⚠️ {Object.keys(cambios).length} alumno{Object.keys(cambios).length > 1 ? 's' : ''} con cambios sin guardar
            </div>
            <button onClick={guardarCambios} disabled={guardando} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              {guardando ? '⏳' : '💾 Guardar'}
            </button>
          </div>
        )}

        {/* LISTA DE ALUMNOS */}
        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando alumnos...</div>
        ) : alumnos.length === 0 && grupoSeleccionado ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No hay alumnos en este grupo</div>
        ) : alumnos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
            <div>{esDirectivo ? 'Selecciona un grupo para empezar' : 'Cargando tu grupo...'}</div>
          </div>
        ) : (
          <div>
            {/* RESUMEN */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'Total', valor: alumnos.length, emoji: '👥', color: azul },
                { label: 'Con restricción', valor: alumnos.filter(a => contarRestricciones(a) > 0).length, emoji: '⚠️', color: '#92400e' },
                { label: 'Sin DNI', valor: alumnos.filter(a => !a.dni).length, emoji: '🪪', color: rojo },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: 'white', borderRadius: 10, padding: '10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 18 }}>{s.emoji}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.valor}</div>
                  <div style={{ fontSize: 10, color: '#888' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* LEYENDA */}
            <div style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#92400e', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>✅ = Autorizado</span>
              <span>❌ = NO autorizado (pulsa para cambiar)</span>
            </div>

            {alumnos.map(alumno => {
              const expandido = alumnoExpandido === alumno.id;
              const restricciones = contarRestricciones(alumno);
              const tieneCambios = !!cambios[alumno.id];

              return (
                <div key={alumno.id} style={{ backgroundColor: 'white', borderRadius: 12, marginBottom: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: `2px solid ${tieneCambios ? '#fbbf24' : restricciones > 0 ? '#fca5a5' : '#e5e7eb'}`, overflow: 'hidden' }}>

                  {/* CABECERA ALUMNO */}
                  <div onClick={() => setAlumnoExpandido(expandido ? null : alumno.id)}
                    style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>{alumno.apellidos}, {alumno.nombre}</div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2, display: 'flex', gap: 8 }}>
                        {alumno.dni ? <span>🪪 {alumno.dni}</span> : <span style={{ color: rojo }}>🪪 Sin DNI</span>}
                        {tieneCambios && <span style={{ color: '#92400e', fontWeight: 600 }}>✏️ Sin guardar</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {restricciones > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 700, backgroundColor: '#fee2e2', color: rojo, padding: '3px 8px', borderRadius: 20 }}>
                          ❌ {restricciones}
                        </span>
                      )}
                      <span style={{ color: '#aaa', fontSize: 18 }}>{expandido ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* DETALLE EXPANDIDO */}
                  {expandido && (
                    <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px 14px' }}>

                      {/* DNI */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: azul, display: 'block', marginBottom: 5 }}>🪪 DNI del alumno/a</label>
                        <input
                          value={cambios[alumno.id]?.dni !== undefined ? cambios[alumno.id].dni : (alumno.dni || '')}
                          onChange={e => setDni(alumno.id, e.target.value)}
                          placeholder="12345678A"
                          maxLength={9}
                          style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box', textTransform: 'uppercase' }}
                        />
                      </div>

                      {/* SITUACIÓN ACADÉMICA */}
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', margin: '12px 0 8px', letterSpacing: 0.5 }}>
                        Situación académica
                      </div>
                      {AUTORIZACIONES.filter(a => a.seccion === 'academico').map(auth => {
                        const valor = getValor(alumno, auth.key);
                        return (
                          <div key={auth.key} onClick={() => toggleAuth(alumno.id, auth.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer', backgroundColor: valor ? '#f0fdf4' : '#fafafa', border: `1.5px solid ${valor ? '#6ee7b7' : '#e5e7eb'}`, transition: 'all 0.15s' }}>
                            <span style={{ fontSize: 22, minWidth: 30, textAlign: 'center' }}>{valor ? '✅' : '⬜'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: valor ? '#065f46' : '#555' }}>
                                {auth.emoji} {auth.label}
                              </div>
                              <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>{auth.detalle}</div>
                              <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>👤 {auth.quien}</div>
                            </div>
                          </div>
                        );
                      })}

                      {/* SECCIÓN MENORES */}
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#6d28d9', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                        A cumplimentar si es menor de edad
                      </div>
                      {AUTORIZACIONES.filter(a => a.seccion === 'menor').map(auth => {
                        const valor = getValor(alumno, auth.key);
                        return (
                          <div key={auth.key} onClick={() => toggleAuth(alumno.id, auth.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer', backgroundColor: valor ? '#f0fdf4' : '#fee2e2', border: `1.5px solid ${valor ? '#6ee7b7' : '#fca5a5'}`, transition: 'all 0.15s' }}>
                            <span style={{ fontSize: 22, minWidth: 30, textAlign: 'center' }}>{valor ? '✅' : '❌'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: valor ? '#065f46' : rojo }}>
                                {auth.emoji} {auth.label}
                              </div>
                              <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>{auth.detalle}</div>
                              <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>👤 {auth.quien}</div>
                            </div>
                          </div>
                        );
                      })}

                      {/* SECCIÓN MAYORES */}
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', margin: '12px 0 8px', letterSpacing: 0.5 }}>
                        A cumplimentar si es mayor de edad
                      </div>
                      {AUTORIZACIONES.filter(a => a.seccion === 'mayor').map(auth => {
                        const valor = getValor(alumno, auth.key);
                        return (
                          <div key={auth.key} onClick={() => toggleAuth(alumno.id, auth.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 6, cursor: 'pointer', backgroundColor: valor ? '#f0fdf4' : '#fee2e2', border: `1.5px solid ${valor ? '#6ee7b7' : '#fca5a5'}`, transition: 'all 0.15s' }}>
                            <span style={{ fontSize: 22, minWidth: 30, textAlign: 'center' }}>{valor ? '✅' : '❌'}</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: valor ? '#065f46' : rojo }}>
                                {auth.emoji} {auth.label}
                              </div>
                              <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>{auth.detalle}</div>
                              <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>👤 {auth.quien}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* BOTÓN GUARDAR FINAL */}
            {hayPendientes() && (
              <button onClick={guardarCambios} disabled={guardando} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginTop: 8 }}>
                {guardando ? '⏳ Guardando...' : `💾 Guardar ${Object.keys(cambios).length} cambio${Object.keys(cambios).length > 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
