'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { getSupabase } from '@/lib/supabase';
import { getConfigCurso, esDiaLectivo } from '@/lib/curso';
import EscenarioDia from '@/components/EscenarioDia';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';
const AMBAR = '#b45309';

const TIPOS = [
  { valor: 'salida',   emoji: '🚌', label: 'Salida fuera del centro' },
  { valor: 'centro',   emoji: '🏫', label: 'Actividad en el centro' },
  { valor: 'viaje',    emoji: '🌍', label: 'Viaje de varios días' },
  { valor: 'ponente',  emoji: '🎤', label: 'Charla o ponente externo' },
];

const HORAS = [
  { id: '1', label: '1ª · 8:30' },
  { id: '2', label: '2ª · 9:25' },
  { id: '3', label: '3ª · 10:20' },
  { id: '4', label: '4ª · 11:45' },
  { id: '5', label: '5ª · 12:40' },
  { id: '6', label: '6ª · 13:35' },
];

const ESTADOS = {
  pendiente:  { label: 'Pendiente',  emoji: '⏳', bg: '#fffbeb', color: '#78350f', borde: '#fde68a' },
  aprobada:   { label: 'Aprobada',   emoji: '✅', bg: '#f0fdf4', color: '#166534', borde: '#bbf7d0' },
  rechazada:  { label: 'No aprobada', emoji: '❌', bg: '#fef2f2', color: '#991b1b', borde: '#fecaca' },
  realizada:  { label: 'Realizada',  emoji: '🎉', bg: '#eff6ff', color: '#1e40af', borde: '#bfdbfe' },
};

