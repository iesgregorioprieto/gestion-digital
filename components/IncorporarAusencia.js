'use client';
/**
 * SE INCORPORA ANTES DE TIEMPO (jefatura · petición de Delia, nov. 2026)
 *
 * Ausencia de varios días y el profesor vuelve antes de la fecha prevista.
 * Se elige el día y la hora a la que se incorpora:
 *   · a 1ª hora → la ausencia termina el día anterior;
 *   · a otra hora → ese día queda como ausencia aparte de las horas
 *     anteriores, con las tareas que dejó para esos grupos.
 * Al guardar se borran las guardias pendientes de lo que ya no falta y
 * se rehace el reparto.
 */
import { useState } from 'react';

const azul = '#1e3a5f';
const fmt = f => (f || '').split('-').reverse().join('/');

export default function IncorporarAusencia({ ausencia, onCerrar, onGuardado }) {
  const hoy = new Date().toLocaleDateString('sv-SE');
  const minimo = ausencia.fecha_inicio > hoy ? ausencia.fecha_inicio : hoy;
  const [fecha, setFecha] = useState(minimo);
  const [hora, setHora] = useState('1');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const n = parseInt(hora, 10);
  const resumen = !fecha ? '' : n === 1
    ? (fecha === ausencia.fecha_inicio
      ? 'Ese día es el primero de la ausencia: si vuelve a 1ª hora no llega a faltar (bórrala).'
      : `La ausencia terminará el ${fmt(new Date(new Date(fecha + 'T12:00:00').getTime() - 864e5).toLocaleDateString('sv-SE'))}. Desde el ${fmt(fecha)} da sus clases.`)
    : (fecha === ausencia.fecha_inicio
      ? `La ausencia se queda solo en el ${fmt(fecha)}, de 1ª a ${n - 1}ª hora.`
      : `La ausencia terminará el día anterior y el ${fmt(fecha)} quedará como ausencia aparte de 1ª a ${n - 1}ª hora, con sus tareas.`);

  async function guardar() {
    setGuardando(true); setError('');
    try {
      if (!fecha || fecha < ausencia.fecha_inicio || fecha > ausencia.fecha_fin) {
        throw new Error(`El día tiene que estar entre el ${fmt(ausencia.fecha_inicio)} y el ${fmt(ausencia.fecha_fin)}.`);
      }
      const r = await fetch('/api/ausencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'incorporar', id: ausencia.id, datos: { fecha, hora: n } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || 'No se ha podido guardar');
      onGuardado?.(d);
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 12, width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: azul }}>↩️ Se incorpora antes de tiempo</div>
        <div style={{ fontSize: 12.5, color: '#475569', margin: '4px 0 14px' }}>
          {ausencia.profesor_nombre} · prevista del {fmt(ausencia.fecha_inicio)} al {fmt(ausencia.fecha_fin)}
        </div>

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: azul, marginBottom: 4 }}>Día en que se incorpora</label>
        <input type="date" value={fecha} min={ausencia.fecha_inicio} max={ausencia.fecha_fin}
          onChange={e => setFecha(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, marginBottom: 12 }} />

        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: azul, marginBottom: 6 }}>Desde qué hora da clase ese día</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {['1', '2', '3', '4', '5', '6'].map(h => (
            <button key={h} type="button" onClick={() => setHora(h)} style={{
              padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: `2px solid ${hora === h ? '#15803d' : '#e2e8f0'}`,
              backgroundColor: hora === h ? '#f0fdf4' : 'white', color: hora === h ? '#166534' : '#475569',
            }}>{h}ª</button>
          ))}
        </div>

        {resumen && (
          <div style={{ fontSize: 12.5, color: '#334155', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
            {resumen} Las guardias de lo que ya no falta se quitan; lo fichado no se toca.
          </div>
        )}
        {error && <div style={{ color: '#b91c1c', fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>❌ {error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || (n === 1 && fecha === ausencia.fecha_inicio)}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#15803d', color: 'white', fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer', opacity: (n === 1 && fecha === ausencia.fecha_inicio) ? 0.5 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar y recalcular guardias'}
          </button>
        </div>
      </div>
    </div>
  );
}
