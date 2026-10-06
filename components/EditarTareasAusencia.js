'use client';
/**
 * EDITAR LAS TAREAS DE UNA AUSENCIA (jefatura)
 *
 * Petición de Sebas (oct. 2026): el profesor registra la ausencia sin
 * tareas y luego las manda por correo. Jefatura las pone aquí.
 *
 *   · Ausencia de un día → una tarea por cada hora de clase.
 *   · Varios días o baja → una tarea por módulo (grupo + materia).
 *
 * Solo cambia las tareas, nunca las horas (para eso está "Cambiar horas").
 * Al guardar, el servidor lleva la tarea también a las guardias ya
 * repartidas, para que quien cubre vea la nueva al momento.
 */
import { useState, useEffect } from 'react';
import { adjuntosDe, enlaceDocumento, MAX_ADJUNTOS } from '@/lib/adjuntos';

const azul = '#1e3a5f';
const numHora = h => String(h?.hora || h?.hora_id || '').trim().match(/^(\d)/)?.[1] || '';
const esClase = h => {
  const t = (h?.tipo || '').toLowerCase();
  return t ? t.includes('clase') : !!h?.grupo;
};
const clave = x => `${(x?.grupo || '').trim().toLowerCase()}|${(x?.materia || '').trim().toLowerCase()}`;
const fechaES = f => (f || '').split('-').reverse().join('/');

// ─── Subida de archivos (igual que en el formulario del profesor) ───
async function encogerSiEsFoto(archivo) {
  if (!archivo.type?.startsWith('image/') || archivo.size < 800 * 1024) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise(res => lienzo.toBlob(res, 'image/jpeg', 0.82));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return archivo; }
}

async function subirArchivo(archivo) {
  const form = new FormData();
  form.append('archivo', await encogerSiEsFoto(archivo));
  form.append('carpeta', 'tareas');
  form.append('bucket', 'ausencias-docs');
  let r;
  try { r = await fetch('/api/documento', { method: 'POST', body: form }); }
  catch { throw new Error('No hay conexión. Inténtalo de nuevo.'); }
  if (r.status === 413) throw new Error(`«${archivo.name}» es demasiado grande. Mándalo en PDF o con menos calidad.`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || `No se ha podido subir «${archivo.name}».`);
  return { url: d.url, nombre: archivo.name };
}

