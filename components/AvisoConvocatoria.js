'use client';

/**
 * AVISO DE CONVOCATORIAS
 *
 * Se monta en toda la aplicación, igual que AvisoComunicacion, y mira
 * una sola vez al abrir: si hay un fichaje o una votación en marcha
 * para quien tiene la sesión, salta a pantalla completa. Con la app
 * abierta, salta en el momento al convocarse; con la app cerrada,
 * salta al abrirla mientras siga dentro de la ventana.
 *
 * Confirmar si se asistirá NO sale aquí: eso va en «Tareas pendientes»,
 * arriba del panel, donde lo ve todo el mundo nada más entrar.
 */

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const VERDE = '#166534';
const MORADO = '#7e22ce';
const ROJO = '#991b1b';

export default function AvisoConvocatoria() {
  const ruta = usePathname();
  const [c, setC] = useState(null);
  const [votando, setVotando] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');

  const fuera = !ruta || ruta.startsWith('/gestion') || ruta.startsWith('/login') || ruta.startsWith('/sala') || ruta === '/';

  /**
   * CUÁNDO SE VUELVE A MIRAR
   *
   * Antes se miraba una sola vez, al abrir o cambiar de pantalla. En un
   * claustro, quien tenía la app abierta en el panel no veía saltar la
   * votación: solo le llegaba si le entraba la notificación y la pulsaba.
   *
   * Ahora se vuelve a mirar mientras haga falta, y solo entonces, para no
   * gastar peticiones el resto del curso:
   *   · votación abierta sin votar → cada 10 s
   *   · cualquier otro momento     → no se repite (oct. 2026: una reunión
   *     abierta todo el día gastaba CPU sin necesidad)
   * Y siempre al volver a la app (desbloquear el móvil, cambiar de pestaña).
   */
  useEffect(() => {
    if (typeof window === 'undefined' || fuera) return;
    // En /fichar se llega desde el QR o la etiqueta, a veces en una
    // pestaña nueva sin los datos de la app: basta con la sesión (cookie),
    // que es lo que mira el servidor. Así, tras fichar, la votación salta
    // en esa misma pantalla aunque el móvil no reciba notificaciones.
    if (!ruta.startsWith('/fichar') && !sessionStorage.getItem('profesor_id')) return;
    let vivo = true;
    let espera = null;

    function programar(lista) {
      clearTimeout(espera);
      // Solo se repite mientras hay una votación abierta (cada 10 s, hasta
      // que se vota o se cierra). Fuera de eso no se pregunta: la reunión
      // y la votación llegan por notificación, y siempre se mira al abrir
      // la app o volver a ella.
      const votando = lista.some(x => x.votacion && !x.votacion.yaVote);
      const ms = votando ? 10000 : 0;
      if (ms) espera = setTimeout(() => { if (!document.hidden) mirar(); else programar(lista); }, ms);
    }

    function mirar() {
      fetch('/api/convocatorias?modo=mias')
        .then(r => r.ok ? r.json() : { convocatorias: [] })
        .then(d => {
          if (!vivo) return;
          const lista = d.convocatorias || [];
          const cand = lista.find(x => x.votacion && !x.votacion.yaVote) || lista.find(x => x.fichajeAbierto && !x.fichado && x.modo_fichaje !== 'fisico');
          setC(cand || null);
          programar(lista);
        })
        .catch(() => { if (vivo) espera = setTimeout(mirar, 20000); });
    }

    const alVolver = () => { if (!document.hidden) { clearTimeout(espera); mirar(); } };
    mirar();
    document.addEventListener('visibilitychange', alVolver);

    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => {
      vivo = false; clearTimeout(espera); clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruta]);

  // Confirmación del voto, que se va sola
  useEffect(() => {
    if (!hecho) return;
    const t = setTimeout(() => setHecho(''), 3000);
    return () => clearTimeout(t);
  }, [hecho]);

  if (hecho) {
    return (
      <div style={{ position: 'fixed', left: 16, right: 16, bottom: 24, zIndex: 9997, display: 'flex', justifyContent: 'center' }}>
        <div style={{ backgroundColor: VERDE, color: 'white', padding: '14px 22px', borderRadius: 14, fontWeight: 800, fontSize: 15.5,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>{hecho}</div>
      </div>
    );
  }

  if (fuera || !c) return null;

  // Antes, si el servidor decía que no (cerrada, ya votado, sin conexión),
  // no pasaba nada: el profesor pulsaba y se quedaba sin saber si contaba.
  async function enviar(accion, datos) {
    setEnviando(true); setError('');
    try {
      const r = await fetch('/api/convocatorias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, datos }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || 'No se ha podido registrar. Inténtalo otra vez.');
      return r.ok || d.error === 'Ya has votado en esta votación';
    } catch {
      setError('Sin conexión. Comprueba los datos o la wifi e inténtalo otra vez.');
      return false;
    } finally {
      setEnviando(false);
    }
  }

  async function fichar() {
    if (await enviar('fichar', { id: c.id })) {
      setC(x => ({ ...x, fichado: true }));
      setHecho('✅ Asistencia registrada');
    }
  }

  async function votar() {
    if (!elegida) return;
    if (await enviar('votar', { votacion_id: c.votacion.id, opcion: elegida })) {
      setC(x => ({ ...x, votacion: { ...x.votacion, yaVote: true } }));
      setHecho('✅ Voto registrado');
    }
  }

  // Si se acaba el tiempo, el aviso se quita sin esperar a la siguiente consulta
  const votoVencido = c.votacion?.cierre_at && new Date(c.votacion.cierre_at).getTime() <= ahora;
  const tocaVotar = c.votacion && !c.votacion.yaVote && !votoVencido;
  // La opción marcada va con su votación: una nueva empieza sin nada marcado
  const elegida = votando?.id === c.votacion?.id ? votando.opcion : null;
  const tocaFichar = !tocaVotar && c.fichajeAbierto && !c.fichado && c.modo_fichaje !== 'fisico';
  if (!tocaVotar && !tocaFichar) return null;

  let restante = null;
  const limite = tocaVotar ? c.votacion.cierre_at : c.fichaje_fin;
  if (limite) {
    const falta = new Date(limite).getTime() - ahora;
    const m = Math.max(0, Math.floor(falta / 60000)), s = Math.max(0, Math.floor((falta % 60000) / 1000));
    restante = { texto: `${m}:${String(s).padStart(2, '0')}`, apurado: falta < 60000 };
  }

  const color = tocaVotar ? MORADO : VERDE;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9997, backgroundColor: 'rgba(15,23,42,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', borderRadius: 18, maxWidth: 480, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        <div style={{ background: `linear-gradient(135deg, ${color}, ${tocaVotar ? '#a855f7' : '#22c55e'})`, color: 'white', padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 4 }}>{tocaVotar ? '🗳️' : '✋'}</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, opacity: 0.9 }}>
            {tocaVotar ? 'VOTACIÓN EN MARCHA' : 'CONTROL DE ASISTENCIA'}
          </div>
          {restante && (
            <div style={{ marginTop: 9, display: 'inline-block', padding: '5px 18px', borderRadius: 20,
              backgroundColor: restante.apurado ? 'white' : 'rgba(255,255,255,0.2)', color: restante.apurado ? ROJO : 'white',
              fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
              {restante.texto}
            </div>
          )}
        </div>
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>{c.titulo}</div>
          {tocaVotar ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#222', marginBottom: 12 }}>{c.votacion.pregunta}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {(c.votacion.opciones || []).map(o => (
                  <button key={o} onClick={() => { setVotando({ id: c.votacion.id, opcion: o }); setError(''); }} disabled={enviando}
                    style={{ padding: '12px 15px', borderRadius: 10, textAlign: 'left', cursor: 'pointer', fontSize: 14.5, fontWeight: 700,
                      border: `2px solid ${elegida === o ? MORADO : '#e9d5ff'}`, backgroundColor: elegida === o ? '#f3e8ff' : 'white', color: '#333' }}>
                    {elegida === o ? '◉ ' : '○ '}{o}
                  </button>
                ))}
              </div>
              <button onClick={votar} disabled={!elegida || enviando}
                style={{ width: '100%', padding: 15, borderRadius: 11, border: 'none', backgroundColor: MORADO, color: 'white',
                  fontWeight: 800, fontSize: 15.5, cursor: 'pointer', opacity: elegida ? 1 : 0.5 }}>
                {enviando ? 'Enviando...' : 'Votar'}
              </button>
            </>
          ) : (
            <>
              <button onClick={fichar} disabled={enviando}
                style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', backgroundColor: VERDE, color: 'white',
                  fontWeight: 800, fontSize: 17, cursor: 'pointer' }}>
                {enviando ? 'Registrando...' : '✋ Estoy aquí'}
              </button>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>Queda constancia de tu asistencia a la reunión</div>
            </>
          )}
          {error && (
            <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 9, backgroundColor: '#fef2f2', border: '1px solid #fecaca',
              color: ROJO, fontSize: 13.5, fontWeight: 700, textAlign: 'center' }}>⚠️ {error}</div>
          )}
          <a href="/convocatorias" style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 12.5, color: '#94a3b8' }}>Ver todas las convocatorias</a>
        </div>
      </div>
    </div>
  );
}
