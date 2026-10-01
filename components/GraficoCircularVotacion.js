/**
 * GRÁFICO CIRCULAR DE UNA VOTACIÓN CERRADA
 *
 * El mismo tipo de donut que ya se ve en el tablero de proyección,
 * pero en tamaño compacto para usarlo dentro de una tarjeta. Solo
 * tiene sentido con la votación ya cerrada: antes de eso no hay
 * recuento que enseñar.
 */

const AZUL = '#1e3a5f';

// Paleta de reserva, para opciones que no son sí/no/abstención
const PALETA = ['#2563eb', '#7c3aed', '#c2410c', '#0891b2', '#be123c', '#4d7c0f'];

function colorOpcion(opcion, indice) {
  const t = (opcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if (t === 'si' || t.startsWith('si,') || t.startsWith('a favor') || t.startsWith('aprob')) return '#16a34a';
  if (t === 'no' || t.startsWith('no,') || t.startsWith('en contra') || t.startsWith('rechaz')) return '#dc2626';
  if (t.startsWith('absten') || t.startsWith('ns') || t.startsWith('no sabe') || t.startsWith('blanco')) return '#94a3b8';
  return PALETA[indice % PALETA.length];
}

function punto(cx, cy, r, grados) {
  const rad = (grados - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function porcion(cx, cy, rExt, rInt, desde, hasta) {
  if (hasta - desde >= 359.999) {
    return `M ${cx} ${cy - rExt} A ${rExt} ${rExt} 0 1 1 ${cx - 0.01} ${cy - rExt} Z`
         + `M ${cx} ${cy - rInt} A ${rInt} ${rInt} 0 1 0 ${cx - 0.01} ${cy - rInt} Z`;
  }
  const [x1, y1] = punto(cx, cy, rExt, desde);
  const [x2, y2] = punto(cx, cy, rExt, hasta);
  const [x3, y3] = punto(cx, cy, rInt, hasta);
  const [x4, y4] = punto(cx, cy, rInt, desde);
  const grande = hasta - desde > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rExt} ${rExt} 0 ${grande} 1 ${x2} ${y2} `
       + `L ${x3} ${y3} A ${rInt} ${rInt} 0 ${grande} 0 ${x4} ${y4} Z`;
}

/**
 * props:
 *  - opciones: ["Sí", "No", ...]
 *  - recuento: { "Sí": 5, "No": 1 }
 *  - size: diámetro en px (por defecto 150, compacto para una tarjeta)
 */
export default function GraficoCircularVotacion({ opciones, recuento, size = 150 }) {
  const total = Object.values(recuento || {}).reduce((a, b) => a + b, 0);
  let angulo = 0;
  const porciones = (opciones || []).map((o, i) => {
    const n = recuento?.[o] || 0;
    const grados = total > 0 ? (n / total) * 360 : 0;
    const trozo = { opcion: o, n, desde: angulo, hasta: angulo + grados, color: colorOpcion(o, i),
      pct: total > 0 ? Math.round((n / total) * 100) : 0 };
    angulo += grados;
    return trozo;
  });

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg viewBox="0 0 240 240" style={{ width: size, height: size, flexShrink: 0 }}>
        {porciones.filter(t => t.n > 0).map(t => (
          <path key={t.opcion} d={porcion(120, 120, 108, 58, t.desde, t.hasta)}
            fill={t.color} stroke="white" strokeWidth="2.5" />
        ))}
        <text x="120" y="114" textAnchor="middle" style={{ fontSize: 38, fontWeight: 800, fill: AZUL }}>{total}</text>
        <text x="120" y="138" textAnchor="middle" style={{ fontSize: 13, fill: '#64748b' }}>{total === 1 ? 'voto' : 'votos'}</text>
      </svg>
      <div style={{ flex: '1 1 160px', minWidth: 140 }}>
        {porciones.map(t => (
          <div key={t.opcion} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 13, height: 13, borderRadius: 4, backgroundColor: t.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#333', flex: 1 }}>{t.opcion}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: AZUL }}>{t.n}</span>
            <span style={{ fontSize: 11.5, color: '#64748b', width: 38, textAlign: 'right' }}>{t.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