export default function EditarTareasAusencia({ ausencia, onCerrar, onGuardado }) {
  const horas = Array.isArray(ausencia.horas) ? ausencia.horas : [];
  const porHoras = horas.some(h => numHora(h) || /^tarde/i.test(String(h?.hora || h?.hora_id || '').trim()));

  const [items, setItems] = useState(null);     // [{ id, etiqueta, hora|grupo+materia, instrucciones, previos, nuevos, firma }]
  const [otras, setOtras] = useState([]);       // horas que no llevan tarea (guardias, reuniones…)
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const desde = h => ({
      instrucciones: h?.instrucciones && !/^Hora añadida por jefatura/.test(h.instrucciones) ? h.instrucciones : '',
      previos: adjuntosDe(h),
      nuevos: [],
      firma: h?.tarea_jefatura || null,
    });

    if (porHoras) {
      const ordenadas = horas.filter(h => numHora(h)).sort((a, b) => numHora(a).localeCompare(numHora(b)));
      setItems(ordenadas.filter(esClase).map(h => ({
        id: numHora(h), hora: numHora(h),
        etiqueta: `${numHora(h)}ª · ${[h.grupo, h.materia].filter(Boolean).join(' · ') || 'clase'}`,
        ...desde(h),
      })));
      setOtras(ordenadas.filter(h => !esClase(h)).map(h => `${numHora(h)}ª · ${h.tipo || '—'}`));
      return;
    }

    // Varios días: los módulos de su horario + los bloques que ya tenga
    fetch(`/api/ausencias?horario_dia=1&fecha=${ausencia.fecha_inicio}&profesor_id=${ausencia.profesor_id}`)
      .then(r => r.json())
      .catch(() => ({}))
      .then(d => {
        const lista = [];
        const vistos = new Set();
        horas.forEach(b => {
          if (!b?.grupo || vistos.has(clave(b))) return;
          vistos.add(clave(b));
          lista.push({ grupo: b.grupo, materia: b.materia || '', ...desde(b) });
        });
        (d?.gruposUnicos || []).forEach(u => {
          if (vistos.has(clave(u))) return;
          vistos.add(clave(u));
          lista.push({ grupo: u.grupo, materia: u.materia || '', ...desde(null) });
        });
        setItems(lista.map((x, i) => ({ ...x, id: String(i), etiqueta: [x.grupo, x.materia].filter(Boolean).join(' · ') })));
      });
  }, [ausencia]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiar = (id, campos) => setItems(l => l.map(x => x.id === id ? { ...x, ...campos } : x));

  async function guardar() {
    setGuardando(true); setError('');
    try {
      const tareas = [];
      for (const x of items) {
        const subidos = [];
        for (const f of x.nuevos) subidos.push(await subirArchivo(f));
        const comun = { instrucciones: x.instrucciones, archivos: [...x.previos, ...subidos] };
        tareas.push(porHoras ? { hora: x.hora, ...comun } : { grupo: x.grupo, materia: x.materia, ...comun });
      }
      const r = await fetch('/api/ausencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'editar_tareas', id: ausencia.id, datos: { tareas } }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido guardar');
      onGuardado?.(d.horas || horas, d.guardias_actualizadas || 0, d.cambiadas || 0);
    } catch (e) {
      setError(`${e.message} No se ha guardado nada; lo escrito sigue aquí.`);
    } finally { setGuardando(false); }
  }

  const periodo = ausencia.fecha_fin && ausencia.fecha_fin !== ausencia.fecha_inicio
    ? `${fechaES(ausencia.fecha_inicio)} – ${fechaES(ausencia.fecha_fin)}`
    : ausencia.fecha_fin ? fechaES(ausencia.fecha_inicio) : `desde ${fechaES(ausencia.fecha_inicio)} (sin fecha de vuelta)`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: 'white', borderRadius: 12, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: azul }}>✏️ Tareas de la ausencia</div>
        <div style={{ fontSize: 12.5, color: '#475569', margin: '4px 0 12px' }}>
          {ausencia.profesor_nombre} · {periodo}
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          {porHoras
            ? 'Una tarea por cada hora de clase.'
            : 'Varios días: una tarea por módulo. Sale en cada clase de ese módulo mientras dure la ausencia.'}
          {' '}Quien tenga ya la guardia verá la tarea nueva al momento.
        </div>

        {!items && <div style={{ fontSize: 13, color: '#64748b' }}>Cargando…</div>}
        {items && items.length === 0 && (
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {porHoras ? 'Esta ausencia no tiene horas de clase: no hay tareas que poner.' : 'No se encuentran sus módulos en el horario.'}
          </div>
        )}

        {(items || []).map(x => {
          const total = x.previos.length + x.nuevos.length;
          return (
            <div key={x.id} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, padding: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: azul, marginBottom: 6 }}>{x.etiqueta}</div>
              {x.firma && (
                <div style={{ fontSize: 11, color: '#92400e', marginBottom: 6 }}>
                  ✏️ Puesta por {x.firma.por} el {new Date(x.firma.en).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              <textarea value={x.instrucciones} rows={3}
                onChange={e => cambiar(x.id, { instrucciones: e.target.value })}
                placeholder="Tarea para el grupo (lo que haya mandado el profesor)…"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ marginTop: 6 }}>
                {x.previos.map((a, i) => (
                  <div key={a.url} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', backgroundColor: '#d1fae5', borderRadius: 7, marginBottom: 4 }}>
                    <span>📎</span>
                    <a href={enlaceDocumento(a.url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1e6b2e', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>{a.nombre || 'Archivo'}</a>
                    <button type="button" title="Quitar" onClick={() => cambiar(x.id, { previos: x.previos.filter((_, n) => n !== i) })}
                      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
                {x.nuevos.map((f, i) => (
                  <div key={f.name + i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', backgroundColor: '#fef3c7', borderRadius: 7, marginBottom: 4 }}>
                    <span>📎</span>
                    <span style={{ fontSize: 12, color: '#92400e', fontWeight: 600, flex: 1, wordBreak: 'break-all' }}>{f.name} (se sube al guardar)</span>
                    <button type="button" title="Quitar" onClick={() => cambiar(x.id, { nuevos: x.nuevos.filter((_, n) => n !== i) })}
                      style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
                {total < MAX_ADJUNTOS && (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, border: '2px dashed #fbbf24', color: '#92400e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    📎 {total ? 'Añadir otro archivo' : 'Adjuntar archivos'}
                    <input type="file" multiple accept=".pdf,.doc,.docx,.odt,.jpg,.jpeg,.png,.webp,.heic,.xls,.xlsx,.ods,.txt"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const juntos = [...x.nuevos];
                        Array.from(e.target.files || []).forEach(f => { if (!juntos.some(y => y.name === f.name && y.size === f.size)) juntos.push(f); });
                        cambiar(x.id, { nuevos: juntos.slice(0, Math.max(0, MAX_ADJUNTOS - x.previos.length)) });
                        e.target.value = '';
                      }} />
                  </label>
                )}
              </div>
            </div>
          );
        })}

        {otras.length > 0 && (
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10 }}>
            Sin tarea (no son clase): {otras.join(', ')}
          </div>
        )}

        {error && <div style={{ color: '#b91c1c', fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>❌ {error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando || !items || items.length === 0}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white', fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer' }}>
            {guardando ? 'Guardando…' : 'Guardar tareas'}
          </button>
        </div>
      </div>
    </div>
  );
}
