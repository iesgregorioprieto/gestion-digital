'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
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
  const [alumnos, setAlumnos] = useState([]);
  const [cambios, setCambios] = useState({}); // {id: {auth_imagenes: true/false, dni: ''}}
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [alumnoExpandido, setAlumnoExpandido] = useState(null);

  const esDirectivo = ['jefe_estudios', 'secretario', 'director'].includes(rolGestion);

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
      getSupabase().from('profesores').select('grupo_tutoria').eq('id', id).then(({ data }) => {
        if (data?.[0]?.grupo_tutoria) {
          setGrupoTutor(data[0].grupo_tutoria);
          setGrupoSeleccionado(data[0].grupo_tutoria);
          cargarAlumnos(data[0].grupo_tutoria);
        }
      });
    }
  }, []);

  async function cargarGrupos() {
    const { data } = await getSupabase().from('alumnos').select('grupo').order('grupo');
    if (data) {
      const gs = [...new Set(data.map(a => a.grupo))].sort();
      setGrupos(gs);
    }
  }

  async function cargarAlumnos(grupo) {
    if (!grupo) return;
    setCargando(true);
    setAlumnos([]);
    setCambios({});
    const { data } = await getSupabase()
      .from('alumnos')
      .select('*')
      .eq('grupo', grupo)
      .order('apellidos');
    setAlumnos(data || []);
    setCargando(false);
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
      const { error } = await getSupabase().from('alumnos').update(datos).eq('id', id);
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
  function contarRestricciones(alumno) {
    return AUTORIZACIONES.filter(a => !getValor(alumno, a.key)).length;
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
