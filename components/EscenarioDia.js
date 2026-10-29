'use client';

import { useState, useEffect } from 'react';
// La lectura va por /api/escenario con clave de servicio.

// Escenario de un dia concreto: quien falta y por que.
// Orden de prioridad fijado por direccion:
//   1. Ausencias  2. Extraescolares  3. Formacion  4. DLD
// Se usa desde Ausencias, DLD, Actividades y Jefatura.

const BLOQUES = [
  { id: 'ausencias',    orden: 1, emoji: '🏥', titulo: 'Ausencias',      color: '#991b1b', bg: '#fef2f2', borde: '#fecaca' },
  { id: 'extraescolar', orden: 2, emoji: '🚌', titulo: 'Extraescolares', color: '#1e40af', bg: '#eff6ff', borde: '#bfdbfe' },
  { id: 'formacion',    orden: 3, emoji: '🎓', titulo: 'Formación',      color: '#92400e', bg: '#fffbeb', borde: '#fde68a' },
  { id: 'dld',          orden: 4, emoji: '🗓️', titulo: 'DLD',            color: '#166534', bg: '#f0fdf4', borde: '#bbf7d0' },
];

const TIPOS_DLD = {
  canoso:      '🦳 CANOSO',
  no_lectivo:  '🌙 DLD no lectivo',
  '1_lectivo': '📚 1º DLD lectivo',
  '2_lectivo': '📖 2º DLD lectivo',
  '3_lectivo': '📗 3º DLD lectivo',
};

