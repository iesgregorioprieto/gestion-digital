'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { reducirImagen } from '@/lib/reducirImagen';
import { getSupabase } from '@/lib/supabase';
import { consulta, consultaRpc } from '@/lib/consulta';
import { SECCIONES, seccionPorId, tipoDeIncidencia } from '@/lib/tiposMantenimiento';

// Zonas comunes que no son un aula del horario
const ZONAS = ['Pasillo', 'Baños', 'Patio', 'Gimnasio', 'Biblioteca', 'Sala de profesores', 'Conserjería', 'Secretaría', 'Cafetería', 'Escaleras', 'Exterior / fachada'];

function sinAcentos(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function Mantenimiento() {
  const [paso, setPaso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [esDirectivo, setEsDirectivo] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const [aulas, setAulas] = useState([]);
  const [verSugerencias, setVerSugerencias] = useState(false);
  const [repetidas, setRepetidas] = useState(null); // null = sin comprobar
  const [comprobando, setComprobando] = useState(false);

  const [form, setForm] = useState({
    seccion: '',
    estancia: '',
    ubicacion_exacta: '',
    descripcion: '',
    foto: null,
    fotoPreview: null,
    archivoNombre: '',
    archivoEsImagen: false,
  });

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) {
      window.location.href = '/login';
      return;
    }
    const rolGestion = sessionStorage.getItem('profesor_rol_gestion') || '';
    setEsDirectivo(['secretario', 'director', 'jefe_estudios'].includes(rolGestion));
    setProfesorId(id);
    setProfesorNombre(nombre || '');
    fetch('/api/solicitudes?aulas=1').then(r => r.json()).then(j => setAulas(j.aulas || [])).catch(() => {});
  }, []);

  async function cargarHistorial() {
    if (!profesorId) return;
    setCargandoHistorial(true);
    let query = consulta('mantenimiento').select('*');
    // Directivo ve todas las incidencias; profesor solo las suyas
    if (!esDirectivo) query = query.eq('profesor_id', profesorId);
    const { data } = await query.order('created_at', { ascending: false }).limit(200);
    // Primero las que faltan por resolver (pendientes y en proceso, la
    // más reciente arriba) y las resueltas siempre al final.
    const lista = (data || []).slice().sort((a, b) =>
      (a.estado === 'resuelta' ? 1 : 0) - (b.estado === 'resuelta' ? 1 : 0)
    );
    setHistorial(lista);
    setCargandoHistorial(false);
  }

  function toggleHistorial() {
    const nuevoEstado = !mostrarHistorial;
    setMostrarHistorial(nuevoEstado);
    if (nuevoEstado && historial.length === 0) cargarHistorial();
  }

  function seleccionarSeccion(id) {
    setForm(f => ({ ...f, seccion: id }));
    setRepetidas(null);
    setPaso(2);
  }

  // Antes de pasar a la descripción, se mira si ese mismo problema ya
  // está avisado en ese sitio, para no duplicar avisos.
  async function irADescripcion() {
    setError('');
    if (!form.estancia.trim()) { setError('Indica el aula o la zona.'); return; }
    setComprobando(true);
    try {
      const q = new URLSearchParams({ repetidas: '1', seccion: form.seccion, estancia: form.estancia.trim() });
      const j = await fetch('/api/solicitudes?' + q).then(r => r.json());
      if (j.repetidas?.length) { setRepetidas(j.repetidas); setComprobando(false); return; }
    } catch { /* si falla la comprobación, se sigue */ }
    setComprobando(false);
    setRepetidas(null);
    setPaso(3);
  }

  function reiniciar() {
    setEnviado(false); setPaso(1); setRepetidas(null); setError('');
    setForm({ seccion: '', estancia: '', ubicacion_exacta: '', descripcion: '', foto: null, fotoPreview: null, archivoNombre: '', archivoEsImagen: false });
  }

  function manejarFoto(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    const esImagen = archivo.type.startsWith('image/');
    const preview = esImagen ? URL.createObjectURL(archivo) : null;
    setForm(f => ({ ...f, foto: archivo, fotoPreview: preview, archivoNombre: archivo.name, archivoEsImagen: esImagen }));
    // Resetear input para que funcione al volver a seleccionar el mismo archivo
    e.target.value = '';
  }

  async function enviar() {
    setError('');
    if (!form.descripcion.trim()) {
      setError('Por favor describe el desperfecto.');
      return;
    }

    setEnviando(true);
    try {
      let foto_url = null;

      // Subir foto si hay una
      if (form.foto) {
        const nombreArchivo = `${Date.now()}_${form.foto.name}`;
        const fd = new FormData();
        // Reducida antes de subirla: una foto de móvil de 5 MB queda en
        // unos 300 KB, y el espacio de Supabase da para un curso entero.
        fd.append('archivo', await reducirImagen(form.foto));
        fd.append('carpeta', 'fotos');
        fd.append('bucket', 'mantenimiento-fotos');
        const upResp = await fetch('/api/documento', { method: 'POST', body: fd });
        const upData = await upResp.json();
        if (!upData.url) {
          setError('Error al subir el archivo: ' + (upData.error || 'fallo'));
          setEnviando(false);
          return;
        }
        foto_url = upData.url;
      }

      const _r = await fetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabla: 'mantenimiento',
          accion: 'crear',
          datos: {
            profesor_nombre: profesorNombre,
            seccion: form.seccion,
            estancia: form.estancia.trim(),
            ubicacion_exacta: form.ubicacion_exacta.trim(),
            descripcion: form.descripcion.trim(),
            foto_url,
          },
        }),
      });
      const err = _r.ok ? null : await _r.json();

      if (err) {
        setError('Error al enviar: ' + (err.error || 'inténtalo de nuevo'));
      } else {
        setEnviado(true);
      }
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  const verde = '#1e6b2e';
  const verdeClaro = '#e8f5e9';

  const seccionSel = seccionPorId(form.seccion);
  const textoAula = sinAcentos(form.estancia.trim());
  const sugerencias = textoAula
    ? [...ZONAS, ...aulas].filter(a => sinAcentos(a).includes(textoAula) && a !== form.estancia).slice(0, 8)
    : [];

  // ─── PANTALLA ÉXITO ───
  if (enviado) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: verde, marginBottom: 12 }}>¡Incidencia enviada!</h2>
          <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
            Tu aviso de <strong>{seccionSel?.emoji} {seccionSel?.label}</strong> en <strong>{form.estancia}</strong> ha quedado registrado.
          </p>
          <p style={{ color: '#888', fontSize: 14 }}>Te llegará un aviso cuando esté arreglado.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center' }}>
            <button onClick={reiniciar} style={{
              padding: '12px 20px', borderRadius: 10, border: `2px solid ${verde}`,
              backgroundColor: 'white', color: verde, fontWeight: 700, cursor: 'pointer', fontSize: 14
            }}>+ Nueva incidencia</button>
            <a href="/profesor" style={{
              padding: '12px 20px', borderRadius: 10, border: 'none',
              backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14,
              textDecoration: 'none', display: 'inline-block'
            }}>← Volver</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🔧 Incidencias de mantenimiento</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {profesorNombre}</div>
        </div>
        <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Volver</a>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* BOTÓN VER HISTORIAL */}
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <button onClick={toggleHistorial} style={{ padding: '8px 14px', borderRadius: 8, border: '1.5px solid #ddd', backgroundColor: mostrarHistorial ? verde : 'white', color: mostrarHistorial ? 'white' : '#555', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            📋 {mostrarHistorial ? 'Ocultar historial' : (esDirectivo ? 'Ver todas las incidencias' : 'Ver mis incidencias')}
          </button>
        </div>

        {/* PANEL HISTORIAL */}
        {mostrarHistorial && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 20, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
            {cargandoHistorial ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#888' }}>Cargando...</div>
            ) : historial.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: '#888', fontSize: 14 }}>
                🔧 {esDirectivo ? 'No hay incidencias registradas' : 'Aún no has notificado incidencias'}
              </div>
            ) : (
              historial.map(inc => {
                const est = inc.estado || 'pendiente';
                const estilos = { pendiente: { bg: '#fef3c7', color: '#92400e', emoji: '⏳', label: 'Pendiente' }, en_proceso: { bg: '#dbeafe', color: '#1e40af', emoji: '🔧', label: 'En proceso' }, resuelta: { bg: '#d1fae5', color: '#065f46', emoji: '✅', label: 'Resuelta' } };
                const e = estilos[est] || estilos.pendiente;
                return (
                  <div key={inc.id} style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 8, backgroundColor: '#f9fafb', borderLeft: `4px solid ${e.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {new Date(inc.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {esDirectivo && inc.profesor_nombre && <span style={{ marginLeft: 8, fontWeight: 700, color: '#1e3a5f' }}>👤 {inc.profesor_nombre}</span>}
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 12, backgroundColor: e.bg, color: e.color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{e.emoji} {e.label}</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#333' }}>
                      <span title={tipoDeIncidencia(inc).label}>{tipoDeIncidencia(inc).emoji}</span> <strong>{inc.estancia}</strong>{inc.ubicacion_exacta ? ` · ${inc.ubicacion_exacta}` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{inc.descripcion}</div>
                    {inc.comentario_secretario && (
                      <div style={{ marginTop: 6, padding: '6px 10px', backgroundColor: '#eff6ff', borderRadius: 6, fontSize: 12, color: '#1e3a5f' }}>
                        💬 <strong>Secretaría:</strong> {inc.comentario_secretario}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* PASOS */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center' }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: n < 3 ? 1 : 'none' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: paso >= n ? verde : '#ddd',
                color: paso >= n ? 'white' : '#999',
                fontWeight: 700, fontSize: 14, flexShrink: 0
              }}>{n}</div>
              <span style={{ fontSize: 12, color: paso >= n ? verde : '#999', fontWeight: paso === n ? 700 : 400 }}>
                {n === 1 ? 'Qué' : n === 2 ? 'Dónde' : 'Descripción'}
              </span>
              {n < 3 && <div style={{ flex: 1, height: 2, backgroundColor: paso > n ? verde : '#ddd' }} />}
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>

          {/* PASO 1 — QUÉ HAY QUE REPARAR */}
          {paso === 1 && (
            <div>
              <h2 style={{ color: verde, marginTop: 0, marginBottom: 6, fontSize: 20 }}>¿Qué hay que reparar?</h2>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>Elige el tipo de avería</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {SECCIONES.map(sec => {
                  const activa = form.seccion === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => seleccionarSeccion(sec.id)}
                      style={{
                        border: `2px solid ${activa ? sec.color : '#e5e7eb'}`,
                        backgroundColor: activa ? sec.fondo : 'white',
                        borderRadius: 14, padding: '16px 10px 14px',
                        textAlign: 'center', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      }}
                    >
                      <span style={{ width: 60, height: 60, borderRadius: '50%', backgroundColor: sec.fondo, border: `2px solid ${sec.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>{sec.emoji}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: sec.color, lineHeight: 1.2 }}>{sec.label}</span>
                      <span style={{ fontSize: 11, color: '#888', lineHeight: 1.3 }}>{sec.ayuda}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* PASO 2 — DÓNDE */}
          {paso === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 36 }}>{seccionSel?.emoji}</span>
                <h2 style={{ color: seccionSel?.color || verde, margin: 0, fontSize: 20 }}>{seccionSel?.label}</h2>
              </div>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 18 }}>¿Dónde está?</p>

              <div style={{ marginBottom: 14, position: 'relative' }}>
                <label style={labelEstilo}>🏫 Aula o zona *</label>
                <input
                  type="text"
                  value={form.estancia}
                  onChange={e => { setForm(f => ({ ...f, estancia: e.target.value })); setVerSugerencias(true); setRepetidas(null); }}
                  onFocus={() => setVerSugerencias(true)}
                  onBlur={() => setTimeout(() => setVerSugerencias(false), 150)}
                  placeholder="Escribe el aula, p. ej. A12, Taller…"
                  style={inputEstilo}
                  autoComplete="off"
                />
                {verSugerencias && sugerencias.length > 0 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, backgroundColor: 'white', border: '1.5px solid #ddd', borderRadius: 8, marginTop: 4, boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto' }}>
                    {sugerencias.map(a => (
                      <div key={a} onMouseDown={() => { setForm(f => ({ ...f, estancia: a })); setVerSugerencias(false); setRepetidas(null); }}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 14, borderBottom: '1px solid #f1f5f9' }}>
                        {ZONAS.includes(a) ? '📍' : '🏫'} {a}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>O toca una zona común:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ZONAS.map(z => (
                    <button key={z} onClick={() => { setForm(f => ({ ...f, estancia: z })); setRepetidas(null); }} style={{
                      padding: '6px 11px', borderRadius: 18, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${form.estancia === z ? verde : '#ddd'}`,
                      backgroundColor: form.estancia === z ? verdeClaro : 'white', color: form.estancia === z ? verde : '#555',
                    }}>{z}</button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelEstilo}>📍 Concreta el sitio (opcional)</label>
                <input
                  type="text"
                  value={form.ubicacion_exacta}
                  onChange={e => setForm(f => ({ ...f, ubicacion_exacta: e.target.value }))}
                  placeholder="Ej: ventana del fondo, junto a la pizarra…"
                  style={inputEstilo}
                />
              </div>

              {repetidas && (
                <div style={{ backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                    ⚠️ Ya hay {repetidas.length === 1 ? 'un aviso abierto' : `${repetidas.length} avisos abiertos`} de {seccionSel?.label.toLowerCase()} en {form.estancia}
                  </div>
                  {repetidas.map((r, k) => (
                    <div key={k} style={{ fontSize: 13, color: '#444', padding: '5px 0', borderTop: k ? '1px solid #fde68a' : 'none' }}>
                      {r.ubicacion_exacta ? <b>{r.ubicacion_exacta}: </b> : null}{r.descripcion}
                      <span style={{ color: '#999', fontSize: 11.5 }}> · {r.created_at ? new Date(r.created_at).toLocaleDateString('es-ES') : ''} · {r.estado === 'en_proceso' ? 'en proceso' : 'pendiente'}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <a href="/profesor" style={{ flex: 1, minWidth: 150, textAlign: 'center', padding: '10px 12px', borderRadius: 8, backgroundColor: '#f59e0b', color: 'white', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Es lo mismo, ya está avisado</a>
                    <button onClick={() => { setRepetidas(null); setPaso(3); }} style={{ flex: 1, minWidth: 150, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #f59e0b', backgroundColor: 'white', color: '#92400e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Es otra avería, continuar</button>
                  </div>
                </div>
              )}

              {error && paso === 2 && (
                <div style={{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 14, color: '#b91c1c', fontSize: 14 }}>⚠️ {error}</div>
              )}

              {!repetidas && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setError(''); setPaso(1); }} style={{
                    flex: 1, padding: 13, borderRadius: 10, border: '1.5px solid #ddd',
                    backgroundColor: 'white', color: '#555', cursor: 'pointer', fontWeight: 600
                  }}>← Anterior</button>
                  <button onClick={irADescripcion} disabled={comprobando} style={{
                    flex: 2, padding: 13, borderRadius: 10, border: 'none',
                    backgroundColor: verde, color: 'white', cursor: 'pointer', fontWeight: 700
                  }}>{comprobando ? 'Comprobando…' : 'Siguiente →'}</button>
                </div>
              )}
            </div>
          )}

          {/* PASO 3 — DESCRIPCIÓN Y FOTO */}
          {paso === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 36 }}>{seccionSel?.emoji}</span>
                <div>
                  <h2 style={{ color: seccionSel?.color || verde, margin: 0, fontSize: 20 }}>{seccionSel?.label}</h2>
                  <div style={{ fontSize: 13, color: '#888' }}>📍 {form.estancia}{form.ubicacion_exacta ? ` · ${form.ubicacion_exacta}` : ''}</div>
                </div>
              </div>

              <div style={{ marginBottom: 16, marginTop: 20 }}>
                <label style={labelEstilo}>🔧 Describe el desperfecto *</label>
                <textarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej: La persiana no sube, está atascada. El proyector no enciende. Hay una gotera en el techo..."
                  rows={4}
                  style={{ ...inputEstilo, resize: 'vertical' }}
                />
              </div>

              {/* FOTO */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelEstilo}>📷 Foto (opcional)</label>
                {/* PREVIEW */}
                {form.foto && (
                  <div style={{ textAlign: 'center', marginBottom: 10, padding: '10px', backgroundColor: '#f8f8f8', borderRadius: 10, border: '1px solid #e0e0e0' }}>
                    {form.archivoEsImagen && form.fotoPreview ? (
                      <img src={form.fotoPreview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 8 }} />
                    ) : (
                      <div style={{ fontSize: 36, marginBottom: 8 }}>
                        {form.archivoNombre?.endsWith('.pdf') ? '📄' : form.archivoNombre?.endsWith('.doc') || form.archivoNombre?.endsWith('.docx') ? '📝' : '📎'}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: '#555', fontWeight: 600, marginBottom: 6 }}>
                      ✅ {form.archivoNombre || 'Archivo adjunto'}
                    </div>
                    <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>
                      {form.foto.size ? `${(form.foto.size / 1024).toFixed(0)} KB` : ''}
                    </div>
                    <button onClick={() => setForm(f => ({ ...f, foto: null, fotoPreview: null, archivoNombre: '', archivoEsImagen: false }))}
                      style={{ fontSize: 12, color: '#991b1b', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                      ✕ Quitar archivo
                    </button>
                  </div>
                )}

                {/* BOTONES */}
                {!form.foto ? (
                  <div style={{ border: '2px dashed #ddd', borderRadius: 10, padding: 16, textAlign: 'center', backgroundColor: '#fafafa' }}>
                    <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>📎 Adjunta una foto o documento del problema</div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <button onClick={() => document.getElementById('inputCamara').click()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 9, border: '1.5px solid #fbbf24', backgroundColor: '#fffbeb', color: '#92400e', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        📷 Hacer foto
                      </button>
                      <button onClick={() => document.getElementById('inputArchivo').click()}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 9, border: '1.5px solid #93c5fd', backgroundColor: '#eff6ff', color: '#1e40af', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        📁 Subir archivo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => document.getElementById('inputCamara').click()}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #fbbf24', backgroundColor: '#fffbeb', color: '#92400e', fontWeight: 600, cursor: 'pointer' }}>
                      📷 Cambiar foto
                    </button>
                    <button onClick={() => document.getElementById('inputArchivo').click()}
                      style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #93c5fd', backgroundColor: '#eff6ff', color: '#1e40af', fontWeight: 600, cursor: 'pointer' }}>
                      📁 Cambiar archivo
                    </button>
                  </div>
                )}

                {/* INPUTS OCULTOS */}
                <input id="inputCamara" type="file" accept="image/*" capture="environment" onChange={manejarFoto} style={{ display: 'none' }} />
                <input id="inputArchivo" type="file" accept="image/*,.pdf,.doc,.docx" onChange={manejarFoto} style={{ display: 'none' }} />
              </div>

              {error && (
                <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 16, color: '#b91c1c', fontSize: 14 }}>
                  ⚠️ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPaso(2)} style={{
                  flex: 1, padding: 13, borderRadius: 10, border: '1.5px solid #ddd',
                  backgroundColor: 'white', color: '#555', cursor: 'pointer', fontWeight: 600
                }}>← Anterior</button>
                <button onClick={enviar} disabled={enviando} style={{
                  flex: 2, padding: 13, borderRadius: 10, border: 'none',
                  backgroundColor: verde, color: 'white',
                  cursor: enviando ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15
                }}>
                  {enviando ? 'Enviando...' : '📨 Enviar incidencia'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelEstilo = { display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6 };
const inputEstilo = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: '1.5px solid #ddd', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'system-ui, sans-serif'
};