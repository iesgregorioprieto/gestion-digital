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

const verde = '#1e6b2e';
const verdeClaro = '#f0fdf4';
const azul = '#1e3a5f';

const ESTADOS = {
  pendiente: { label: 'Pendiente', bg: '#fef3c7', color: '#92400e', emoji: '⏳' },
  aprobada:  { label: 'Aprobada',  bg: '#d1fae5', color: '#065f46', emoji: '✅' },
  rechazada: { label: 'Rechazada', bg: '#fee2e2', color: '#991b1b', emoji: '❌' },
  comprado:  { label: 'Comprado',  bg: '#dbeafe', color: '#1e40af', emoji: '📦' },
};

export default function Compras() {
  const [profesorId, setProfesorId] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState('formulario'); // 'formulario' | 'historial'
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  // Formulario
  const [tipo, setTipo] = useState(''); // 'ya_comprado' | 'pedir'
  const [proveedor, setProveedor] = useState('');
  const [articulos, setArticulos] = useState([{ nombre: '', cantidad: 1, precio: '', enlace: '', archivo: null, archivoNombre: '' }]);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setProfesorNombre(nombre || '');
    // Cargar departamento del profesor
    getSupabase().from('profesores').select('departamento').eq('id', id).then(({ data }) => {
      if (data && data[0]) setDepartamento(data[0].departamento || '');
    });
    cargarHistorial(id);
  }, []);

  async function cargarHistorial(id) {
    setCargando(true);
    const { data } = await getSupabase()
      .from('compras')
      .select('*')
      .eq('profesor_id', id)
      .order('created_at', { ascending: false });
    setHistorial(data || []);
    setCargando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  function addArticulo() {
    setArticulos(prev => [...prev, { nombre: '', cantidad: 1, precio: '', enlace: '', archivo: null, archivoNombre: '' }]);
  }

  function removeArticulo(i) {
    setArticulos(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateArticulo(i, campo, valor) {
    setArticulos(prev => prev.map((a, idx) => idx === i ? { ...a, [campo]: valor } : a));
  }

  async function subirArchivo(archivo, carpeta) {
    if (!archivo) return null;
    const ext = archivo.name.split('.').pop();
    const nombre = `${carpeta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await getSupabase().storage.from('compras-docs').upload(nombre, archivo);
    if (error) return null;
    const { data } = getSupabase().storage.from('compras-docs').getPublicUrl(nombre);
    return data.publicUrl;
  }

  async function enviar() {
    if (!tipo) { mostrarMensaje('Indica el tipo de solicitud.', 'error'); return; }
    const articulosValidos = articulos.filter(a => a.nombre.trim());
    if (!articulosValidos.length) { mostrarMensaje('Añade al menos un artículo.', 'error'); return; }
    setEnviando(true);

    // Subir archivos de cada artículo
    const articulosConUrl = await Promise.all(articulosValidos.map(async (a) => {
      let urlArchivo = null;
      if (a.archivo) urlArchivo = await subirArchivo(a.archivo, tipo === 'ya_comprado' ? 'albaranes' : 'presupuestos');
      return {
        nombre: a.nombre.trim(),
        cantidad: Number(a.cantidad) || 1,
        precio: a.precio ? parseFloat(a.precio) : null,
        enlace: a.enlace.trim() || null,
        archivo_url: urlArchivo,
        archivo_nombre: a.archivoNombre || null,
      };
    }));

    const total = articulosConUrl.reduce((sum, a) => sum + (a.precio || 0) * a.cantidad, 0);

    const { error } = await getSupabase().from('compras').insert([{
      profesor_id: profesorId,
      profesor_nombre: profesorNombre,
      departamento,
      tipo,
      proveedor: proveedor.trim() || null,
      articulos: articulosConUrl,
      total_estimado: total > 0 ? total : null,
    }]);

    setEnviando(false);
    if (error) { mostrarMensaje('Error al enviar. Inténtalo de nuevo.', 'error'); return; }

    mostrarMensaje('✅ Solicitud enviada correctamente.', 'ok');
    // Resetear formulario
    setTipo('');
    setProveedor('');
    setArticulos([{ nombre: '', cantidad: 1, precio: '', enlace: '', archivo: null, archivoNombre: '' }]);
    cargarHistorial(profesorId);
    setTimeout(() => setVista('historial'), 1500);
  }

  const totalEstimado = articulos.reduce((sum, a) => {
    const p = parseFloat(a.precio) || 0;
    const q = parseInt(a.cantidad) || 1;
    return sum + p * q;
  }, 0);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🛒</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Solicitud de Compras</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{profesorNombre} · {departamento}</div>
        </div>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div style={{ margin: '12px 16px 0', padding: '12px 16px', borderRadius: 10, backgroundColor: mensaje.tipo === 'ok' ? '#d1fae5' : '#fee2e2', color: mensaje.tipo === 'ok' ? '#065f46' : '#991b1b', fontWeight: 600, fontSize: 14 }}>
          {mensaje.texto}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 16px 0' }}>
        {[{ id: 'formulario', label: '📝 Nueva solicitud' }, { id: 'historial', label: `📋 Mis solicitudes (${historial.length})` }].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)} style={{ padding: '9px 18px', borderRadius: 10, border: `2px solid ${vista === t.id ? verde : '#ddd'}`, backgroundColor: vista === t.id ? verde : 'white', color: vista === t.id ? 'white' : '#555', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: 16 }}>
        {/* =================== FORMULARIO =================== */}
        {vista === 'formulario' && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>

            {/* TIPO */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: 700, fontSize: 14, color: azul, display: 'block', marginBottom: 10 }}>¿Qué tipo de solicitud es? *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { valor: 'ya_comprado', emoji: '🧾', titulo: 'Ya lo he comprado', desc: 'Adjunto el albarán para que el secretario lo archive' },
                  { valor: 'pedir', emoji: '🛍️', titulo: 'Necesito que lo pidas', desc: 'Adjunto enlace o presupuesto para que el secretario lo tramite' },
                ].map(t => (
                  <div key={t.valor} onClick={() => setTipo(t.valor)} style={{ padding: 14, borderRadius: 12, border: `2px solid ${tipo === t.valor ? verde : '#e0e0e0'}`, backgroundColor: tipo === t.valor ? verdeClaro : 'white', cursor: 'pointer' }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{t.emoji}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: tipo === t.valor ? verde : '#333', marginBottom: 4 }}>{t.titulo}</div>
                    <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>{t.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {tipo && (
              <>
                {/* PROVEEDOR */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontWeight: 700, fontSize: 13, color: azul, display: 'block', marginBottom: 6 }}>
                    {tipo === 'pedir' ? '🏪 Proveedor / Tienda (Amazon, etc.)' : '🏪 Proveedor / Establecimiento'}
                  </label>
                  <input value={proveedor} onChange={e => setProveedor(e.target.value)} placeholder="Ej: Amazon, Leroy Merlín, Ferretería López..." style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }} />
                </div>

                {/* ARTÍCULOS */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontWeight: 700, fontSize: 13, color: azul, display: 'block', marginBottom: 10 }}>📦 Artículos *</label>

                  {articulos.map((a, i) => (
                    <div key={i} style={{ backgroundColor: '#f8fdf8', borderRadius: 10, padding: 14, marginBottom: 10, border: '1.5px solid #e0e0e0', position: 'relative' }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: verde, marginBottom: 8 }}>Artículo {i + 1}</div>

                      {/* Nombre */}
                      <input value={a.nombre} onChange={e => updateArticulo(i, 'nombre', e.target.value)} placeholder="Nombre del artículo *" style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, marginBottom: 8, boxSizing: 'border-box' }} />

                      {/* Cantidad + Precio */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                        <div>
                          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Cantidad</label>
                          <input type="number" min="1" value={a.cantidad} onChange={e => updateArticulo(i, 'cantidad', e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 3 }}>Precio unitario (€)</label>
                          <input type="number" min="0" step="0.01" value={a.precio} onChange={e => updateArticulo(i, 'precio', e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                        </div>
                      </div>

                      {/* Enlace (solo si tipo=pedir) */}
                      {tipo === 'pedir' && (
                        <input value={a.enlace} onChange={e => updateArticulo(i, 'enlace', e.target.value)} placeholder="🔗 Enlace del producto (Amazon, etc.)" style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1.5px solid #ddd', fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
                      )}

                      {/* Archivo */}
                      <div>
                        <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
                          {tipo === 'ya_comprado' ? '📎 Albarán (foto/PDF)' : '📎 Presupuesto (foto/PDF) — opcional'}
                        </label>
                        <input type="file" accept="image/*,application/pdf" onChange={e => {
                          const f = e.target.files[0];
                          if (f) updateArticulo(i, 'archivo', f);
                          if (f) updateArticulo(i, 'archivoNombre', f.name);
                        }} style={{ fontSize: 12, width: '100%' }} />
                        {a.archivoNombre && <div style={{ fontSize: 11, color: verde, marginTop: 3 }}>📎 {a.archivoNombre}</div>}
                      </div>

                      {/* Subtotal */}
                      {a.precio && <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, fontWeight: 700, color: azul }}>Subtotal: {(parseFloat(a.precio) * (parseInt(a.cantidad) || 1)).toFixed(2)} €</div>}

                      {/* Quitar artículo */}
                      {articulos.length > 1 && (
                        <button onClick={() => removeArticulo(i)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: '#ccc', fontSize: 18, cursor: 'pointer' }}>✕</button>
                      )}
                    </div>
                  ))}

                  <button onClick={addArticulo} style={{ width: '100%', padding: '10px', borderRadius: 8, border: `2px dashed ${verde}`, backgroundColor: 'white', color: verde, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    ＋ Añadir otro artículo
                  </button>
                </div>

                {/* TOTAL */}
                {totalEstimado > 0 && (
                  <div style={{ backgroundColor: verdeClaro, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: verde, fontSize: 15 }}>💶 Total estimado</span>
                    <span style={{ fontWeight: 800, color: verde, fontSize: 18 }}>{totalEstimado.toFixed(2)} €</span>
                  </div>
                )}

                {/* ENVIAR */}
                <button onClick={enviar} disabled={enviando} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 800, fontSize: 15, cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1 }}>
                  {enviando ? '⏳ Enviando...' : '🛒 Enviar solicitud'}
                </button>
              </>
            )}
          </div>
        )}

        {/* =================== HISTORIAL =================== */}
        {vista === 'historial' && (
          <div>
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
            ) : historial.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>🛒</div>
                <div>Aún no has enviado ninguna solicitud</div>
              </div>
            ) : historial.map(s => {
              const est = ESTADOS[s.estado] || ESTADOS.pendiente;
              const arts = Array.isArray(s.articulos) ? s.articulos : [];
              return (
                <div key={s.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${est.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontSize: 12, color: '#888' }}>{new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                      <div style={{ fontWeight: 700, fontSize: 14, color: azul, marginTop: 2 }}>
                        {s.tipo === 'ya_comprado' ? '🧾 Ya comprado' : '🛍️ Solicitud de pedido'}
                        {s.proveedor ? ` · ${s.proveedor}` : ''}
                      </div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 20, backgroundColor: est.bg, color: est.color, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>{est.emoji} {est.label}</span>
                  </div>

                  {arts.map((a, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#555', marginBottom: 3, display: 'flex', justifyContent: 'space-between' }}>
                      <span>• {a.nombre} × {a.cantidad}</span>
                      {a.precio && <span style={{ color: verde, fontWeight: 600 }}>{(a.precio * a.cantidad).toFixed(2)} €</span>}
                    </div>
                  ))}

                  {s.total_estimado > 0 && (
                    <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 700, color: azul, fontSize: 14 }}>Total: {parseFloat(s.total_estimado).toFixed(2)} €</div>
                  )}

                  {s.comentario_secretario && (
                    <div style={{ marginTop: 10, padding: '8px 12px', backgroundColor: '#f0f4f0', borderRadius: 8, fontSize: 13, color: '#444' }}>
                      💬 <strong>Secretaría:</strong> {s.comentario_secretario}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
