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
      backgroundColor: '#eff6ff', border: '2px solid #93c5fd', borderRadius: 12,
      padding: '16px 18px', marginBottom: 18,
    }}>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1e3a5f', marginBottom: 6 }}>
        📄 Sube tu hoja de servicios
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: '#1e3a5f', lineHeight: 1.6 }}>
        Tu antigüedad en el cuerpo sirve para ordenar los días de libre disposición cuando
        coinciden varios el mismo día y para saber quién tiene derecho al día CANOSO. A partir
        de ahora se toma de tu <strong>hoja de servicios oficial</strong>, no de lo que cada uno
        escriba. Se hace una sola vez y se tarda un par de minutos.
      </p>
      <ol style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 13, color: '#1e3a5f', lineHeight: 1.7 }}>
        <li>
          Descárgala en PDF del{' '}
          <a href={PORTAL} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 700 }}>
            Portal del Personal Docente
          </a>{' '}(tal cual, sin escanear ni hacer foto).
        </li>
        <li>Súbela en Mis datos, comprueba lo que sale y pulsa «Es correcto, guardar».</li>
      </ol>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href="/mis-datos#hoja-servicios" style={{
          padding: '9px 16px', borderRadius: 8, backgroundColor: '#1e3a5f', color: 'white',
          fontSize: 13.5, fontWeight: 700, textDecoration: 'none',
        }}>Subir mi hoja ahora</a>
        <button type="button" onClick={ahoraNo} style={{
          padding: '9px 16px', borderRadius: 8, border: '1px solid #93c5fd', backgroundColor: 'white',
          color: '#1e3a5f', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
        }}>Ahora no</button>
      </div>
      <div style={{ marginTop: 9, fontSize: 11.5, color: '#64748b' }}>
        📌 Si lo dejas para luego, te quedará un recordatorio pequeño abajo a la izquierda, con estas
        instrucciones y el enlace, hasta que la subas.
      </div>
      <div style={{ marginTop: 4, fontSize: 11.5, color: '#64748b' }}>
        🔒 El PDF no se guarda: se lee, se toma el tiempo de servicio y se descarta.
      </div>
    </div>
  );
}