export default function EscenarioDia({ fecha, compacto = false }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [grupos, setGrupos] = useState(null);
  const [umbral, setUmbral] = useState(2);

  const [actualizado, setActualizado] = useState(null);

  /**
   * Se refresca solo, como el panel de la sala de profesores.
   *
   * Durante la mañana entran ausencias nuevas —alguien llama a las diez
   * diciendo que no viene a 3ª— y esta pantalla se queda abierta en el
   * despacho. Si no se actualiza sola, se está mirando la foto de las
   * nueve y se toman decisiones con datos viejos.
   *
   * La primera carga muestra «cargando»; las siguientes se hacen por
   * detrás, sin parpadeo, para no molestar a quien esté leyendo.
   */
  useEffect(() => {
    if (!fecha) { setItems([]); setGrupos(null); setCargando(false); return; }
    let cancelado = false;
    let primera = true;

    const traer = async () => {
      if (primera) setCargando(true);
      setError('');
      try {
        const r = await fetch(`/api/escenario?fecha=${fecha}`);
        if (cancelado) return;
        const d = await r.json();

        if (!r.ok || d.error) {
          setError(d.error === 'solo_equipo_directivo'
            ? 'El escenario del día es solo para el equipo directivo.'
            : (d.error || 'No se ha podido cargar el escenario del día.'));
          setCargando(false);
          return;
        }

        setItems(d.items || []);
        setGrupos(Array.isArray(d.grupos) ? d.grupos : null);
        if (d.umbral) setUmbral(d.umbral);
        setActualizado(new Date());
      } catch (e) {
        if (!cancelado) setError('No se ha podido cargar el escenario del día.');
      }
      if (!cancelado) { setCargando(false); primera = false; }
    };

    traer();
    const reloj = setInterval(() => { if (!document.hidden) traer(); }, 180000); // 3 min

    // Al volver a la pestaña, al momento: no tiene sentido esperar al
    // siguiente minuto si alguien acaba de sentarse delante.
    const alVolver = () => { if (document.visibilityState === 'visible') traer(); };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      cancelado = true;
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [fecha]);

  const totalProfes = new Set(items.map(i => i.profesor)).size;

  if (!fecha) return null;

  if (cargando) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#666', fontSize: 13 }}>
        ⏳ Cargando el escenario del día...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* RESUMEN */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderRadius: 10, marginBottom: 12,
        backgroundColor: totalProfes === 0 ? '#f0fdf4' : totalProfes >= 8 ? '#fef2f2' : '#fffbeb',
        border: `1.5px solid ${totalProfes === 0 ? '#bbf7d0' : totalProfes >= 8 ? '#fecaca' : '#fde68a'}`,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: totalProfes === 0 ? '#166534' : totalProfes >= 8 ? '#991b1b' : '#92400e' }}>
          {totalProfes}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>
          {totalProfes === 0
            ? 'No hay nadie fuera del centro este día.'
            : `${totalProfes === 1 ? 'profesor/a fuera' : 'profesores/as fuera'} del centro este día.`}
        </span>
        {actualizado && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}
            title="Se actualiza solo cada minuto">
            🔄 {actualizado.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* GRUPOS QUE PIERDEN MÁS DE 2 PERIODOS (#231) */}
      {grupos && totalProfes > 0 && (() => {
        const graves = grupos.filter(g => g.periodos.length > umbral);
        const ok = graves.length === 0;
        return (
          <div style={{
            marginBottom: 12, borderRadius: 10, padding: '9px 12px', fontSize: 12.5,
            backgroundColor: ok ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${ok ? '#bbf7d0' : '#fecaca'}`,
            color: ok ? '#166534' : '#991b1b',
          }}>
            {ok ? (
              <span>✅ Ningún grupo se queda sin su profesor en más de {umbral} periodos lectivos este día.</span>
            ) : (
              <>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>
                  🔴 {graves.length === 1 ? 'Un grupo pierde' : `${graves.length} grupos pierden`} más de {umbral} periodos lectivos:
                </div>
                {graves.map(g => (
                  <div key={g.grupo} style={{ marginTop: 3, lineHeight: 1.45 }}>
                    <strong>{g.grupo}</strong> — {g.periodos.length} periodos:{' '}
                    {g.periodos.map(p => `${p.hora}ª ${p.quien.map(q => q.profesor).join(' / ')}`).join(' · ')}
                  </div>
                ))}
              </>
            )}
          </div>
        );
      })()}

      {/* BLOQUES POR PRIORIDAD */}
      {BLOQUES.map(b => {
        const propios = items.filter(i => i.bloque === b.id);
        if (propios.length === 0) return null;
        return (
          <div key={b.id} style={{
            marginBottom: 10, borderRadius: 10, overflow: 'hidden',
            border: `1.5px solid ${b.borde}`, backgroundColor: b.bg,
          }}>
            <div style={{
              padding: '7px 12px', fontSize: 13, fontWeight: 800, color: b.color,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{b.orden}º</span>
              <span>{b.emoji} {b.titulo}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                backgroundColor: 'white', padding: '2px 8px', borderRadius: 20, color: b.color,
              }}>
                {propios.length}
              </span>
            </div>
            <div style={{ backgroundColor: 'white' }}>
              {propios.map((p, i) => (
                <div key={i} style={{
                  padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4,
                  borderTop: `1px solid ${b.borde}`,
                  display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                }}>
                  <span style={{ fontWeight: 700, color: '#333' }}>{p.profesor}</span>
                  <span style={{ color: '#666' }}>{p.detalle}</span>
                  {!compacto && p.nHoras > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                      {p.nHoras} {p.nHoras === 1 ? 'hora' : 'horas'}{Array.isArray(p.clases) ? ' de clase' : ''}
                    </span>
                  )}
                  {p.estado === 'pendiente' && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '1px 7px', borderRadius: 20 }}>
                      pendiente
                    </span>
                  )}
                  {Array.isArray(p.clases) && (
                    <div style={{ flexBasis: '100%', display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                      {p.clases.length === 0 ? (
                        <span style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>Sin horas de clase con alumnos este día</span>
                      ) : p.clases.map((c, k) => (
                        <span key={k}
                          title={c.grupoFuera ? 'El grupo está fuera en una actividad a esa hora' : undefined}
                          style={{
                            fontSize: 11, padding: '1px 7px', borderRadius: 6,
                            backgroundColor: c.grupoFuera ? '#f3f4f6' : '#eef2ff',
                            color: c.grupoFuera ? '#9ca3af' : '#3730a3',
                            textDecoration: c.grupoFuera ? 'line-through' : 'none',
                            whiteSpace: 'nowrap',
                          }}>
                          {c.hora}ª {c.grupo || '—'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
