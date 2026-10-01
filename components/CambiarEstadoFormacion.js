'use client';
import { useState } from 'react';

/**
 * Botón «Cambiar estado» de una solicitud de formación (solo director).
 * Sirve para corregir, revocar una concesión, reabrir o devolver al jefe.
 * El motivo es obligatorio y se avisa al profesor por correo.
 */

const OPCIONES = [
  { valor: 'autorizada',         label: '✅ Concedida' },
  { valor: 'denegada_director',  label: '❌ Denegada por dirección' },
  { valor: 'pendiente_director', label: '⏳ Pendiente de dirección' },
  { valor: 'pendiente_jefe',     label: '↩️ Devolver al jefe de departamento' },
  { valor: 'retirada',           label: '🚫 Anulada' },
];

export default function CambiarEstadoFormacion({ solicitud, onHecho }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado]   = useState('');
  const [motivo, setMotivo]   = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError]     = useState('');

  const opciones = OPCIONES.filter(o => o.valor !== solicitud.estado);

  async function guardar() {
    setError('');
    if (!estado) { setError('Elige el nuevo estado.'); return; }
    if (!motivo.trim()) { setError('Escribe el motivo del cambio. Le llegará al profesor.'); return; }
    if (solicitud.estado === 'autorizada' && solicitud.ausencia_id &&
        !confirm('Esta formación ya tiene una ausencia registrada. El cambio no la borra: tendrás que revisarla en Gestión de ausencias.\n\n¿Seguir?')) return;
    setEnviando(true);
    try {
      const r = await fetch('/api/formacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cambiar_estado', id: solicitud.id, datos: { estado, motivo: motivo.trim() } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido cambiar');
      setAbierto(false); setEstado(''); setMotivo('');
      onHecho && onHecho(d.aviso ? `✅ Estado cambiado. ${d.aviso}` : '✅ Estado cambiado. Se ha avisado al profesor.');
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} style={{
        marginTop: 8, padding: '6px 12px', borderRadius: 7, border: '1.5px solid #c4b5fd',
        backgroundColor: 'white', color: '#5b21b6', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
      }}>✏️ Cambiar estado</button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 10, backgroundColor: '#faf5ff', borderRadius: 8, border: '1.5px solid #ddd6fe' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#5b21b6', marginBottom: 6 }}>Cambiar estado a:</div>
      <select value={estado} onChange={e => setEstado(e.target.value)} style={{
        width: '100%', padding: '8px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: 13, marginBottom: 8, fontFamily: 'inherit', backgroundColor: 'white',
      }}>
        <option value="">— Elige —</option>
        {opciones.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
      </select>
      <textarea value={motivo} onChange={e => setMotivo(e.target.value)} maxLength={1000}
        placeholder="Motivo del cambio (obligatorio, le llega al profesor)"
        style={{ width: '100%', minHeight: 54, padding: '8px 10px', borderRadius: 7, border: '1.5px solid #d1d5db', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }} />
      {error && <div style={{ fontSize: 12, color: '#991b1b', marginTop: 6, fontWeight: 600 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button disabled={enviando} onClick={guardar} style={{
          flex: 1, padding: '9px 12px', borderRadius: 7, border: 'none', backgroundColor: '#5b21b6', color: 'white',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: enviando ? 0.6 : 1, fontFamily: 'inherit',
        }}>{enviando ? '⏳ Guardando…' : 'Guardar cambio'}</button>
        <button disabled={enviando} onClick={() => { setAbierto(false); setError(''); }} style={{
          padding: '9px 12px', borderRadius: 7, border: '1.5px solid #d1d5db', backgroundColor: 'white', color: '#555',
          fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancelar</button>
      </div>
    </div>
  );
}
