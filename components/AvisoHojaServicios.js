'use client';

/**
 * AVISO «SUBE TU HOJA DE SERVICIOS»
 *
 * La antigüedad en el cuerpo (desempates del DLD y día CANOSO) se toma de
 * la hoja de servicios oficial. Este aviso sale en el panel a quien aún no
 * la ha subido, con un botón que lleva directo al recuadro de Mis datos.
 *
 * Desaparece para siempre en cuanto la sube. «Ahora no» lo oculta hasta la
 * próxima vez que entre en la aplicación.
 */
import { useState, useEffect } from 'react';

const CLAVE = 'aviso_hoja_servicios_oculto';
const PORTAL = 'https://portalpersonaldocente.jccm.es/misdatos/administrativosyformacion';

export default function AvisoHojaServicios() {
  const [ver, setVer] = useState(false);
  const [verMas, setVerMas] = useState(false);

  useEffect(() => {
    try { if (sessionStorage.getItem(CLAVE)) return; } catch {}
    (async () => {
      try {
        const r = await fetch('/api/profesores?mi_ficha=1');
        const d = await r.json();
        const p = d.profesor;
        // Si la columna no existe aún, no se molesta a nadie
        if (p && 'servicios_origen' in p && p.servicios_origen !== 'hoja') setVer(true);
      } catch {}
    })();
  }, []);

  if (!ver) return null;

  const ahoraNo = () => {
    try { sessionStorage.setItem(CLAVE, '1'); } catch {}
    setVer(false);
  };

  return (
    <div style={{
      backgroundColor: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 10,
      padding: '9px 12px', marginBottom: 14, fontSize: 13, color: '#1e3a5f',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, flex: '1 1 200px' }}>📄 Sube tu hoja de servicios</span>
        <a href="/mis-datos#hoja-servicios" style={{
          padding: '6px 12px', borderRadius: 7, backgroundColor: '#1e3a5f', color: 'white',
          fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
        }}>Subir</a>
        <button type="button" onClick={() => setVerMas(v => !v)} style={{
          padding: '6px 10px', borderRadius: 7, border: '1px solid #93c5fd', backgroundColor: 'white',
          color: '#1e3a5f', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        }}>{verMas ? 'Menos' : '¿Por qué?'}</button>
        <button type="button" onClick={ahoraNo} aria-label="Ocultar" title="Ocultar (queda el recordatorio 📌 abajo)" style={{
          border: 'none', background: 'none', color: '#64748b', fontSize: 16, cursor: 'pointer', padding: '0 2px',
        }}>✕</button>
      </div>
      {verMas && (
        <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.6 }}>
          Tu antigüedad en el cuerpo (desempates de los días de libre disposición y día CANOSO) se
          toma ahora de la hoja oficial. Descárgala en PDF del{' '}
          <a href={PORTAL} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 700 }}>
            Portal del Personal Docente</a>{' '}
          y súbela en Mis datos. Se hace una vez; el PDF no se guarda. Si lo ocultas, queda un
          recordatorio 📌 abajo a la izquierda hasta que la subas.
        </div>
      )}
    </div>
  );
}
