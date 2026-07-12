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

const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL','Física y Química',
  'Ciencias Naturales/Biología','Matemáticas','Lengua y Literatura','Inglés',
  'Educación Física','Dibujo/Plástica','Geografía e Historia','Filosofía',
  'Música','Tecnología','Orientación','PT/AL'
];

const TIPOS_CONTRATO = [
  'Funcionario de carrera',
  'Interino con vacante',
  'Interino sin vacante',
  'Comisión de servicios'
];

const ROLES_DOCENTES = [
  { valor: 'profesor', etiqueta: '📚 Profesor/a' },
  { valor: 'tutor', etiqueta: '🤝 Tutor/a' },
  { valor: 'jefe_departamento', etiqueta: '📂 Jefe/a de Departamento' },
];

export default function PanelSecretario() {
  const [pestana, setPestana] = useState('compras');
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [busqueda, setBusqueda] = useState('');
  const [filtroDpto, setFiltroDpto] = useState('');
  const [profesores, setProfesores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [profesorSeleccionado, setProfesorSeleccionado] = useState(null);
  const [modoVista, setModoVista] = useState(null);
  const [formEdicion, setFormEdicion] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [compras, setCompras] = useState([]);
  const [cargandoCompras, setCargandoCompras] = useState(false);
  const [filtroCompraEstado, setFiltroCompraEstado] = useState('todos');
  const [filtroCompraDpto, setFiltroCompraDpto] = useState('');
  const [filtroCompraProveedor, setFiltroCompraProveedor] = useState('');
  const [filtroCompraFechaDesde, setFiltroCompraFechaDesde] = useState('');
  const [filtroCompraFechaHasta, setFiltroCompraFechaHasta] = useState('');
  const [compraAbierta, setCompraAbierta] = useState(null);
  const [comentarioSecretario, setComentarioSecretario] = useState('');
  const [procesandoCompra, setProcesandoCompra] = useState(false);
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
    const { data, error } = await getSupabase()
      .from('profesores')
      .select('*')
      .eq('estado', filtroEstado)
      .order('created_at', { ascending: false });
    if (!error) setProfesores(data || []);
    setCargando(false);
  }

  async function aprobar(id) {
    await getSupabase().from('profesores').update({ estado: 'activo' }).eq('id', id);
    mostrarMensaje('✅ Profesor aprobado', 'ok');
    cargarProfesores();
    cerrarModal();
  }

  async function rechazar(id) {
    await getSupabase().from('profesores').update({ estado: 'inactivo' }).eq('id', id);
    mostrarMensaje('❌ Profesor rechazado', 'error');
    cargarProfesores();
    cerrarModal();
  }

  async function eliminarInterinos() {
    if (!confirm('¿Eliminar TODOS los interinos? Esta acción no se puede deshacer.')) return;
    await getSupabase().from('profesores').delete().like('tipo_contrato', 'Interino%');
    mostrarMensaje('🗑️ Interinos eliminados', 'ok');
    cargarProfesores();
  }

  async function eliminarProfesor(id, nombre) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    const { error } = await getSupabase().from('profesores').delete().eq('id', id);
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
      especialidad: formEdicion.especialidad || '',
      tipo_contrato: formEdicion.tipo_contrato,
      antiguedad_centro: formEdicion.antiguedad_centro || 0,
      antiguedad_cuerpo: formEdicion.antiguedad_cuerpo || 0,
      rol: rolesFinales,
      rol_gestion: formEdicion.rol_gestion || null,
      grupo_tutoria: rolesFinales.includes('tutor') ? (formEdicion.grupo_tutoria || null) : null,
      estado: formEdicion.estado,
    };
    const { error } = await getSupabase()
      .from('profesores')
      .update(datosAGuardar)
      .eq('id', profesorSeleccionado.id);
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
      especialidad: profesor.especialidad || '',
      tipo_contrato: profesor.tipo_contrato,
      antiguedad_centro: profesor.antiguedad_centro || '',
      antiguedad_cuerpo: profesor.antiguedad_cuerpo || '',
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

  function badgeEstado(estado) {
    if (estado === 'activo') return { bg: '#d1fae5', color: '#065f46', texto: '✅ Activo' };
    if (estado === 'pendiente') return { bg: '#fef3c7', color: '#92400e', texto: '⏳ Pendiente' };
    return { bg: '#fee2e2', color: '#991b1b', texto: '❌ Inactivo' };
  }

  const verde = '#1e6b2e';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>⚙️ Panel de Gestión</div>
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

        {/* PESTAÑAS */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          {[
            { id: 'profesores', label: '👥 Profesores', activo: true },
            { id: 'mantenimiento', label: '🔧 Mantenimiento', activo: true },
            { id: 'compras', label: '🛒 Compras', activo: true },
            { id: 'guardias', label: '📅 Guardias', activo: false },
            { id: 'dld', label: '📄 DLD', activo: false },
            { id: 'noticias', label: '📢 Noticias', activo: false },
          ].map(t => (
            <button key={t.id} onClick={() => t.activo && setPestana(t.id)} style={{
              padding: '10px 18px', borderRadius: 10, border: '1.5px solid',
              borderColor: pestana === t.id ? verde : '#ccc',
              backgroundColor: pestana === t.id ? verde : 'white',
              color: pestana === t.id ? 'white' : t.activo ? '#333' : '#aaa',
              cursor: t.activo ? 'pointer' : 'default',
              fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6
            }}>
              {t.label}
              {!t.activo && <span style={{ fontSize: 11, opacity: 0.6 }}>Próximo</span>}
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
              <button onClick={eliminarInterinos} style={{
                padding: '8px 16px', borderRadius: 8, border: '1.5px solid #fca5a5',
                backgroundColor: '#fff5f5', color: '#b91c1c', cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}>🗑️ Eliminar interinos</button>
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
            ) : (
              profesoresFiltrados.map(p => {
                const badge = badgeEstado(p.estado);
                return (
                  <div key={p.id} style={{
                    backgroundColor: 'white', borderRadius: 12, padding: 18,
                    marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    borderLeft: `4px solid ${verde}`
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: verde }}>{p.nombre} {p.apellidos}</div>
                        <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>📧 {p.email}</div>
                        <div style={{ fontSize: 13, color: '#555' }}>🏫 {p.departamento}{p.especialidad ? ` · ${p.especialidad}` : ''}</div>
                        <div style={{ fontSize: 13, color: '#555' }}>💼 {p.tipo_contrato}</div>
                        <div style={{ fontSize: 13, color: '#555' }}>🎭 {etiquetaRoles(p)}</div>
                        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                          Registrado: {new Date(p.created_at).toLocaleDateString('es-ES')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <span style={{ fontSize: 12, backgroundColor: badge.bg, color: badge.color, padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>
                          {badge.texto}
                        </span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <button onClick={() => abrirFicha(p)} style={btnEstilo('#e8f5e9', verde, verde)}>👁️ Ficha</button>
                          <button onClick={() => abrirEdicion(p)} style={btnEstilo('#e8f0fe', '#1a56db', '#1a56db')}>✏️ Editar</button>
                          {p.estado === 'pendiente' && <>
                            <button onClick={() => aprobar(p.id)} style={btnEstilo('#d1fae5', '#065f46', '#065f46')}>✅ Aprobar</button>
                            <button onClick={() => rechazar(p.id)} style={btnEstilo('#fee2e2', '#b91c1c', '#b91c1c')}>❌ Rechazar</button>
                          </>}
                          {p.estado === 'activo' && (
                            <button onClick={() => rechazar(p.id)} style={btnEstilo('#fee2e2', '#b91c1c', '#b91c1c')}>🚫 Desactivar</button>
                          )}
                          {p.estado === 'inactivo' && (
                            <button onClick={() => aprobar(p.id)} style={btnEstilo('#d1fae5', '#065f46', '#065f46')}>↩️ Reactivar</button>
                          )}
                          <button onClick={() => eliminarProfesor(p.id, `${p.nombre} ${p.apellidos}`)} style={btnEstilo('#fee2e2', '#7f1d1d', '#7f1d1d')}>🗑️ Eliminar</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* MODAL FICHA */}
      {modoVista === 'ficha' && profesorSeleccionado && (
        <Modal onClose={cerrarModal} titulo="📋 Ficha del Profesor">
          <FilaInfo label="Nombre" valor={`${profesorSeleccionado.nombre} ${profesorSeleccionado.apellidos}`} />
          <FilaInfo label="Email" valor={profesorSeleccionado.email} />
          <FilaInfo label="Departamento" valor={profesorSeleccionado.departamento} />
          <FilaInfo label="Especialidad" valor={profesorSeleccionado.especialidad || '—'} />
          <FilaInfo label="Tipo contrato" valor={profesorSeleccionado.tipo_contrato} />
          <FilaInfo label="Roles" valor={etiquetaRoles(profesorSeleccionado)} />
          <FilaInfo label="Rol gestión" valor={profesorSeleccionado.rol_gestion || '—'} />
          <FilaInfo label="Antigüedad centro" valor={profesorSeleccionado.antiguedad_centro ? `${profesorSeleccionado.antiguedad_centro} años` : '—'} />
          <FilaInfo label="Antigüedad cuerpo" valor={profesorSeleccionado.antiguedad_cuerpo ? `${profesorSeleccionado.antiguedad_cuerpo} años` : '—'} />
          <FilaInfo label="Estado" valor={badgeEstado(profesorSeleccionado.estado).texto} />
          <FilaInfo label="Registrado" valor={new Date(profesorSeleccionado.created_at).toLocaleDateString('es-ES')} />
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => abrirEdicion(profesorSeleccionado)} style={{ ...btnEstilo('#e8f0fe', '#1a56db', '#1a56db'), padding: '10px 20px' }}>✏️ Editar datos</button>
            <button onClick={cerrarModal} style={{ ...btnEstilo('#f5f5f5', '#555', '#ddd'), padding: '10px 20px' }}>Cerrar</button>
          </div>
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
            <Campo label="Especialidad" value={formEdicion.especialidad} onChange={v => setFormEdicion(f => ({ ...f, especialidad: v }))} />
            <CampoSelect label="Tipo contrato" value={formEdicion.tipo_contrato} onChange={v => setFormEdicion(f => ({ ...f, tipo_contrato: v }))} opciones={TIPOS_CONTRATO} />
            <Campo label="Antigüedad centro (años)" value={formEdicion.antiguedad_centro} onChange={v => setFormEdicion(f => ({ ...f, antiguedad_centro: v }))} tipo="number" />
            <Campo label="Antigüedad cuerpo (años)" value={formEdicion.antiguedad_cuerpo} onChange={v => setFormEdicion(f => ({ ...f, antiguedad_cuerpo: v }))} tipo="number" />
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
      {pestana === 'mantenimiento' && <SeccionMantenimiento />}

      {pestana === 'compras' && <SeccionCompras
        compras={compras} setCompras={setCompras}
        cargando={cargandoCompras} setCargando={setCargandoCompras}
        filtroEstado={filtroCompraEstado} setFiltroEstado={setFiltroCompraEstado}
        filtroDpto={filtroCompraDpto} setFiltroDpto={setFiltroCompraDpto}
        filtroProveedor={filtroCompraProveedor} setFiltroProveedor={setFiltroCompraProveedor}
        filtroDesde={filtroCompraFechaDesde} setFiltroDesde={setFiltroCompraFechaDesde}
        filtroHasta={filtroCompraFechaHasta} setFiltroHasta={setFiltroCompraFechaHasta}
        compraAbierta={compraAbierta} setCompraAbierta={setCompraAbierta}
        comentario={comentarioSecretario} setComentario={setComentarioSecretario}
        procesando={procesandoCompra} setProcesando={setProcesandoCompra}
      />}

    </div>
  );
}

function SeccionMantenimiento() {
  const verde = '#1e6b2e';
  const azul = '#1e3a5f';
  const [incidencias, setIncidencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroEstancia, setFiltroEstancia] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [comentario, setComentario] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await getSupabase().from('mantenimiento').select('*').order('created_at', { ascending: false });
    setIncidencias(data || []);
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  async function cambiarEstado(id, estado) {
    setProcesando(true);
    await getSupabase().from('mantenimiento').update({ estado, comentario_secretario: comentario || null }).eq('id', id);
    setProcesando(false);
    setAbierta(null);
    setComentario('');
    mostrarMensaje(`✅ Incidencia marcada como "${estado}"`, 'ok');
    cargar();
  }

  async function eliminar(id) {
    if (!confirm('¿Eliminar esta incidencia? No se puede deshacer.')) return;
    await getSupabase().from('mantenimiento').delete().eq('id', id);
    mostrarMensaje('🗑️ Incidencia eliminada', 'ok');
    cargar();
  }

  function generarInforme() {
    const filas = incidenciasFiltradas.map(i => [
      new Date(i.created_at).toLocaleDateString('es-ES'),
      i.profesor_nombre || '',
      i.estancia || '',
      i.ubicacion_exacta || '',
      i.descripcion || '',
      i.estado || '',
      i.comentario_secretario || '',
    ]);

    const cabecera = ['Fecha', 'Profesor', 'Estancia', 'Ubicación', 'Descripción', 'Estado', 'Comentario secretario'];
    const contenido = [cabecera, ...filas].map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `incidencias_mantenimiento_${new Date().getFullYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarMensaje('📊 Informe descargado correctamente', 'ok');
  }

  const ESTADOS = {
    todos:      { label: 'Todas' },
    pendiente:  { label: 'Pendiente',  bg: '#fef3c7', color: '#92400e', emoji: '⏳' },
    en_proceso: { label: 'En proceso', bg: '#dbeafe', color: '#1e40af', emoji: '🔧' },
    resuelta:   { label: 'Resuelta',   bg: '#d1fae5', color: '#065f46', emoji: '✅' },
  };

  const estancias = [...new Set(incidencias.map(i => i.estancia).filter(Boolean))].sort();

  const incidenciasFiltradas = incidencias.filter(i => {
    if (filtroEstado !== 'todos' && i.estado !== filtroEstado) return false;
    if (filtroEstancia && i.estancia !== filtroEstancia) return false;
    return true;
  });

  const contadores = {
    pendiente:  incidencias.filter(i => i.estado === 'pendiente').length,
    en_proceso: incidencias.filter(i => i.estado === 'en_proceso').length,
    resuelta:   incidencias.filter(i => i.estado === 'resuelta').length,
  };

  return (
    <div>
      {mensaje && <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>{mensaje.texto}</div>}

      {/* CONTADORES */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[['pendiente','⏳','#fef3c7','#92400e'], ['en_proceso','🔧','#dbeafe','#1e40af'], ['resuelta','✅','#d1fae5','#065f46']].map(([est, emoji, bg, color]) => (
          <div key={est} onClick={() => setFiltroEstado(filtroEstado === est ? 'todos' : est)} style={{ backgroundColor: bg, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', border: `2px solid ${filtroEstado === est ? color : 'transparent'}`, textAlign: 'center' }}>
            <div style={{ fontSize: 22 }}>{emoji}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color }}>{contadores[est]}</div>
            <div style={{ fontSize: 12, color, fontWeight: 600 }}>{ESTADOS[est].label}</div>
          </div>
        ))}
      </div>

      {/* FILTROS */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Estancia</label>
          <select value={filtroEstancia} onChange={e => setFiltroEstancia(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13 }}>
            <option value="">Todas las estancias</option>
            {estancias.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <button onClick={() => { setFiltroEstado('todos'); setFiltroEstancia(''); }} style={{ padding: '8px 14px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🔄 Borrar filtros</button>
        <button onClick={generarInforme} style={{ padding: '8px 14px', borderRadius: 7, border: '1.5px solid #6ee7b7', backgroundColor: '#d1fae5', color: '#065f46', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>📊 Informe CSV</button>
      </div>

      {/* LISTA */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
      ) : incidenciasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}><div style={{ fontSize: 36, marginBottom: 8 }}>🔧</div>No hay incidencias con esos filtros</div>
      ) : incidenciasFiltradas.map(inc => {
        const est = ESTADOS[inc.estado] || ESTADOS.pendiente;
        return (
          <div key={inc.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${est.color || '#f59e0b'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>{inc.estancia}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{inc.profesor_nombre} · {inc.created_at ? new Date(inc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha'}</div>
                {inc.ubicacion_exacta && <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>📍 {inc.ubicacion_exacta}</div>}
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 20, backgroundColor: est.bg || '#fef3c7', color: est.color || '#92400e', fontWeight: 700, fontSize: 12 }}>{est.emoji} {est.label}</span>
            </div>

            <div style={{ fontSize: 14, color: '#444', marginBottom: 10, lineHeight: 1.5 }}>{inc.descripcion}</div>

            {inc.foto_url && (
              <div style={{ marginBottom: 10 }}>
                <a href={inc.foto_url} target="_blank" rel="noopener noreferrer">
                  <img src={inc.foto_url} alt="Foto incidencia" style={{ maxHeight: 140, borderRadius: 8, border: '1px solid #e0e0e0', cursor: 'pointer' }} />
                </a>
              </div>
            )}

            {inc.comentario_secretario && (
              <div style={{ marginBottom: 10, padding: '7px 12px', backgroundColor: '#f0f4f0', borderRadius: 7, fontSize: 13, color: '#444' }}>
                💬 {inc.comentario_secretario}
              </div>
            )}

            {/* BOTONES */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {inc.estado === 'pendiente' && (
                <button onClick={() => { setAbierta(inc); setComentario(''); }} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🔧 Poner en proceso</button>
              )}
              {inc.estado === 'en_proceso' && (
                <button onClick={() => { setAbierta(inc); setComentario(inc.comentario_secretario || ''); }} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #6ee7b7', backgroundColor: '#d1fae5', color: '#065f46', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>✅ Marcar como resuelta</button>
              )}
              {inc.estado === 'resuelta' && (
                <button onClick={() => eliminar(inc.id)} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #fca5a5', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🗑️ Eliminar</button>
              )}
            </div>
          </div>
        );
      })}

      {/* MODAL GESTIÓN */}
      {abierta && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={e => e.target === e.currentTarget && setAbierta(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: azul }}>🔧 Gestionar incidencia</div>
              <button onClick={() => setAbierta(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}><strong>{abierta.estancia}</strong>{abierta.ubicacion_exacta ? ` · ${abierta.ubicacion_exacta}` : ''}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{abierta.descripcion}</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: azul, display: 'block', marginBottom: 6 }}>💬 Comentario (opcional)</label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej: Avisado el técnico, se revisará el martes..." rows={3} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {abierta.estado === 'pendiente' && (
                <button onClick={() => cambiarEstado(abierta.id, 'en_proceso')} disabled={procesando} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>🔧 Poner en proceso</button>
              )}
              {abierta.estado === 'en_proceso' && (
                <button onClick={() => cambiarEstado(abierta.id, 'resuelta')} disabled={procesando} style={{ flex: 1, padding: 11, borderRadius: 8, border: 'none', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✅ Marcar como resuelta</button>
              )}
              <button onClick={() => setAbierta(null)} style={{ padding: '11px 18px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SeccionCompras({ compras, setCompras, cargando, setCargando, filtroEstado, setFiltroEstado, filtroDpto, setFiltroDpto, filtroProveedor, setFiltroProveedor, filtroDesde, setFiltroDesde, filtroHasta, setFiltroHasta, compraAbierta, setCompraAbierta, comentario, setComentario, procesando, setProcesando }) {
  const verde = '#1e6b2e';
  const azul = '#1e3a5f';
  const [mensaje, setMensaje] = useState(null);
  const [modalRegistro, setModalRegistro] = useState(false);
  const [registro, setRegistro] = useState({ proveedor: '', articulos: [{ nombre: '', cantidad: 1, precio: '', iva: '21' }] });
  const [enviandoRegistro, setEnviandoRegistro] = useState(false);

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    const { data } = await getSupabase().from('compras').select('*').order('created_at', { ascending: false });
    setCompras(data || []);
    setCargando(false);
  }

  async function cambiarEstado(id, estado) {
    setProcesando(true);
    await getSupabase().from('compras').update({ estado, comentario_secretario: comentario || null }).eq('id', id);
    setProcesando(false);
    setCompraAbierta(null);
    setComentario('');
    mostrarMensaje(`✅ Solicitud marcada como "${estado}"`, 'ok');
    cargar();
  }

  async function registrarCompraDirecta() {
    const arts = registro.articulos.filter(a => a.nombre.trim());
    if (!arts.length) { mostrarMensaje('Añade al menos un artículo.', 'error'); return; }
    setEnviandoRegistro(true);
    const articulosConIva = arts.map(a => ({
      nombre: a.nombre.trim(),
      cantidad: Number(a.cantidad) || 1,
      precio: a.precio ? parseFloat(a.precio) : null,
      iva: parseFloat(a.iva) || 21,
    }));
    const total = articulosConIva.reduce((sum, a) => sum + (a.precio || 0) * a.cantidad * (1 + (a.iva || 21) / 100), 0);
    const nombreSecretario = typeof window !== 'undefined' ? (sessionStorage.getItem('profesor_nombre') || 'Secretaría') : 'Secretaría';
    const { error } = await getSupabase().from('compras').insert([{
      profesor_id: '00000000-0000-0000-0000-000000000000',
      profesor_nombre: nombreSecretario,
      departamento: 'Secretaría',
      tipo: 'ya_comprado',
      estado: 'aprobada',
      proveedor: registro.proveedor.trim() || null,
      articulos: articulosConIva,
      total_estimado: total > 0 ? total : null,
      comentario_secretario: 'Compra registrada directamente por secretaría',
    }]);
    setEnviandoRegistro(false);
    if (error) { mostrarMensaje('Error: ' + error.message, 'error'); return; }
    mostrarMensaje('✅ Compra registrada correctamente', 'ok');
    setModalRegistro(false);
    setRegistro({ proveedor: '', articulos: [{ nombre: '', cantidad: 1, precio: '', iva: '21' }] });
    cargar();
  }

  function addArticuloRegistro() {
    setRegistro(r => ({ ...r, articulos: [...r.articulos, { nombre: '', cantidad: 1, precio: '', iva: '21' }] }));
  }

  function updateArticuloRegistro(i, campo, valor) {
    setRegistro(r => ({ ...r, articulos: r.articulos.map((a, idx) => idx === i ? { ...a, [campo]: valor } : a) }));
  }

  const totalRegistro = registro.articulos.reduce((sum, a) => {
    return sum + (parseFloat(a.precio) || 0) * (parseInt(a.cantidad) || 1) * (1 + (parseFloat(a.iva) || 21) / 100);
  }, 0);

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  const ESTADOS = {
    todos:     { label: 'Todas',    bg: '#f5f5f5', color: '#555' },
    pendiente: { label: 'Pendiente', bg: '#fef3c7', color: '#92400e', emoji: '⏳' },
    aprobada:  { label: 'Aprobada',  bg: '#d1fae5', color: '#065f46', emoji: '✅' },
    rechazada: { label: 'Rechazada', bg: '#fee2e2', color: '#991b1b', emoji: '❌' },
    comprado:  { label: 'Comprado',  bg: '#dbeafe', color: '#1e40af', emoji: '📦' },
  };

  // Filtros aplicados
  const comprasFiltradas = compras.filter(c => {
    if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
    if (filtroDpto && !c.departamento?.toLowerCase().includes(filtroDpto.toLowerCase())) return false;
    if (filtroProveedor && !c.proveedor?.toLowerCase().includes(filtroProveedor.toLowerCase())) return false;
    if (filtroDesde && c.created_at < filtroDesde) return false;
    if (filtroHasta && c.created_at.slice(0,10) > filtroHasta) return false;
    return true;
  });

  const totalFiltrado = comprasFiltradas.reduce((sum, c) => sum + (parseFloat(c.total_estimado) || 0), 0);

  return (
    <div>
      {mensaje && <div style={{ marginBottom: 12, padding: '10px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>{mensaje.texto}</div>}

      {/* FILTROS */}
      <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: azul, marginBottom: 12 }}>🔍 Filtros de búsqueda</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13 }}>
              {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Departamento</label>
            <input value={filtroDpto} onChange={e => setFiltroDpto(e.target.value)} placeholder="Todos..." style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Proveedor</label>
            <input value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} placeholder="Amazon, Leroy..." style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Desde</label>
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Hasta</label>
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button onClick={() => { setFiltroEstado('todos'); setFiltroDpto(''); setFiltroProveedor(''); setFiltroDesde(''); setFiltroHasta(''); }} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>🔄 Borrar filtros</button>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><strong style={{ color: azul }}>{comprasFiltradas.length}</strong> solicitudes · Total estimado: <strong style={{ color: verde }}>{totalFiltrado.toFixed(2)} €</strong></span>
          <button onClick={() => setModalRegistro(true)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>➕ Registrar compra</button>
        </div>
      </div>

      {/* LISTA */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
      ) : comprasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}><div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>No hay solicitudes con esos filtros</div>
      ) : comprasFiltradas.map(c => {
        const est = ESTADOS[c.estado] || ESTADOS.pendiente;
        const arts = Array.isArray(c.articulos) ? c.articulos : [];
        return (
          <div key={c.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${est.color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>{c.profesor_nombre}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{c.departamento} · {new Date(c.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>
                  {c.tipo === 'ya_comprado' ? '🧾 Ya comprado' : '🛍️ Solicitud de pedido'}
                  {c.proveedor ? ` · ${c.proveedor}` : ''}
                </div>
              </div>
              <span style={{ padding: '4px 12px', borderRadius: 20, backgroundColor: est.bg, color: est.color, fontWeight: 700, fontSize: 12 }}>{est.emoji} {est.label}</span>
            </div>

            <div style={{ marginTop: 10, borderTop: '1px solid #f0f0f0', paddingTop: 10 }}>
              {arts.map((a, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#555', marginBottom: 4 }}>
                  <span>• {a.nombre} × {a.cantidad}{a.descripcion ? ` — ${a.descripcion}` : ''}</span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {a.precio && (
                      <span style={{ color: '#888', fontSize: 12 }}>
                        {(a.precio * a.cantidad).toFixed(2)} € + IVA {a.iva || 21}% = <strong style={{ color: verde }}>{(a.precio * a.cantidad * (1 + (a.iva || 21) / 100)).toFixed(2)} €</strong>
                      </span>
                    )}
                    {a.enlace && <a href={a.enlace} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontSize: 12, fontWeight: 600 }}>🔗 Ver</a>}
                    {a.archivo_url && <a href={a.archivo_url} target="_blank" rel="noopener noreferrer" style={{ color: '#7c3aed', fontSize: 12, fontWeight: 600 }}>📎 Doc</a>}
                  </div>
                </div>
              ))}
              {c.total_estimado > 0 && (
                <div style={{ marginTop: 8, padding: '8px 12px', backgroundColor: '#f8fdf8', borderRadius: 7, border: '1px solid #e0e0e0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                    <span>Base imponible:</span>
                    <span>{arts.reduce((s, a) => s + (a.precio || 0) * a.cantidad, 0).toFixed(2)} €</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
                    <span>IVA:</span>
                    <span>{(parseFloat(c.total_estimado) - arts.reduce((s, a) => s + (a.precio || 0) * a.cantidad, 0)).toFixed(2)} €</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: azul, fontSize: 14, borderTop: '1px solid #ddd', marginTop: 4, paddingTop: 4 }}>
                    <span>Total (con IVA):</span>
                    <span>{parseFloat(c.total_estimado).toFixed(2)} €</span>
                  </div>
                </div>
              )}
              {c.albaran_url && (
                <div style={{ marginTop: 8 }}>
                  <a href={c.albaran_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 8, color: '#92400e', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                    🧾 Ver albarán adjunto
                  </a>
                </div>
              )}
            </div>

            {c.comentario_secretario && (
              <div style={{ marginTop: 8, padding: '7px 12px', backgroundColor: '#f0f4f0', borderRadius: 7, fontSize: 12, color: '#444' }}>💬 {c.comentario_secretario}</div>
            )}

            {/* BOTONES DE ACCIÓN */}
            {c.estado === 'pendiente' && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => { setCompraAbierta(c); setComentario(''); }} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#333', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>📝 Gestionar</button>
              </div>
            )}
            {c.estado === 'aprobada' && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => cambiarEstado(c.id, 'comprado')} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>📦 Marcar como comprado</button>
              </div>
            )}
            {c.estado === 'comprado' && (
              <div style={{ marginTop: 12 }}>
                <button onClick={async () => {
                  if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return;
                  await getSupabase().from('compras').delete().eq('id', c.id);
                  mostrarMensaje('🗑️ Solicitud eliminada correctamente', 'ok');
                  cargar();
                }} style={{ padding: '7px 14px', borderRadius: 7, border: '1.5px solid #fca5a5', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                  🗑️ Eliminar (factura contabilizada)
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* MODAL GESTIÓN */}
      {compraAbierta && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={e => e.target === e.currentTarget && setCompraAbierta(null)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: azul }}>🛒 Gestionar solicitud</div>
              <button onClick={() => setCompraAbierta(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 4 }}><strong>{compraAbierta.profesor_nombre}</strong> · {compraAbierta.departamento}</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{compraAbierta.tipo === 'ya_comprado' ? '🧾 Ya comprado' : '🛍️ Solicitud de pedido'}{compraAbierta.proveedor ? ` · ${compraAbierta.proveedor}` : ''}</div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: azul, display: 'block', marginBottom: 6 }}>💬 Comentario (opcional)</label>
              <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Motivo de aprobación o rechazo..." rows={3} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => cambiarEstado(compraAbierta.id, 'aprobada')} disabled={procesando} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', backgroundColor: '#d1fae5', color: '#065f46', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>✅ Aprobar</button>
              <button onClick={() => cambiarEstado(compraAbierta.id, 'rechazada')} disabled={procesando} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', backgroundColor: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>❌ Rechazar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRO DIRECTO SECRETARÍA */}
      {modalRegistro && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={e => e.target === e.currentTarget && setModalRegistro(false)}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: azul }}>➕ Registrar compra (Secretaría)</div>
              <button onClick={() => setModalRegistro(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16, padding: '8px 12px', backgroundColor: '#f0f4f0', borderRadius: 8 }}>
              Esta compra quedará registrada directamente como <strong>Aprobada</strong> sin pasar por pendiente.
            </div>

            {/* Proveedor */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: azul, display: 'block', marginBottom: 5 }}>🏪 Proveedor</label>
              <input value={registro.proveedor} onChange={e => setRegistro(r => ({ ...r, proveedor: e.target.value }))} placeholder="Amazon, Leroy Merlín..." style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
            </div>

            {/* Artículos */}
            <label style={{ fontSize: 13, fontWeight: 600, color: azul, display: 'block', marginBottom: 8 }}>📦 Artículos *</label>
            {registro.articulos.map((a, i) => (
              <div key={i} style={{ backgroundColor: '#f8fdf8', borderRadius: 8, padding: 12, marginBottom: 8, border: '1.5px solid #e0e0e0', position: 'relative' }}>
                <input value={a.nombre} onChange={e => updateArticuloRegistro(i, 'nombre', e.target.value)} placeholder="Nombre del artículo *" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1.5px solid #ddd', fontSize: 13, marginBottom: 6, boxSizing: 'border-box' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                  <div>
                    <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 2 }}>Cantidad</label>
                    <input type="number" min="1" value={a.cantidad} onChange={e => updateArticuloRegistro(i, 'cantidad', e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 2 }}>Precio s/IVA (€)</label>
                    <input type="number" min="0" step="0.01" value={a.precio} onChange={e => updateArticuloRegistro(i, 'precio', e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: '#888', display: 'block', marginBottom: 2 }}>IVA (%)</label>
                    <select value={a.iva} onChange={e => updateArticuloRegistro(i, 'iva', e.target.value)} style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }}>
                      <option value="0">0%</option>
                      <option value="4">4%</option>
                      <option value="10">10%</option>
                      <option value="21">21%</option>
                    </select>
                  </div>
                </div>
                {registro.articulos.length > 1 && (
                  <button onClick={() => setRegistro(r => ({ ...r, articulos: r.articulos.filter((_, idx) => idx !== i) }))} style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#ccc', fontSize: 16, cursor: 'pointer' }}>✕</button>
                )}
              </div>
            ))}
            <button onClick={addArticuloRegistro} style={{ width: '100%', padding: 9, borderRadius: 7, border: `2px dashed ${verde}`, backgroundColor: 'white', color: verde, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>＋ Añadir artículo</button>

            {totalRegistro > 0 && (
              <div style={{ backgroundColor: '#f0fdf4', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: verde, fontSize: 14 }}>
                <span>Total con IVA:</span><span>{totalRegistro.toFixed(2)} €</span>
              </div>
            )}

            <button onClick={registrarCompraDirecta} disabled={enviandoRegistro} style={{ width: '100%', padding: 13, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 800, fontSize: 15, cursor: enviandoRegistro ? 'not-allowed' : 'pointer', opacity: enviandoRegistro ? 0.7 : 1 }}>
              {enviandoRegistro ? '⏳ Registrando...' : '✅ Registrar compra'}
            </button>
          </div>
        </div>
      )}
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