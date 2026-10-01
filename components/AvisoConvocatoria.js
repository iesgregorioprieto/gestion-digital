'use client';

/**
 * AVISO DE CONVOCATORIAS
 *
 * Se monta en toda la aplicación, igual que AvisoComunicacion, y mira
 * una sola vez al abrir: si hay algo pendiente para quien tiene la
 * sesión —confirmar si asistirá, fichar su presencia o votar— salta a
 * pantalla completa y no se puede cerrar sin responder. El push ya
 * avisa al móvil en el momento; esto es para quien ya tiene la app
 * abierta o la abre durante la ventana.
 *
 * Orden de prioridad si hubiera varias cosas pendientes a la vez:
 * votar > fichar > confirmar asistencia. Lo más urgente primero.
 */

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const AZUL = '#1e3a5f';
const VERDE = '#166534';
const MORADO = '#7e22ce';
const ROJO = '#991b1b';

export default function AvisoConvocatoria() {
  const ruta = usePathname();
  const [c, setC] = useState(null);
  const [votando, setVotando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  const fuera = !ruta || ruta.startsWith('/gestion') || ruta.startsWith('/login') || ruta.startsWith('/sala') || ruta === '/';

  useEffect(() => {
    if (typeof window === 'undefined' || fuera) return;
    if (!sessionStorage.getItem('profesor_id')) return;
    let vivo = true;

    fetch('/api/convocatorias?modo=mias')
      .then(r => r.ok ? r.json() : { convocatorias: [] })
      .then(d => {
        if (!vivo) return;
        const lista = d.convocatorias || [];
        const cand =
          lista.find(x => x.votacion && !x.votacion.yaVote) ||
          lista.find(x => x.fichajeAbierto && !x.fichado) ||
          lista.find(x => x.estado === 'convocada' && x.asistira === null);
        setC(cand || null);
      })
      .catch(() => {});

    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { vivo = false; clearInterval(reloj); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  // Avisa a la pestaña de «Pendientes» para que se actualice en el acto,
  // sin esperar a la próxima vez que se abra la aplicación.
  function avisarResuelto() {
    try { sessionStorage.removeItem('recordatorios_pendientes'); } catch {}
    window.dispatchEvent(new Event('recordatorios:actualizar'));
  }

  if (fuera || !c) return null;

  const tocaVotar = c.votacion && !c.votacion.yaVote;
  const tocaFichar = !tocaVotar && c.fichajeAbierto && !c.fichado;
  const tocaResponder = !tocaVotar && !tocaFichar && c.estado === 'convocada' && c.asistira === null;
  if (!tocaVotar && !tocaFichar && !tocaResponder) return null;

  async function fichar() {
    setEnviando(true);
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'fichar', datos: { id: c.id } }),
    });
    if (r.ok) { setC(x => ({ ...x, fichado: true })); avisarResuelto(); }
    setEnviando(false);
  }

  async function votar() {
    if (!votando) return;
    setEnviando(true);
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'votar', datos: { votacion_id: c.votacion.id, opcion: votando } }),
    });
    if (r.ok) { setC(x => ({ ...x, votacion: { ...x.votacion, yaVote: true } })); avisarResuelto(); }
    setEnviando(false);
  }

  async function responder(asistira) {
    setEnviando(true);
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'responder', datos: { id: c.id, asistira } }),
    });
    if (r.ok) { setC(x => ({ ...x, asistira })); avisarResuelto(); }
    setEnviando(false);
  }

  let restante = null;
  const limite = tocaVotar ? c.votacion.cierre_at : tocaFichar ? c.fichaje_fin : null;
  if (limite) {
    const falta = new Date(limite).getTime() - ahora;
    const m = Math.max(0, Math.floor(falta / 60000)), s = Math.max(0, Math.floor((falta % 60000) / 1000));
    restante = { texto: `${m}:${String(s).padStart(2, '0')}`, apurado: falta < 60000 };
  }

  const color = tocaVotar ? MORADO : VERDE;
  const cabecera = tocaVotar
    ? { icono: '🗳️', etiqueta: 'VOTACIÓN EN MARCHA' }
    : tocaFichar
    ? { icono: '✋', etiqueta: 'CONTROL DE ASISTENCIA' }
    : { icono: '📅', etiqueta: 'CONVOCATORIA' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9997, backgroundColor: 'rgba(15,23,42,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 18, maxWidth: 480, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg, ${color}, ${tocaVotar ? '#a855f7' : tocaFichar ? '#22c55e' : '#2563eb'})`,
          color: 'white', padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>{cabecera.icono}</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.9 }}>{cabecera.etiqueta}</div>
          {restante && (
            <div style={{ marginTop: 9, display: 'inline-block', padding: '5px 18px', borderRadius: 20,
              backgroundColor: restante.apurado ? 'white' : 'rgba(255,255,255,0.2)', color: restante.apurado ? ROJO : 'white',
              fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {restante.texto}
            </div>
          )}
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#222', marginBottom: tocaResponder ? 4 : 6 }}>{c.titulo}</div>
          {tocaResponder && (c.fecha || c.lugar) && (
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              {c.fecha && new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              {c.hora ? ` · ${c.hora}` : ''}{c.lugar ? ` · ${c.lugar}` : ''}
            </div>
          )}

          {tocaVotar && (
            <>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#222', marginBottom: 12 }}>{c.votacion.pregunta}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(c.votacion.opciones || []).map(o => (
                  <button key={o} onClick={() => setVotando(o)} disabled={enviando}
                    style={{ padding: '12px 15px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
                      border: `2px solid ${votando === o ? MORADO : '#e9d5ff'}`, backgroundColor: votando === o ? '#f3e8ff' : 'white', color: '#333' }}>
                    {votando === o ? '◉ ' : '○ '}{o}
                  </button>
                ))}
              </div>
              <button onClick={votar} disabled={!votando || enviando}
                style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', backgroundColor: MORADO, color: 'white',
                  fontWeight: 800, fontSize: 15.5, cursor: 'pointer', opacity: votando ? 1 : 0.5 }}>
                {enviando ? 'Enviando...' : 'Votar'}
              </button>
            </>
          )}

          {tocaFichar && (
            <>
              <button onClick={fichar} disabled={enviando}
                style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', backgroundColor: VERDE, color: 'white',
                  fontWeight: 800, fontSize: 17, cursor: 'pointer' }}>
                {enviando ? 'Registrando...' : '✋ Estoy aquí'}
              </button>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>Queda constancia de tu asistencia a la reunión</div>
            </>
          )}

          {tocaResponder && (
            <>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: AZUL, marginBottom: 10, textAlign: 'center' }}>¿Vas a asistir?</div>
              <div style={{ display: 'flex', gap: 9 }}>
                <button onClick={() => responder(true)} disabled={enviando}
                  style={{ flex: 1, padding: 15, borderRadius: 11, border: 'none', backgroundColor: VERDE, color: 'white',
                    fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
                  ✅ Sí, asistiré
                </button>
                <button onClick={() => responder(false)} disabled={enviando}
                  style={{ flex: 1, padding: 15, borderRadius: 11, border: `2px solid ${ROJO}`, backgroundColor: 'white', color: ROJO,
                    fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
                  No podré
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 11, textAlign: 'center' }}>Puedes cambiarlo más adelante desde «Convocatorias»</div>
            </>
          )}

          <a href="/convocatorias" style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 12.5, color: '#94a3b8' }}>Ver todas las convocatorias</a>
        </div>
      </div>
    </div>
  );
}
