'use client';
/**
 * «¿TU TUTORÍA ES ESO-2B?» — vincular la tutoría con un toque
 *
 * Sale en el panel al tutor cuyo grupo de tutoría no coincide con ningún
 * grupo del alumnado (y por eso no ve a sus alumnos para autorizaciones y
 * seguro). Propone el grupo según su horario (ver lib/tutoria.js) y lo
 * vincula al confirmar. Si no es ese, elige entre los grupos a los que da
 * clase, o cualquier otro en Mis datos.
 */
import { useState, useEffect } from 'react';

const azul = '#1e3a5f';

export default function AvisoTutoria() {
  const [d, setD] = useState(null);
  const [otros, setOtros] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/tutoria').then(r => r.ok ? r.json() : null).then(setD).catch(() => {});
  }, []);

  async function vincular(grupo) {
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/tutoria', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grupo }) });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error || 'No se ha podido vincular');
      setHecho(x);
      window.dispatchEvent(new Event('recordatorios:actualizar'));
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  if (hecho) {
    return (
      <div id="tutoria" style={{ backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13.5, color: '#166534', fontWeight: 600 }}>
        ✅ Tutoría vinculada: <strong>{hecho.grupo}</strong>{hecho.alumnos ? ` · ${hecho.alumnos} alumnos` : ''}. Ya puedes marcar autorizaciones y seguro escolar.
      </div>
    );
  }
  if (!d || !d.esTutor || d.valida) return null;

  const s = d.sugerencia;
  const boton = (texto, onClick, principal) => (
    <button type="button" disabled={guardando} onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer',
      border: principal ? 'none' : '1.5px solid #93c5fd', backgroundColor: principal ? azul : 'white', color: principal ? 'white' : azul,
    }}>{texto}</button>
  );

  return (
    <div id="tutoria" style={{ backgroundColor: '#fff7ed', border: '2px solid #fdba74', borderRadius: 12, padding: '14px 16px', marginBottom: 16, scrollMarginTop: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#9a3412', marginBottom: 4 }}>🎓 Vincula tu tutoría</div>
      <div style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.55, marginBottom: 10 }}>
        {d.actual
          ? <>Tu tutoría está escrita como «{d.actual}» y no coincide con ningún grupo del alumnado, así que no ves a tus alumnos para las autorizaciones y el seguro escolar.</>
          : <>Eres tutor/a pero no tienes grupo de tutoría, así que no ves a tus alumnos para las autorizaciones y el seguro escolar.</>}
      </div>

      {s && !otros && (
        <div style={{ backgroundColor: 'white', borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 15, color: azul }}>¿Tu tutoría es <strong>{s.grupo}</strong>?{s.alumnos > 0 && <span style={{ color: '#64748b', fontSize: 13 }}> · {s.alumnos} alumnos</span>}</div>
          <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px' }}>Lo proponemos porque {s.motivo}.</div>
          {s.alumnos === 0 && (
            <div style={{ fontSize: 12, color: '#92400e', backgroundColor: '#fffbeb', borderRadius: 7, padding: '6px 9px', marginBottom: 8 }}>
              Este grupo todavía no tiene alumnos cargados desde la matrícula. Vincúlalo igualmente: verás a tus alumnos en cuanto secretaría actualice la matrícula.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {boton(guardando ? 'Vinculando…' : 'Sí, vincular', () => vincular(s.grupo), true)}
            {boton('Es otro grupo', () => setOtros(true))}
          </div>
        </div>
      )}

      {(!s || otros) && (
        <div style={{ backgroundColor: 'white', borderRadius: 9, padding: '10px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: azul, marginBottom: 8 }}>¿De cuál de tus grupos eres tutor/a?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(d.opciones || []).map(o => (
              <button key={o.grupo} type="button" disabled={guardando} onClick={() => vincular(o.grupo)} style={{
                padding: '7px 11px', borderRadius: 8, border: '1.5px solid #cbd5e1', backgroundColor: '#f8fafc', color: azul,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}>{o.grupo}{o.alumnos ? <span style={{ fontWeight: 400, color: '#64748b' }}> · {o.alumnos}</span> : null}</button>
            ))}
          </div>
        </div>
      )}

      <a href="/mis-datos#tutoria" style={{ fontSize: 12.5, color: '#9a3412', fontWeight: 700 }}>Otro grupo o no soy tutor/a → editar mi perfil</a>
      {error && <div style={{ marginTop: 6, fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>❌ {error}</div>}
    </div>
  );
}
