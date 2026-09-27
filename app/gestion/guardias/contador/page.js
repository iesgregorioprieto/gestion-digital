'use client';
export const dynamic = 'force-dynamic';

/**
 * CONTADOR DE GUARDIAS (jefatura)
 * Lo que antes se llevaba en papel: quién entra y cuántas veces, para ver
 * si alguien va por encima de lo que le toca.
 */
import { useState, useEffect, useMemo } from 'react';

const azul = '#1e3a5f';
const COLOR = {
  alto:   { fondo: '#fef2f2', borde: '#fca5a5', texto: '#b91c1c', etiqueta: 'Por encima' },
  bajo:   { fondo: '#eff6ff', borde: '#bfdbfe', texto: '#1d4ed8', etiqueta: 'Por debajo' },
  normal: { fondo: 'white',   borde: '#e5e7eb', texto: '#334155', etiqueta: '' },
  apoyo:  { fondo: '#f0fdf4', borde: '#bbf7d0', texto: '#15803d', etiqueta: 'Cubre sin tener guardias' },
};

export default function ContadorGuardias() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [sector, setSector] = useState('');
  const [busca, setBusca] = useState('');
  const [verAyuda, setVerAyuda] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/guardias/contador');
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'No se ha podido cargar');
        if (!d.filas) throw new Error('Esta pantalla es solo para el equipo directivo.');
        setDatos(d);
      } catch (e) { setError(e.message); }
    })();
  }, []);

  const filas = useMemo(() => {
    if (!datos) return [];
    const q = busca.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return datos.filas.filter(f => (!sector || f.sector === sector)
      && (!q || f.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
             || (f.departamento || '').toLowerCase().includes(q)));
  }, [datos, sector, busca]);

  const altos = datos ? datos.filas.filter(f => f.nivel === 'alto') : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      <div style={{ backgroundColor: azul, color: 'white', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>📊 Contador de guardias</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{datos ? `Curso ${datos.curso} · guardias fichadas, sin recreos` : 'Cargando…'}</div>
        </div>
        <a href="/gestion/guardias" style={{ color: 'white', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 13, textDecoration: 'none' }}>← Guardias</a>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>
        {error && <div style={{ backgroundColor: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, fontWeight: 600 }}>❌ {error}</div>}
        {!datos && !error && <div style={{ color: '#64748b', padding: 20 }}>Contando guardias…</div>}

        {datos && (
          <>
            {/* Cómo se lee */}
            <div style={{ backgroundColor: 'white', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>
              <button type="button" onClick={() => setVerAyuda(v => !v)} style={{ border: 'none', background: 'none', padding: 0, color: '#1e40af', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                {verAyuda ? '▾' : '▸'} ¿Cómo se lee esta tabla?
              </button>
              {verAyuda && (
                <div style={{ marginTop: 8 }}>
                  <p style={{ margin: '0 0 6px' }}><strong>Hechas</strong>: guardias fichadas en el curso. Son las que cuentan para la rotación. Los recreos no entran.</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Le tocarían</strong>: lo que llevaría si todos los de su sector hubieran entrado en proporción a sus horas de guardia. Quien tiene 3 horas a la semana entra más que quien tiene 1, y es lo normal: por eso se compara con esto y no con la media a secas.</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Fuera</strong>: cuántas de sus guardias fueron cubriendo a otro sector.</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Sin fichar</strong>: asignadas en días pasados que no se ficharon.</p>
                  <p style={{ margin: '0 0 6px' }}>En <strong style={{ color: '#15803d' }}>verde</strong>, quien ha cubierto guardias sin tenerlas en su horario (las ficha jefatura). No cuentan para la media de su sector.</p>
                  <p style={{ margin: 0 }}>Sale en <strong style={{ color: '#b91c1c' }}>rojo</strong> quien lleva al menos 2 más de lo que le toca y un 50 % por encima. Suele ser por necesidad: si a su hora de guardia solo hay dos personas de su sector y faltan tres, entran las dos sí o sí.</p>
                </div>
              )}
            </div>

            {/* Resumen por sector */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {datos.sectores.map(s => (
                <button key={s.sector} type="button" onClick={() => setSector(x => x === s.sector ? '' : s.sector)} style={{
                  padding: '8px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                  border: `2px solid ${sector === s.sector ? azul : '#e2e8f0'}`,
                  backgroundColor: sector === s.sector ? '#e0e7ff' : 'white', color: azul,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{s.sector}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{s.hechas} hechas · media {s.media.toFixed(1)} · {s.profesores} prof.</div>
                </button>
              ))}
            </div>

            {altos.length > 0 && !sector && !busca && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 9, padding: '9px 12px', marginBottom: 12, fontSize: 12.5, color: '#b91c1c' }}>
                <strong>Por encima de lo que les toca:</strong> {altos.map(f => `${f.nombre} (${f.hechas}, le tocarían ${f.esperadas})`).join(' · ')}
              </div>
            )}

            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar profesor o departamento…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginBottom: 10 }} />

            <div style={{ backgroundColor: 'white', borderRadius: 10, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '9px 10px' }}>Profesor</th>
                    <th style={{ padding: '9px 10px' }}>Sector</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center' }}>Guardias/sem</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center' }}>Hechas</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center' }}>Le tocarían</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center' }}>Fuera</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center' }}>Sin fichar</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => {
                    const c = COLOR[f.nivel];
                    return (
                      <tr key={f.clave} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: c.fondo }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 700, color: c.texto }}>{f.nombre}{f.sinIdentificar && <span style={{ color: '#94a3b8', fontWeight: 500 }}> (sin identificar)</span>}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{f.departamento}{c.etiqueta && <strong style={{ color: c.texto }}> · {c.etiqueta}</strong>}</div>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11.5, color: '#64748b' }}>{f.sector}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{f.semanales}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: c.texto }}>{f.hechas}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{f.esperadas}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{f.fuera || ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: f.noRealizadas ? '#b45309' : '#64748b', fontWeight: f.noRealizadas ? 700 : 400 }}>{f.noRealizadas || ''}</td>
                      </tr>
                    );
                  })}
                  {filas.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 18, textAlign: 'center', color: '#94a3b8' }}>Nadie con ese filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
