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

// Familias válidas (sin modulares)
const FAMILIAS = {
  'ESO': 'ESO', 'BTO': 'Bachillerato', 'GB': 'FP Básica',
  'GM': 'Grado Medio', 'GS': 'Grado Superior',
  'CA': 'Cursos Espec.', 'FPPE': 'FP Permanente',
};

function detectarFamilia(grupo) {
  if (!grupo) return null;
  const g = grupo.trim().toUpperCase();
  // Excluir modulares
  if (g.includes('MOD') || g.startsWith('2GM')) return null;
  for (const prefijo of Object.keys(FAMILIAS)) {
    if (g.startsWith(prefijo + '-') || g.startsWith(prefijo + ' ')) return prefijo;
  }
  if (g.startsWith('PL-')) return null; // PL-AAD no incluir
  return null;
}

export default function GestionDatos() {
  const [nombre, setNombre] = useState('');
  const [stats, setStats] = useState({ grupos: 0, alumnos: 0, cursoActual: '' });
  const [grupos, setGrupos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [preview, setPreview] = useState([]);
  const [modalPreview, setModalPreview] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [cursoNuevo, setCursoNuevo] = useState('2025-2026');
  const [vistaTab, setVistaTab] = useState('grupos');
  const fileRefGrupos = useRef(null);
  const fileRefAlumnos = useRef(null);
  const [previewAlumnos, setPreviewAlumnos] = useState([]);
  const [modalAlumnos, setModalAlumnos] = useState(false);

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
    const { data: gs } = await getSupabase().from('grupos').select('codigo, curso_academico').order('codigo');
    const { data: als } = await getSupabase().from('alumnos').select('id, curso_academico');
    const curso = gs?.[0]?.curso_academico || '—';
    setGrupos(gs || []);
    setStats({ grupos: gs?.length || 0, alumnos: als?.length || 0, cursoActual: curso });
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  // ===== IMPORTAR GRUPOS DESDE CSV DE DELPHOS =====
  async function procesarCSVGrupos(e) {
    const file = e.target.files[0];
    if (!file) return;
    setProcesando(true);

    const texto = await file.text();
    // Detectar separador
    const sep = texto.includes(';') ? ';' : ',';
    const lineas = texto.split('\n').filter(l => l.trim());
    const cabecera = lineas[0].split(sep).map(c => c.trim().replace(/"/g, '').toUpperCase());
    const idxGrupo = cabecera.findIndex(c => c === 'GRUPO');

    if (idxGrupo === -1) {
      mostrarMensaje('❌ No se encontró la columna GRUPO en el CSV.', 'error');
      setProcesando(false); return;
    }

    // Extraer grupos únicos sin modulares
    const gruposSet = new Set();
    for (let i = 1; i < lineas.length; i++) {
      const cols = lineas[i].split(sep).map(c => c.trim().replace(/"/g, ''));
      const grupo = cols[idxGrupo];
      const familia = detectarFamilia(grupo);
      if (familia && grupo) gruposSet.add(JSON.stringify({ codigo: grupo.trim(), familia }));
    }

    const gruposNuevos = [...gruposSet].map(s => JSON.parse(s));
    setPreview(gruposNuevos);
    setModalPreview(true);
    setProcesando(false);
    e.target.value = '';
  }

  async function confirmarGrupos() {
    setProcesando(true);
    // Borrar grupos del curso actual y reinsertar
    await getSupabase().from('grupos').delete().eq('curso_academico', cursoNuevo);
    const { error } = await getSupabase().from('grupos').insert(
      preview.map(g => ({ ...g, curso_academico: cursoNuevo }))
    );
    setProcesando(false);
    setModalPreview(false);
    if (error) { mostrarMensaje('❌ Error: ' + error.message, 'error'); return; }
    mostrarMensaje(`✅ ${preview.length} grupos importados para el curso ${cursoNuevo}`, 'ok');
    setPreview([]);
    cargarStats();
  }

  // ===== IMPORTAR ALUMNOS DESDE CSV DE DELPHOS =====
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
      alumno: cabecera.findIndex(c => c === 'ALUMNO'),
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
      const familia = detectarFamilia(grupo);
      if (!familia) continue; // saltar modulares y sin grupo
      alumnosNuevos.push({
        nombre: cols[idx.nombre] || '',
        apellidos: cols[idx.apellidos] || '',
        grupo: grupo,
        num_expediente: idx.numExp !== -1 ? cols[idx.numExp] : null,
        curso_academico: cursoNuevo,
      });
    }

    setPreviewAlumnos(alumnosNuevos);
    setModalAlumnos(true);
    setProcesando(false);
    e.target.value = '';
  }

  async function confirmarAlumnos() {
    setProcesando(true);
    // Borrar alumnos del curso y reinsertar
    await getSupabase().from('alumnos').delete().eq('curso_academico', cursoNuevo);

    // Insertar en lotes de 200
    const LOTE = 200;
    for (let i = 0; i < previewAlumnos.length; i += LOTE) {
      const lote = previewAlumnos.slice(i, i + LOTE);
      const { error } = await getSupabase().from('alumnos').insert(lote);
      if (error) {
        setProcesando(false);
        mostrarMensaje('❌ Error al importar: ' + error.message, 'error');
        setModalAlumnos(false);
        return;
      }
    }

    setProcesando(false);
    setModalAlumnos(false);
    mostrarMensaje(`✅ ${previewAlumnos.length} alumnos importados para el curso ${cursoNuevo}`, 'ok');
    setPreviewAlumnos([]);
    cargarStats();
  }

  // Agrupar grupos por familia
  const gruposPorFamilia = grupos.reduce((acc, g) => {
    if (!acc[g.familia]) acc[g.familia] = [];
    acc[g.familia].push(g.codigo);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/jefe-estudios'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>📊</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Gestión de Datos del Centro</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{nombre}</div>
        </div>
      </div>

      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ padding: 16 }}>

        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Grupos', valor: stats.grupos, emoji: '📚', color: azul },
            { label: 'Alumnos', valor: stats.alumnos, emoji: '👥', color: verde },
            { label: 'Curso actual', valor: stats.cursoActual, emoji: '📅', color: '#7c2d12' },
          ].map(s => (
            <div key={s.label} style={{ backgroundColor: 'white', borderRadius: 10, padding: '12px 14px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontSize: 20 }}>{s.emoji}</div>
              <div style={{ fontSize: s.label === 'Curso actual' ? 13 : 22, fontWeight: 800, color: s.color }}>{s.valor || '—'}</div>
              <div style={{ fontSize: 11, color: '#888' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* SELECTOR CURSO */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: azul, display: 'block', marginBottom: 6 }}>📅 Curso académico para importar</label>
          <input value={cursoNuevo} onChange={e => setCursoNuevo(e.target.value)} placeholder="2025-2026" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
          <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>Los datos importados se asociarán a este curso. Al reimportar se borran los anteriores del mismo curso.</div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[{ id: 'grupos', label: '📚 Grupos' }, { id: 'alumnos', label: '👥 Alumnos' }].map(t => (
            <button key={t.id} onClick={() => setVistaTab(t.id)} style={{ padding: '9px 18px', borderRadius: 10, border: `2px solid ${vistaTab === t.id ? azul : '#ddd'}`, backgroundColor: vistaTab === t.id ? azul : 'white', color: vistaTab === t.id ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ===== GRUPOS ===== */}
        {vistaTab === 'grupos' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>📤 Importar grupos desde CSV de Delphos</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
                Sube el CSV de matrículas de Delphos. El sistema extraerá los grupos automáticamente (sin modulares ni a distancia).
              </div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 20px', borderRadius: 10, border: '2.5px dashed #93c5fd', backgroundColor: '#f0f7ff', color: '#1e40af', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                <span style={{ fontSize: 26 }}>📊</span>
                <div>
                  <div>Subir CSV de matrículas (Delphos)</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Columna requerida: GRUPO</div>
                </div>
                <input ref={fileRefGrupos} type="file" accept=".csv,.txt" onChange={procesarCSVGrupos} style={{ display: 'none' }} />
              </label>
            </div>

            {/* Lista de grupos actuales */}
            {Object.keys(gruposPorFamilia).length > 0 && (
              <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 12 }}>📚 Grupos cargados — curso {stats.cursoActual}</div>
                {Object.entries(gruposPorFamilia).sort().map(([familia, gs]) => (
                  <div key={familia} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 6, textTransform: 'uppercase' }}>{FAMILIAS[familia] || familia} ({gs.length})</div>
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

        {/* ===== ALUMNOS ===== */}
        {vistaTab === 'alumnos' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: azul, marginBottom: 6 }}>📤 Importar alumnos desde CSV de Delphos</div>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
                Sube el CSV de matrículas. Se importarán <strong>nombre, apellidos y grupo</strong> de cada alumno. Los modulares se excluyen automáticamente.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 20px', borderRadius: 10, border: '2.5px dashed #6ee7b7', backgroundColor: '#f0fdf4', color: '#065f46', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                <span style={{ fontSize: 26 }}>👥</span>
                <div>
                  <div>Subir CSV de matrículas (Delphos)</div>
                  <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 2 }}>Columnas requeridas: NOMBRE, APELLIDOS, GRUPO</div>
                </div>
                <input ref={fileRefAlumnos} type="file" accept=".csv,.txt" onChange={procesarCSVAlumnos} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, border: '1.5px solid #fcd34d', fontSize: 13, color: '#92400e' }}>
              ⚠️ <strong>Importante:</strong> Al importar un nuevo listado de alumnos para el mismo curso se borrarán los anteriores de ese curso. Las autorizaciones vinculadas a esos alumnos se mantendrán hasta que el jefe de estudios las actualice.
            </div>
          </div>
        )}
      </div>

      {/* MODAL PREVIEW GRUPOS */}
      {modalPreview && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 6 }}>📚 Vista previa — Grupos detectados</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>{preview.length} grupos válidos (sin modulares). Se importarán para el curso <strong>{cursoNuevo}</strong>.</div>

            {Object.entries(preview.reduce((acc, g) => { if (!acc[g.familia]) acc[g.familia] = []; acc[g.familia].push(g.codigo); return acc; }, {})).sort().map(([fam, gs]) => (
              <div key={fam} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 4 }}>{FAMILIAS[fam] || fam} ({gs.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {gs.sort().map(g => <span key={g} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 16, backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>{g}</span>)}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={confirmarGrupos} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {procesando ? '⏳ Importando...' : `✅ Importar ${preview.length} grupos`}
              </button>
              <button onClick={() => { setModalPreview(false); setPreview([]); }} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PREVIEW ALUMNOS */}
      {modalAlumnos && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, maxWidth: 560, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: azul, marginBottom: 6 }}>👥 Vista previa — Alumnos detectados</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>{previewAlumnos.length} alumnos válidos. Se importarán para el curso <strong>{cursoNuevo}</strong>.</div>

            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {previewAlumnos.slice(0, 30).map((a, i) => (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 6, backgroundColor: '#f8f8f8', marginBottom: 4, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>{a.apellidos}</strong>, {a.nombre}</span>
                  <span style={{ fontSize: 11, color: '#888', backgroundColor: '#e0e7ff', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>{a.grupo}</span>
                </div>
              ))}
              {previewAlumnos.length > 30 && <div style={{ textAlign: 'center', color: '#888', fontSize: 12, padding: 8 }}>...y {previewAlumnos.length - 30} más</div>}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={confirmarAlumnos} disabled={procesando} style={{ flex: 1, padding: 12, borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {procesando ? '⏳ Importando...' : `✅ Importar ${previewAlumnos.length} alumnos`}
              </button>
              <button onClick={() => { setModalAlumnos(false); setPreviewAlumnos([]); }} style={{ padding: '12px 18px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: '#f5f5f5', color: '#555', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
