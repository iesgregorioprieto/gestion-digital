'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

const AZUL = '#1e3a5f';

const ETIQUETAS = {
  ayuda:     { texto: 'Me ayuda',     emoji: '😀', color: '#16a34a' },
  mejorable: { texto: 'Lo mejoraría', emoji: '🔧', color: '#f59e0b' },
  no_sirve:  { texto: 'No me sirve',  emoji: '🙁', color: '#dc2626' },
};

export default function PanelValoraciones() {
  const [modulos, setModulos] = useState([]);
  const [valoraciones, setValoraciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [moduloAbierto, setModuloAbierto] = useState(null);

  useEffect(() => {
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/login'; return;
    }
    fetch('/api/valoraciones?resumen=1')
      .then(r => r.json())
      .then(d => { setModulos(d.modulos || []); setValoraciones(d.valoraciones || []); })
      .catch(e => console.error('No se pudieron cargar las valoraciones:', e))
      .finally(() => setCargando(false));
  }, []);

  function datosDe(clave) {
    const vals = valoraciones.filter(v => v.modulo === clave);
    const cuenta = { ayuda: 0, mejorable: 0, no_sirve: 0 };
    vals.forEach(v => { if (cuenta[v.valoracion] !== undefined) cuenta[v.valoracion]++; });
    const total = vals.length;
    const sugerencias = vals.filter(v => v.sugerencia);
    return { vals, cuenta, total, sugerencias };
  }

  // Gráfico circular dibujado con un degradado cónico: sin librerías
  function Tarta({ cuenta, total }) {
    if (total === 0) {
      return (
        <div style={{ width: 130, height: 130, borderRadius: '50%', backgroundColor: '#f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>
          Sin datos
        </div>
      );
    }
    let acumulado = 0;
    const tramos = Object.entries(cuenta).map(([k, n]) => {
      const desde = (acumulado / total) * 360;
      acumulado += n;
      const hasta = (acumulado / total) * 360;
      return `${ETIQUETAS[k].color} ${desde}deg ${hasta}deg`;
    });
    return (
      <div style={{
        width: 130, height: 130, borderRadius: '50%',
        background: `conic-gradient(${tramos.join(', ')})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 76, height: 76, borderRadius: '50%', backgroundColor: 'white',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: AZUL, lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 10, color: '#888' }}>respuestas</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: AZUL, color: 'white', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => window.location.href = '/gestion'}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>←</button>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>📊 Valoración de módulos</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, opacity: 0.85 }}>Qué opina el claustro de cada módulo en prueba</p>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 1000, margin: '0 auto' }}>

        {cargando && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>⏳ Cargando...</div>}

        {!cargando && modulos.length === 0 && (
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 30, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>📊</div>
            <div style={{ fontWeight: 700, color: '#555', marginBottom: 6 }}>No hay módulos en prueba</div>
            <div style={{ fontSize: 13.5, color: '#888', lineHeight: 1.6 }}>
              Cuando se ponga un módulo a prueba aparecerá aquí con las respuestas del claustro.
            </div>
          </div>
        )}

        {!cargando && modulos.map(m => {
          const { cuenta, total, sugerencias } = datosDe(m.clave);
          const abierto = moduloAbierto === m.clave;

          return (
            <div key={m.clave} style={{ backgroundColor: 'white', borderRadius: 14, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>

              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <Tarta cuenta={cuenta} total={total} />

                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: 17, color: AZUL }}>{m.nombre}</h2>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                      backgroundColor: m.estado === 'en_prueba' ? '#fef3c7' : m.estado === 'consolidado' ? '#dcfce7' : '#fee2e2',
                      color: m.estado === 'en_prueba' ? '#92400e' : m.estado === 'consolidado' ? '#166534' : '#991b1b',
                    }}>
                      {m.estado === 'en_prueba' ? '⏳ En prueba' : m.estado === 'consolidado' ? '✅ Consolidado' : '🗑️ Retirado'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#888', marginBottom: 12 }}>
                    Desde el {new Date(m.fecha_inicio + 'T12:00:00').toLocaleDateString('es-ES')} · {m.dias_prueba} días de prueba
                  </div>

                  {Object.entries(cuenta).map(([k, n]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: ETIQUETAS[k].color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, color: '#444', flex: 1 }}>
                        {ETIQUETAS[k].emoji} {ETIQUETAS[k].texto}
                      </span>
                      <strong style={{ fontSize: 14, color: AZUL }}>{n}</strong>
                      <span style={{ fontSize: 12, color: '#999', width: 44, textAlign: 'right' }}>
                        {total > 0 ? Math.round((n / total) * 100) + '%' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {sugerencias.length > 0 && (
                <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 14 }}>
                  <button onClick={() => setModuloAbierto(abierto ? null : m.clave)}
                    style={{ background: 'none', border: 'none', color: AZUL, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: 0 }}>
                    {abierto ? '▼' : '▶'} 💬 {sugerencias.length} sugerencia{sugerencias.length === 1 ? '' : 's'} de mejora
                  </button>

                  {abierto && (
                    <div style={{ marginTop: 12 }}>
                      {sugerencias.map(s => (
                        <div key={s.id} style={{
                          backgroundColor: '#f8fafc', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                          borderLeft: `4px solid ${ETIQUETAS[s.valoracion].color}`,
                        }}>
                          <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6, marginBottom: 6 }}>
                            {s.sugerencia}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#888' }}>
                            {ETIQUETAS[s.valoracion].emoji} {ETIQUETAS[s.valoracion].texto} ·{' '}
                            {new Date(s.created_at).toLocaleDateString('es-ES')} ·{' '}
                            {s.quiere_contacto
                              ? <span style={{ color: '#166534', fontWeight: 700 }}>✉️ Acepta que se le pregunte</span>
                              : <span>Sin identificar</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!cargando && modulos.length > 0 && (
          <div style={{ fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8, lineHeight: 1.6 }}>
            Las valoraciones sin identificar llegan sin nombre a propósito: quien no marca la casilla
            de contacto queda en el anonimato, y así escribe con más franqueza.
          </div>
        )}
      </div>
    </div>
  );
}
