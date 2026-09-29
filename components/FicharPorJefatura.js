'use client';
/**
 * GUARDIAS SIN FICHAR (jefatura)
 *
 * Lista las guardias de un día que ya han empezado y nadie ha fichado,
 * incluidas las que salieron en rojo (sin cubrir). Cada una se puede dar
 * por hecha indicando QUIÉN la hizo de verdad: el asignado, u otra persona
 * aunque no estuviera de guardia (p. ej. el departamento cubriendo una
 * vacante). Cuenta para la rotación y para el contador de quien la hizo.
 */
import { useState, useEffect, useCallback } from 'react';

const azul = '#1e3a5f';
const sinTildes = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function FicharPorJefatura({ fecha }) {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [profes, setProfes] = useState([]);
  const [modal, setModal] = useState(null);     // { guardia, quien, obs, busca }
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const r = await fetch('/api/apoyos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'listar_sin_fichar', datos: { fecha } }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se ha podido cargar');
      setLista(d.lista || []);
    } catch (e) { setError(e.message); setLista([]); }
  }, [fecha]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!modal || profes.length) return;
    fetch('/api/profesores?estado=activo').then(r => r.json())
      .then(d => setProfes((d.profesores || []).map(p => ({ id: p.id, nombre: `${p.apellidos}, ${p.nombre}`, dep: p.departamento || '' }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre))))
      .catch(() => {});
  }, [modal, profes.length]);

  async function fichar() {
    setGuardando(true);
    try {
      const r = await fetch('/api/apoyos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'fichar_jefatura', id: modal.guardia.id,
          datos: { profesor_id: modal.quien, observaciones: modal.obs } }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se ha podido fichar');
      setModal(null);
      await cargar();
    } catch (e) {
      setModal(m => ({ ...m, error: e.message }));
    } finally { setGuardando(false); }
  }

  const n = lista?.length || 0;
  const visibles = modal ? profes.filter(p => !modal.busca || sinTildes(p.nombre + ' ' + p.dep).includes(sinTildes(modal.busca))).slice(0, 40) : [];
  const elegido = modal && profes.find(p => p.id === modal.quien);

  return (
    <div style={{ backgroundColor: '#fff7ed', borderBottom: '1px solid #fed7aa' }}>
      <button type="button" onClick={() => setAbierto(a => !a)} style={{
        width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', background: 'none',
        cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#9a3412',
      }}>
        {abierto ? '▾' : '▸'} ✔ Guardias sin fichar {fecha.split('-').reverse().join('/')}
        {lista && <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 10, backgroundColor: n ? '#ea580c' : '#e5e7eb', color: n ? 'white' : '#475569' }}>{n}</span>}
      </button>

      {abierto && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ fontSize: 11.5, color: '#7c2d12', marginBottom: 8, lineHeight: 1.5 }}>
            Guardias de horas ya pasadas que nadie ha fichado, incluidas las que salieron sin cubrir.
            Si se hicieron, fíchalas indicando quién las hizo de verdad: cuentan para la rotación y
            para el contador de esa persona, aunque no estuviera de guardia.
          </div>
          {error && <div style={{ color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>❌ {error}</div>}
          {lista && n === 0 && !error && <div style={{ fontSize: 12, color: '#64748b' }}>No hay ninguna pendiente.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(lista || []).map(g => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                backgroundColor: 'white', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 10px', fontSize: 12.5 }}>
                <strong style={{ minWidth: 30 }}>{g.esRecreo ? '☕' : `${g.hora}ª`}</strong>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  {g.esRecreo
                    ? <div><strong>Recreo</strong> · zona {g.aula || '—'}</div>
                    : <div><span style={{ color: '#64748b' }}>Falta:</span> <strong>{g.ausente}</strong> · {g.grupo || 'sin grupo'} {g.aula && `· ${g.aula}`}</div>}
                  <div style={{ fontSize: 11.5, color: g.asignado ? '#475569' : '#b91c1c' }}>
                    {g.asignado ? `Asignada a ${g.asignado}` : 'Sin cubrir (nadie de guardia libre)'}
                  </div>
                </div>
                <button type="button" onClick={() => setModal({ guardia: g, quien: g.asignadoId || '', obs: '', busca: '' })} style={{
                  padding: '6px 12px', borderRadius: 7, border: 'none', backgroundColor: '#15803d', color: 'white',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>✔ Fichar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: 'white', borderRadius: 12, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: azul, marginBottom: 4 }}>✔ Fichar guardia</div>
            <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 12 }}>
              {modal.guardia.esRecreo ? `Recreo · zona ${modal.guardia.aula || '—'}` : `${modal.guardia.hora}ª · falta ${modal.guardia.ausente} · ${modal.guardia.grupo || 'sin grupo'}`}
            </div>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', marginBottom: 4 }}>¿Quién la hizo?</div>
            <div style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, backgroundColor: elegido || modal.quien ? '#f0fdf4' : '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 6 }}>
              {elegido ? <><strong>{elegido.nombre}</strong> <span style={{ color: '#64748b' }}>· {elegido.dep}</span></>
                : modal.quien ? (modal.guardia.asignado || 'El asignado') : <span style={{ color: '#94a3b8' }}>Elige a alguien de la lista</span>}
            </div>
            <input value={modal.busca} onChange={e => setModal(m => ({ ...m, busca: e.target.value }))}
              placeholder="Buscar otro profesor (nombre o departamento)…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, marginBottom: 6 }} />
            {modal.busca && (
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8 }}>
                {visibles.map(p => (
                  <button key={p.id} type="button" onClick={() => setModal(m => ({ ...m, quien: p.id, busca: '' }))} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none',
                    borderBottom: '1px solid #f1f5f9', background: 'white', cursor: 'pointer', fontSize: 12.5,
                  }}>{p.nombre} <span style={{ color: '#94a3b8' }}>· {p.dep}</span></button>
                ))}
                {visibles.length === 0 && <div style={{ padding: 8, fontSize: 12, color: '#94a3b8' }}>Nadie con ese nombre.</div>}
              </div>
            )}

            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#334155', margin: '6px 0 4px' }}>Observaciones (opcional)</div>
            <textarea value={modal.obs} onChange={e => setModal(m => ({ ...m, obs: e.target.value }))} rows={2}
              placeholder="Ej.: la cubrió el departamento por la vacante de FP Básica"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical' }} />

            <div style={{ fontSize: 11, color: '#64748b', margin: '8px 0 12px' }}>
              Quedará constancia de que la ha fichado jefatura{modal.guardia.asignadoId && modal.quien && modal.quien !== modal.guardia.asignadoId ? ' y de a quién la había asignado la app' : ''}.
            </div>
            {modal.error && <div style={{ color: '#b91c1c', fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>❌ {modal.error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setModal(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button type="button" onClick={fichar} disabled={guardando || !modal.quien} style={{
                padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#15803d', color: 'white',
                fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer', opacity: !modal.quien ? 0.5 : 1,
              }}>{guardando ? 'Fichando…' : 'Fichar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
