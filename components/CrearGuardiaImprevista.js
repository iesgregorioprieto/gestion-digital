'use client';
/**
 * CREAR UNA GUARDIA AHORA — caso del pasillo
 *
 * Un profesor de guardia se encuentra un grupo sin nadie (el titular tuvo
 * un contratiempo y no pudo avisar ni se generó guardia). Jefatura crea la
 * guardia de esa hora concreta y asigna directamente a quien la va a
 * hacer, sin esperar a un recálculo ni a que se registre una ausencia.
 *
 * Usa /api/guardias/libres para saber quién está libre a esa hora (los
 * mismos datos que usa el reparto automático), y la acción 'asignar' de
 * /api/apoyos, que marca asignado_por: el reparto nunca la toca ni la
 * duplica.
 */
import { useState, useEffect } from 'react';

const azul = '#1e3a5f';
const HORAS = [
  { id: '1', label: '1ª · 8:30–9:25' }, { id: '2', label: '2ª · 9:25–10:20' },
  { id: '3', label: '3ª · 10:20–11:15' }, { id: '4', label: '4ª · 11:45–12:40' },
  { id: '5', label: '5ª · 12:40–13:35' }, { id: '6', label: '6ª · 13:35–14:30' },
];
const ETQ = { libre: ['Libre', '#166534', '#f0fdf4'], ocupado: ['Ya cubriendo otra', '#92400e', '#fffbeb'],
  en_clase: ['Tiene clase', '#64748b', '#f8fafc'], ausente: ['Ausente hoy', '#b91c1c', '#fef2f2'],
  de_baja: ['De baja', '#b91c1c', '#fef2f2'], sin_identificar: ['Sin identificar', '#94a3b8', '#f8fafc'] };

export default function CrearGuardiaImprevista({ fecha, onCreada }) {
  const [abierto, setAbierto] = useState(false);
  const [hora, setHora] = useState('');
  const [grupo, setGrupo] = useState('');
  const [aula, setAula] = useState('');
  const [sector, setSector] = useState('');
  const [datos, setDatos] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hora) { setDatos(null); return; }
    setDatos(null); setElegido(null); setError('');
    fetch(`/api/guardias/libres?fecha=${fecha}&hora=${hora}`).then(r => r.json())
      .then(d => { if (!d.error) setDatos(d); else setError('No se ha podido consultar quién está libre.'); })
      .catch(() => setError('No se ha podido consultar quién está libre.'));
  }, [hora, fecha]);

  async function crear() {
    if (!hora || !elegido) return;
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/apoyos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'asignar', datos: {
          fecha, hora, profesor_id: elegido.profesorId, sector_apoyo: elegido.sector,
          sector_destino: sector || elegido.sector, grupo: grupo.trim() || null, aula: aula.trim() || null,
          estado: 'pendiente', tipo_apoyo: 'imprevisto',
          motivo_asignacion: 'Guardia creada sobre la marcha: el grupo se encontró sin profesor y no había generada ninguna guardia.',
        } }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se ha podido crear');
      onCreada?.();
      setAbierto(false); setHora(''); setGrupo(''); setAula(''); setSector(''); setDatos(null); setElegido(null);
    } catch (e) { setError(e.message); }
    setGuardando(false);
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} style={{
        padding: '7px 14px', borderRadius: 8, border: '1.5px solid #fca5a5', backgroundColor: '#fef2f2',
        color: '#b91c1c', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
      }}>🚨 Crear guardia ahora (grupo sin profesor)</button>
    );
  }

  const sectores = Object.entries(datos?.sectores || {});

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 12, width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: azul, marginBottom: 4 }}>🚨 Crear guardia ahora</div>
        <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 12 }}>
          Para un grupo que se encuentra sin profesor, sin ausencia ni guardia registrada.
        </div>

        <label style={{ fontSize: 12.5, fontWeight: 700, color: azul }}>Hora</label>
        <select value={hora} onChange={e => setHora(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, margin: '4px 0 10px' }}>
          <option value="">— elige la hora —</option>
          {HORAS.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 2 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: azul }}>Grupo (opcional)</label>
            <input value={grupo} onChange={e => setGrupo(e.target.value)} placeholder="p. ej. ESO-2A"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4 }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12.5, fontWeight: 700, color: azul }}>Aula</label>
            <input value={aula} onChange={e => setAula(e.target.value)} placeholder="A201"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginTop: 4 }} />
          </div>
        </div>

        {hora && !datos && !error && <div style={{ fontSize: 13, color: '#64748b' }}>Consultando quién está libre…</div>}
        {error && <div style={{ fontSize: 12.5, color: '#b91c1c', fontWeight: 600, marginBottom: 8 }}>❌ {error}</div>}

        {datos && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: azul, margin: '8px 0 6px' }}>
              ¿Quién lo va a cubrir? <span style={{ fontWeight: 400, color: '#64748b' }}>({datos.libres} libres)</span>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {sectores.map(([sec, gente]) => (
                <div key={sec}>
                  <div style={{ padding: '5px 10px', backgroundColor: '#f8fafc', fontSize: 11, fontWeight: 800, color: '#475569', position: 'sticky', top: 0 }}>{sec}</div>
                  {gente.map((p, i) => {
                    const [txt, color, fondo] = ETQ[p.estado] || ['', '#64748b', 'white'];
                    const elegible = p.estado === 'libre' && p.profesorId;
                    const on = elegido?.profesorId === p.profesorId && elegido?.sector === sec;
                    return (
                      <button key={i} type="button" disabled={!elegible} onClick={() => { setElegido(p); setSector(sec); }} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                        padding: '7px 10px', border: 'none', borderTop: '1px solid #f1f5f9',
                        backgroundColor: on ? '#dbeafe' : fondo, cursor: elegible ? 'pointer' : 'default', fontSize: 12.5,
                      }}>
                        <span style={{ color: elegible ? '#1e293b' : '#94a3b8' }}>{p.nombre}</span>
                        <span style={{ fontSize: 11, color, fontWeight: 700 }}>{on ? '✓ elegido' : txt}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
              {sectores.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: '#94a3b8', textAlign: 'center' }}>Nadie de guardia a esa hora.</div>}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="button" onClick={() => setAbierto(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={crear} disabled={!elegido || guardando} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white',
            fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer', opacity: !elegido ? 0.5 : 1,
          }}>{guardando ? 'Creando…' : 'Crear y asignar'}</button>
        </div>
      </div>
    </div>
  );
}
