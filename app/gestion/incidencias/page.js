'use client';
export const dynamic = 'force-dynamic';

/**
 * ATENDER INCIDENCIAS
 *
 * Lo que avisa el profesorado sobre fallos y mejoras de la aplicación.
 * Se van moviendo entre recibida, en ello, resuelta y descartada, y se
 * les puede contestar. La respuesta la ve quien la abrió.
 */

import { useState, useEffect } from 'react';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';

const ESTADOS = {
  nueva:      { emoji: '🆕', label: 'Recibidas',  color: '#1e40af', bg: '#eff6ff', borde: '#bfdbfe' },
  en_curso:   { emoji: '🔧', label: 'En ello',    color: '#b45309', bg: '#fffbeb', borde: '#fcd34d' },
  resuelta:   { emoji: '✅', label: 'Resueltas',  color: VERDE,     bg: '#f0fdf4', borde: '#bbf7d0' },
  descartada: { emoji: '📁', label: 'Descartadas',color: '#666',    bg: '#f8fafc', borde: '#e2e8f0' },
};

export default function GestionIncidencias() {
  const [incidencias, setIncidencias] = useState([]);
  const [filtro, setFiltro] = useState('pendientes');
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [respuesta, setRespuesta] = useState('');
  const [procesando, setProcesando] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [usuario, setUsuario] = useState('');

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/profesor';
      return;
    }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargar();
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch('/api/incidencias');
      const d = await r.json();
      setIncidencias(d.incidencias || []);
    } catch (e) { /* lista vacía */ }
    setCargando(false);
  }

  function aviso(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 4000);
  }

  async function atender(id, estado) {
    setProcesando(id);
    const r = await fetch('/api/incidencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'atender', id, datos: { estado, respuesta } }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso('No se ha podido guardar: ' + (e.error || 'error'), 'error');
    } else {
      aviso('✅ Guardado', 'ok');
      setAbierta(null);
      setRespuesta('');
      cargar();
    }
    setProcesando(null);
  }

  const pendientes = incidencias.filter(i => i.estado === 'nueva' || i.estado === 'en_curso');
  const cerradas   = incidencias.filter(i => i.estado === 'resuelta' || i.estado === 'descartada');
  const lista = filtro === 'pendientes' ? pendientes : cerradas;

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
          <div style={{ fontSize: 19, fontWeight: 800 }}>🐞 Incidencias de la aplicación</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>IES Gregorio Prieto · {usuario}</div>
        </div>
        <a href="/gestion" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>
          ← Inicio
        </a>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>

        {mensaje && (
          <div style={{
            padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: mensaje.tipo === 'ok' ? VERDE : '#991b1b',
          }}>{mensaje.texto}</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 16 }}>
          {Object.entries(ESTADOS).map(([clave, e]) => (
            <div key={clave} style={{ textAlign: 'center', padding: 11, borderRadius: 10, backgroundColor: e.bg, border: `1.5px solid ${e.borde}` }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: e.color }}>
                {incidencias.filter(i => i.estado === clave).length}
              </div>
              <div style={{ fontSize: 11.5, color: '#555' }}>{e.emoji} {e.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setFiltro('pendientes')} style={btn(filtro === 'pendientes')}>
            Por atender {pendientes.length > 0 && `(${pendientes.length})`}
          </button>
          <button onClick={() => setFiltro('cerradas')} style={btn(filtro === 'cerradas')}>
            Cerradas
          </button>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🐞</div>
            {filtro === 'pendientes' ? 'No hay nada por atender' : 'Todavía no hay incidencias cerradas'}
          </div>
        ) : (
          lista.map(i => {
            const est = ESTADOS[i.estado] || ESTADOS.nueva;
            const abiertaEsta = abierta === i.id;
            return (
              <div key={i.id} style={{
                backgroundColor: 'white', borderRadius: 12, marginBottom: 12,
                border: '1px solid #e5e7eb', borderLeft: `5px solid ${est.borde}`, overflow: 'hidden',
              }}>
                <div onClick={() => { setAbierta(abiertaEsta ? null : i.id); setRespuesta(i.respuesta || ''); }}
                  style={{ padding: '13px 16px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 800, fontSize: 14.5, color: '#222' }}>
                        {i.tipo === 'sugerencia' ? '💡' : '🐞'} {i.modulo || 'Sin especificar'}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {i.profesor_nombre} · {new Date(i.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                      </div>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: est.color, backgroundColor: est.bg, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      {est.emoji} {est.label.replace(/s$/, '')}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, color: '#444', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
                    {i.descripcion}
                  </div>
                </div>

                {abiertaEsta && (
                  <div style={{ padding: '0 16px 15px', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ paddingTop: 13 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                        Respuesta para quien lo avisó (opcional)
                      </label>
                      <textarea value={respuesta} onChange={e => setRespuesta(e.target.value)} rows={3}
                        placeholder="Ya está arreglado, sale en la próxima actualización..."
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
                    </div>

                    <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
                      {i.estado !== 'en_curso' && (
                        <button onClick={() => atender(i.id, 'en_curso')} disabled={procesando === i.id}
                          style={{ padding: '8px 15px', borderRadius: 9, border: 'none', backgroundColor: '#b45309', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          🔧 En ello
                        </button>
                      )}
                      <button onClick={() => atender(i.id, 'resuelta')} disabled={procesando === i.id}
                        style={{ padding: '8px 15px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        ✅ Resuelta
                      </button>
                      <button onClick={() => atender(i.id, 'descartada')} disabled={procesando === i.id}
                        style={{ padding: '8px 15px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        📁 Descartar
                      </button>
                      {i.estado !== 'nueva' && (
                        <button onClick={() => atender(i.id, 'nueva')} disabled={procesando === i.id}
                          style={{ padding: '8px 15px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }}>
                          ↩️ Reabrir
                        </button>
                      )}
                    </div>

                    {i.atendida_por && (
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10 }}>
                        Última vez atendida por {i.atendida_por}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
