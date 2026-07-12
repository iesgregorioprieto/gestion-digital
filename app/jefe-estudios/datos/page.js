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

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => { const r = sessionStorage.getItem('profesor_rol_gestion'); window.location.href = r === 'director' ? '/director' : '/jefe-estudios'; }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
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
                Delphos genera un archivo RAR/ZIP con los horarios de todos los profesores en formato HTML. Este archivo permite que DLD y Ausencias carguen el horario automáticamente.
              </div>
              <div style={{ fontSize: 12, backgroundColor: '#f0fdf4', padding: '8px 12px', borderRadius: 7, color: '#065f46', marginBottom: 16 }}>
                🖥️ <strong>Delphos:</strong> Horarios → Imprimir/Exportar → HTML indexado → Se generará un RAR con carpeta <strong>Profesores/</strong>
              </div>

              <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fbbf24', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                ⚠️ <strong>Este archivo solo puede procesarlo el equipo técnico.</strong> Entrega el RAR al responsable TIC o contacta con el administrador del portal para actualizar los horarios al inicio de curso.
              </div>

              <div style={{ backgroundColor: '#f8f8f8', borderRadius: 10, padding: 14 }}>
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
            </div>
          </div>
        )}
      </div>

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
