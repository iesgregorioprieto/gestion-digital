'use client';

/**
 * RECORDATORIOS PERSISTENTES
 *
 * Una pestaña pequeña fija en la esquina inferior izquierda que NO se puede
 * cerrar, solo plegar. Desaparece cuando la tarea está hecha o cuando pasa
 * su fecha. Pensado para lo que la gente lee, cierra y olvida: el aviso
 * grande se ve una vez; esto se queda hasta que se cumple.
 *
 * Cada recordatorio del registro (RECORDATORIOS, abajo) dice:
 *   id         identificador
 *   titulo     lo que pone la pestaña
 *   hasta      (opcional) fecha AAAA-MM-DD a partir de la cual deja de salir
 *   pendiente  función asíncrona: ¿le toca todavía a esta persona?
 *   cuerpo     lo que se ve al desplegarla (instrucciones, enlaces)
 *   accion     { texto, href } botón principal
 *
 * Para añadir uno nuevo, se añade al registro y ya está.
 *
 * Se consulta UNA vez por sesión (no en cada pantalla) para no gastar
 * peticiones. Una pantalla puede pedir que se vuelva a mirar lanzando el
 * evento 'recordatorios:actualizar' (lo hace la hoja de servicios al
 * guardarse, para que la pestaña se vaya en el acto).
 */
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

const PORTAL_DOCENTE = 'https://portalpersonaldocente.jccm.es/misdatos/administrativosyformacion';
const CACHE = 'recordatorios_pendientes';

const RECORDATORIOS = [
  {
    id: 'hoja_servicios',
    titulo: 'Sube tu hoja de servicios',
    pendiente: async () => {
      const r = await fetch('/api/profesores?mi_ficha=1');
      if (!r.ok) return false;
      const p = (await r.json()).profesor;
      return !!p && 'servicios_origen' in p && p.servicios_origen !== 'hoja';
    },
    cuerpo: (
      <>
        <p style={{ margin: '0 0 8px' }}>
          Tu antigüedad en el cuerpo (desempates de los días de libre disposición y día CANOSO)
          se toma de tu hoja de servicios oficial. Solo hay que hacerlo una vez.
        </p>
        <ol style={{ margin: '0 0 4px', paddingLeft: 18 }}>
          <li style={{ marginBottom: 4 }}>
            Descárgala en PDF del{' '}
            <a href={PORTAL_DOCENTE} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 700 }}>
              Portal del Personal Docente
            </a>, tal cual (sin escanear ni foto).
          </li>
          <li>Súbela en Mis datos y pulsa «Es correcto, guardar».</li>
        </ol>
      </>
    ),
    accion: { texto: 'Subir mi hoja', href: '/mis-datos#hoja-servicios' },
  },
];

// Pantallas donde no pinta nada: acceso, pantalla de la sala, urna y la
// propia pantalla donde se hace la tarea.
function oculto(ruta) {
  return !ruta || ruta === '/' || ruta.startsWith('/login') || ruta.startsWith('/sala')
    || ruta.startsWith('/urna') || ruta.startsWith('/registro') || ruta.startsWith('/completar-perfil')
    || ruta.startsWith('/recuperar') || ruta.startsWith('/activar');
}

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function Recordatorios() {
  const ruta = usePathname();
  const [pendientes, setPendientes] = useState([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;

    async function mirar(forzar = false) {
      try {
        if (!sessionStorage.getItem('profesor_id')) { setPendientes([]); return; }
        if (!forzar) {
          const guardado = sessionStorage.getItem(CACHE);
          if (guardado) { setPendientes(JSON.parse(guardado)); return; }
        }
      } catch { return; }

      const hoy = hoyISO();
      const ids = [];
      for (const r of RECORDATORIOS) {
        if (r.hasta && hoy > r.hasta) continue;
        try { if (await r.pendiente()) ids.push(r.id); } catch {}
      }
      if (!vivo) return;
      try { sessionStorage.setItem(CACHE, JSON.stringify(ids)); } catch {}
      setPendientes(ids);
    }

    mirar();
    const alActualizar = () => mirar(true);
    window.addEventListener('recordatorios:actualizar', alActualizar);
    return () => { vivo = false; window.removeEventListener('recordatorios:actualizar', alActualizar); };
  }, []);

  const lista = RECORDATORIOS.filter(r => pendientes.includes(r.id));
  if (oculto(ruta) || lista.length === 0) return null;
  // En la pantalla donde se hace la tarea, la pestaña sobra
  const visibles = lista.filter(r => !ruta.startsWith(r.accion.href.split('#')[0]));
  if (visibles.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', left: 12, bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      zIndex: 9000, maxWidth: 'min(340px, calc(100vw - 24px))',
    }}>
      {abierto ? (
        <div style={{
          backgroundColor: 'white', border: '2px solid #93c5fd', borderRadius: 12,
          boxShadow: '0 8px 24px rgba(15,23,42,0.18)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            backgroundColor: '#1e3a5f', color: 'white', padding: '8px 12px', fontSize: 13, fontWeight: 800 }}>
            <span>📌 Pendiente{visibles.length > 1 ? `s (${visibles.length})` : ''}</span>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Plegar"
              style={{ border: 'none', background: 'none', color: 'white', fontSize: 16, cursor: 'pointer', padding: 0 }}>▾</button>
          </div>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {visibles.map((r, i) => (
              <div key={r.id} style={{ padding: '11px 13px', borderTop: i ? '1px solid #e2e8f0' : 'none',
                fontSize: 12.5, color: '#1e3a5f', lineHeight: 1.55 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>{r.titulo}</div>
                {r.cuerpo}
                <a href={r.accion.href} style={{
                  display: 'inline-block', marginTop: 8, padding: '7px 13px', borderRadius: 8,
                  backgroundColor: '#1e3a5f', color: 'white', fontWeight: 700, textDecoration: 'none', fontSize: 12.5,
                }}>{r.accion.texto}</a>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 13px', borderRadius: 999, border: '2px solid #93c5fd',
          backgroundColor: '#eff6ff', color: '#1e3a5f', fontSize: 12.5, fontWeight: 800,
          cursor: 'pointer', boxShadow: '0 4px 14px rgba(15,23,42,0.15)',
        }}>
          📌 {visibles.length === 1 ? visibles[0].titulo : `${visibles.length} pendientes`}
        </button>
      )}
    </div>
  );
}
