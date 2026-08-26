'use client';

import { useState, useEffect } from 'react';

/**
 * VALORACIÓN DEL PORTAL
 *
 * Una sola pregunta, sobre APrieto en conjunto, a los 15 días de que la
 * persona se diera de alta. Ni antes (aún no lo conoce) ni por cada
 * módulo (con diez módulos serían diez encuestas y nadie contestaría
 * la tercera en serio).
 *
 * Si dice que lo mejoraría, se le pregunta EN QUÉ PARTE con un
 * desplegable: sin eso, un "va lento" no se puede arreglar.
 *
 * El nombre solo se guarda si marca que quiere que le contacten. Quien
 * teme que su crítica llegue con nombre y apellidos al director acaba
 * pulsando "me ayuda" y callándose, y entonces esto no sirve de nada.
 */

const PARTES = [
  { id: 'general',        emoji: '📱', texto: 'En general, el portal entero' },
  { id: 'guardias',       emoji: '🛡️', texto: 'Guardias' },
  { id: 'ausencias',      emoji: '🏥', texto: 'Notificar una ausencia' },
  { id: 'dld',            emoji: '📄', texto: 'Días de libre disposición' },
  { id: 'autorizaciones', emoji: '📋', texto: 'Autorizaciones del alumnado' },
  { id: 'actividades',    emoji: '🎒', texto: 'Actividades complementarias' },
  { id: 'calendario',     emoji: '📆', texto: 'Calendario escolar' },
  { id: 'mantenimiento',  emoji: '🔧', texto: 'Mantenimiento' },
  { id: 'limpieza',       emoji: '🧹', texto: 'Incidencias de limpieza' },
  { id: 'compras',        emoji: '🛒', texto: 'Solicitudes de compra' },
  { id: 'entrar',         emoji: '🔑', texto: 'Entrar / la contraseña' },
  { id: 'movil',          emoji: '📲', texto: 'Cómo se ve en el móvil' },
];

export default function ValoracionModulo() {
  const [toca, setToca] = useState(false);
  const [elegida, setElegida] = useState(null);
  const [parte, setParte] = useState('general');
  const [sugerencia, setSugerencia] = useState('');
  const [contacto, setContacto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gracias, setGracias] = useState(false);

  useEffect(() => {
    fetch('/api/valoraciones')
      .then(r => r.json())
      .then(d => setToca(!!d.preguntar))
      .catch(e => console.warn('No se pudo comprobar la valoración:', e));
  }, []);

  async function enviar() {
    if (!elegida) return;
    setEnviando(true);
    try {
      const r = await fetch('/api/valoraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valoracion: elegida,
          parte: elegida === 'ayuda' ? 'general' : parte,
          sugerencia: sugerencia.trim() || null,
          quiereContacto: contacto,
        }),
      });
      if (r.ok) setGracias(true); else setToca(false);
    } catch (e) { setToca(false); }
    setEnviando(false);
  }

  if (!toca) return null;

  if (gracias) {
    return (
      <div style={{ ...caja, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
        ✅ <strong>Gracias.</strong> Tu opinión llega al director y al secretario,
        y de ahí salen las mejoras del portal.
      </div>
    );
  }

  const pideDetalle = elegida === 'mejorable' || elegida === 'no_sirve';

  return (
    <div style={caja}>
      <div style={{ fontWeight: 800, fontSize: 16, color: '#1e3a5f', marginBottom: 4 }}>
        💬 ¿Qué tal te va APrieto?
      </div>
      <div style={{ fontSize: 13.5, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
        Llevas unos días usándolo. Un toque y seguimos: nos ayuda a decidir qué mejorar.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { id: 'ayuda',     emoji: '😀', texto: 'Me ayuda',     color: '#166534', bg: '#dcfce7', bd: '#86efac' },
          { id: 'mejorable', emoji: '🔧', texto: 'Lo mejoraría', color: '#92400e', bg: '#fef3c7', bd: '#fcd34d' },
          { id: 'no_sirve',  emoji: '🙁', texto: 'No me sirve',  color: '#991b1b', bg: '#fee2e2', bd: '#fca5a5' },
        ].map(op => (
          <button key={op.id} onClick={() => setElegida(op.id)}
            style={{
              flex: '1 1 140px', padding: '14px 10px', borderRadius: 12, cursor: 'pointer',
              border: `2.5px solid ${elegida === op.id ? op.color : op.bd}`,
              backgroundColor: elegida === op.id ? op.bg : 'white',
              color: op.color, fontWeight: 700, fontSize: 14,
              transform: elegida === op.id ? 'scale(1.03)' : 'none',
              transition: 'transform .12s',
            }}>
            <div style={{ fontSize: 30, marginBottom: 4 }}>{op.emoji}</div>
            {op.texto}
          </button>
        ))}
      </div>

      {pideDetalle && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#333', marginBottom: 7 }}>
            ¿En qué parte?
          </div>
          <select value={parte} onChange={e => setParte(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 15,
              border: '1.5px solid #ddd', backgroundColor: 'white', marginBottom: 14,
              fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
            }}>
            {PARTES.map(p => (
              <option key={p.id} value={p.id}>{p.emoji}  {p.texto}</option>
            ))}
          </select>

          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#333', marginBottom: 7 }}>
            {elegida === 'mejorable' ? '¿Qué cambiarías?' : '¿Qué es lo que no te encaja?'}
          </div>
          <textarea value={sugerencia} onChange={e => setSugerencia(e.target.value)} rows={3}
            placeholder="Con tus palabras. Cuanto más concreto, más fácil de arreglar."
            style={{
              width: '100%', padding: '11px 13px', borderRadius: 10, fontSize: 14.5,
              border: '1.5px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
            }} />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginTop: 12, fontSize: 13, color: '#555', cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={contacto} onChange={e => setContacto(e.target.checked)}
              style={{ marginTop: 2, width: 17, height: 17, cursor: 'pointer' }} />
            <span>
              Quiero que puedan contactar conmigo para aclararlo.
              <br />
              <span style={{ color: '#999' }}>Si no lo marcas, llega sin tu nombre.</span>
            </span>
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={enviar} disabled={!elegida || enviando}
          style={{
            padding: '12px 26px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 15,
            backgroundColor: !elegida || enviando ? '#cbd5e1' : '#1e3a5f',
            color: 'white', cursor: !elegida || enviando ? 'default' : 'pointer',
          }}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
        <button onClick={() => setToca(false)}
          style={{ padding: '12px 16px', borderRadius: 10, border: 'none', backgroundColor: 'transparent', color: '#999', fontSize: 13.5, cursor: 'pointer' }}>
          Ahora no
        </button>
      </div>
    </div>
  );
}

const caja = {
  backgroundColor: 'white',
  border: '1.5px solid #dbeafe',
  borderRadius: 14,
  padding: '18px 20px',
  marginBottom: 18,
  boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
  fontFamily: 'system-ui, sans-serif',
};
