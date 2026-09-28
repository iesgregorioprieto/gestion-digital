'use client';
/**
 * CAMBIAR LAS HORAS DE UNA AUSENCIA DE UN DÍA (jefatura)
 *
 * Caso típico: pidió 1ª, 2ª y 3ª por una cita médica; el médico se retrasa
 * y llama para que le pongan también 4ª. O al revés: sale antes y llega a
 * 3ª, así que esa hora se quita y se libera al de guardia.
 *
 * Se marcan o desmarcan horas sobre su horario de ese día. Al guardar se
 * actualiza la ausencia y se recalculan las guardias en el momento: la
 * hora añadida la cubre el de guardia; la quitada deja de estar cubierta.
 * Las horas que ya tenía conservan su tarea; las añadidas llevan una nota.
 */
import { useState, useEffect } from 'react';

const azul = '#1e3a5f';
const num = h => String(h || '').match(/\d/)?.[0] || '';

export default function EditarHorasAusencia({ ausencia, onCerrar, onGuardado }) {
  const [horario, setHorario] = useState(null);
  const [marcadas, setMarcadas] = useState(() => new Set((ausencia.horas || []).map(h => num(h.hora || h.hora_id)).filter(Boolean)));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/ausencias?horario_dia=1&fecha=${ausencia.fecha_inicio}&profesor_id=${ausencia.profesor_id}`)
      .then(r => r.json())
      .then(d => {
        const porHora = {};
        (d.horas || []).forEach(h => { const n = num(h.hora_id); if (n) porHora[n] = h; });
        // Lo que ya tenía la ausencia aunque no esté en el horario actual
        (ausencia.horas || []).forEach(h => { const n = num(h.hora || h.hora_id); if (n && !porHora[n]) porHora[n] = { hora_id: n + 'a', tipo: h.tipo, grupo: h.grupo, materia: h.materia }; });
        setHorario(porHora);
      })
      .catch(() => setError('No se ha podido cargar su horario de ese día.'));
  }, [ausencia]);

  const cambiar = n => setMarcadas(m => { const x = new Set(m); x.has(n) ? x.delete(n) : x.add(n); return x; });

  async function guardar() {
    setGuardando(true); setError('');
    try {
      const previas = {};
      (ausencia.horas || []).forEach(h => { const n = num(h.hora || h.hora_id); if (n) previas[n] = h; });
      const horas = [...marcadas].sort().map(n => previas[n] || {
        hora: `${n}ª hora`,
        tipo: horario?.[n]?.tipo || 'clase',
        grupo: horario?.[n]?.grupo || null,
        materia: horario?.[n]?.materia || null,
        archivo_url: null, archivo_nombre: null,
        instrucciones: 'Hora añadida por jefatura (sin tarea)',
      });
      if (!horas.length) throw new Error('Deja al menos una hora marcada. Si ya no falta ninguna, borra la ausencia.');

      const r = await fetch('/api/ausencias', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'editar', id: ausencia.id, datos: { horas } }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido guardar');

      // Guardias de ese día, en el momento
      await fetch('/api/guardias/preasignar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: ausencia.fecha_inicio }) }).catch(() => {});

      onGuardado?.(horas);
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  const horasDia = horario ? Object.keys(horario).sort() : [];
  const etiqueta = h => h?.tipo === 'clase' ? `clase · ${h.grupo || ''}` : (h?.tipo || '—');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 12, width: 'min(440px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: azul }}>🕐 Cambiar horas de la ausencia</div>
        <div style={{ fontSize: 12.5, color: '#475569', margin: '4px 0 12px' }}>
          {ausencia.profesor_nombre} · {ausencia.fecha_inicio.split('-').reverse().join('/')}
        </div>

        {!horario && !error && <div style={{ fontSize: 13, color: '#64748b' }}>Cargando su horario…</div>}
        {horario && horasDia.length === 0 && <div style={{ fontSize: 13, color: '#64748b' }}>No tiene horario ese día.</div>}

        {horasDia.map(n => {
          const h = horario[n];
          const on = marcadas.has(n);
          const antes = (ausencia.horas || []).some(x => num(x.hora || x.hora_id) === n);
          return (
            <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 5, borderRadius: 8, cursor: 'pointer',
              border: `1.5px solid ${on ? '#fca5a5' : '#e2e8f0'}`, backgroundColor: on ? '#fef2f2' : 'white' }}>
              <input type="checkbox" checked={on} onChange={() => cambiar(n)} style={{ transform: 'scale(1.2)' }} />
              <strong style={{ minWidth: 26 }}>{n}ª</strong>
              <span style={{ flex: 1, fontSize: 12.5, color: '#334155' }}>{etiqueta(h)}</span>
              {on !== antes && <span style={{ fontSize: 11, fontWeight: 700, color: on ? '#b91c1c' : '#15803d' }}>{on ? 'se añade' : 'se quita'}</span>}
            </label>
          );
        })}

        <div style={{ fontSize: 11.5, color: '#64748b', margin: '10px 0' }}>
          Marcadas = horas en las que falta. Al guardar se recalculan las guardias de ese día: lo añadido lo cubre el de guardia; lo quitado deja de estar cubierto. Las horas ya pasadas no cambian.
        </div>
        {error && <div style={{ color: '#b91c1c', fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>❌ {error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || !horario} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white', fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Guardando…' : 'Guardar y recalcular guardias'}
          </button>
        </div>
      </div>
    </div>
  );
}
