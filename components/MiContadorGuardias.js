'use client';
/**
 * «Llevas X guardias este curso · media de tu sector: Y»
 * Para que cada uno vea que el reparto es justo sin tener que preguntar.
 * Solo su dato y la media: nunca nombres de compañeros.
 */
import { useState, useEffect } from 'react';

export default function MiContadorGuardias() {
  const [d, setD] = useState(null);
  useEffect(() => {
    fetch('/api/guardias/contador').then(r => r.ok ? r.json() : null).then(setD).catch(() => {});
  }, []);
  if (!d?.mio || !d?.sector) return null;
  const { hechas, semanales } = d.mio;
  return (
    <div style={{
      margin: '0 0 12px', padding: '8px 12px', borderRadius: 9, backgroundColor: '#f8fafc',
      border: '1px solid #e2e8f0', fontSize: 12.5, color: '#334155', lineHeight: 1.5,
    }}>
      📊 Llevas <strong>{hechas} {hechas === 1 ? 'guardia fichada' : 'guardias fichadas'}</strong> este curso
      · media de {d.sector.sector}: <strong>{d.sector.media.toString().replace('.', ',')}</strong>
      <span style={{ color: '#94a3b8' }}> · tienes {semanales} {semanales === 1 ? 'hora' : 'horas'} de guardia a la semana</span>
    </div>
  );
}
