'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

const AZUL = '#1e3a5f';

export default function CalendarioEscolar() {
  const [calendario, setCalendario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }

    fetch('/api/calendario')
      .then(r => r.json())
      .then(d => setCalendario(d.calendario || null))
      .catch(e => console.error('No se pudo cargar el calendario:', e))
      .finally(() => setCargando(false));
  }, []);

  const esImagen = calendario?.tipo?.startsWith('image/');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: AZUL, color: 'white', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => window.location.href = '/profesor'}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>📆 Calendario escolar</h1>
          {calendario && (
            <p style={{ margin: '3px 0 0', fontSize: 13, opacity: 0.85 }}>Curso {calendario.curso}</p>
          )}
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>

        {cargando && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>
        )}

        {!cargando && !calendario && (
          <div style={{
            backgroundColor: 'white', borderRadius: 14, padding: 30, textAlign: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>📆</div>
            <div style={{ fontWeight: 700, color: '#555', marginBottom: 6 }}>
              Todavía no hay calendario publicado
            </div>
            <div style={{ fontSize: 13.5, color: '#888', lineHeight: 1.6 }}>
              Cuando el equipo directivo suba el calendario del curso, aparecerá aquí.
            </div>
          </div>
        )}

        {!cargando && calendario && (
          <>
            {esImagen ? (
              // Una imagen se ve directamente: en el móvil se amplía con los dedos
              <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <img
                  src={calendario.archivo_url}
                  alt={`Calendario escolar del curso ${calendario.curso}`}
                  style={{ width: '100%', borderRadius: 10, display: 'block' }}
                />
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 44, marginBottom: 12 }}>📄</div>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#333' }}>
                  Calendario del curso {calendario.curso}
                </div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
                  {calendario.nombre}
                </div>
                <a href={calendario.archivo_url} target="_blank" rel="noreferrer"
                  style={{ display: 'inline-block', padding: '12px 26px', borderRadius: 10, backgroundColor: AZUL, color: 'white', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
                  📖 Abrir el calendario
                </a>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <a href={calendario.archivo_url} download target="_blank" rel="noreferrer"
                style={{ fontSize: 13, color: AZUL, textDecoration: 'none', fontWeight: 600 }}>
                ⬇️ Descargar
              </a>
            </div>

            <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11.5, color: '#aaa' }}>
              Calendario oficial publicado por la Consejería de Educación de Castilla-La Mancha
            </div>
          </>
        )}
      </div>
    </div>
  );
}
