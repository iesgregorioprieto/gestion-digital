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

const verde = '#1e6b2e';
const verdeClaro = '#f0fdf4';
const azul = '#1e3a5f';

const RESTRICCIONES = [
  { key: 'auth_imagenes',        emoji: '📸', label: 'Imágenes <14',           detalle: 'NO autorizado a grabación/difusión de imágenes (menor 14 años)' },
  { key: 'auth_salidas',         emoji: '🚪', label: 'Salidas recreo',          detalle: 'NO autorizado a salir en recreo/última hora (16-17 años)' },
  { key: 'auth_actividades',     emoji: '🎒', label: 'Actividades extra',        detalle: 'NO autorizado para actividades extracurriculares fuera del centro' },
  { key: 'auth_informar_progeni',emoji: '📊', label: 'Informar progenitores',    detalle: 'NO autoriza informar a progenitores de datos académicos (mayor de edad)' },
  { key: 'auth_imagenes_mayor',  emoji: '📸', label: 'Imágenes mayor edad',      detalle: 'NO autoriza grabación/difusión de imágenes (mayor de edad)' },
];

export default function Autorizaciones() {
  const [profesorNombre, setProfesorNombre] = useState('');
  const [rolGestion, setRolGestion] = useState('');
  const [roles, setRoles] = useState([]);
  const [vista, setVista] = useState('consulta');
  const [busqueda, setBusqueda] = useState('');
  const [filtroBusqueda, setFiltroBusqueda] = useState('nombre');
  const [alumnos, setAlumnos] = useState([]);
  const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  // Jefe de estudios
  const [subiendoExcel, setSubiendoExcel] = useState(false);
  const [previstaExcel, setPrevistaExcel] = useState([]);
  const [modalPreview, setModalPreview] = useState(false);
  const [grupos, setGrupos] = useState([]);
  const [filtroGrupo, setFiltroGrupo] = useState('');
  const [stats, setStats] = useState({ total: 0, conRestricciones: 0, grupos: 0 });
  const fileRef = useRef(null);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorNombre(sessionStorage.getItem('profesor_nombre') || '');
    setRolGestion(sessionStorage.getItem('profesor_rol_gestion') || '');
    setRoles(JSON.parse(sessionStorage.getItem('profesor_roles') || '[]'));
    cargarGrupos();
    cargarStats();
  }, []);

  async function cargarGrupos() {
    const { data } = await getSupabase().from('alumnos').select('grupo');
    if (data) {
      const gs = [...new Set(data.map(a => a.grupo))].sort();
      setGrupos(gs);
    }
  }

  async function cargarStats() {
    const { data } = await getSupabase().from('alumnos').select('*');
    if (data) {
      const conR = data.filter(a =>
        a.auth_imagenes === false || a.auth_salidas === false || a.auth_actividades === false ||
        a.auth_informar_progeni === false || a.auth_imagenes_mayor === false
      ).length;
      const gs = new Set(data.map(a => a.grupo)).size;
      setStats({ total: data.length, conRestricciones: conR, grupos: gs });
    }
  }

  async function buscarAlumnos() {
    if (!busqueda.trim() && !filtroGrupo) return;
    setCargando(true);
    setAlumnoSeleccionado(null);
    let query = getSupabase().from('alumnos').select('*');
    if (filtroGrupo) {
      query = query.eq('grupo', filtroGrupo);
    } else if (filtroBusqueda === 'nombre') {
      query = query.ilike('apellidos', `%${busqueda.trim()}%`);
    } else {
      query = query.eq('grupo', busqueda.trim().toUpperCase());
    }
    const { data } = await query.order('apellidos');
    setAlumnos(data || []);
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  // ===== IMPORTAR EXCEL =====
  async function procesarExcel(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSubiendoExcel(true);

    const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // Mapear columnas del Excel a campos de la tabla
        const alumnos = rows.map(r => {
          // Intentar detectar las columnas automáticamente
          const keys = Object.keys(r).map(k => k.toLowerCase().trim());
          const get = (terminos) => {
            const key = Object.keys(r).find(k => terminos.some(t => k.toLowerCase().includes(t)));
            return key ? String(r[key]).trim() : '';
          };

          return {
            nombre: get(['nombre']),
            apellidos: get(['apellido']),
            grupo: get(['grupo', 'curso', 'clase']).toUpperCase(),
            no_imagen_menor14:    ['si','sí','yes','1','true','x'].includes(String(get(['imagen_menor14','img_menor14','menor14','imagen14'])).toLowerCase()),
            no_imagen_mayor14:    ['si','sí','yes','1','true','x'].includes(String(get(['imagen_mayor14','img_mayor14','mayor14'])).toLowerCase()),
            no_salidas_1617:      ['si','sí','yes','1','true','x'].includes(String(get(['salida','recreo','1617','16_17'])).toLowerCase()),
            no_actividades_menor18: ['si','sí','yes','1','true','x'].includes(String(get(['actividad','extracurricular','menor18'])).toLowerCase()),
            no_informar_mayor18:  ['si','sí','yes','1','true','x'].includes(String(get(['informar','progenitor','mayor18'])).toLowerCase()),
          };
        }).filter(a => a.nombre || a.apellidos);

        setPrevistaExcel(alumnos);
        setModalPreview(true);
      } catch (err) {
        mostrarMensaje('Error al leer el Excel: ' + err.message, 'error');
      }
      setSubiendoExcel(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function confirmarImportacion() {
    if (!previstaExcel.length) return;
    setSubiendoExcel(true);
    const { error } = await getSupabase().from('alumnos').insert(previstaExcel);
    setSubiendoExcel(false);
    setModalPreview(false);
    if (error) { mostrarMensaje('Error al importar: ' + error.message, 'error'); return; }
    mostrarMensaje(`✅ ${previstaExcel.length} alumnos importados correctamente`, 'ok');
    setPrevistaExcel([]);
    cargarGrupos();
    cargarStats();
  }

  async function eliminarGrupo(grupo) {
    if (!confirm(`¿Eliminar todos los alumnos del grupo ${grupo}? No se puede deshacer.`)) return;
    await getSupabase().from('alumnos').delete().eq('grupo', grupo);
    mostrarMensaje(`🗑️ Grupo ${grupo} eliminado`, 'ok');
    cargarGrupos();
    cargarStats();
    setAlumnos([]);
  }

  const esJefeEstudios = rolGestion === 'jefe_estudios' || rolGestion === 'secretario' || rolGestion === 'director';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>📋</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Autorizaciones de Alumnos</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{profesorNombre}</div>
        </div>
      </div>

      {/* MENSAJE */}
      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      {/* TABS */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0' }}>
        <button onClick={() => setVista('consulta')} style={{ padding: '9px 18px', borderRadius: 10, border: `2px solid ${vista === 'consulta' ? azul : '#ddd'}`, backgroundColor: vista === 'consulta' ? azul : 'white', color: vista === 'consulta' ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          🔍 Consultar alumno
        </button>
        {esJefeEstudios && (
          <button onClick={() => setVista('gestion')} style={{ padding: '9px 18px', borderRadius: 10, border: `2px solid ${vista === 'gestion' ? azul : '#ddd'}`, backgroundColor: vista === 'gestion' ? azul : 'white', color: vista === 'gestion' ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            ⚙️ Gestión (Jefatura)
          </button>
        )}
      </div>

      <div style={{ padding: 16 }}>

        {/* ===== VISTA CONSULTA ===== */}
        {vista === 'consulta' && (
          <div>
            {/* ESTADÍSTICAS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Alumnos', valor: stats.total, emoji: '👥', color: azul },
                { label: 'Con restricciones', valor: stats.conRestricciones, emoji: '⚠️', color: '#92400e' },
                { label: 'Grupos', valor: stats.grupos, emoji: '📚', color: verde },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: 'white', borderRadius: 10, padding: '12px 14px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <div style={{ fontSize: 20 }}>{s.emoji}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.valor}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* BUSCADOR */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: azul, marginBottom: 12 }}>🔍 Buscar alumno</div>

              {/* Filtro por grupo directo */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 4 }}>Por grupo</label>
                <select value={filtroGrupo} onChange={e => { setFiltroGrupo(e.target.value); setBusqueda(''); }} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13 }}>
                  <option value="">-- Selecciona un grupo --</option>
                  {grupos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              <div style={{ textAlign: 'center', color: '#aaa', fontSize: 12, marginBottom: 10 }}>— o busca por apellido —</div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={busqueda}
                  onChange={e => { setBusqueda(e.target.value); setFiltroGrupo(''); }}
                  onKeyDown={e => e.key === 'Enter' && buscarAlumnos()}
                  placeholder="Apellidos del alumno..."
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }}
                />
                <button onClick={buscarAlumnos} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Buscar</button>
              </div>
            </div>

            {/* RESULTADOS */}
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Buscando...</div>
            ) : alumnos.length > 0 ? (
              <div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>{alumnos.length} alumno{alumnos.length !== 1 ? 's' : ''} encontrado{alumnos.length !== 1 ? 's' : ''}</div>
                {alumnos.map(a => {
                  const restricciones = RESTRICCIONES.filter(r => a[r.key] === false);
                  return (
                    <div key={a.id} onClick={() => setAlumnoSeleccionado(alumnoSeleccionado?.id === a.id ? null : a)}
                      style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer', borderLeft: `4px solid ${restricciones.length > 0 ? '#f59e0b' : verde}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: azul }}>{a.apellidos}, {a.nombre}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>📚 {a.grupo}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {restricciones.length === 0 ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: verde, backgroundColor: verdeClaro, padding: '4px 10px', borderRadius: 20 }}>✅ Sin restricciones</span>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '4px 10px', borderRadius: 20 }}>⚠️ {restricciones.length} restricción{restricciones.length > 1 ? 'es' : ''}</span>
                          )}
                        </div>
                      </div>

                      {/* DETALLE RESTRICCIONES */}
                      {alumnoSeleccionado?.id === a.id && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f0f0' }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: azul, marginBottom: 10 }}>Detalle de autorizaciones:</div>
                          {RESTRICCIONES.map(r => (
                            <div key={r.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', borderRadius: 8, marginBottom: 6, backgroundColor: a[r.key] === false ? '#fef3c7' : '#f0fdf4', border: `1px solid ${a[r.key] === false ? '#fcd34d' : '#6ee7b7'}` }}>
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{a[r.key] === false ? '❌' : '✅'}</span>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: a[r.key] === false ? '#92400e' : '#065f46' }}>
                                  {a[r.key] === false ? 'NO autorizado' : 'Autorizado'} — {r.emoji} {r.label}
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{r.detalle}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : busqueda || filtroGrupo ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                <div>No se encontraron alumnos</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
                <div>Selecciona un grupo o busca por apellido</div>
              </div>
            )}
          </div>
        )}

        {/* ===== VISTA GESTIÓN (JEFE ESTUDIOS) ===== */}
        {vista === 'gestion' && esJefeEstudios && (
          <div>
            {/* SUBIR EXCEL */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>📤 Importar alumnos desde Excel</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
                El Excel debe tener columnas: <strong>nombre, apellidos, grupo</strong> y opcionalmente las columnas de restricciones
                (<strong>imagen_menor14, imagen_mayor14, salida, actividad, informar</strong>) con valor <strong>SI/NO</strong>.
              </div>

              {!subiendoExcel ? (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '16px 20px', borderRadius: 10, border: '2.5px dashed #93c5fd', backgroundColor: '#f0f7ff', color: '#1e40af', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  <span style={{ fontSize: 28 }}>📊</span>
                  <div>
                    <div>Toca aquí para subir el Excel</div>
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Formatos: .xlsx, .xls, .csv</div>
                  </div>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={procesarExcel} style={{ display: 'none' }} />
                </label>
              ) : (
                <div style={{ textAlign: 'center', padding: 20, color: '#1e40af', fontWeight: 600 }}>⏳ Procesando Excel...</div>
              )}
            </div>

            {/* GRUPOS CARGADOS */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 12 }}>📚 Grupos cargados ({grupos.length})</div>
              {grupos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>No hay alumnos importados aún</div>
              ) : grupos.map(g => (
                <div key={g} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, backgroundColor: '#f8fdf8', border: '1px solid #e0e0e0', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: azul }}>📚 {g}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setFiltroGrupo(g); setVista('consulta'); buscarAlumnos(); }} style={{ padding: '6px 12px', borderRadius: 6, border: '1.5px solid #93c5fd', backgroundColor: '#dbeafe', color: '#1e40af', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>👁️ Ver</button>
                    <button onClick={() => eliminarGrupo(g)} style={{ padding: '6px 12px', borderRadius: 6, border: '1.5px solid #fca5a5', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>🗑️ Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MODAL PREVIEW EXCEL */}
      {modalPreview && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 600, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 6 }}>📊 Vista previa del Excel</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>{previstaExcel.length} alumnos detectados. Revisa antes de importar.</div>

            <div style={{ marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
              {previstaExcel.slice(0, 20).map((a, i) => {
                const restricciones = RESTRICCIONES.filter(r => a[r.key] === false);
                return (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: 7, backgroundColor: '#f8f8f8', marginBottom: 6, fontSize: 13 }}>
                    <strong>{a.apellidos}, {a.nombre}</strong> — {a.grupo}
                    {restricciones.length > 0 && <span style={{ marginLeft: 8, color: '#92400e', fontSize: 11 }}>⚠️ {restricciones.map(r => r.emoji + r.label).join(' · ')}</span>}
                  </div>
                );
              })}
              {previstaExcel.length > 20 && <div style={{ textAlign: 'center', color: '#888', fontSize: 12, padding: 8 }}>...y {previstaExcel.length - 20} más</div>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmarImportacion} disabled={subiendoExcel} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {subiendoExcel ? '⏳ Importando...' : `✅ Importar ${previstaExcel.length} alumnos`}
              </button>
              <button onClick={() => { setModalPreview(false); setPrevistaExcel([]); }} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
