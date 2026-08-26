'use client';

import { useState, useEffect } from 'react';

/**
 * VALORACIÓN DE UN MÓDULO EN PRUEBA
 *
 * Se coloca dentro de cada módulo que esté a prueba. Al abrirse la
 * pantalla pregunta al servidor si a esta persona le toca valorar; si no
 * le toca, no pinta nada y no molesta.
 *
 * Uso:  <ValoracionModulo modulo="guardias" />
 */
export default function ValoracionModulo({ modulo }) {
  const [pregunta, setPregunta] = useState(null);   // null = no toca
  const [elegida, setElegida] = useState(null);
  const [sugerencia, setSugerencia] = useState('');
  const [contacto, setContacto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gracias, setGracias] = useState(false);

  useEffect(() => {
    if (!modulo) return;
    fetch(`/api/valoraciones?modulo=${encodeURIComponent(modulo)}`)
      .then(r => r.json())
      .then(d => { if (d.preguntar) setPregunta(d); })
      .catch(e => console.warn('No se pudo comprobar la valoración:', e));
  }, [modulo]);

  async function enviar() {
    if (!elegida) return;
    setEnviando(true);
    try {
      const r = await fetch('/api/valoraciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modulo,
          valoracion: elegida,
          sugerencia: sugerencia.trim() || null,
          quiereContacto: contacto,
          tipo: pregunta.preguntar,
        }),
      });
      if (r.ok) setGracias(true);
      else setPregunta(null);   // si falla, mejor no insistir
    } catch (e) {
      setPregunta(null);
    }
    setEnviando(false);
  }

  if (!pregunta) return null;

  if (gracias) {
    return (
      <div style={{ ...caja, backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', color: '#166534' }}>
        ✅ <strong>Gracias.</strong> Tu opinión llega al equipo directivo y ayuda a decidir
        si este módulo se queda como está, se mejora o se retira.
      </div>
    );
  }

  const esFinal = pregunta.preguntar === 'encuesta_final';

  return (
    <div style={caja}>
      <div style={{ fontWeight: 800, fontSize: 15, color: '#1e3a5f', marginBottom: 4 }}>
        {esFinal ? '📋 Han pasado los 15 días de prueba' : '💬 ¿Qué te parece?'}
      </div>
      <div style={{ fontSize: 13.5, color: '#555', marginBottom: 14, lineHeight: 1.6 }}>
        {esFinal
          ? `Estamos decidiendo si ${pregunta.nombre} se queda en el portal. Tu respuesta cuenta.`
          : `${pregunta.nombre} está en periodo de prueba. Un toque y seguimos.`}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { id: 'ayuda',     emoji: '😀', texto: 'Me ayuda',    color: '#166534', bg: '#dcfce7', bd: '#86efac' },
          { id: 'mejorable', emoji: '🔧', texto: 'Lo mejoraría', color: '#92400e', bg: '#fef3c7', bd: '#fcd34d' },
          { id: 'no_sirve',  emoji: '🙁', texto: 'No me sirve',  color: '#991b1b', bg: '#fee2e2', bd: '#fca5a5' },
        ].map(op => (
          <button key={op.id} onClick={() => setElegida(op.id)}
            style={{
              flex: '1 1 130px', padding: '12px 10px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${elegida === op.id ? op.color : op.bd}`,
              backgroundColor: elegida === op.id ? op.bg : 'white',
              color: op.color, fontWeight: 700, fontSize: 13.5,
            }}>
            <div style={{ fontSize: 22, marginBottom: 2 }}>{op.emoji}</div>
            {op.texto}
          </button>
        ))}
      </div>

      {/* El campo de texto solo aparece cuando hace falta */}
      {(elegida === 'mejorable' || elegida === 'no_sirve') && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#333', marginBottom: 6 }}>
            {elegida === 'mejorable' ? '¿Qué cambiarías?' : '¿Qué es lo que no te encaja?'}
          </div>
          <textarea
            value={sugerencia}
            onChange={e => setSugerencia(e.target.value)}
            rows={3}
            placeholder="Cuéntalo con tus palabras. Cuanto más concreto, más fácil de arreglar."
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
              border: '1.5px solid #ddd', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical',
            }}
          />

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12.5, color: '#555', cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={contacto} onChange={e => setContacto(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer' }} />
            <span>
              Quiero que el equipo directivo pueda contactar conmigo para aclarar esto.
              <br />
              <span style={{ color: '#888' }}>
                Si no lo marcas, tu respuesta llega sin tu nombre.
              </span>
            </span>
          </label>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={enviar} disabled={!elegida || enviando}
          style={{
            padding: '10px 22px', borderRadius: 9, border: 'none', fontWeight: 700, fontSize: 14,
            backgroundColor: !elegida || enviando ? '#cbd5e1' : '#1e3a5f',
            color: 'white', cursor: !elegida || enviando ? 'default' : 'pointer',
          }}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
        <button onClick={() => setPregunta(null)}
          style={{ padding: '10px 16px', borderRadius: 9, border: 'none', backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer' }}>
          Ahora no
        </button>
      </div>
    </div>
  );
}

const caja = {
  backgroundColor: 'white',
  border: '1.5px solid #dbeafe',
  borderRadius: 12,
  padding: '16px 18px',
  marginBottom: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  fontFamily: 'system-ui, sans-serif',
};
