'use client';
/**
 * «TUS FRANJAS DE GUARDIA» — incidencia #186.
 *
 * En cada franja (día + hora) en que el profesor tiene guardia, cuántas
 * guardias ha fichado en esa franja cada compañero que está con él. Es la
 * cuenta con la que el motor decide quién sale: dentro de cada sector,
 * primero quien menos lleva en esa franja.
 *
 * Plegado por defecto; los datos solo se piden al abrirlo.
 */
import { useState, useEffect } from 'react';

const azul = '#1e3a5f';
const DIAS = { lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves', viernes: 'Viernes' };

// «Martínez Lara, María Rocío» → «María Rocío Martínez Lara»
function nombreLegible(n) {
  if (!n || !n.includes(',')) return n || '';
  const [ap, no] = n.split(',');
  return `${no.trim()} ${ap.trim()}`;
}

function fechaLarga(f) {
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

// Las guardias hechas fuera de sus franjas se reparten entre ellas y
// pueden dar decimales: 2,3 en vez de 2.333…
function numero(n) {
  return Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace('.', ',');
}

function Persona({ p, max }) {
  const ancho = max > 0 ? Math.max(4, Math.round((p.fichadas / max) * 100)) : 4;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
      <div style={{ flex: '0 0 46%', fontSize: 12.5, color: p.yo ? azul : '#334155', fontWeight: p.yo ? 800 : 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {p.yo ? 'Tú' : nombreLegible(p.nombre)}
        {p.sinIdentificar && <span style={{ color: '#94a3b8', fontWeight: 400 }}> (sin identificar)</span>}
      </div>
      <div style={{ flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${ancho}%`, height: '100%', borderRadius: 4,
          backgroundColor: p.yo ? '#2563eb' : '#94a3b8' }} />
      </div>
      <div style={{ width: 30, textAlign: 'right', fontSize: 13, fontWeight: 800,
        color: p.yo ? azul : '#334155', fontVariantNumeric: 'tabular-nums' }}>{numero(p.fichadas)}</div>
    </div>
  );
}

export default function MisFranjasGuardia() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!abierto || datos) return;
    fetch('/api/guardias/mis-franjas')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setDatos)
      .catch(() => setError(true));
  }, [abierto, datos]);

  const enTransicion = datos?.transicion && datos.transicion.peso < 1;

  return (
    <div style={{ margin: '0 0 12px', borderRadius: 9, border: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
      <div onClick={() => setAbierto(a => !a)} role="button" style={{
        padding: '8px 12px', fontSize: 12.5, color: '#334155', cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}>
        <span>👥 <strong>Tus franjas de guardia:</strong> cuántas lleva cada compañero</span>
        <span style={{ color: '#1e40af', fontWeight: 700 }}>{abierto ? 'Ocultar ▲' : 'Ver ▼'}</span>
      </div>

      {abierto && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>
            Guardias <strong>fichadas en cada franja</strong> este curso. Cuando falta alguien de tu sector,
            sale primero el de tu sector que <strong>menos lleva en esa franja</strong>.
            Si estás solo de tu sector a esa hora, te toca a ti siempre que falte alguien de tu sector.
            {enTransicion && (
              <div style={{ marginTop: 6, padding: '6px 9px', borderRadius: 7, backgroundColor: '#fffbeb',
                border: '1px solid #fde68a', color: '#92400e' }}>
                ⏳ Hasta las vacaciones de Navidad las franjas se están igualando poco a poco, así que
                todavía puede haber alguna diferencia. Desde el {fechaLarga(datos.transicion.pura)} cuenta solo la franja.
              </div>
            )}
          </div>

          {datos?.fueraRepartidas > 0 && (
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5, marginBottom: 10, padding: '6px 9px',
              borderRadius: 7, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
              ➕ Has hecho <strong>{numero(datos.fueraRepartidas)} {datos.fueraRepartidas === 1 ? 'guardia' : 'guardias'} a
              horas que no son de guardia tuya</strong>. Te cuentan repartidas a partes iguales entre tus franjas,
              para que te toque salir un poco menos en todas. Por eso puede haber decimales.
            </div>
          )}

          {error && <div style={{ fontSize: 12.5, color: '#b91c1c' }}>No se ha podido cargar. Prueba otra vez más tarde.</div>}
          {!datos && !error && <div style={{ fontSize: 12.5, color: '#64748b' }}>Cargando…</div>}
          {datos && datos.franjas.length === 0 && (
            <div style={{ fontSize: 12.5, color: '#64748b' }}>No tienes guardias en el cuadrante (sin contar recreos).</div>
          )}

          {datos && datos.franjas.map(f => {
            const max = Math.max(0, ...f.sectores.flatMap(s => s.personas.map(p => p.fichadas)));
            const mio = f.sectores.filter(s => s.mio);
            const otros = f.sectores.filter(s => !s.mio);
            return (
              <div key={`${f.dia}-${f.hora}`} style={{ backgroundColor: 'white', border: '1px solid #e2e8f0',
                borderRadius: 9, padding: '9px 11px', marginBottom: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: azul, marginBottom: 4 }}>
                  {DIAS[f.dia] || f.dia} · {f.hora}ª
                </div>
                {mio.map(s => (
                  <div key={s.sector}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      Tu sector · {s.sector}{s.personas.length === 1 ? ' (estás solo)' : ''}
                    </div>
                    {s.personas.map((p, i) => <Persona key={i} p={p} max={max} />)}
                  </div>
                ))}
                {otros.length > 0 && (
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ fontSize: 11.5, color: '#64748b', cursor: 'pointer' }}>
                      Otros de guardia a esa hora ({otros.reduce((n, s) => n + s.personas.length, 0)})
                    </summary>
                    {['GENERAL', 'FP'].map(tipo => {
                      const grupo = otros.filter(s => (tipo === 'FP') === s.fp);
                      if (grupo.length === 0) return null;
                      return (
                        <div key={tipo} style={{ marginTop: 6 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 800, color: '#64748b', letterSpacing: 0.3 }}>
                            {tipo === 'FP' ? 'FORMACIÓN PROFESIONAL' : 'GENERAL'}
                          </div>
                          {grupo.map(s => (
                            <div key={s.sector} style={{ marginTop: 3 }}>
                              {tipo === 'FP' && <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>{s.sector}</div>}
                              {s.personas.map((p, i) => <Persona key={i} p={p} max={max} />)}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
