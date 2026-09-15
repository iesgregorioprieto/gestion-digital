'use client';

/**
 * AVISO "¿ERES TÚ?"
 *
 * El cuadrante de guardias de Delphos escribe los nombres abreviados y no
 * siempre casan con la ficha del profesor. Quien no casa es invisible
 * para el motor: no recibe sus guardias y su sector parece más pequeño de
 * lo que es.
 *
 * Este aviso se lo enseña al propio interesado, con sus días y sus horas
 * para que lo reconozca de un vistazo. Confirmarlo es un botón, y a
 * partir de ahí tiene sus guardias todo el curso.
 *
 * Solo lo ve quien tiene algo pendiente de confirmar. Al que ya está
 * reconocido no le sale nada.
 */

import { useState, useEffect } from 'react';

const AMBAR  = '#b45309';
const FONDO  = '#fffbeb';
const BORDE  = '#fcd34d';
const VERDE  = '#166534';

const DIAS = { lunes: 'L', martes: 'M', miercoles: 'X', miércoles: 'X', jueves: 'J', viernes: 'V' };

function resumenHoras(horas) {
  const porDia = {};
  (horas || []).forEach(h => {
    const d = DIAS[h.dia] || (h.dia || '?').slice(0, 1).toUpperCase();
    (porDia[d] = porDia[d] || []).push(h.hora === 'recreo' ? 'recreo' : `${h.hora}ª`);
  });
  return Object.entries(porDia).map(([d, hs]) => `${d}: ${hs.join(', ')}`).join('  ·  ');
}

export default function AvisoCuadrante() {
  const [propuestas, setPropuestas] = useState([]);
  const [enviando, setEnviando] = useState('');
  const [hecho, setHecho] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sessionStorage.getItem('profesor_id')) return;
    let vivo = true;
    fetch('/api/mi-cuadrante')
      .then(r => r.ok ? r.json() : { propuestas: [] })
      .then(d => { if (vivo) setPropuestas(d.propuestas || []); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  async function responder(nombre, accion) {
    setEnviando(nombre);
    setError('');
    try {
      const r = await fetch('/api/mi-cuadrante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, nombre_horario: nombre }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error === 'ya_cogido'
          ? 'Ese puesto ya lo ha reconocido otra persona. Si crees que es un error, díselo a jefatura de estudios.'
          : 'No se ha podido guardar. Inténtalo de nuevo.');
        setEnviando('');
        return;
      }
      setPropuestas(ps => ps.filter(p => p.nombre !== nombre));
      if (accion === 'soy_yo') setHecho(nombre);
    } catch {
      setError('No se ha podido guardar. Inténtalo de nuevo.');
    }
    setEnviando('');
  }

  if (hecho) {
    return (
      <div style={{
        margin: '16px 24px', padding: '14px 18px', borderRadius: 10,
        backgroundColor: '#dcfce7', border: `1.5px solid ${VERDE}`, color: VERDE,
        fontSize: 14, fontWeight: 600,
      }}>
        ✅ Listo. Ya tienes tus guardias del cuadrante. Aparecerán en «Mis guardias»
        a partir de ahora, y no habrá que volver a preguntártelo.
      </div>
    );
  }

  if (propuestas.length === 0) return null;

  return (
    <div style={{ margin: '16px 24px' }}>
      {propuestas.map(p => (
        <div key={p.nombre} style={{
          padding: '16px 18px', borderRadius: 10, marginBottom: 10,
          backgroundColor: FONDO, border: `1.5px solid ${BORDE}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: AMBAR, marginBottom: 6 }}>
            🛡️ ¿Eres tú?
          </div>
          <div style={{ fontSize: 14, color: '#422006', lineHeight: 1.5 }}>
            En el cuadrante de guardias hay un puesto a nombre de{' '}
            <strong>«{p.nombre}»</strong>{p.sector ? <> en <strong>{p.sector}</strong></> : null},
            y nadie lo ha reconocido como suyo.
          </div>
          {p.horas?.length > 0 && (
            <div style={{
              marginTop: 8, padding: '8px 10px', borderRadius: 6,
              backgroundColor: 'white', border: '1px solid #fde68a',
              fontSize: 13, color: '#78350f', fontWeight: 600,
            }}>
              {resumenHoras(p.horas)}
            </div>
          )}
          <div style={{ fontSize: 12.5, color: '#78350f', marginTop: 8 }}>
            Si esas son tus horas de guardia, confírmalo: a partir de ese momento te
            llegarán con el grupo y el aula. Si no lo confirmas, esas guardias no se
            reparten y tu sector cuenta con una persona menos.
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              onClick={() => responder(p.nombre, 'soy_yo')}
              disabled={enviando === p.nombre}
              style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                backgroundColor: VERDE, color: 'white',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
              {enviando === p.nombre ? 'Guardando…' : 'Sí, soy yo'}
            </button>
            <button
              onClick={() => responder(p.nombre, 'no_soy_yo')}
              disabled={enviando === p.nombre}
              style={{
                padding: '9px 18px', borderRadius: 8,
                border: '1.5px solid #d6d3d1', backgroundColor: 'white',
                color: '#57534e', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>
              No soy yo
            </button>
          </div>
        </div>
      ))}
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 8,
          backgroundColor: '#fee2e2', border: '1.5px solid #dc2626',
          color: '#991b1b', fontSize: 13.5, fontWeight: 600,
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
