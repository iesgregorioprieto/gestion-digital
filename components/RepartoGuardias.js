'use client';
/**
 * «¿CÓMO SE REPARTEN LAS GUARDIAS?»
 *
 * Botón ⓘ + panel con la regla explicada en llano, un ejemplo con números
 * y la tabla real de rotación entre sectores del curso. Para que quien
 * piense «a mi departamento le toca más por ser pequeño» lo compruebe
 * mirando, sin tener que fiarse de nadie.
 *
 * La tabla sale de /api/guardias/contador (campo «rotacion»), que usa la
 * misma cuenta que el motor. Solo datos por sector, sin nombres.
 *
 * Se abre con el botón o desde cualquier sitio lanzando el evento
 * 'guardias:reparto' (lo hace la línea de «Llevas X guardias»).
 */
import { useState, useEffect } from 'react';

const azul = '#1e3a5f';
const coma = n => String(n).replace('.', ',');

export function abrirRepartoGuardias() {
  window.dispatchEvent(new Event('guardias:reparto'));
}

export default function RepartoGuardias({ claro = true }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener('guardias:reparto', abrir);
    return () => window.removeEventListener('guardias:reparto', abrir);
  }, []);

  // Solo se piden los números al abrir el panel
  useEffect(() => {
    if (!abierto || datos) return;
    fetch('/api/guardias/contador')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setDatos(d))
      .catch(() => setError(true));
  }, [abierto, datos]);

  const rotacion = datos?.rotacion || [];
  const miSector = datos?.mio?.sector || null;

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} title="¿Cómo se reparten las guardias?"
        aria-label="¿Cómo se reparten las guardias?" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', fontSize: 15, fontWeight: 800,
          border: claro ? '1.5px solid rgba(255,255,255,0.6)' : `1.5px solid ${azul}`,
          backgroundColor: 'transparent', color: claro ? 'white' : azul, fontFamily: 'Georgia, serif',
        }}>i</button>

      {abierto && (
        <div onClick={() => setAbierto(false)} style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: 'white', borderRadius: 14, padding: '20px 20px 16px', width: '100%', maxWidth: 520,
            maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            fontSize: 14, color: '#334155', lineHeight: 1.6, textAlign: 'left',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: azul, marginBottom: 12 }}>
              ¿Cómo se reparten las guardias?
            </div>

            <div style={{ fontWeight: 800, color: azul, marginBottom: 4 }}>Cuando falta alguien, ¿quién le cubre?</div>
            <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>
              <li style={{ marginBottom: 6 }}>
                <strong>Primero, los de guardia de su mismo sector</strong> (GENERAL, o su familia de FP).
                Entre ellos va antes el de su mismo departamento y, si no, el que menos guardias lleve fichadas.
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Si en su sector no queda nadie libre:</strong> a un profesor de FP le apoya
                <strong> otra familia de FP</strong> (GENERAL solo si no queda nadie en ninguna familia de FP);
                a uno de GENERAL le apoya <strong>FP</strong>.
              </li>
              <li style={{ marginBottom: 6 }}>
                <strong>Cuando hay que salir fuera, se turnan los sectores según su tamaño</strong>:
                sale el que menos ha salido <em>por persona</em>. Y dentro de él, quien menos lleve.
              </li>
              <li>
                <strong>Ningún grupo se queda sin profesor</strong> mientras quede alguien libre en el centro.
                Solo se ve en rojo si no queda nadie.
              </li>
            </ol>

            <div style={{ padding: '9px 12px', borderRadius: 9, backgroundColor: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', marginBottom: 14, fontSize: 13.5 }}>
              <strong>Solo cuentan las guardias fichadas.</strong> La que no se ficha consta como no
              realizada y no suma a tu turno.
            </div>

            <div style={{ fontWeight: 800, color: azul, marginBottom: 4 }}>¿Y si mi departamento es pequeño?</div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 12px', marginBottom: 8, fontSize: 13.5 }}>
              <div>Sector <strong>A</strong>: 3 profesores, ha salido 2 veces → 2 ÷ 3 = <strong>0,67</strong> por persona.</div>
              <div>Sector <strong>B</strong>: 9 profesores, ha salido 4 veces → 4 ÷ 9 = <strong>0,44</strong> por persona.</div>
              <div style={{ marginTop: 6 }}>
                La próxima vez <strong>sale B</strong>, aunque en total haya salido más, porque por persona va por detrás.
              </div>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 13.5 }}>
              Un sector pequeño sale <strong>menos veces en total</strong>; a cada persona le toca lo mismo que en uno grande.
            </p>
            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#64748b' }}>
              Eso sí: las ausencias de tu propio sector las cubre primero tu sector, igual que en todos.
              Si en el tuyo sois pocos y faltan compañeros, esas guardias os tocan a vosotros antes que a nadie de fuera.
            </p>

            <div style={{ fontWeight: 800, color: azul, marginBottom: 4 }}>Cómo va este curso</div>
            <p style={{ margin: '0 0 6px', fontSize: 12.5, color: '#64748b' }}>
              Veces que cada sector ha salido a cubrir a otro (solo fichadas, sin recreos). Sale primero el de arriba.
            </p>
            {error && <div style={{ fontSize: 13, color: '#b91c1c' }}>No se han podido cargar los datos.</div>}
            {!error && !datos && <div style={{ fontSize: 13, color: '#64748b' }}>Cargando…</div>}
            {datos && rotacion.length > 0 && (
              <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left', fontSize: 12 }}>
                      <th style={{ padding: '5px 6px' }}>Sector</th>
                      <th style={{ padding: '5px 6px', textAlign: 'right' }}>Profesores</th>
                      <th style={{ padding: '5px 6px', textAlign: 'right' }}>Salidas</th>
                      <th style={{ padding: '5px 6px', textAlign: 'right' }}>Por persona</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rotacion.map(r => {
                      const mio = miSector && r.sector === miSector;
                      return (
                        <tr key={r.sector} style={{ borderTop: '1px solid #e2e8f0', backgroundColor: mio ? '#eff6ff' : 'transparent', fontWeight: mio ? 800 : 400 }}>
                          <td style={{ padding: '6px' }}>{r.sector}{mio ? ' (el tuyo)' : ''}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{r.profesores}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{r.salidas}</td>
                          <td style={{ padding: '6px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{coma(r.porPersona.toFixed(2))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ fontWeight: 800, color: azul, marginBottom: 4 }}>Qué no se cubre</div>
            <ul style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13.5 }}>
              <li>Las horas en que al que falta le tocaba guardia: hay un guardia menos, pero nadie que cubrir.</li>
              <li>Las horas sin alumnos (atención a padres, dual en la empresa, horas sin asignar).</li>
              <li>A 6ª hora, los grupos de Grado Medio y Superior (Grado Básico sí se cubre).</li>
            </ul>

            <div style={{ fontWeight: 800, color: azul, marginBottom: 4 }}>¿Cuándo cambia lo asignado?</div>
            <p style={{ margin: '0 0 6px', fontSize: 13.5 }}>
              Al registrarse una ausencia y 30 minutos antes de cada timbre. Lo de una hora que ya ha empezado no se mueve.
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 13.5 }}>
              Si te toca fuera de tu sector, en tu guardia verás el motivo.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" onClick={() => setAbierto(false)} style={{
                padding: '10px 20px', borderRadius: 9, border: 'none', backgroundColor: azul,
                color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>Entendido</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