function fmtFecha(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

export default function Actividades() {
  const [profId, setProfId]       = useState('');
  const [nombre, setNombre]       = useState('');
  const [departamento, setDepto]  = useState('');
  const [cargando, setCargando]   = useState(true);
  const [vista, setVista]         = useState('lista'); // 'lista' | 'nueva' | 'escenario'
  const [fechaEscenario, setFechaEscenario] = useState(hoyLocal());
  const [mensaje, setMensaje]     = useState(null);

  const [actividades, setActividades] = useState([]);
  const [grupos, setGrupos]           = useState([]);
  const [profesores, setProfesores]   = useState([]);
  const [enviando, setEnviando]       = useState(false);
  const [avisoFecha, setAvisoFecha]   = useState(null);

  const [form, setForm] = useState({
    titulo: '', tipo: 'salida', relacion_curricular: '',
    fecha_inicio: '', fecha_fin: '',
    horas: [], hora_salida: '', hora_regreso: '',
    grupos: [], acompanantes: [],
    lugar: '', transporte: '', coste_alumno: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const aviso = (texto, tipo = 'ok') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  };

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    if (!id) { window.location.href = '/login'; return; }
    setProfId(id);
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
    cargar(id);
  }, []);

  async function cargar(id) {
    setCargando(true);
    try {
      const [{ data: acts }, { data: gs }, { data: profs }, { data: yo }] = await Promise.all([
        getSupabase().from('actividades').select('*').order('fecha_inicio', { ascending: true }),
        getSupabase().from('grupos').select('codigo').order('codigo'),
        getSupabase().from('profesores').select('id, nombre, apellidos').eq('estado', 'activo').order('apellidos'),
        getSupabase().from('profesores').select('departamento').eq('id', id),
      ]);

      setActividades(acts || []);
      setGrupos((gs || []).map(g => g.codigo).filter(Boolean));
      setProfesores(profs || []);
      setDepto((yo || [])[0]?.departamento || '');
    } catch (e) {
      aviso('Error al cargar: ' + e.message, 'error');
    }
    setCargando(false);
  }

  async function comprobarFecha(fecha) {
    if (!fecha) { setAvisoFecha(null); return; }
    const cfg = await getConfigCurso();
    const info = esDiaLectivo(fecha, cfg);

    const mismasFecha = actividades.filter(a =>
      a.fecha_inicio === fecha && a.estado !== 'rechazada'
    );

    if (!info.lectivo) {
      setAvisoFecha({ tipo: 'error', texto: `Ese día no hay clase${info.motivo ? ' — ' + info.motivo : ''}.` });
    } else if (mismasFecha.length > 0) {
      setAvisoFecha({
        tipo: 'aviso',
        texto: `Ya hay ${mismasFecha.length} actividad(es) ese día: ${mismasFecha.map(a => a.titulo).join(', ')}.`
      });
    } else {
      setAvisoFecha({ tipo: 'ok', texto: 'Día lectivo y sin otras actividades programadas.' });
    }
  }

  function alternar(campo, valor) {
    const lista = form[campo];
    set(campo, lista.includes(valor) ? lista.filter(x => x !== valor) : [...lista, valor]);
  }

  async function enviar() {
    if (!form.titulo.trim())   return aviso('Ponle un título a la actividad.', 'error');
    if (!form.fecha_inicio)    return aviso('Indica la fecha.', 'error');
    if (form.grupos.length === 0)       return aviso('Selecciona al menos un grupo.', 'error');
    if (form.acompanantes.length === 0) return aviso('Indica quién acompaña.', 'error');

    setEnviando(true);
    try {
      const cfg = await getConfigCurso();
      const _ra = await fetch('/api/centro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: 'actividades', accion: 'crear', datos: {
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        departamento: departamento || null,
        relacion_curricular: form.relacion_curricular.trim() || null,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || form.fecha_inicio,
        horas: form.horas,
        hora_salida: form.hora_salida || null,
        hora_regreso: form.hora_regreso || null,
        grupos: form.grupos,
        acompanantes: form.acompanantes,
        lugar: form.lugar.trim() || null,
        transporte: form.transporte.trim() || null,
        coste_alumno: form.coste_alumno ? parseFloat(form.coste_alumno) : null,
        profesor_nombre: nombre,
        curso: cfg?.config?.curso || null,
      } }),
      });
      const error = _ra.ok ? null : await _ra.json();

      if (error) { aviso('Error al guardar: ' + (error.error || 'inténtalo de nuevo'), 'error'); setEnviando(false); return; }

      aviso('📨 Propuesta enviada a jefatura de estudios');
      setForm({
        titulo: '', tipo: 'salida', relacion_curricular: '',
        fecha_inicio: '', fecha_fin: '', horas: [], hora_salida: '', hora_regreso: '',
        grupos: [], acompanantes: [], lugar: '', transporte: '', coste_alumno: '',
      });
      setAvisoFecha(null);
      setVista('lista');
      cargar(profId);
    } catch (e) {
      aviso('Error: ' + e.message, 'error');
    }
    setEnviando(false);
  }

  const hoy = hoyLocal();
  const proximas = actividades.filter(a => a.fecha_inicio >= hoy && a.estado !== 'rechazada');
  const mias     = actividades.filter(a => a.profesor_id === profId);

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#888' }}>
        ⏳ Cargando actividades...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🎒</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Actividades Complementarias</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{departamento || 'IES Gregorio Prieto'}</div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 50px' }}>

        {mensaje && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
            color:           mensaje.tipo === 'ok' ? '#166534' : '#991b1b',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}>{mensaje.texto}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {[
            { id: 'lista', label: '📅 Calendario' },
            { id: 'nueva', label: '➕ Proponer' },
            { id: 'escenario', label: '📅 Escenario' },
          ].map(t => (
            <button key={t.id} onClick={() => setVista(t.id)} style={{
              flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              border: vista === t.id ? 'none' : '1.5px solid #ddd',
              backgroundColor: vista === t.id ? VERDE : 'white',
              color: vista === t.id ? 'white' : '#666',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── CALENDARIO ── */}
        {vista === 'lista' && (
          <div>
            {proximas.length === 0 ? (
              <div style={{ ...tarjeta, textAlign: 'center', padding: 36 }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>🗓️</div>
                <div style={{ fontWeight: 700, color: '#555', marginBottom: 6 }}>
                  No hay actividades programadas
                </div>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 18 }}>
                  Propón la primera desde la pestaña de arriba.
                </div>
                <button onClick={() => setVista('nueva')} style={{ ...boton, padding: '11px 24px' }}>
                  ➕ Proponer actividad
                </button>
              </div>
            ) : (
              <>
                <Sub>Próximas actividades</Sub>
                {proximas.map(a => <Tarjeta key={a.id} a={a} />)}
              </>
            )}

            {mias.length > 0 && (
              <>
                <Sub>Mis propuestas</Sub>
                {mias.map(a => <Tarjeta key={'m' + a.id} a={a} />)}
              </>
            )}
          </div>
        )}

        {/* ── PROPONER ── */}
        {vista === 'escenario' && (
          <div>
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'block', marginBottom: 8 }}>
                📅 ¿Qué día quieres consultar?
              </label>
              <input type="date" value={fechaEscenario} onChange={e => setFechaEscenario(e.target.value)}
                style={{ padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, width: '100%', maxWidth: 260, boxSizing: 'border-box' }} />
              <div style={{ marginTop: 8, fontSize: 12, color: '#666', lineHeight: 1.5 }}>
                Todo lo previsto ese día por orden de prioridad: ausencias, extraescolares, formación y DLD.
              </div>
            </div>
            <EscenarioDia fecha={fechaEscenario} />
          </div>
        )}

        {vista === 'nueva' && (
          <div>
            <div style={{ ...nota('#eff6ff', '#bfdbfe', '#1e40af') }}>
              Los alumnos, horarios y grupos ya están en la aplicación.
              Solo tienes que indicar lo que no sabemos.
            </div>

            <div style={tarjeta}>
              <Sub2>Qué actividad es</Sub2>

              <Campo label="Título *">
                <input value={form.titulo} onChange={e => set('titulo', e.target.value)}
                  placeholder="Ej: Visita a la feria del automóvil" style={input} />
              </Campo>

              <Campo label="Tipo">
                <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={input}>
                  {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.emoji} {t.label}</option>)}
                </select>
              </Campo>

              <Campo label="Relación con el currículo">
                <textarea value={form.relacion_curricular} rows={2}
                  onChange={e => set('relacion_curricular', e.target.value)}
                  placeholder="Ej: RA4 — Identifica sistemas de seguridad activa y pasiva."
                  style={{ ...input, resize: 'vertical' }} />
                <Pista>Se usará en la memoria del departamento a final de curso.</Pista>
              </Campo>
            </div>

            <div style={tarjeta}>
              <Sub2>Cuándo</Sub2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Campo label="Fecha *">
                  <input type="date" value={form.fecha_inicio} style={input}
                    onChange={e => { set('fecha_inicio', e.target.value); comprobarFecha(e.target.value); }} />
                </Campo>
                <Campo label="Fecha de fin">
                  <input type="date" value={form.fecha_fin} style={input}
                    onChange={e => set('fecha_fin', e.target.value)} />
                  <Pista>Solo si dura varios días.</Pista>
                </Campo>
              </div>

              {avisoFecha && (
                <div style={nota(
                  avisoFecha.tipo === 'ok' ? '#f0fdf4' : avisoFecha.tipo === 'aviso' ? '#fffbeb' : '#fef2f2',
                  avisoFecha.tipo === 'ok' ? '#bbf7d0' : avisoFecha.tipo === 'aviso' ? '#fde68a' : '#fecaca',
                  avisoFecha.tipo === 'ok' ? '#166534' : avisoFecha.tipo === 'aviso' ? '#78350f' : '#991b1b'
                )}>
                  {avisoFecha.tipo === 'ok' ? '✅' : avisoFecha.tipo === 'aviso' ? '⚠️' : '🚫'} {avisoFecha.texto}
                </div>
              )}

              <Campo label="Horas que ocupa">
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {HORAS.map(h => (
                    <Chip key={h.id} activo={form.horas.includes(h.id)} onClick={() => alternar('horas', h.id)}>
                      {h.label}
                    </Chip>
                  ))}
                </div>
                <Pista>De esto depende a quién hay que cubrir y qué guardias quedan libres.</Pista>
              </Campo>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Campo label="Hora de salida">
                  <input type="time" value={form.hora_salida} style={input}
                    onChange={e => set('hora_salida', e.target.value)} />
                </Campo>
                <Campo label="Hora de regreso">
                  <input type="time" value={form.hora_regreso} style={input}
                    onChange={e => set('hora_regreso', e.target.value)} />
                </Campo>
              </div>
            </div>

            <div style={tarjeta}>
              <Sub2>Quién va</Sub2>

              <Campo label="Grupos participantes *">
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', maxHeight: 190, overflowY: 'auto' }}>
                  {grupos.length === 0 && <Pista>No hay grupos cargados todavía.</Pista>}
                  {grupos.map(g => (
                    <Chip key={g} activo={form.grupos.includes(g)} onClick={() => alternar('grupos', g)}>
                      {g}
                    </Chip>
                  ))}
                </div>
              </Campo>

              <Campo label="Profesores acompañantes *">
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', maxHeight: 190, overflowY: 'auto' }}>
                  {profesores.map(p => {
                    const etiqueta = `${p.apellidos || ''}, ${(p.nombre || '')[0] || ''}.`;
                    return (
                      <Chip key={p.id} activo={form.acompanantes.includes(p.id)}
                        onClick={() => alternar('acompanantes', p.id)}>
                        {etiqueta}
                      </Chip>
                    );
                  })}
                </div>
                <Pista>{form.acompanantes.length} seleccionado(s)</Pista>
              </Campo>
            </div>

            <div style={tarjeta}>
              <Sub2>Logística</Sub2>

              <Campo label="Lugar">
                <input value={form.lugar} onChange={e => set('lugar', e.target.value)}
                  placeholder="Ej: IFEMA, Madrid" style={input} />
              </Campo>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Campo label="Transporte">
                  <input value={form.transporte} onChange={e => set('transporte', e.target.value)}
                    placeholder="Autobús contratado" style={input} />
                </Campo>
                <Campo label="Coste por alumno (€)">
                  <input type="number" step="0.01" min="0" value={form.coste_alumno}
                    onChange={e => set('coste_alumno', e.target.value)}
                    placeholder="0" style={input} />
                </Campo>
              </div>
            </div>

            <button onClick={enviar} disabled={enviando} style={{
              ...boton, width: '100%', padding: 14, fontSize: 15,
              cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1,
            }}>
              {enviando ? '⏳ Enviando...' : '📨 Enviar a jefatura de estudios'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Componentes ──

function Tarjeta({ a }) {
  const est = ESTADOS[a.estado] || ESTADOS.pendiente;
  const tipo = TIPOS.find(t => t.valor === a.tipo) || TIPOS[0];
  const d = new Date(a.fecha_inicio + 'T12:00:00');

  return (
    <div style={{
      display: 'flex', gap: 13, padding: '13px 15px', marginBottom: 9,
      backgroundColor: 'white', borderRadius: 10,
      border: '1px solid #e5e7eb', borderLeft: `4px solid ${est.borde}`,
    }}>
      <div style={{
        flexShrink: 0, width: 50, textAlign: 'center',
        backgroundColor: '#f0f4f0', borderRadius: 8, padding: '7px 4px',
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: VERDE, lineHeight: 1 }}>
          {d.getDate()}
        </div>
        <div style={{ fontSize: 9.5, color: '#888', textTransform: 'uppercase', marginTop: 2 }}>
          {d.toLocaleDateString('es-ES', { month: 'short' })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{a.titulo}</div>
        <div style={{ fontSize: 12, color: '#888', lineHeight: 1.5 }}>
          {tipo.emoji} {a.departamento || '—'}
          {Array.isArray(a.grupos) && a.grupos.length > 0 && ` · ${a.grupos.join(', ')}`}
          {Array.isArray(a.acompanantes) && a.acompanantes.length > 0 && ` · ${a.acompanantes.length} acompañante(s)`}
        </div>
        <div style={{ marginTop: 7 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20,
            fontSize: 11, fontWeight: 700,
            backgroundColor: est.bg, color: est.color, border: `1px solid ${est.borde}`,
          }}>{est.emoji} {est.label}</span>
        </div>
        {a.estado === 'rechazada' && a.motivo_rechazo && (
          <div style={{ marginTop: 7, fontSize: 12, color: '#991b1b', backgroundColor: '#fef2f2', padding: '7px 11px', borderRadius: 7, lineHeight: 1.5 }}>
            {a.motivo_rechazo}
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ activo, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
      fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
      border: `1.5px solid ${activo ? VERDE : '#ddd'}`,
      backgroundColor: activo ? '#f0fdf4' : 'white',
      color: activo ? '#166534' : '#666',
    }}>{activo ? '✓ ' : ''}{children}</button>
  );
}

function Sub({ children }) {
  return (
    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, margin: '20px 0 11px' }}>
      {children}
    </div>
  );
}

function Sub2({ children }) {
  return (
    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#333', marginBottom: 13, paddingBottom: 7, borderBottom: '1px solid #eee' }}>
      {children}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Pista({ children }) {
  return <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 5, lineHeight: 1.5 }}>{children}</div>;
}

function nota(bg, borde, color) {
  return {
    backgroundColor: bg, border: `1.5px solid ${borde}`, color,
    borderRadius: 10, padding: '12px 16px', marginBottom: 16,
    fontSize: 13, lineHeight: 1.6,
  };
}

const tarjeta = {
  backgroundColor: 'white', borderRadius: 14, padding: 20,
  boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 16,
};

const input = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1.5px solid #d1d5db', fontSize: 14,
  boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif',
};

const boton = {
  padding: '12px 20px', borderRadius: 10, border: 'none',
  backgroundColor: VERDE, color: 'white', fontWeight: 700,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};
