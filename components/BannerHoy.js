'use client';
/**
 * BANNER «HOY» — arriba del panel del profesor
 *
 * Lo que le toca hoy, calculado solo (ver /api/hoy): guardias sin fichar
 * con su horario de fichaje, su recreo, y reuniones de su horario. Cada
 * línea se va sola cuando ya no aplica. Si no hay nada, no se muestra.
 */
import { useState, useEffect } from 'react';

const ICONO = { guardia: '🛡️', recreo: '☕', reunion: '👥', aviso: '📢' };
const azul = '#1e3a5f';

export default function BannerHoy() {
  const [lineas, setLineas] = useState([]);

  useEffect(() => {
    let vivo = true;
    const cargar = () => fetch('/api/hoy').then(r => r.ok ? r.json() : { lineas: [] })
      .then(d => { if (vivo) setLineas(d.lineas || []); }).catch(() => {});
    cargar();
    // Se refresca cada 5 minutos: lo fichado o lo pasado desaparece
    const t = setInterval(cargar, 5 * 60 * 1000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (!lineas.length) return null;

  return (
    <div style={{ backgroundColor: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: azul, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Hoy</div>
      {lineas.map((l, i) => {
        const contenido = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 8, marginBottom: 3,
            backgroundColor: l.ahora ? '#fef3c7' : 'white', border: `1px solid ${l.ahora ? '#fcd34d' : '#dbeafe'}` }}>
            <span style={{ fontSize: 17 }}>{ICONO[l.tipo] || '•'}</span>
            <span style={{ flex: 1, fontSize: 13.5, color: '#1e293b', fontWeight: l.ahora || l.tipo === 'aviso' ? 700 : 500 }}>
              {l.texto}
              {l.detalle && <span style={{ display: 'block', fontWeight: 400, fontSize: 12.5, color: '#475569', marginTop: 2 }}>{l.detalle}</span>}
            </span>
            {l.ahora && <span style={{ fontSize: 11, fontWeight: 800, color: '#92400e' }}>AHORA</span>}
            {l.enlace && <span style={{ fontSize: 14, color: '#64748b' }}>›</span>}
          </div>
        );
        return l.enlace
          ? <a key={i} href={l.enlace} style={{ textDecoration: 'none' }}>{contenido}</a>
          : <div key={i}>{contenido}</div>;
      })}
    </div>
  );
}
