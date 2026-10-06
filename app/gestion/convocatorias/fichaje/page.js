'use client';
export const dynamic = 'force-dynamic';

/**
 * PANTALLA DE FICHAJE — para proyectar en la entrada o en la sala
 *
 * Igual que el tablero de las votaciones: los nombres se ponen en verde
 * según cada uno ficha. Aquí NO hay QR: el fichaje es físico, con los
 * carteles impresos y las etiquetas NFC repartidos por la entrada.
 *
 * Quien no ha fichado sale en gris, como todos al principio: no se le
 * marca en rojo ni en una lista aparte.
 *
 * Consume poco: solo pregunta cada 5 s cuando el fichaje está abierto o
 * a punto de abrirse, y nada con la pestaña oculta.
 */

import { useState, useEffect, useRef } from 'react';

const VERDE = '#1e6b2e';
const AZUL = '#1e3a5f';
const AMBAR = '#b45309';

const horaMadrid = iso => iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
function mmss(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export default function PantallaFichaje() {
  const [id, setId] = useState(null);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [ahora, setAhora] = useState(Date.now());
  const [completa, setCompleta] = useState(false);
  const desfase = useRef(0);   // reloj del servidor − reloj de este ordenador

  useEffect(() => {
    const q = new URL(window.location.href).searchParams;
    if (!q.get('id')) { setError('Falta la convocatoria'); return; }
    setId(q.get('id'));
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const fs = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    return () => { clearInterval(reloj); document.removeEventListener('fullscreenchange', fs); };
  }, []);

  // Carga y refresco
  useEffect(() => {
    if (!id) return;
    let vivo = true, t = null;

    async function cargar() {
      if (document.hidden) { programar(15000); return; }
      try {
        const r = await fetch(`/api/convocatorias?modo=fichaje&id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (!vivo) return;
        if (d.error) { setError(d.error); return; }
        desfase.current = new Date(d.ahora).getTime() - Date.now();
        setDatos(d);
        // Rápido mientras se ficha o está a punto; despacio el resto
        const ya = Date.now() + desfase.current;
        const ini = d.fichaje_inicio ? new Date(d.fichaje_inicio).getTime() : null;
        const cerca = d.abierto || (ini && ini - ya < 45 * 60000 && ini > ya);
        programar(d.estado === 'cerrada' ? null : cerca ? 5000 : 30000);
      } catch {
        programar(10000);   // un fallo de red no vacía la pantalla
      }
    }
    function programar(ms) { if (vivo && ms) t = setTimeout(cargar, ms); }

    cargar();
    return () => { vivo = false; clearTimeout(t); };
  }, [id]);

  function pantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f0f4f0', color: '#991b1b', fontSize: 20, fontWeight: 700, padding: 20, textAlign: 'center' }}>
        {error === 'sin_permisos' ? 'Esta pantalla es solo para el equipo directivo.' : error === 'no_encontrada' ? 'Esa convocatoria no existe.' : error}
      </div>
    );
  }
  if (!datos) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f4f0', color: '#64748b', fontSize: 20 }}>Cargando…</div>;
  }

  const { personas, presentes, total, tarde } = datos;
  const reloj = ahora + desfase.current;
  const ini = datos.fichaje_inicio ? new Date(datos.fichaje_inicio).getTime() : null;
  const fin = datos.fichaje_fin ? new Date(datos.fichaje_fin).getTime() : null;
  const abierto = ini && fin && reloj >= ini && reloj < fin && datos.estado !== 'cerrada';
  const antes = ini && reloj < ini && datos.estado !== 'cerrada';
  const pct = total > 0 ? Math.round((presentes / total) * 100) : 0;
  const ultimos = personas.filter(p => p.at).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 4);

  const estado = abierto
    ? { t: '🟢 FICHAJE ABIERTO', sub: `se cierra en ${mmss(fin - reloj)}`, c: VERDE }
    : antes
      ? { t: '⏳ TODAVÍA NO SE PUEDE FICHAR', sub: `se abre a las ${horaMadrid(datos.fichaje_inicio)} · en ${mmss(ini - reloj)}`, c: AZUL }
      : { t: '🔒 FICHAJE CERRADO', sub: fin ? `se cerró a las ${horaMadrid(datos.fichaje_fin)}` : 'sin abrir', c: '#64748b' };

  const boton = { padding: '7px 13px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#475569' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', padding: '20px 24px', fontFamily: 'system-ui, sans-serif', boxSizing: 'border-box' }}>

      {/* Controles: discretos, arriba a la derecha */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
        <button onClick={pantallaCompleta} style={boton}>{completa ? '↙️ Salir de pantalla completa' : '⛶ Pantalla completa'}</button>
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        <div style={{ flex: '1 1 560px', minWidth: 0 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 14, padding: '18px 24px', marginBottom: 16,
            boxShadow: '0 2px 10px rgba(0,0,0,0.07)', borderLeft: `6px solid ${estado.c}` }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: estado.c, letterSpacing: 0.4 }}>{estado.t}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: AZUL, lineHeight: 1.25, marginTop: 4 }}>{datos.titulo}</div>
            <div style={{ fontSize: 15, color: '#64748b', marginTop: 3 }}>
              {datos.hora ? `${datos.hora}` : ''}{datos.lugar ? ` · ${datos.lugar}` : ''} · {estado.sub}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 46, fontWeight: 800, color: VERDE, fontVariantNumeric: 'tabular-nums' }}>
                {presentes}<span style={{ fontSize: 24, color: '#94a3b8' }}> / {total}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#475569' }}>{pct}%</div>
              {tarde > 0 && <div style={{ fontSize: 15, color: AMBAR, fontWeight: 700 }}>· {tarde} tarde</div>}
            </div>
            <div style={{ marginTop: 10, height: 16, borderRadius: 8, backgroundColor: '#e2e8f0', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: VERDE, transition: 'width .6s ease' }} />
            </div>
            <div style={{ marginTop: 10, fontSize: 14, color: '#475569' }}>
              Se ficha en la entrada: 📷 QR de los carteles o 📶 etiqueta NFC
            </div>
            {ultimos.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 14, color: '#475569' }}>
                Últimos: {ultimos.map(p => `${p.nombre} ${horaMadrid(p.at)}`).join(' · ')}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))', gap: 7 }}>
            {personas.map((p, i) => (
              <div key={i} style={{ padding: '8px 11px', borderRadius: 9, fontSize: 15, fontWeight: 700,
                backgroundColor: p.fichado ? (p.tarde ? '#fef3c7' : '#dcfce7') : 'white',
                color: p.fichado ? (p.tarde ? AMBAR : VERDE) : '#94a3b8',
                border: `1.5px solid ${p.fichado ? (p.tarde ? '#fcd34d' : '#86efac') : '#e2e8f0'}`,
                transition: 'background-color .5s ease', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.fichado ? '✓ ' : ''}{p.nombre}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
