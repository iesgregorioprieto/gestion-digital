'use client';
/**
 * TAREAS PENDIENTES — bloque del panel, entre Mi Horario y los módulos
 *
 * Lo calcula /api/pendientes según el perfil de quien entra. Cada línea
 * lleva a la pantalla donde se resuelve y desaparece sola cuando está
 * hecha. Si no hay nada pendiente, el bloque no sale.
 *
 * Se consulta al entrar y cada 5 minutos, y también al volver a la
 * pestaña (quien justifica una falta y vuelve al panel la ve desaparecer).
 */
import { useState, useEffect } from 'react';

const ambar = '#92400e';

export default function TareasPendientes() {
  const [tareas, setTareas] = useState([]);

  useEffect(() => {
    let vivo = true;
    const cargar = () => fetch('/api/pendientes').then(r => r.ok ? r.json() : { tareas: [] })
      .then(d => { if (vivo) setTareas(d.tareas || []); }).catch(() => {});
    cargar();
    const t = setInterval(() => { if (!document.hidden) cargar(); }, 5 * 60 * 1000); // solo a la vista
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    const alActualizar = () => cargar();
    window.addEventListener('pendientes:actualizar', alActualizar);
    return () => {
      vivo = false; clearInterval(t);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('pendientes:actualizar', alActualizar);
    };
  }, []);

  if (!tareas.length) return null;

  return (
    <div style={{
      backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 12,
      padding: '10px 14px', marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: ambar, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
          📌 Tareas pendientes
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'white', backgroundColor: '#d97706', borderRadius: 999, padding: '1px 8px' }}>
          {tareas.length}
        </span>
      </div>
      {tareas.map(t => (
        <a key={t.id} href={t.enlace} style={{ textDecoration: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, marginBottom: 4,
            backgroundColor: t.urgente ? '#fef2f2' : 'white',
            border: `1px solid ${t.urgente ? '#fca5a5' : '#fde68a'}`,
          }}>
            <span style={{ fontSize: 17 }}>{t.icono}</span>
            <span style={{ flex: 1, fontSize: 13.5, color: t.urgente ? '#991b1b' : '#1e293b', fontWeight: 700 }}>
              {t.texto}
              {t.detalle && (
                <span style={{ display: 'block', fontWeight: 400, fontSize: 12.5, color: t.urgente ? '#b91c1c' : '#475569', marginTop: 2 }}>
                  {t.detalle}
                </span>
              )}
            </span>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>›</span>
          </div>
        </a>
      ))}
    </div>
  );
}
