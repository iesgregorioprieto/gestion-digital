'use client';

/**
 * AVISO DE COMUNICACIONES
 *
 * Se monta en toda la aplicación. Cuando dirección publica un aviso o
 * una convocatoria, salta sobre la pantalla en la que esté el profesor
 * y no le deja seguir hasta que responde.
 *
 * Solo salta a quien va dirigida: eso lo decide el servidor, no esta
 * pantalla. Aquí solo se muestra lo que llega.
 */

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const AZUL   = '#1e3a5f';
const VERDE  = '#166534';
const ROJO   = '#991b1b';
const NARANJA= '#b45309';

export default function AvisoComunicacion() {
  const ruta = usePathname();
  const [pendiente, setPendiente] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(Date.now());

  const fuera = !ruta || ruta.startsWith('/login') || ruta.startsWith('/sala') || ruta === '/';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let vivo = true;

    const mirar = () => {
      if (!sessionStorage.getItem('profesor_id')) { setPendiente(null); return; }
      fetch('/api/comunicaciones')
        .then(r => r.ok ? r.json() : { comunicaciones: [] })
        .then(d => {
          if (!vivo) return;
          const cs = (d.comunicaciones || []).filter(c => c.estado !== 'cerrada');

          // Primero lo que exige respuesta ahora mismo: un fichaje abierto
          const fichando = cs.find(c => c.fichajeAbierto && !c.miRespuesta?.fichado_at);
          if (fichando) { setPendiente(fichando); return; }

          // Después, lo que aún no ha contestado
          const sinContestar = cs.find(c =>
            c.tipo === 'convocatoria'
              ? (c.miRespuesta?.asistira === null || c.miRespuesta?.asistira === undefined)
              : !c.miRespuesta?.leida_at
          );
          setPendiente(sinContestar || null);
        })
        .catch(() => {});
    };
    mirar();
    const t = setInterval(mirar, 20000);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, []);

  if (fuera || !pendiente) return null;

  const c = pendiente;
  const esConvocatoria = c.tipo === 'convocatoria';
  const tocaFichar = c.fichajeAbierto && !c.miRespuesta?.fichado_at;

  let restante = null;
  if (tocaFichar && c.fichajeCierre) {
    const falta = new Date(c.fichajeCierre).getTime() - ahora;
    const m = Math.max(0, Math.floor(falta / 60000));
    const s = Math.max(0, Math.floor((falta % 60000) / 1000));
    restante = { texto: `${m}:${String(s).padStart(2, '0')}`, apurado: falta < 60000 };
  }

  async function responder(accion, extra) {
    setEnviando(true);
    setError('');
    try {
      const r = await fetch('/api/comunicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, id: c.id, datos: extra || {} }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || 'No se ha podido guardar');
      } else {
        setPendiente(null);
      }
    } catch (e) {
      setError('No se ha podido guardar. Comprueba la conexión.');
    }
    setEnviando(false);
  }

  const fechaTexto = c.fecha_reunion
    ? new Date(c.fecha_reunion + 'T12:00:00').toLocaleDateString('es-ES',
        { weekday: 'long', day: 'numeric', month: 'long' })
    : '';

  const cabecera = tocaFichar
    ? { fondo: `linear-gradient(135deg, ${VERDE}, #22c55e)`, etiqueta: 'CONTROL DE ASISTENCIA', icono: '✋' }
    : esConvocatoria
      ? { fondo: `linear-gradient(135deg, ${AZUL}, #2563eb)`, etiqueta: 'CONVOCATORIA', icono: '📅' }
      : { fondo: `linear-gradient(135deg, ${NARANJA}, #f59e0b)`, etiqueta: 'AVISO', icono: '📢' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      backgroundColor: 'rgba(15,23,42,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 18, maxWidth: 540, width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.4)', overflow: 'hidden',
      }}>
        <div style={{ background: cabecera.fondo, color: 'white', padding: '22px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 34, marginBottom: 4 }}>{cabecera.icono}</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.9 }}>
            {cabecera.etiqueta}
          </div>
          {restante && (
            <div style={{
              marginTop: 10, display: 'inline-block', padding: '5px 18px', borderRadius: 20,
              backgroundColor: restante.apurado ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)',
              color: restante.apurado ? ROJO : 'white',
              fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            }}>
              {restante.texto}
            </div>
          )}
        </div>

        <div style={{ padding: '22px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#222', lineHeight: 1.4, marginBottom: 10 }}>
            {c.titulo}
          </div>

          <div style={{ fontSize: 14, color: '#444', lineHeight: 1.65, marginBottom: 16, whiteSpace: 'pre-wrap' }}>
            {c.mensaje}
          </div>

          {esConvocatoria && (c.fecha_reunion || c.hora_reunion || c.lugar) && (
            <div style={{ padding: '13px 15px', borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 16, fontSize: 13.5, lineHeight: 1.8 }}>
              {fechaTexto && <div style={{ textTransform: 'capitalize' }}>📅 <strong>{fechaTexto}</strong></div>}
              {c.hora_reunion && <div>🕗 {c.hora_reunion}</div>}
              {c.lugar && <div>📍 {c.lugar}</div>}
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 13px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', color: ROJO, fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Fichaje en marcha */}
          {tocaFichar ? (
            <>
              <button onClick={() => responder('fichar')} disabled={enviando}
                style={{ width: '100%', padding: 17, borderRadius: 12, border: 'none',
                  backgroundColor: VERDE, color: 'white', fontWeight: 800, fontSize: 17, cursor: 'pointer' }}>
                {enviando ? 'Registrando...' : '✋ Estoy aquí'}
              </button>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
                Queda constancia de tu asistencia a la reunión
              </div>
            </>
          ) : esConvocatoria ? (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: AZUL, marginBottom: 10, textAlign: 'center' }}>
                ¿Vas a asistir?
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button onClick={() => responder('asistencia', { asistira: true })} disabled={enviando}
                  style={{ flex: 1, padding: 15, borderRadius: 11, border: 'none', backgroundColor: VERDE,
                    color: 'white', fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
                  ✅ Sí, asistiré
                </button>
                <button onClick={() => responder('asistencia', { asistira: false })} disabled={enviando}
                  style={{ flex: 1, padding: 15, borderRadius: 11, border: `2px solid ${ROJO}`, backgroundColor: 'white',
                    color: ROJO, fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
                  No podré
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 11, textAlign: 'center', lineHeight: 1.5 }}>
                Puedes cambiarlo más adelante desde el aviso
              </div>
            </>
          ) : (
            <>
              <button onClick={() => responder('leida')} disabled={enviando}
                style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', backgroundColor: AZUL,
                  color: 'white', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
                {enviando ? 'Guardando...' : '👍 Enterado'}
              </button>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
                Queda constancia de que lo has leído
              </div>
            </>
          )}

          {c.creada_por && (
            <div style={{ fontSize: 11.5, color: '#cbd5e1', marginTop: 14, textAlign: 'center' }}>
              {c.creada_por}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
