'use client';

/**
 * AVISO DE VOTACIÓN
 *
 * Se monta en toda la aplicación. Cuando dirección lanza una votación,
 * salta sobre la pantalla en la que esté el profesor, sin que tenga que
 * ir a buscarla. Se vota ahí mismo.
 *
 * Al agotarse el tiempo se cierra sola y enseña los resultados, para que
 * todo el claustro los vea a la vez.
 */

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const MORADO = '#7e22ce';
const VERDE  = '#166534';

export default function AvisoVotacion() {
  const ruta = usePathname();
  const [votacion, setVotacion] = useState(null);
  const [elegida, setElegida] = useState('');
  const [votando, setVotando] = useState(false);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(Date.now());
  const [cerradoAMano, setCerradoAMano] = useState(null);

  // En la pantalla de votaciones no hace falta: ya está todo allí.
  // Y en el login o el panel de la sala tampoco pinta nada.
  const fuera = !ruta
    || ruta.startsWith('/votaciones')
    || ruta.startsWith('/gestion/votaciones')
    || ruta.startsWith('/login')
    || ruta.startsWith('/sala')
    || ruta === '/';

  // El sondeo se hace siempre, aunque en ese momento no toque enseñar
  // nada. Antes dependía de la ruta, y si alguien abría la aplicación
  // directamente en una pantalla excluida no llegaba a arrancar.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let vivo = true;
    const mirar = () => {
      // Sin sesión no hay nada que mirar, pero se sigue intentando por
      // si acaba de iniciarla en otra pestaña.
      if (!sessionStorage.getItem('profesor_id')) { setVotacion(null); return; }
      fetch('/api/votaciones')
        .then(r => r.ok ? r.json() : { votaciones: [] })
        .then(d => {
          if (!vivo) return;
          const vs = d.votaciones || [];
          // Deja rastro en la consola del navegador: si algún día no
          // salta, aquí se ve si el problema es que no llegan datos o
          // que no hay ninguna abierta.
          if (typeof window !== 'undefined' && window.localStorage?.getItem('depurar_votaciones') === '1') {
            console.log('[votaciones]', vs.length, 'en total ·',
              vs.filter(v => v.abierta).length, 'abiertas ·',
              vs.filter(v => v.abierta && !v.yaVote).length, 'sin votar por mí');
          }
          // Primero, alguna abierta en la que aún no ha votado
          const abierta = vs.find(v => v.abierta && !v.yaVote);
          if (abierta) { setVotacion(abierta); return; }
          // Si no, una que acabe de cerrarse y en la que participó,
          // para que vea los resultados sin buscarlos
          const recien = vs.find(v =>
            v.estado === 'cerrada' && v.yaVote && v.cerrada_at &&
            Date.now() - new Date(v.cerrada_at).getTime() < 120000
          );
          setVotacion(recien || null);
        })
        .catch(() => {});
    };
    mirar();
    // Cada 10 segundos: en un claustro, esperar más se hace largo.
    const t = setInterval(mirar, 10000);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { vivo = false; clearInterval(t); clearInterval(reloj); };
  }, []);

  if (fuera || !votacion) return null;
  if (cerradoAMano === votacion.id) return null;

  const cerrada = votacion.estado === 'cerrada' || !votacion.abierta;

  let restante = null;
  if (votacion.cierre && !cerrada) {
    const falta = new Date(votacion.cierre).getTime() - ahora;
    if (falta > 0) {
      const m = Math.floor(falta / 60000);
      const s = Math.floor((falta % 60000) / 1000);
      restante = { texto: `${m}:${String(s).padStart(2, '0')}`, apurado: falta < 60000 };
    } else {
      restante = { texto: '0:00', apurado: true };
    }
  }

  async function votar() {
    if (!elegida) { setError('Elige una opción'); return; }
    setVotando(true);
    setError('');
    try {
      const r = await fetch('/api/votaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'votar', id: votacion.id, datos: { opcion: elegida } }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setError(e.error || 'No se ha podido registrar el voto');
      } else {
        setVotacion(v => ({ ...v, yaVote: true }));
        setElegida('');
      }
    } catch (e) {
      setError('No se ha podido registrar el voto');
    }
    setVotando(false);
  }

  const total = votacion.totalVotos || 0;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      backgroundColor: 'rgba(15,23,42,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        backgroundColor: 'white', borderRadius: 18, maxWidth: 520, width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)', overflow: 'hidden',
      }}>
        {/* Cabecera */}
        <div style={{
          background: cerrada ? `linear-gradient(135deg, ${VERDE}, #22c55e)` : `linear-gradient(135deg, ${MORADO}, #a855f7)`,
          color: 'white', padding: '22px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 34, marginBottom: 4 }}>🗳️</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.9 }}>
            {cerrada ? 'VOTACIÓN CERRADA' : 'VOTACIÓN EN MARCHA'}
          </div>
          {restante && !cerrada && (
            <div style={{
              marginTop: 10, display: 'inline-block', padding: '5px 18px', borderRadius: 20,
              backgroundColor: restante.apurado ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.2)',
              color: restante.apurado ? '#991b1b' : 'white',
              fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
            }}>
              {restante.texto}
            </div>
          )}
        </div>

        <div style={{ padding: '22px 24px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#222', lineHeight: 1.4, marginBottom: 10 }}>
            {votacion.pregunta}
          </div>
          {votacion.descripcion && !cerrada && (
            <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6, marginBottom: 16 }}>
              {votacion.descripcion}
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 13px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {/* Resultados */}
          {cerrada ? (
            <>
              {(votacion.opciones || []).map(o => {
                const n = votacion.recuento?.[o] || 0;
                const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                return (
                  <div key={o} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: '#333' }}>{o}</span>
                      <span style={{ color: '#666' }}><strong>{n}</strong> · {pct}%</span>
                    </div>
                    <div style={{ height: 11, borderRadius: 6, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: VERDE, borderRadius: 6, transition: 'width .4s' }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 14, textAlign: 'center' }}>
                {total} {total === 1 ? 'voto' : 'votos'} · {votacion.participantes} {votacion.participantes === 1 ? 'participante' : 'participantes'}
              </div>
              <button onClick={() => setCerradoAMano(votacion.id)}
                style={{ width: '100%', marginTop: 16, padding: 13, borderRadius: 10, border: 'none', backgroundColor: '#e2e8f0', color: '#334155', fontWeight: 700, fontSize: 14.5, cursor: 'pointer' }}>
                Cerrar
              </button>
            </>
          ) : votacion.yaVote ? (
            <>
              <div style={{ padding: '16px 18px', borderRadius: 10, backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', fontSize: 14.5, color: VERDE, fontWeight: 700, textAlign: 'center' }}>
                ✅ Tu voto ha quedado registrado
              </div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
                Los resultados aparecerán aquí cuando termine el tiempo.
              </div>
              <button onClick={() => setCerradoAMano(votacion.id)}
                style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>
                Seguir con lo que estaba haciendo
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
                {(votacion.opciones || []).map(o => (
                  <button key={o} onClick={() => setElegida(o)}
                    style={{
                      padding: '14px 16px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                      fontSize: 15, fontWeight: elegida === o ? 800 : 600,
                      border: `2px solid ${elegida === o ? MORADO : '#ddd'}`,
                      backgroundColor: elegida === o ? '#faf5ff' : 'white',
                      color: elegida === o ? MORADO : '#444',
                    }}>
                    {elegida === o ? '🔘' : '⚪'} {o}
                  </button>
                ))}
              </div>
              <button onClick={votar} disabled={votando}
                style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', backgroundColor: MORADO, color: 'white', fontWeight: 800, fontSize: 16, cursor: 'pointer' }}>
                {votando ? 'Enviando...' : '🗳️ Votar'}
              </button>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
                Tu voto es secreto y no se puede modificar una vez enviado
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
