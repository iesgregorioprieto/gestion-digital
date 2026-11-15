"use client";

/**
 * PANEL DE ENERGÍA DE LA SALA DE PROFESORES
 *
 * Producción solar, red y consumo del centro, tal como los manda Home
 * Assistant a /api/energia. Diseño de José María (energia-widget.html),
 * pasado a componente. No hace llamadas propias: los datos llegan con
 * la recarga normal de la sala (/api/sala), para no gastar más Vercel.
 *
 * datos = { recibido, ts, ahora: { solar, red, consumo }, hoy: { solar, importada, exportada, consumo } }
 *   potencias en W; energía del día en kWh; red > 0 importa, < 0 exporta.
 */

// La sala recarga cada 2-10 minutos: se da margen antes de decir «sin datos».
const CADUCIDAD_MIN = 15;
const UMBRAL_W = 50;               // por debajo de 50 W no se anima el flujo
const CIRC = 2 * Math.PI * 38;     // perímetro del anillo del Centro

const fkw = w => ((w || 0) / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kW';
const fkwh = v => Number(v || 0).toLocaleString('es-ES', { maximumFractionDigits: v < 100 ? 1 : 0 });

function Flujo({ id, color, d, w }) {
  const activo = w > UMBRAL_W;
  // más potencia = punto más rápido (entre 1 y 6 s)
  const dur = activo ? Math.max(1, Math.min(6, 6 - Math.log10(w) * 1.2)).toFixed(1) + 's' : '3s';
  return (
    <>
      <path id={id} d={d} fill="none" stroke={color} strokeWidth={2} opacity={activo ? 0.9 : 0.2} />
      {activo && (
        <circle r={4} fill={color}>
          <animateMotion dur={dur} repeatCount="indefinite"><mpath href={'#' + id} /></animateMotion>
        </circle>
      )}
    </>
  );
}

export default function EnergiaSala({ datos, ahora = new Date() }) {
  if (!datos) return null;
  const a = datos.ahora || {}, h = datos.hoy || {};
  const solar = a.solar || 0, red = a.red || 0, consumo = a.consumo || 0;

  const exporta = red < 0 ? -red : 0;
  const total = h.consumo || 0;
  const fSolar = total > 0 ? Math.min(Math.max(((h.solar || 0) - (h.exportada || 0)) / total, 0), 1) : 0;

  const momento = datos.recibido || datos.ts;
  const edadMin = momento ? (ahora.getTime() - new Date(momento).getTime()) / 60000 : Infinity;
  const caducado = !(edadMin <= CADUCIDAD_MIN);

  const lbl = { fontSize: 12, fill: '#9fb0c3', textAnchor: 'middle' };
  const kwS = { fontSize: 17, fontWeight: 700, fill: '#ffffff', textAnchor: 'middle' };
  const kwhS = { fontSize: 10.5, fill: '#c8d3df', textAnchor: 'middle' };
  const ico = { fontSize: 15, textAnchor: 'middle' };

  return (
    <div style={{ flexShrink: 0, width: 300, position: 'relative', background: '#0f172a',
      borderRadius: 12, border: '1px solid #334155', padding: '6px 10px', display: 'flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', right: 10, top: 6, fontSize: 11, color: caducado ? '#ff6b6b' : '#9fb0c3' }}>
        {caducado ? 'sin datos' : new Date(momento).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <svg viewBox="0 0 340 195" role="img" aria-label="Energía del centro"
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', opacity: caducado ? 0.35 : 1 }}>
        {!caducado && (
          <>
            <Flujo id="ew-p-solar-centro" color="#f5a623" d="M170,95 V112 Q170,128 186,128 H247" w={Math.max(solar - exporta, 0)} />
            <Flujo id="ew-p-solar-red" color="#b07cff" d="M160,95 V112 Q160,128 144,128 H93" w={exporta} />
            <Flujo id="ew-p-red-centro" color="#4ea1ff" d="M93,146 H247" w={red > 0 ? red : 0} />
          </>
        )}

        {/* Solar */}
        <text style={lbl} x="165" y="11">Solar</text>
        <circle cx="165" cy="57" r="38" fill="#14233a" stroke="#f5a623" strokeWidth={3} />
        <text style={ico} x="165" y="44">☀️</text>
        <text style={kwS} x="165" y="64">{fkw(solar)}</text>
        <text style={kwhS} x="165" y="79">{fkwh(h.solar)} kWh hoy</text>

        {/* Red */}
        <circle cx="55" cy="137" r="38" fill="#14233a" stroke="#4ea1ff" strokeWidth={3} />
        <text style={ico} x="55" y="122">⚡</text>
        <text style={kwS} x="55" y="142">{fkw(Math.abs(red))}</text>
        <text style={kwhS} x="55" y="157">{'→' + fkwh(h.importada) + '  ←' + fkwh(h.exportada)}</text>
        <text style={lbl} x="55" y="191">Red</text>

        {/* Centro: anillo con el reparto solar / red del día */}
        <circle cx="285" cy="137" r="38" fill="#14233a" stroke="#1f3352" strokeWidth={3} />
        <circle cx="285" cy="137" r="38" fill="none" stroke="#4ea1ff" strokeWidth={4}
          transform="rotate(-90 285 137)" strokeDasharray={`${CIRC} 0`} />
        <circle cx="285" cy="137" r="38" fill="none" stroke="#f5a623" strokeWidth={4}
          transform="rotate(-90 285 137)" strokeDasharray={`${fSolar * CIRC} ${CIRC}`} />
        <text style={ico} x="285" y="122">🏫</text>
        <text style={kwS} x="285" y="142">{fkw(consumo)}</text>
        <text style={kwhS} x="285" y="157">{fkwh(h.consumo)} kWh hoy</text>
        <text style={lbl} x="285" y="191">Centro</text>
      </svg>
    </div>
  );
}
