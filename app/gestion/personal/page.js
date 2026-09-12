'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { getSupabase } from '@/lib/supabase';
import { consulta, consultaRpc } from '@/lib/consulta';
import { getCursoActual } from '@/lib/curso';
import { DEPARTAMENTOS } from '@/lib/sectores';

const TIPOS_CONTRATO = [
  'Funcionario de carrera',
  'Interino con vacante',
  'Interino sin vacante',
  'Comisión de servicios'
];

// Años para los desplegables. Se pide el AÑO, nunca el número de años:
// el número se calcula solo y así no envejece en la ficha.
function anios(desde, hasta) {
  const salida = [];
  for (let a = hasta; a >= desde; a--) salida.push(String(a));
  return salida;
}
const ANIOS_INCORPORACION = ['', ...anios(1970, new Date().getFullYear())];

const ROLES_DOCENTES = [
  { valor: 'profesor', etiqueta: '📚 Profesor/a' },
  { valor: 'tutor', etiqueta: '🤝 Tutor/a' },
  { valor: 'jefe_departamento', etiqueta: '📂 Jefe/a de Departamento' },
];

// El sector de guardia se deriva automáticamente del departamento (ver lib/sectores.js)

export default function PanelSecretario() {
  const [pestana, setPestana] = useState('profesores');
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [busqueda, setBusqueda] = useState('');
  const [filtroDpto, setFiltroDpto] = useState('');
  const [profesores, setProfesores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState(null);
  const [modoVista, setModoVista] = useState(null);
  const [formEdicion, setFormEdicion] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [aprobandoId, setAprobandoId] = useState(null);
  const [resumenMasivo, setResumenMasivo] = useState(null);
  const [pestanaFicha, setPestanaFicha] = useState('datos'); // 'datos' | 'baja'
  const [gestionandoBaja, setGestionandoBaja] = useState(false);
  const [fechaBaja, setFechaBaja] = useState(hoyLocal());
  const [mensaje, setMensaje] = useState(null);
  const [nombreUsuario, setNombreUsuario] = useState('');

  // PROTECCIÓN: si no has hecho login, te manda al login
  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) {
      window.location.href = '/login';
      return;
    }
    if (rol !== 'secretario' && rol !== 'director' && rol !== 'jefe_estudios') {
      window.location.href = '/gestion';
      return;
    }
    setNombreUsuario(nombre || '');
  }, []);

  useEffect(() => {
    cargarProfesores();
  }, [filtroEstado]);

  async function cargarProfesores() {
    setCargando(true);
    const resp = await fetch(`/api/profesores?estado=${encodeURIComponent(filtroEstado)}`);
    const cuerpo = await resp.json();
    const data = cuerpo.profesores || [];
    const error = resp.ok ? null : { message: cuerpo.error || 'error' };
    if (!error) setProfesores(data || []);
    setCargando(false);
  }

  async function aprobar(id) {
    // Sin esto, un doble clic genera dos tokens y envía dos correos:
    // el enlace del primero quedaría invalidado por el segundo.
    if (aprobandoId) return;
    setAprobandoId(id);

    // El token lo genera el servidor: el navegador no puede escribirlo
    const resp = await fetch('/api/profesores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'aprobar', id }),
    });
    const respuesta = await resp.json();
    const error = resp.ok ? null : respuesta;
    const token = respuesta.token;

    // Si la base de datos falla no se envía el correo: sería un enlace muerto
    if (error) {
      mostrarMensaje('No se pudo aprobar: ' + error.message, 'error');
      setAprobandoId(null);
      return;
    }

    mostrarMensaje('✅ Aprobado — se le ha enviado el enlace de activación', 'ok');

    try {
      const rows = await consulta('profesores').select('nombre,apellidos,email,rol_gestion').eq('id', id);
      const prof = (rows.data || [])[0];
      if (prof?.email) {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo: 'activacion_cuenta', datos: { ...prof, token } })
        });
      }
    } catch(e) { console.error('Email activación:', e); }

    setAprobandoId(null);
    cargarProfesores();
    cerrarModal();
  }

  async function rechazar(id) {
    await fetch('/api/profesores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'cambiar_estado', id, datos: { estado: 'inactivo' } }) });
    mostrarMensaje('❌ Profesor rechazado', 'error');
    cargarProfesores();
    cerrarModal();
  }

  async function eliminarInactivos() {
    if (!confirm('¿Eliminar todos los profesores INACTIVOS (dados de baja al importar el CSV del nuevo curso)? Esta acción no se puede deshacer.')) return;
    const resp = await fetch('/api/profesores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'eliminar_inactivos' }) });
    const error = resp.ok ? null : await resp.json();
    if (!error) mostrarMensaje('🗑️ Profesores inactivos eliminados', 'ok');
    else mostrarMensaje('❌ Error al eliminar: ' + error.message, 'error');
    cargarProfesores();
  }

  async function eliminarProfesor(id, nombre) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    const resp = await fetch('/api/profesores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'eliminar', id }) });
    const error = resp.ok ? null : await resp.json();
    if (error) { mostrarMensaje('⚠️ Error al eliminar: ' + error.message, 'error'); return; }
    mostrarMensaje('🗑️ Profesor eliminado', 'ok');
    cargarProfesores();
  }

  async function guardarEdicion() {
    setGuardando(true);
    let rolesFinales = Array.isArray(formEdicion.rol) ? formEdicion.rol : [formEdicion.rol];
    if (!rolesFinales.includes('profesor')) rolesFinales = ['profesor', ...rolesFinales];
    // Solo campos editables — excluir id, created_at, etc.
    const datosAGuardar = {
      nombre: formEdicion.nombre,
      apellidos: formEdicion.apellidos,
      email: formEdicion.email,
      departamento: formEdicion.departamento,
      tipo_contrato: formEdicion.tipo_contrato,
      anio_centro: formEdicion.anio_centro ? parseInt(formEdicion.anio_centro, 10) : null,
      anio_cuerpo: formEdicion.anio_cuerpo ? parseInt(formEdicion.anio_cuerpo, 10) : null,
      // El número de años se deriva del año y se guarda solo para lo que
      // todavía lo lea. No se teclea en ningún sitio.
      antiguedad_centro: formEdicion.anio_centro ? Math.max(0, new Date().getFullYear() - parseInt(formEdicion.anio_centro, 10)) : null,
      antiguedad_cuerpo: formEdicion.anio_cuerpo ? Math.max(0, new Date().getFullYear() - parseInt(formEdicion.anio_cuerpo, 10)) : null,
      rol: rolesFinales,
      rol_gestion: formEdicion.rol_gestion || null,
      grupo_tutoria: rolesFinales.includes('tutor') ? (formEdicion.grupo_tutoria || null) : null,
      estado: formEdicion.estado,
    };
    const _rf = await fetch('/api/profesores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar_ficha', id: profesorSeleccionado.id, datos: datosAGuardar }),
    });
    const error = _rf.ok ? null : await _rf.json();
    setGuardando(false);
    if (!error) {
      mostrarMensaje('💾 Datos guardados correctamente', 'ok');
      cargarProfesores();
      cerrarModal();
    } else {
      mostrarMensaje('⚠️ Error al guardar: ' + error.message, 'error');
    }
  }

  function toggleRol(valor) {
    const rolesActuales = Array.isArray(formEdicion.rol) ? formEdicion.rol : ['profesor'];
    if (rolesActuales.includes(valor)) {
      if (valor === 'profesor') return;
      setFormEdicion(f => ({ ...f, rol: rolesActuales.filter(r => r !== valor) }));
    } else {
      setFormEdicion(f => ({ ...f, rol: [...rolesActuales, valor] }));
    }
  }

  function abrirFicha(profesor) {
    setProfesorSeleccionado(profesor);
    setModoVista('ficha');
  }

  function abrirEdicion(profesor) {
    setProfesorSeleccionado(profesor);
    const rolesActuales = Array.isArray(profesor.rol) ? profesor.rol : ['profesor'];
    setFormEdicion({
      nombre: profesor.nombre,
      apellidos: profesor.apellidos,
      email: profesor.email,
      departamento: profesor.departamento,
      tipo_contrato: profesor.tipo_contrato,
      anio_centro: profesor.anio_centro ? String(profesor.anio_centro) : '',
      anio_cuerpo: profesor.anio_cuerpo ? String(profesor.anio_cuerpo) : '',
      rol: rolesActuales,
      rol_gestion: profesor.rol_gestion || '',
      grupo_tutoria: profesor.grupo_tutoria || '',
      estado: profesor.estado,
    });
    setModoVista('editar');
  }

  function cerrarModal() {
    setProfesorSeleccionado(null);
    setModoVista(null);
    setFormEdicion({});
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  function cerrarSesion() {
    sessionStorage.clear();
    window.location.href = '/login';
  }

  const profesoresFiltrados = profesores.filter(p => {
    const nombre = `${p.nombre} ${p.apellidos}`.toLowerCase();
    const coincideBusqueda = nombre.includes(busqueda.toLowerCase());
    const coincideDpto = filtroDpto === '' || p.departamento === filtroDpto;
    return coincideBusqueda && coincideDpto;
  });

  function etiquetaRoles(p) {
    const roles = Array.isArray(p.rol) ? p.rol : [p.rol];
    const etiquetas = [];
    if (p.rol_gestion === 'director') etiquetas.push('👔 Director/a');
    if (p.rol_gestion === 'jefe_estudios') etiquetas.push('📋 Jefe/a de Estudios');
    if (p.rol_gestion === 'secretario') etiquetas.push('📁 Secretario/a');
    if (roles.includes('jefe_departamento')) etiquetas.push('📂 Jefe/a Dpto.');
    if (roles.includes('tutor')) etiquetas.push(`🤝 Tutor/a${p.grupo_tutoria ? ` (${p.grupo_tutoria})` : ''}`);
    if (roles.includes('profesor')) etiquetas.push('📚 Profesor/a');
    return etiquetas.join(' · ');
  }

  // La antigüedad guardada como número se queda congelada en el momento
  // en que se rellenó la ficha. Si hay año de incorporación, se calcula
  // al vuelo: así no miente al pasar los cursos.
  function antiguedadReal(anio, guardada) {
    if (anio) return Math.max(0, new Date().getFullYear() - parseInt(anio, 10));
    return guardada || 0;
  }

  function badgeEstado(estado) {
    if (estado === 'activo') return { bg: '#d1fae5', color: '#065f46', texto: '✅ Activo' };
    if (estado === 'pendiente') return { bg: '#fef3c7', color: '#92400e', texto: '⏳ Pendiente' };
    return { bg: '#fee2e2', color: '#991b1b', texto: '❌ Inactivo' };
  }

  const verde = '#1e6b2e';

  function renderProfesor(p) {
    const badge = badgeEstado(p.estado);
    return (
      <div key={p.id} style={{
        backgroundColor: 'white', borderRadius: 12, padding: 18,
        marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        borderLeft: `4px solid ${p.solicitud_acceso && p.estado === 'pendiente' ? '#f59e0b' : verde}`
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: verde }}>{p.apellidos}, {p.nombre}</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>📧 {p.email}</div>
            <div style={{ fontSize: 13, color: '#555' }}>🏫 {p.departamento || '—'}</div>
            <div style={{ fontSize: 13, color: '#555' }}>💼 {p.tipo_contrato || '—'}</div>
            <div style={{ fontSize: 13, color: '#555' }}>🎭 {etiquetaRoles(p)}</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
              {p.solicitud_acceso && p.estado === 'pendiente'
                ? '📨 Solicitó acceso'
                : `Registrado: ${new Date(p.created_at).toLocaleDateString('es-ES')}`}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <span style={{ fontSize: 12, backgroundColor: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
              {badge.texto}
            </span>
            {p.en_baja && (
              <span style={{ fontSize: 12, backgroundColor: '#fef2f2', color: '#b91c1c', padding: '3px 10px', borderRadius: 20, fontWeight: 700, border: '1px solid #fca5a5' }}>
                {p.tipo_baja === 'con_sustituto' ? '🔄 Baja con sustituto' : '🏥 Baja temporal'}
              </span>
            )}
            {p.titular_id && (
              <span style={{ fontSize: 12, backgroundColor: '#fef3c7', color: '#78350f', padding: '3px 10px', borderRadius: 20, fontWeight: 700, border: '1px solid #fbbf24' }}>
                🔄 Sustituto
              </span>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={() => abrirFicha(p)} style={btnEstilo('#e8f5e9', verde, verde)}>👁️ Ficha</button>
              <button onClick={() => abrirEdicion(p)} style={btnEstilo('#e8f0fe', '#1a56db', '#1a56db')}>✏️ Editar</button>
              {p.estado === 'pendiente' && <>
                <button onClick={() => aprobar(p.id)} disabled={aprobandoId === p.id}
                  style={{ ...btnEstilo('#d1fae5', '#065f46', '#065f46'), opacity: aprobandoId === p.id ? 0.5 : 1, cursor: aprobandoId === p.id ? 'wait' : 'pointer' }}>
                  {aprobandoId === p.id ? '⏳ Aprobando...' : '✅ Aprobar'}
                </button>
                <button onClick={() => rechazar(p.id)} style={btnEstilo('#fee2e2', '#b91c1c', '#b91c1c')}>❌ Rechazar</button>
              </>}
              {p.estado === 'activo' && (
                <button onClick={() => rechazar(p.id)} style={btnEstilo('#fee2e2', '#b91c1c', '#b91c1c')}>🚫 Desactivar</button>
              )}
              {p.estado === 'inactivo' && (
                <button onClick={() => aprobar(p.id)} disabled={aprobandoId === p.id}
                  style={{ ...btnEstilo('#d1fae5', '#065f46', '#065f46'), opacity: aprobandoId === p.id ? 0.5 : 1 }}>
                  {aprobandoId === p.id ? '⏳...' : '↩️ Reactivar'}
                </button>
              )}
              <button onClick={() => eliminarProfesor(p.id, `${p.nombre} ${p.apellidos}`)} style={btnEstilo('#fee2e2', '#7f1d1d', '#7f1d1d')}>🗑️ Eliminar</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Función de activación masiva para el claustro
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  /**
   * Activación masiva pensada para el claustro entero en septiembre.
   *
   * Resend limita a 2 correos por segundo: si se envían 150 seguidos, la
   * mayoría devuelve error 429 y los profesores nunca reciben su enlace.
   * Por eso se espera entre envío y envío y se reintenta si hace falta.
   */

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👥 Gestión de Personal</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {nombreUsuario}</div>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); const r = sessionStorage.getItem('profesor_rol_gestion'); window.location.href = '/gestion'; }} style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Inicio</a>
          <button onClick={cerrarSesion} style={{
            padding: '7px 14px', borderRadius: 8, border: '1.5px solid rgba(255,255,255,0.4)',
            backgroundColor: 'transparent', color: 'white', cursor: 'pointer', fontSize: 13
          }}>🚪 Salir</button>
        </div>
      </div>

      {/* TOAST */}
      {mensaje && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          backgroundColor: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b',
          color: 'white', padding: '12px 20px', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)', fontSize: 15
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* NAVEGACIÓN DE PESTAÑAS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { id: 'profesores', emoji: '👥', label: 'Profesorado' },
          ].map(t => (
            <button key={t.id} onClick={() => setPestana(t.id)} style={{
              padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              backgroundColor: pestana === t.id ? '#1e6b2e' : 'white',
              color: pestana === t.id ? 'white' : '#555',
              boxShadow: pestana === t.id ? '0 2px 8px rgba(30,107,46,0.3)' : '0 1px 3px rgba(0,0,0,0.08)',
            }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {pestana === 'profesores' && (
          <>
            {/* BUSCADOR */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="🔍 Buscar por nombre..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: '9px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, outline: 'none' }}
              />
              <select
                value={filtroDpto}
                onChange={e => setFiltroDpto(e.target.value)}
                style={{ padding: '9px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, minWidth: 200 }}
              >
                <option value="">📂 Todos los departamentos</option>
                {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {(busqueda || filtroDpto) && (
                <button onClick={() => { setBusqueda(''); setFiltroDpto(''); }} style={{
                  padding: '9px 14px', borderRadius: 8, border: '1.5px solid #ddd',
                  backgroundColor: '#f5f5f5', cursor: 'pointer', fontSize: 13
                }}>✖ Limpiar</button>
              )}
            </div>

            {/* FILTROS ESTADO */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                {['pendiente', 'activo', 'inactivo'].map(e => (
                  <button key={e} onClick={() => setFiltroEstado(e)} style={{
                    padding: '8px 18px', borderRadius: 8,
                    border: `1.5px solid ${filtroEstado === e ? verde : '#ddd'}`,
                    backgroundColor: filtroEstado === e ? verde : 'white',
                    color: filtroEstado === e ? 'white' : '#555',
                    cursor: 'pointer', fontWeight: 600, fontSize: 14
                  }}>
                    {e === 'pendiente' ? '⏳ Pendiente' : e === 'activo' ? '✅ Activo' : '❌ Inactivo'}
                  </button>
                ))}
              </div>
              <button onClick={eliminarInactivos} style={{
                padding: '8px 16px', borderRadius: 8, border: '1.5px solid #fca5a5',
                backgroundColor: '#fff5f5', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}>🗑️ Eliminar inactivos del curso anterior</button>
            </div>

            {/* CONTADOR */}
            <div style={{ fontSize: 13, color: '#666', marginBottom: 10, paddingLeft: 4 }}>
              {cargando ? 'Cargando...' : `${profesoresFiltrados.length} profesor${profesoresFiltrados.length !== 1 ? 'es' : ''} encontrado${profesoresFiltrados.length !== 1 ? 's' : ''}`}
            </div>

            {/* LISTA */}
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando profesores...</div>
            ) : profesoresFiltrados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#aaa', backgroundColor: 'white', borderRadius: 12 }}>
                No hay profesores en este estado
              </div>
            ) : filtroEstado === 'pendiente' ? (
              (() => {
                const solicitantes = profesoresFiltrados.filter(p => p.solicitud_acceso === true);

                return (
                  <>
                    {/* ═════════ SOLICITUDES DE ACCESO ═════════ */}
                    {solicitantes.length > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <div style={{
                          backgroundColor: '#fef3c7', border: '2px solid #f59e0b', borderRadius: 10,
                          padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10
                        }}>
                          <span style={{ fontSize: 24 }}>📨</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, color: '#78350f', fontSize: 15 }}>
                              Solicitudes de acceso ({solicitantes.length})
                            </div>
                            <div style={{ fontSize: 12, color: '#92400e' }}>
                              Estos profesores han completado su registro. Apruébalos para que puedan acceder al portal.
                            </div>
                          </div>
                        </div>
                        {solicitantes.map(p => renderProfesor(p))}
                      </div>
                    )}

                  </>
                );
              })()
            ) : (
              profesoresFiltrados.map(p => renderProfesor(p))
            )}
          </>
        )}
      </div>

      {/* MODAL FICHA */}
      {modoVista === 'ficha' && profesorSeleccionado && (
        <Modal onClose={() => { cerrarModal(); setPestanaFicha('datos'); }} titulo={`📋 ${profesorSeleccionado.nombre} ${profesorSeleccionado.apellidos}${profesorSeleccionado.en_baja ? ' 🏥 DE BAJA' : ''}`}>
          
          {/* PESTAÑAS */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['datos', 'baja'].map(tab => {
              const enBaja = tab === 'baja' && profesorSeleccionado.en_baja;
              return (
                <button key={tab} onClick={() => setPestanaFicha(tab)} style={{
                  padding: '8px 16px', borderRadius: 8, border: enBaja && pestanaFicha !== tab ? '1.5px solid #fca5a5' : 'none', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13, position: 'relative',
                  backgroundColor: pestanaFicha === tab ? (tab === 'baja' ? '#b91c1c' : '#1a56db') : (enBaja ? '#fef2f2' : '#f3f4f6'),
                  color: pestanaFicha === tab ? 'white' : (enBaja ? '#b91c1c' : '#555'),
                }}>
                  {tab === 'datos' ? '📋 Datos' : '🏥 Baja / Sustitución'}
                  {enBaja && pestanaFicha !== tab && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: '50%',
                      backgroundColor: '#dc2626', border: '2px solid white',
                    }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* PESTAÑA DATOS */}
          {pestanaFicha === 'datos' && (<>
            <FilaInfo label="Nombre" valor={`${profesorSeleccionado.nombre} ${profesorSeleccionado.apellidos}`} />
            <FilaInfo label="Email" valor={profesorSeleccionado.email} />
            <FilaInfo label="Departamento" valor={profesorSeleccionado.departamento || '—'} />
            <FilaInfo label="Tipo contrato" valor={profesorSeleccionado.tipo_contrato} />
            <FilaInfo label="Roles" valor={etiquetaRoles(profesorSeleccionado)} />
            <FilaInfo label="Rol gestión" valor={profesorSeleccionado.rol_gestion || '—'} />
            <FilaInfo label="Antigüedad centro" valor={(() => {
              const a = antiguedadReal(profesorSeleccionado.anio_centro, profesorSeleccionado.antiguedad_centro);
              return a ? `${a} años${profesorSeleccionado.anio_centro ? ` (desde ${profesorSeleccionado.anio_centro})` : ''}` : '—';
            })()} />
            <FilaInfo label="Antigüedad cuerpo" valor={(() => {
              const a = antiguedadReal(profesorSeleccionado.anio_cuerpo, profesorSeleccionado.antiguedad_cuerpo);
              return a ? `${a} años${profesorSeleccionado.anio_cuerpo ? ` (desde ${profesorSeleccionado.anio_cuerpo})` : ''}` : '—';
            })()} />
            <FilaInfo label="Estado" valor={badgeEstado(profesorSeleccionado.estado).texto} />
            <FilaInfo label="Registrado" valor={new Date(profesorSeleccionado.created_at).toLocaleDateString('es-ES')} />
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => abrirEdicion(profesorSeleccionado)} style={{ ...btnEstilo('#e8f0fe', '#1a56db', '#1a56db'), padding: '10px 20px' }}>✏️ Editar datos</button>
              <button onClick={cerrarModal} style={{ ...btnEstilo('#f5f5f5', '#555', '#ddd'), padding: '10px 20px' }}>Cerrar</button>
            </div>
          </>)}

          {/* PESTAÑA BAJA — solo informa. Las bajas se gestionan en su
              propia pantalla: son un suceso con fechas, no una propiedad
              de la ficha, y tocarlas desde dos sitios dejaba descuadrados
              el estado del profesor y su ausencia en el cuadrante. */}
          {pestanaFicha === 'baja' && (() => {
            const p = profesorSeleccionado;
            const sustituto = p.sustituto_id ? profesores.find(x => x.id === p.sustituto_id) : null;
            return (
              <div>
                <div style={{
                  backgroundColor: p.en_baja ? '#fef2f2' : '#f9fafb',
                  border: `1.5px solid ${p.en_baja ? '#fca5a5' : '#e5e7eb'}`,
                  borderRadius: 10, padding: 16, marginBottom: 16,
                }}>
                  {p.en_baja ? (
                    <>
                      <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: 15, marginBottom: 6 }}>
                        🏥 De baja desde el {p.fecha_baja
                          ? new Date(p.fecha_baja + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                          : '—'}
                      </div>
                      <div style={{ fontSize: 13, color: '#7f1d1d' }}>
                        {sustituto
                          ? `Sustituido por ${sustituto.nombre} ${sustituto.apellidos}`
                          : 'Sin sustituto — sus grupos los cubren los compañeros de guardia'}
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: '#666' }}>
                      Este profesor no está de baja.
                    </div>
                  )}
                </div>

                <a
                  href="/gestion/ausencias?vista=bajas"
                  style={{
                    display: 'inline-block', textDecoration: 'none',
                    padding: '11px 18px', borderRadius: 9,
                    backgroundColor: '#1a56db', color: 'white',
                    fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  🏥 Ir a Bajas y sustituciones
                </a>
                <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
                  Las bajas y los sustitutos se gestionan allí, en un único sitio.
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* MODAL EDICIÓN */}
      {modoVista === 'editar' && profesorSeleccionado && (
        <Modal onClose={cerrarModal} titulo="✏️ Editar Profesor">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Campo label="Nombre" value={formEdicion.nombre} onChange={v => setFormEdicion(f => ({ ...f, nombre: v }))} />
            <Campo label="Apellidos" value={formEdicion.apellidos} onChange={v => setFormEdicion(f => ({ ...f, apellidos: v }))} />
            <Campo label="Email" value={formEdicion.email} onChange={v => setFormEdicion(f => ({ ...f, email: v }))} tipo="email" />
            <CampoSelect label="Departamento" value={formEdicion.departamento} onChange={v => setFormEdicion(f => ({ ...f, departamento: v }))} opciones={DEPARTAMENTOS} />
            <CampoSelect label="Tipo contrato" value={formEdicion.tipo_contrato} onChange={v => setFormEdicion(f => ({ ...f, tipo_contrato: v }))} opciones={TIPOS_CONTRATO} />
            <CampoSelect label="Año de incorporación actual al centro" value={formEdicion.anio_centro} onChange={v => setFormEdicion(f => ({ ...f, anio_centro: v }))} opciones={ANIOS_INCORPORACION} />
            <CampoSelect label="Año de ingreso en el cuerpo" value={formEdicion.anio_cuerpo} onChange={v => setFormEdicion(f => ({ ...f, anio_cuerpo: v }))} opciones={ANIOS_INCORPORACION} />
          </div>

          <div style={{ padding: '11px 14px', borderRadius: 9, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e3a5f', lineHeight: 1.65, marginTop: -6, marginBottom: 14 }}>
            <strong>Antigüedad en el cuerpo:</strong> todo el tiempo de servicio docente
            reconocido, incluidos los años de interinidad. Es el mismo que cuenta para
            trienios y sexenios, y se ve en la nómina. Sirve para desempatar las
            solicitudes de días de libre disposición.
          </div>

          {/* CHECKBOXES ROLES DOCENTES */}
          <div style={{ marginTop: 16, padding: 14, backgroundColor: '#f8fdf8', borderRadius: 10, border: '1.5px solid #c8e6c9' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: verde, marginBottom: 10 }}>🎭 Roles docentes (puedes marcar varios)</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {ROLES_DOCENTES.map(r => {
                const rolesActuales = Array.isArray(formEdicion.rol) ? formEdicion.rol : ['profesor'];
                const marcado = rolesActuales.includes(r.valor);
                return (
                  <label key={r.valor} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: r.valor === 'profesor' ? 'default' : 'pointer', fontSize: 14, userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => toggleRol(r.valor)}
                      disabled={r.valor === 'profesor'}
                      style={{ width: 18, height: 18, accentColor: verde }}
                    />
                    {r.etiqueta}
                    {r.valor === 'profesor' && <span style={{ fontSize: 11, color: '#999' }}>(siempre)</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {/* GRUPO TUTORÍA - solo si es tutor */}
          {Array.isArray(formEdicion.rol) && formEdicion.rol.includes('tutor') && (
            <div style={{ marginTop: 12, padding: 14, backgroundColor: '#fff7ed', borderRadius: 10, border: '1.5px solid #fbbf24' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 10 }}>🤝 Grupo de tutoría asignado</div>
              <select value={formEdicion.grupo_tutoria || ''} onChange={e => setFormEdicion(f => ({ ...f, grupo_tutoria: e.target.value }))} style={{ ...inputEstilo, borderColor: !formEdicion.grupo_tutoria ? '#fca5a5' : '#ddd' }}>
                <option value="">— Selecciona el grupo —</option>
                <optgroup label="ESO">
                  {['ESO-1AM','ESO-1AZ','ESO-1NA','ESO-1VE','ESO-2AM','ESO-2AZ','ESO-2VE','ESO-3AM','ESO-3AZ','ESO-3DIV','ESO-3NA','ESO-3VE','ESO-4AM','ESO-4AZ','ESO-4VE'].map(g => <option key={g} value={g}>{g}</option>)}
                </optgroup>
                <optgroup label="Bachillerato">
                  {['BTO-1CT','BTO-1HCS','BTO-2A','BTO-2B'].map(g => <option key={g} value={g}>{g}</option>)}
                </optgroup>
                <optgroup label="FP Básica">
                  {['GB-1CR','GB-1EE','GB-1MV','GB-1SC','GB-2CR','GB-2EE','GB-2MV','GB-2SC'].map(g => <option key={g} value={g}>{g}</option>)}
                </optgroup>
                <optgroup label="Grado Medio">
                  {['GM-1ACC','GM-1AOV','GM-1CAR','GM-1COC','GM-1EVA.A','GM-1EVA.B','GM-1GAD','GM-1IEA','GM-1ITE','GM-1SMR.A','GM-1SMR.B','GM-2ACC','GM-2AOV','GM-2CAR','GM-2COC','GM-2EVA','GM-2GAD','GM-2IEA','GM-2ITE','GM-2SMR.A','GM-2SMR.B'].map(g => <option key={g} value={g}>{g}</option>)}
                </optgroup>
                <optgroup label="Grado Superior">
                  {['GS-1AAD','GS-1AFI','GS-1ASIR','GS-1AUT','GS-1DAM','GS-1DAW','GS-1DDC','GS-1GVEC','GS-1SEA','GS-1STI','GS-1TLO','GS-1VIT','GS-2AFI','GS-2ASIR','GS-2AUT','GS-2DAM','GS-2DAW','GS-2DDC','GS-2GVEC','GS-2SEA','GS-2STI','GS-2TLO','GS-2VITI'].map(g => <option key={g} value={g}>{g}</option>)}
                </optgroup>
                <optgroup label="Otros">
                  {['CA-CFGS-A','CA-CFGS-B','CA-CFGS-C','FPPE-1JAR','FPPE-2JAR'].map(g => <option key={g} value={g}>{g}</option>)}
                </optgroup>
              </select>
              {!formEdicion.grupo_tutoria && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>⚠️ El tutor debe tener un grupo asignado</div>}
            </div>
          )}

          {/* ROL GESTIÓN */}
          <div style={{ marginTop: 14 }}>
            <label style={labelEstilo}>👔 Cargo directivo</label>
            <select value={formEdicion.rol_gestion} onChange={e => setFormEdicion(f => ({ ...f, rol_gestion: e.target.value }))} style={inputEstilo}>
              <option value="">— Sin cargo directivo —</option>
              <option value="director">👔 Director/a</option>
              <option value="jefe_estudios">📋 Jefe/a de Estudios</option>
              <option value="secretario">📁 Secretario/a</option>
            </select>
          </div>

          {/* ESTADO */}
          <div style={{ marginTop: 14 }}>
            <label style={labelEstilo}>Estado</label>
            <select value={formEdicion.estado} onChange={e => setFormEdicion(f => ({ ...f, estado: e.target.value }))} style={inputEstilo}>
              <option value="pendiente">⏳ Pendiente</option>
              <option value="activo">✅ Activo</option>
              <option value="inactivo">❌ Inactivo</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button onClick={guardarEdicion} disabled={guardando} style={{
              padding: '11px 24px', borderRadius: 8, border: 'none',
              backgroundColor: verde, color: 'white', fontWeight: 700,
              cursor: guardando ? 'not-allowed' : 'pointer', fontSize: 15
            }}>
              {guardando ? 'Guardando...' : '💾 Guardar cambios'}
            </button>
            <button onClick={cerrarModal} style={{ ...btnEstilo('#f5f5f5', '#555', '#ddd'), padding: '11px 20px' }}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* ========== PESTAÑA COMPRAS ========== */}

        {/* ========== PESTAÑA CLAUSTRO ========== */}


    </div>
  );
}

function Modal({ children, onClose, titulo }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        backgroundColor: 'white', borderRadius: 14, padding: 28,
        maxWidth: 680, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1e6b2e' }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FilaInfo({ label, valor }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ width: 160, fontWeight: 600, color: '#555', fontSize: 14, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 14, color: '#222' }}>{valor}</span>
    </div>
  );
}

function Campo({ label, value, onChange, tipo = 'text' }) {
  return (
    <div>
      <label style={labelEstilo}>{label}</label>
      <input type={tipo} value={value || ''} onChange={e => onChange(e.target.value)} style={inputEstilo} />
    </div>
  );
}

function CampoSelect({ label, value, onChange, opciones }) {
  return (
    <div>
      <label style={labelEstilo}>{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputEstilo}>
        {opciones.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

const labelEstilo = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 };
const inputEstilo = { width: '100%', padding: '8px 12px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' };

function btnEstilo(bg, color, border) {
  return {
    padding: '7px 14px', borderRadius: 7, border: `1.5px solid ${border}`,
    backgroundColor: bg, color, cursor: 'pointer', fontWeight: 600, fontSize: 13
  };
}