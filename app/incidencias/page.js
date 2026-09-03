'use client';
export const dynamic = 'force-dynamic';

/**
 * AVISAR DE UN FALLO
 *
 * Donde el profesorado cuenta qué no le funciona o qué echa en falta,
 * sin tener que buscar a nadie. Ve el estado de lo que ha avisado y la
 * respuesta cuando se atiende.
 */

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';

const MODULOS = [
  'Ausencias', 'Guardias', 'Días de libre disposición',
  'Actividades complementarias', 'Autorizaciones', 'Horarios',
  'Compras', 'Mantenimiento', 'Panel de la sala', 'Mis datos',
  'Otro / no sabría decir',
];

const ESTADOS = {
  nueva:      { emoji: '🆕', label: 'Recibida',   color: '#1e40af', bg: '#eff6ff', borde: '#bfdbfe' },
  en_curso:   { emoji: '🔧', label: 'En ello',    color: '#b45309', bg: '#fffbeb', borde: '#fcd34d' },
  resuelta:   { emoji: '✅', label: 'Resuelta',   color: VERDE,     bg: '#f0fdf4', borde: '#bbf7d0' },
  descartada: { emoji: '📁', label: 'Descartada', color: '#666',    bg: '#f8fafc', borde: '#e2e8f0' },
};

export default function Incidencias() {
  const [vista, setVista] = useState('nueva');
  const [tipo, setTipo] = useState('fallo');
  const [modulo, setModulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mias, setMias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch('/api/incidencias?mias=1');
      const d = await r.json();
      setMias(d.incidencias || []);
    } catch (e) { /* se muestra la lista vacía */ }
    setCargando(false);
  }

  function aviso(texto, tipoMsg) {
    setMensaje({ texto, tipo: tipoMsg });
    setTimeout(() => setMensaje(null), 4500);
  }

  async function enviar() {
    if (descripcion.trim().length < 10) {
      return aviso('Cuéntanos un poco más: qué hacías y qué ha pasado.', 'error');
    }
    setEnviando(true);
    const r = await fetch('/api/incidencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'crear', datos: { tipo, modulo, descripcion } }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso('No se ha podido enviar: ' + (e.error || 'error'), 'error');
    } else {
      aviso('✅ Enviado. Gracias por avisar.', 'ok');
      setDescripcion(''); setModulo(''); setTipo('fallo');
      cargar();
      setVista('mias');
    }
    setEnviando(false);
  }

  const btn = (activo) => ({
    padding: '9px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${activo ? AZUL : '#ddd'}`,
    backgroundColor: activo ? AZUL : 'white',
    color: activo ? 'white' : '#555',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>🐞 Avisar de un fallo</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>APrieto · IES Gregorio Prieto</div>
        </div>
        <a href="/profesor" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>
          ← Volver
        </a>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>

        {mensaje && (
          <div style={{
            padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: mensaje.tipo === 'ok' ? VERDE : '#991b1b',
          }}>{mensaje.texto}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setVista('nueva')} style={btn(vista === 'nueva')}>✏️ Avisar</button>
          <button onClick={() => setVista('mias')} style={btn(vista === 'mias')}>
            📋 Lo que he avisado {mias.length > 0 && `(${mias.length})`}
          </button>
        </div>

        {vista === 'nueva' && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#555', lineHeight: 1.6 }}>
              Si algo no funciona o echas de menos alguna cosa, cuéntanoslo.
              Cuanto más concreto, antes se arregla.
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 7 }}>¿Qué nos cuentas?</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setTipo('fallo')}
                  style={{ flex: 1, minWidth: 140, padding: '11px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: `2px solid ${tipo === 'fallo' ? '#991b1b' : '#ddd'}`,
                    backgroundColor: tipo === 'fallo' ? '#fef2f2' : 'white',
                    color: tipo === 'fallo' ? '#991b1b' : '#666' }}>
                  🐞 Algo no funciona
                </button>
                <button type="button" onClick={() => setTipo('sugerencia')}
                  style={{ flex: 1, minWidth: 140, padding: '11px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13,
                    border: `2px solid ${tipo === 'sugerencia' ? VERDE : '#ddd'}`,
                    backgroundColor: tipo === 'sugerencia' ? '#f0fdf4' : 'white',
                    color: tipo === 'sugerencia' ? VERDE : '#666' }}>
                  💡 Se me ocurre algo
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>¿Dónde?</label>
              <select value={modulo} onChange={e => setModulo(e.target.value)}
                style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}>
                <option value="">— Elige la parte de la aplicación —</option>
                {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                {tipo === 'fallo' ? 'Cuéntanos qué ha pasado *' : 'Cuéntanos tu idea *'}
              </label>
              <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={5}
                placeholder={tipo === 'fallo'
                  ? 'Qué estabas haciendo, qué esperabas que pasara y qué pasó en su lugar. Si salió algún mensaje, cópialo.'
                  : 'Qué te vendría bien y para qué lo usarías.'}
                style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
            </div>

            <button onClick={enviar} disabled={enviando}
              style={{ padding: '12px 24px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>
              {enviando ? 'Enviando...' : '📨 Enviar'}
            </button>
          </div>
        )}

        {vista === 'mias' && (
          cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
          ) : mias.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🐞</div>
              Todavía no has avisado de nada
            </div>
          ) : (
            mias.map(i => {
              const est = ESTADOS[i.estado] || ESTADOS.nueva;
              return (
                <div key={i.id} style={{
                  backgroundColor: 'white', borderRadius: 12, padding: '14px 16px', marginBottom: 11,
                  border: '1px solid #e5e7eb', borderLeft: `5px solid ${est.borde}`,
                }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 7 }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {i.tipo === 'sugerencia' ? '💡 Sugerencia' : '🐞 Fallo'}
                        {i.modulo ? ` · ${i.modulo}` : ''}
                        {' · '}
                        {new Date(i.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: est.color, backgroundColor: est.bg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      {est.emoji} {est.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, color: '#333', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {i.descripcion}
                  </div>
                  {i.respuesta && (
                    <div style={{ marginTop: 10, padding: '10px 13px', borderRadius: 8, backgroundColor: est.bg, border: `1px solid ${est.borde}`, fontSize: 13, color: '#333', lineHeight: 1.55 }}>
                      <div style={{ fontWeight: 800, marginBottom: 3, color: est.color }}>Respuesta</div>
                      {i.respuesta}
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
