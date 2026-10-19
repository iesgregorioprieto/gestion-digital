'use client';

/**
 * EDITAR UNA ACTIVIDAD COMPLEMENTARIA DESDE JEFATURA
 *
 * Petición de Delia: corregir una actividad ya propuesta (fecha, horas,
 * grupos, acompañantes, lugar…) sin tener que borrarla y pedir al
 * profesor que la vuelva a enviar.
 *
 * Solo lo usa el equipo directivo; el servidor (/api/centro, acción
 * «actualizar») ya rechaza a cualquier otro.
 *
 * Lo que NO hace: tocar las ausencias ya registradas por esa actividad.
 * Si cambian la fecha o las horas, se avisa para que se corrija la
 * ausencia, porque es la que lee el cuadrante de guardias.
 */

import { useState, useEffect } from 'react';
import { consulta } from '@/lib/consulta';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';
const ROJO  = '#991b1b';

const input = {
  width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd',
  fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: 'white',
};

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: AZUL, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Chip({ activo, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '5px 11px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
      border: `1.5px solid ${activo ? AZUL : '#d1d5db'}`,
      backgroundColor: activo ? AZUL : 'white', color: activo ? 'white' : '#444',
    }}>{children}</button>
  );
}

const hhmm = t => (t ? String(t).slice(0, 5) : '');
const nombreProf = p => `${p.apellidos || ''}, ${p.nombre || ''}`.trim();

