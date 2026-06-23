'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ESTANCIAS = [
  { valor: 'aula', emoji: '🏫', etiqueta: 'Aula' },
  { valor: 'taller', emoji: '🔧', etiqueta: 'Taller' },
  { valor: 'laboratorio', emoji: '🔬', etiqueta: 'Laboratorio' },
  { valor: 'gimnasio', emoji: '🏋️', etiqueta: 'Gimnasio' },
  { valor: 'biblioteca', emoji: '📚', etiqueta: 'Biblioteca' },
  { valor: 'banos', emoji: '🚻', etiqueta: 'Baños' },
  { valor: 'pasillo', emoji: '🚶', etiqueta: 'Pasillo' },
  { valor: 'secretaria', emoji: '📋', etiqueta: 'Secretaría' },
  { valor: 'direccion', emoji: '🏛️', etiqueta: 'Dirección' },
  { valor: 'sala_profesores', emoji: '👨‍🏫', etiqueta: 'Sala Profesores' },
  { valor: 'patio', emoji: '🌳', etiqueta: 'Patio' },
  { valor: 'otro', emoji: '📝', etiqueta: 'Otro' },
];

export default function Mantenimiento() {
  const [paso, setPaso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');

  const [form, setForm] = useState({
    estancia: '',
    ubicacion_exacta: '',
    descripcion: '',
    foto: null,
    fotoPreview: null,
  });

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) {
      window.location.href = '/login';
      return;
    }
    setProfesorId(id);
    setProfesorNombre(nombre || '');
  }, []);

  function seleccionarEstancia(valor) {
    setForm(f => ({ ...f, estancia: valor }));
    setPaso(2);
  }

  function manejarFoto(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;
    setForm(f => ({ ...f, foto: archivo, fotoPreview: URL.createObjectURL(archivo) }));
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
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('mantenimiento-fotos')
          .upload(nombreArchivo, form.foto);
        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage
            .from('mantenimiento-fotos')
            .getPublicUrl(nombreArchivo);
          foto_url = urlData.publicUrl;
        }
      }

      const { error: err } = await supabase.from('mantenimiento').insert([{
        profesor_id: profesorId,
        profesor_nombre: profesorNombre,
        estancia: form.estancia,
        ubicacion_exacta: form.ubicacion_exacta.trim(),
        descripcion: form.descripcion.trim(),
        foto_url,
        estado: 'pendiente',
      }]);

      if (err) {
        setError('Error al enviar: ' + err.message);
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

  const estanciaSeleccionada = ESTANCIAS.find(e => e.valor === form.estancia);

  // ─── PANTALLA ÉXITO ───
  if (enviado) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: verde, marginBottom: 12 }}>¡Incidencia enviada!</h2>
          <p style={{ color: '#555', lineHeight: 1.6, marginBottom: 8 }}>
            Tu incidencia en <strong>{estanciaSeleccionada?.etiqueta}</strong> ha sido registrada correctamente.
          </p>
          <p style={{ color: '#888', fontSize: 14 }}>El equipo de mantenimiento la atenderá lo antes posible.</p>
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center' }}>
            <button onClick={() => { setEnviado(false); setPaso(1); setForm({ estancia: '', ubicacion_exacta: '', descripcion: '', foto: null, fotoPreview: null }); }} style={{
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
          <div style={{ fontSize: 18, fontWeight: 700 }}>🔧 Mantenimiento</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {profesorNombre}</div>
        </div>
        <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Volver</a>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

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
                {n === 1 ? 'Estancia' : n === 2 ? 'Ubicación' : 'Descripción'}
              </span>
              {n < 3 && <div style={{ flex: 1, height: 2, backgroundColor: paso > n ? verde : '#ddd' }} />}
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>

          {/* PASO 1 — SELECCIONAR ESTANCIA */}
          {paso === 1 && (
            <div>
              <h2 style={{ color: verde, marginTop: 0, marginBottom: 6, fontSize: 20 }}>¿Dónde está el problema?</h2>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>Selecciona la estancia donde se encuentra la incidencia</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {ESTANCIAS.map(e => (
                  <div
                    key={e.valor}
                    onClick={() => seleccionarEstancia(e.valor)}
                    style={{
                      border: `2px solid ${form.estancia === e.valor ? verde : '#e0e0e0'}`,
                      backgroundColor: form.estancia === e.valor ? verdeClaro : 'white',
                      borderRadius: 12, padding: '16px 8px',
                      textAlign: 'center', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 32, marginBottom: 6 }}>{e.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: form.estancia === e.valor ? verde : '#444' }}>{e.etiqueta}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 2 — UBICACIÓN EXACTA */}
          {paso === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 36 }}>{estanciaSeleccionada?.emoji}</span>
                <h2 style={{ color: verde, margin: 0, fontSize: 20 }}>{estanciaSeleccionada?.etiqueta}</h2>
              </div>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 20 }}>Indica la ubicación exacta para localizarla mejor</p>

              <div style={{ marginBottom: 20 }}>
                <label style={labelEstilo}>📍 Ubicación exacta</label>
                <input
                  type="text"
                  value={form.ubicacion_exacta}
                  onChange={e => setForm(f => ({ ...f, ubicacion_exacta: e.target.value }))}
                  placeholder={
                    form.estancia === 'aula' ? 'Ej: Aula 12, segunda planta' :
                    form.estancia === 'taller' ? 'Ej: Taller de Carrocería' :
                    form.estancia === 'banos' ? 'Ej: Baños planta baja, zona alumnos' :
                    form.estancia === 'pasillo' ? 'Ej: Pasillo primera planta, junto al aula 8' :
                    form.estancia === 'otro' ? 'Describe dónde se encuentra' :
                    'Describe la ubicación exacta'
                  }
                  style={inputEstilo}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPaso(1)} style={{
                  flex: 1, padding: 13, borderRadius: 10, border: '1.5px solid #ddd',
                  backgroundColor: 'white', color: '#555', cursor: 'pointer', fontWeight: 600
                }}>← Anterior</button>
                <button onClick={() => setPaso(3)} style={{
                  flex: 2, padding: 13, borderRadius: 10, border: 'none',
                  backgroundColor: verde, color: 'white', cursor: 'pointer', fontWeight: 700
                }}>Siguiente →</button>
              </div>
            </div>
          )}

          {/* PASO 3 — DESCRIPCIÓN Y FOTO */}
          {paso === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 36 }}>{estanciaSeleccionada?.emoji}</span>
                <div>
                  <h2 style={{ color: verde, margin: 0, fontSize: 20 }}>{estanciaSeleccionada?.etiqueta}</h2>
                  {form.ubicacion_exacta && <div style={{ fontSize: 13, color: '#888' }}>📍 {form.ubicacion_exacta}</div>}
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
                <div style={{
                  border: '2px dashed #ddd', borderRadius: 10, padding: 16,
                  textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa'
                }}
                  onClick={() => document.getElementById('inputFoto').click()}
                >
                  {form.fotoPreview ? (
                    <div>
                      <img src={form.fotoPreview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 8 }} />
                      <div style={{ fontSize: 13, color: '#888' }}>Toca para cambiar la foto</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 40, marginBottom: 8 }}>📷</div>
                      <div style={{ fontSize: 14, color: '#888' }}>Toca para añadir una foto</div>
                      <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>Ayuda a identificar mejor el problema</div>
                    </div>
                  )}
                </div>
                <input
                  id="inputFoto"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={manejarFoto}
                  style={{ display: 'none' }}
                />
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