export default function EditarActividad({ actividad, onCerrar, onGuardada }) {
  const a = actividad;
  const [form, setForm] = useState({
    titulo: a.titulo || '',
    en_pga: a.en_pga === true,
    fecha_inicio: a.fecha_inicio || '',
    fecha_fin: a.fecha_fin || a.fecha_inicio || '',
    hora_salida: hhmm(a.hora_salida),
    hora_regreso: hhmm(a.hora_regreso),
    lugar: a.lugar || '',
    transporte: a.transporte || '',
    financiacion: a.financiacion || '',
    coste_alumno: a.coste_alumno ?? '',
    relacion_curricular: a.relacion_curricular || '',
    descripcion: a.descripcion || '',
    grupos: Array.isArray(a.grupos) ? a.grupos : [],
    acompanantes: Array.isArray(a.acompanantes) ? a.acompanantes : [],
    profesor_guardia: a.profesor_guardia || '',
  });
  const [grupos, setGrupos] = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [buscaProf, setBuscaProf] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const alternar = (k, v) => setForm(f => ({
    ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v],
  }));

  useEffect(() => {
    (async () => {
      const [{ data: gs }, { data: profs }] = await Promise.all([
        consulta('grupos').select('codigo').order('codigo'),
        consulta('profesores').select('id, nombre, apellidos').eq('estado', 'activo').order('apellidos'),
      ]);
      // Los grupos que ya tenía la actividad se conservan aunque no estén
      // en la tabla (curso anterior, código antiguo…), para no perderlos.
      const codigos = (gs || []).map(g => g.codigo).filter(Boolean);
      setGrupos([...new Set([...codigos, ...form.grupos])].sort());
      setProfesores(profs || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar() {
    setError('');
    if (!form.titulo.trim())  return setError('Falta el título.');
    if (!form.fecha_inicio)   return setError('Falta la fecha.');
    if (form.fecha_fin && form.fecha_fin < form.fecha_inicio) return setError('La fecha de vuelta es anterior a la de salida.');
    if (form.grupos.length === 0) return setError('Selecciona al menos un grupo.');

    // El alumnado que asiste va por grupo. Un grupo quitado desaparece;
    // uno añadido va entero (en jefatura no se elige alumno a alumno).
    const previos = a.alumnos_asistentes && typeof a.alumnos_asistentes === 'object' ? a.alumnos_asistentes : {};
    const alumnos_asistentes = Object.fromEntries(
      form.grupos.map(g => [g, previos[g] !== undefined ? previos[g] : 'todos'])
    );
    const quedaAlumnado = Object.values(alumnos_asistentes).some(v => v !== 'todos');

    const datos = {
      titulo: form.titulo.trim(),
      en_pga: form.en_pga === true,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || form.fecha_inicio,
      hora_salida: form.hora_salida || null,
      hora_regreso: form.hora_regreso || null,
      lugar: form.lugar.trim() || null,
      transporte: form.transporte.trim() || null,
      financiacion: form.financiacion || null,
      coste_alumno: form.coste_alumno === '' || form.coste_alumno === null ? null : parseFloat(form.coste_alumno),
      relacion_curricular: form.relacion_curricular.trim() || null,
      descripcion: form.descripcion.trim(),
      grupos: form.grupos,
      acompanantes: form.acompanantes,
      alumnos_asistentes,
      necesita_guardia: quedaAlumnado,
      profesor_guardia: quedaAlumnado ? (form.profesor_guardia || null) : null,
    };

    setGuardando(true);
    const r = await fetch('/api/centro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabla: 'actividades', accion: 'actualizar', id: a.id, datos }),
    });
    setGuardando(false);
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return setError('No se ha podido guardar: ' + (e.error || 'error'));
    }

    const cambiaronHoras =
      datos.fecha_inicio !== a.fecha_inicio ||
      datos.fecha_fin !== (a.fecha_fin || a.fecha_inicio) ||
      hhmm(datos.hora_salida) !== hhmm(a.hora_salida) ||
      hhmm(datos.hora_regreso) !== hhmm(a.hora_regreso) ||
      JSON.stringify([...datos.acompanantes].sort()) !== JSON.stringify([...(a.acompanantes || [])].sort());

    onGuardada({ ...a, ...datos }, cambiaronHoras);
  }

  const profsFiltrados = buscaProf.trim().length >= 2
    ? profesores.filter(p => nombreProf(p).toLowerCase().includes(buscaProf.trim().toLowerCase()))
    : [];
  const nombreDe = id => {
    const p = profesores.find(x => x.id === id);
    return p ? nombreProf(p) : '…';
  };
  const quedaAlumnado = form.grupos.some(g => a.alumnos_asistentes?.[g] !== undefined && a.alumnos_asistentes[g] !== 'todos');

  return (
    <div onClick={onCerrar} style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '24px 12px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        backgroundColor: 'white', borderRadius: 14, width: '100%', maxWidth: 640, padding: 20,
        boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: AZUL }}>✏️ Editar actividad</div>
          <button onClick={onCerrar} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#888' }}>×</button>
        </div>
        <div style={{ fontSize: 12.5, color: '#666', marginBottom: 14 }}>
          Propuesta por <strong>{a.profesor_nombre || '—'}</strong>
        </div>

        <Campo label="Título *">
          <input value={form.titulo} onChange={e => set('titulo', e.target.value)} style={input} />
        </Campo>

        <Campo label="¿Figura en la PGA?">
          <div style={{ display: 'flex', gap: 8 }}>
            <Chip activo={form.en_pga} onClick={() => set('en_pga', true)}>✅ Sí</Chip>
            <Chip activo={!form.en_pga} onClick={() => set('en_pga', false)}>⚠️ No</Chip>
          </div>
        </Campo>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
          <Campo label="Fecha *">
            <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} style={input} />
          </Campo>
          <Campo label="Fecha de vuelta">
            <input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} style={input} />
          </Campo>
          <Campo label="Hora de salida">
            <input type="time" value={form.hora_salida} onChange={e => set('hora_salida', e.target.value)} style={input} />
          </Campo>
          <Campo label="Hora de regreso">
            <input type="time" value={form.hora_regreso} onChange={e => set('hora_regreso', e.target.value)} style={input} />
          </Campo>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <Campo label="Lugar">
            <input value={form.lugar} onChange={e => set('lugar', e.target.value)} style={input} />
          </Campo>
          <Campo label="Transporte">
            <input value={form.transporte} onChange={e => set('transporte', e.target.value)} style={input} />
          </Campo>
          <Campo label="¿Quién la financia?">
            <select value={form.financiacion} onChange={e => set('financiacion', e.target.value)} style={input}>
              <option value="">— Sin indicar —</option>
              <option value="gratuita">Gratuita</option>
              <option value="alumnado">La paga el alumnado</option>
              <option value="centro">La paga el centro</option>
              <option value="mixta">Mixta: alumnado y centro</option>
            </select>
          </Campo>
          <Campo label="Coste por alumno (€)">
            <input type="number" step="0.01" min="0" value={form.coste_alumno}
              onChange={e => set('coste_alumno', e.target.value)} style={input} />
          </Campo>
        </div>

        <Campo label="Grupos *">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 170, overflowY: 'auto', padding: 2 }}>
            {grupos.map(g => (
              <Chip key={g} activo={form.grupos.includes(g)} onClick={() => alternar('grupos', g)}>{g}</Chip>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: '#777', marginTop: 5 }}>
            Un grupo que añadas aquí va entero. Los que ya estaban conservan el alumnado que eligió el profesor.
          </div>
        </Campo>

        <Campo label="Profesorado acompañante">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 7 }}>
            {form.acompanantes.length === 0 && <span style={{ fontSize: 12.5, color: '#999' }}>Nadie</span>}
            {form.acompanantes.map(id => (
              <Chip key={id} activo onClick={() => alternar('acompanantes', id)}>{nombreDe(id)} ✕</Chip>
            ))}
          </div>
          <input value={buscaProf} onChange={e => setBuscaProf(e.target.value)}
            placeholder="Escribe 2 letras para añadir a alguien…" style={input} />
          {profsFiltrados.length > 0 && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 4, maxHeight: 160, overflowY: 'auto' }}>
              {profsFiltrados.filter(p => !form.acompanantes.includes(p.id)).slice(0, 12).map(p => (
                <div key={p.id} onClick={() => { alternar('acompanantes', p.id); setBuscaProf(''); }}
                  style={{ padding: '8px 11px', fontSize: 13, cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                  {nombreProf(p)}
                </div>
              ))}
            </div>
          )}
        </Campo>

        {quedaAlumnado && (
          <Campo label="Profesor/a que se queda con el alumnado que no va">
            <select value={form.profesor_guardia} onChange={e => set('profesor_guardia', e.target.value)} style={input}>
              <option value="">— Sin asignar —</option>
              {form.profesor_guardia && !profesores.some(p => nombreProf(p) === form.profesor_guardia) && (
                <option value={form.profesor_guardia}>{form.profesor_guardia}</option>
              )}
              {profesores.filter(p => !form.acompanantes.includes(p.id)).map(p => (
                <option key={p.id} value={nombreProf(p)}>{nombreProf(p)}</option>
              ))}
            </select>
          </Campo>
        )}

        <Campo label="Relación con el currículo">
          <textarea value={form.relacion_curricular} onChange={e => set('relacion_curricular', e.target.value)}
            rows={2} style={{ ...input, resize: 'vertical' }} />
        </Campo>
        <Campo label="Descripción">
          <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
            rows={3} style={{ ...input, resize: 'vertical' }} />
        </Campo>

        {error && (
          <div style={{ padding: '9px 12px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', color: ROJO, fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
          <button onClick={onCerrar} style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#555', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            {guardando ? 'Guardando…' : '💾 Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
