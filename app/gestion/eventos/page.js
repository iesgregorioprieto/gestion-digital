'use client';
export const dynamic = 'force-dynamic';

/**
 * GESTIÓN DEL CALENDARIO DE EVENTOS — /gestion/eventos
 *
 * Crear, editar y eliminar eventos (evaluaciones, reuniones, charlas,
 * plazos…). Solo equipo directivo.
 *
 * El profesorado consulta en /eventos, que es de solo lectura: ya no
 * tiene botón de crear ni de editar. Los datos son los mismos —no se
 * ha tocado ni un evento ya creado— solo se ha movido aquí la parte
 * de gestión, igual que Convocatorias o Comunicaciones.
 */

import { useState, useEffect } from 'react';
import { consulta } from '@/lib/consulta';
import { hoyLocal } from '@/lib/fechas';
import { DEPARTAMENTOS } from '@/lib/sectores';
import {
  TIPOS_EVENTO, OPCIONES_AVISO, tipoEvento, etiquetaAviso,
  fechaLarga, fechaCorta, textoHora,
} from '@/lib/eventos';

const AZUL = '#1e3a5f';
const ROJO = '#991b1b';
const AMBAR = '#b45309';

const AMBITOS = [
  { valor: 'claustro',         label: '👥 Todo el claustro' },
  { valor: 'ccp',              label: '📂 CCP — jefes de departamento y equipo directivo' },
  { valor: 'jefes_dpto',       label: '📂 Jefes de departamento' },
  { valor: 'tutores',          label: '🤝 Tutores' },
  { valor: 'equipo_directivo', label: '🏛️ Equipo directivo' },
  { valor: 'jefes_estudios',   label: '📋 Jefatura de estudios' },
  { valor: 'departamento',     label: '🏫 Uno o varios departamentos' },
  { valor: 'equipo',           label: '👥 Un equipo de trabajo' },
  { valor: 'manual',           label: '✋ Elegir personas a dedo' },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function iso(a, m, d) {
  return new Date(Date.UTC(a, m, d)).toISOString().slice(0, 10);
}
function sumar(f, n) {
  const [a, m, d] = f.split('-').map(Number);
  return iso(a, m - 1, d + n);
}
function rejillaMes(anio, mes) {
  const primero = new Date(Date.UTC(anio, mes, 1));
  const desplaza = (primero.getUTCDay() + 6) % 7;
  const inicio = iso(anio, mes, 1 - desplaza);
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const total = Math.ceil((desplaza + ultimoDia) / 7) * 7;
  return Array.from({ length: total }, (_, i) => sumar(inicio, i));
}
function eventosDelDia(eventos, f) {
  return eventos.filter(ev => ev.fecha === f || (ev.fecha_fin && ev.fecha < f && ev.fecha_fin >= f));
}

function ConEnlaces({ texto }) {
  const partes = (texto || '').split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {partes.map((p, i) => /^https?:\/\//.test(p)
        ? <a key={i} href={p} target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', wordBreak: 'break-all' }}>{p}</a>
        : <span key={i}>{p}</span>)}
    </>
  );
}

const FORM_VACIO = {
  id: null, titulo: '', tipo: 'reunion', fecha: '', fecha_fin: '', variosDias: false,
  todoElDia: false, hora_inicio: '', hora_fin: '', lugar: '', enlace: '', descripcion: '',
  ambito: ['claustro'], departamento: [], destinatarios: [], equipos: [],
  visible_todos: true, asistencia_obligatoria: false, aviso_minutos: 1440,
};

export default function GestionEventos() {
  const hoy = hoyLocal();
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoy.slice(5, 7)) - 1);
  const [eventos, setEventos] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [diaSel, setDiaSel] = useState(hoy);
  const [abierto, setAbierto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [listo, setListo] = useState(false);
  const [directivoCompleto, setDirectivoCompleto] = useState(false);

  const [vista, setVista] = useState('calendario');
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [profesores, setProfesores] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [buscaPersona, setBuscaPersona] = useState('');

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    const roles = JSON.parse(sessionStorage.getItem('profesor_roles') || '[]');
    const directivo = ['director', 'secretario', 'jefe_estudios'].includes(rol);
    if (!directivo && !roles.includes('jefe_departamento')) { window.location.href = '/profesor'; return; }
    setDirectivoCompleto(directivo);
    setListo(true);
    cargarProximos();
  }, []);

  useEffect(() => { if (listo) cargarMes(); }, [anio, mes, listo]);

  async function cargarMes() {
    const dias = rejillaMes(anio, mes);
    setCargando(true);
    try {
      const r = await fetch(`/api/eventos?desde=${dias[0]}&hasta=${dias[dias.length - 1]}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo cargar');
      setEventos(d.eventos || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function cargarProximos() {
    try {
      const r = await fetch(`/api/eventos?desde=${sumar(hoy, 1)}&hasta=${sumar(hoy, 61)}`);
      const d = await r.json();
      if (r.ok) setProximos(d.eventos || []);
    } catch (e) { /* secundario */ }
  }

  function avisar(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    setTimeout(() => setMensaje(null), 4500);
  }

  function moverMes(n) {
    let m = mes + n, a = anio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m); setAnio(a);
  }

  async function abrirFormulario(ev = null) {
    if (!profesores.length) {
      const { data } = await consulta('profesores').select('id, nombre, apellidos, departamento')
        .eq('estado', 'activo').order('apellidos');
      setProfesores(data || []);
    }
    if (!equipos.length) {
      fetch('/api/equipos').then(r => r.ok ? r.json() : { equipos: [] })
        .then(d => setEquipos(d.equipos || [])).catch(() => {});
    }
    if (ev) {
      let ambito = Array.isArray(ev.ambito) ? ev.ambito : [ev.ambito];
      if (ambito.includes('equipo')) ambito = [...new Set(ambito.map(a => a === 'equipo' ? 'manual' : a))];
      setForm({
        ...FORM_VACIO, ...ev,
        fecha_fin: ev.fecha_fin || '', variosDias: !!ev.fecha_fin,
        todoElDia: !ev.hora_inicio, hora_inicio: ev.hora_inicio || '', hora_fin: ev.hora_fin || '',
        lugar: ev.lugar || '', enlace: ev.enlace || '', descripcion: ev.descripcion || '',
        ambito, departamento: ev.departamento || [], destinatarios: ev.destinatarios || [], equipos: [],
      });
    } else {
      setForm({ ...FORM_VACIO, fecha: diaSel >= hoy ? diaSel : hoy });
    }
    setVista('form');
    try { window.scrollTo({ top: 0 }); } catch (e) {}
  }

  const set = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  function alternarAmbito(valor) {
    setForm(f => {
      if (valor === 'claustro') return { ...f, ambito: ['claustro'], departamento: [], destinatarios: [], equipos: [] };
      const marcado = f.ambito.includes(valor);
      const sin = f.ambito.filter(x => x !== 'claustro' && x !== valor);
      return { ...f, ambito: marcado ? sin : [...sin, valor] };
    });
  }

  async function guardar() {
    if (!form.titulo.trim()) return avisar('Falta el título.', 'error');
    if (!form.fecha) return avisar('Falta la fecha.', 'error');
    if (!form.todoElDia && !form.hora_inicio) return avisar('Indica la hora de inicio o marca «todo el día».', 'error');
    if (!form.ambito.length) return avisar('Elige a quién afecta.', 'error');

    setGuardando(true);
    try {
      const datos = {
        titulo: form.titulo, tipo: form.tipo, fecha: form.fecha,
        fecha_fin: form.variosDias ? form.fecha_fin : null,
        hora_inicio: form.todoElDia ? null : form.hora_inicio,
        hora_fin: form.todoElDia ? null : form.hora_fin,
        lugar: form.lugar, enlace: form.enlace, descripcion: form.descripcion,
        ambito: form.ambito, departamento: form.departamento,
        destinatarios: form.destinatarios, equipos: form.equipos,
        visible_todos: form.visible_todos, asistencia_obligatoria: form.asistencia_obligatoria,
        aviso_minutos: form.aviso_minutos,
      };
      const r = await fetch('/api/eventos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: form.id ? 'editar' : 'crear', id: form.id, datos }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo guardar');
      setAnio(Number(form.fecha.slice(0, 4))); setMes(Number(form.fecha.slice(5, 7)) - 1);
      setDiaSel(form.fecha); setAbierto(String(d.id || form.id));
      setVista('calendario');
      await cargarMes(); cargarProximos();
      avisar(form.id ? 'Evento actualizado.' : 'Evento creado.');
    } catch (e) {
      avisar(e.message, 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(ev) {
    if (!confirm(`¿Eliminar «${ev.titulo}»? No se puede deshacer.`)) return;
    try {
      const r = await fetch('/api/eventos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'eliminar', id: ev.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo eliminar');
      setAbierto(null);
      await cargarMes(); cargarProximos();
      avisar('Evento eliminado.');
    } catch (e) {
      avisar(e.message, 'error');
    }
  }

  const campo = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14.5, boxSizing: 'border-box', fontFamily: 'inherit' };
  const etiqueta = { fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 };
  const tarjeta = { backgroundColor: 'white', borderRadius: 14, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: 14 };

  function Evento({ ev, compacto = false }) {
    const t = tipoEvento(ev.tipo);
    const id = String(ev.id);
    const desplegado = !compacto || abierto === id;
    const esConv = ev.origen === 'convocatoria';
    const ambs = Array.isArray(ev.ambito) ? ev.ambito : (ev.ambito ? [ev.ambito] : []);
    return (
      <div style={{ border: `1.5px solid ${ev.esMio ? t.color + '66' : '#e2e8f0'}`, borderLeft: `5px solid ${t.color}`,
        borderRadius: 10, padding: '11px 13px', marginBottom: 10, backgroundColor: ev.esMio ? t.bg : 'white' }}>
        <div onClick={() => compacto && setAbierto(desplegado ? null : id)}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: compacto ? 'pointer' : 'default' }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{t.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1e293b' }}>{ev.titulo}</div>
            <div style={{ fontSize: 13, color: '#475569', marginTop: 3 }}>
              {compacto ? fechaCorta(ev.fecha) : fechaLarga(ev.fecha)}
              {ev.fecha_fin ? ` al ${fechaCorta(ev.fecha_fin)}` : ''} · {textoHora(ev)}
              {ev.lugar ? ` · ${ev.lugar}` : ''}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {ev.asistencia_obligatoria && <span style={{ fontSize: 11, fontWeight: 800, color: ROJO, backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: 20 }}>Asistencia obligatoria</span>}
              {esConv && <span style={{ fontSize: 11, fontWeight: 800, color: AZUL, backgroundColor: '#dbeafe', padding: '2px 8px', borderRadius: 20 }}>Convocatoria oficial — se gestiona en Convocatorias</span>}
            </div>
          </div>
          {compacto && <span style={{ color: '#94a3b8', fontSize: 16 }}>{desplegado ? '▾' : '›'}</span>}
        </div>

        {desplegado && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
            {ev.descripcion && (
              <div style={{ fontSize: 14, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55, marginBottom: 10 }}>
                <ConEnlaces texto={ev.descripcion} />
              </div>
            )}
            {ev.enlace && (
              <a href={ev.enlace} target={esConv ? '_self' : '_blank'} rel="noreferrer"
                style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 9, backgroundColor: AZUL, color: 'white',
                  textDecoration: 'none', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                {esConv ? '📅 Ir a la convocatoria' : '🔗 Abrir enlace'}
              </a>
            )}
            {!esConv && (
              <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 6, lineHeight: 1.6 }}>
                {ev.puedeGestionar && (
                  <div>Afecta a: {ambs.map(a => AMBITOS.find(x => x.valor === a)?.label.replace(/^\S+\s/, '') || a).join(' · ')}
                    {ev.departamento?.length ? ` (${ev.departamento.join(', ')})` : ''}
                    {ev.destinatarios?.length ? ` (${ev.destinatarios.length} persona${ev.destinatarios.length !== 1 ? 's' : ''})` : ''}</div>
                )}
                <div>Banner: {etiquetaAviso(ev.aviso_minutos)} · {ev.visible_todos ? 'visible para todo el claustro' : 'solo lo ven sus destinatarios'}</div>
                {ev.creado_por_nombre && <div>Creado por {ev.creado_por_nombre}</div>}
                {ev.puedeGestionar ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => abrirFormulario(ev)} style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${AZUL}`, backgroundColor: 'white', color: AZUL, fontWeight: 700, cursor: 'pointer' }}>✏️ Editar</button>
                    <button onClick={() => eliminar(ev)} style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${ROJO}`, backgroundColor: 'white', color: ROJO, fontWeight: 700, cursor: 'pointer' }}>🗑️ Eliminar</button>
                  </div>
                ) : (
                  <div style={{ marginTop: 4, fontStyle: 'italic' }}>No lo creaste tú, así que no puedes editarlo ni eliminarlo.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!listo) return null;

  const dias = rejillaMes(anio, mes);
  const delDia = eventosDelDia(eventos, diaSel);
  const personasFiltradas = profesores.filter(p =>
    !buscaPersona || `${p.apellidos} ${p.nombre}`.toLowerCase().includes(buscaPersona.toLowerCase()));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ backgroundColor: AZUL, color: 'white', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={() => vista === 'form' ? setVista('calendario') : (window.location.href = '/gestion')}
          style={{ background: 'none', border: 'none', color: 'white', fontSize: 24, cursor: 'pointer', padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800 }}>🗓️ Gestión del calendario de eventos</h1>
          <p style={{ margin: '3px 0 0', fontSize: 13, opacity: 0.85 }}>
            {vista === 'form' ? (form.id ? 'Editar evento' : 'Nuevo evento') : 'Evaluaciones, reuniones, charlas y plazos del centro'}
          </p>
        </div>
        {vista === 'calendario' && (
          <button onClick={() => abrirFormulario()}
            style={{ padding: '9px 14px', borderRadius: 9, border: 'none', backgroundColor: 'white', color: AZUL, fontWeight: 800, cursor: 'pointer', fontSize: 14 }}>
            + Nuevo
          </button>
        )}
      </div>

      <div style={{ padding: 16, maxWidth: 820, margin: '0 auto' }}>
        {mensaje && (
          <div style={{ padding: '11px 14px', borderRadius: 9, marginBottom: 14, fontWeight: 700, fontSize: 14,
            backgroundColor: mensaje.tipo === 'error' ? '#fee2e2' : '#dcfce7', color: mensaje.tipo === 'error' ? ROJO : '#166534' }}>
            {mensaje.texto}
          </div>
        )}

        {vista === 'calendario' && (
          <>
            {error && (
              <div style={{ ...tarjeta, color: ROJO, fontWeight: 600 }}>No se pudo cargar el calendario: {error}</div>
            )}

            <div style={tarjeta}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={() => moverMes(-1)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 18, cursor: 'pointer' }}>‹</button>
                <div style={{ fontWeight: 800, fontSize: 17, color: AZUL, textTransform: 'capitalize' }}>
                  {MESES[mes]} {anio} {cargando && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>· cargando…</span>}
                </div>
                <button onClick={() => moverMes(1)} style={{ border: 'none', background: '#f1f5f9', borderRadius: 8, padding: '6px 12px', fontSize: 18, cursor: 'pointer' }}>›</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) repeat(2, 0.6fr)', gap: 4 }}>
                {DIAS_SEMANA.map(d => (
                  <div key={d} style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#94a3b8', paddingBottom: 4 }}>{d}</div>
                ))}
                {dias.map((f, i) => {
                  const delMes = Number(f.slice(5, 7)) - 1 === mes;
                  const finde = i % 7 >= 5;
                  const evs = eventosDelDia(eventos, f);
                  const sel = f === diaSel;
                  const esHoy = f === hoy;
                  return (
                    <button key={f} onClick={() => { setDiaSel(f); setAbierto(null); }}
                      style={{
                        minHeight: 54, borderRadius: 8, cursor: 'pointer', padding: '4px 3px', textAlign: 'center',
                        border: sel ? `2px solid ${AZUL}` : esHoy ? '2px solid #93c5fd' : '1px solid #e2e8f0',
                        backgroundColor: sel ? '#eff6ff' : finde ? '#f8fafc' : 'white',
                        opacity: delMes ? 1 : 0.4, fontFamily: 'inherit',
                      }}>
                      <div style={{ fontSize: 13, fontWeight: esHoy ? 800 : 600, color: esHoy ? '#1d4ed8' : '#334155' }}>
                        {Number(f.slice(8, 10))}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.15, marginTop: 2 }}>
                        {evs.slice(0, 3).map(ev => <span key={ev.id}>{tipoEvento(ev.tipo).emoji}</span>)}
                        {evs.length > 3 && <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}> +{evs.length - 3}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={tarjeta}>
              <div style={{ fontWeight: 800, fontSize: 15, color: AZUL, marginBottom: 10, textTransform: 'capitalize' }}>
                {fechaLarga(diaSel)}{diaSel === hoy ? ' · hoy' : ''}
              </div>
              {delDia.length === 0
                ? <div style={{ fontSize: 14, color: '#94a3b8' }}>No hay eventos este día.</div>
                : delDia.map(ev => <Evento key={ev.id} ev={ev} />)}
            </div>

            <div style={tarjeta}>
              <div style={{ fontWeight: 800, fontSize: 15, color: AZUL, marginBottom: 10 }}>Próximos eventos</div>
              {proximos.length === 0
                ? <div style={{ fontSize: 14, color: '#94a3b8' }}>No hay eventos en los próximos dos meses.</div>
                : proximos.slice(0, 15).map(ev => <Evento key={`p-${ev.id}`} ev={ev} compacto />)}
            </div>
          </>
        )}

        {vista === 'form' && (
          <div style={tarjeta}>
            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Título *</label>
              <input value={form.titulo} onChange={e => set('titulo', e.target.value)} style={campo}
                placeholder="Ej: Sesiones de evaluación 1ª evaluación" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Tipo</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {TIPOS_EVENTO.map(t => (
                  <button key={t.valor} onClick={() => set('tipo', t.valor)}
                    style={{ padding: '7px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      border: `1.5px solid ${form.tipo === t.valor ? t.color : '#e2e8f0'}`,
                      backgroundColor: form.tipo === t.valor ? t.bg : 'white',
                      color: form.tipo === t.valor ? t.color : '#475569', fontWeight: form.tipo === t.valor ? 800 : 500 }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={etiqueta}>{form.variosDias ? 'Desde *' : 'Fecha *'}</label>
                <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} style={campo} />
              </div>
              {form.variosDias && (
                <div style={{ flex: '1 1 160px' }}>
                  <label style={etiqueta}>Hasta</label>
                  <input type="date" value={form.fecha_fin} min={form.fecha} onChange={e => set('fecha_fin', e.target.value)} style={campo} />
                </div>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.variosDias} onChange={e => set('variosDias', e.target.checked)} />
              Dura varios días (por ejemplo, las sesiones de evaluación de una semana)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.todoElDia} onChange={e => set('todoElDia', e.target.checked)} />
              Todo el día (sin hora)
            </label>
            {!form.todoElDia && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={etiqueta}>Hora de inicio *</label>
                  <input type="time" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} style={campo} />
                </div>
                <div style={{ flex: '1 1 130px' }}>
                  <label style={etiqueta}>Hora de fin</label>
                  <input type="time" value={form.hora_fin} onChange={e => set('hora_fin', e.target.value)} style={campo} />
                </div>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Lugar</label>
              <input value={form.lugar} onChange={e => set('lugar', e.target.value)} style={campo}
                placeholder="Ej: Salón de actos · Sala de profesores · Telemático" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Enlace (Teams, Meet, formulario…)</label>
              <input value={form.enlace} onChange={e => set('enlace', e.target.value)} style={campo}
                placeholder="Pega aquí el enlace de la reunión" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Descripción</label>
              <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)} rows={4}
                style={{ ...campo, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Lo que conviene saber: orden del día, qué traer, grupos afectados…" />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, marginBottom: 16, cursor: 'pointer',
              padding: '10px 12px', borderRadius: 9, backgroundColor: form.asistencia_obligatoria ? '#fef2f2' : '#f8fafc',
              border: `1.5px solid ${form.asistencia_obligatoria ? '#fca5a5' : '#e2e8f0'}` }}>
              <input type="checkbox" checked={form.asistencia_obligatoria} onChange={e => set('asistencia_obligatoria', e.target.checked)} style={{ marginTop: 2 }} />
              <span><strong>Asistencia obligatoria</strong> (claustro, sesión de evaluación…). Se marca en rojo en el calendario.</span>
            </label>

            <div style={{ marginBottom: 10 }}>
              <label style={etiqueta}>¿A quién afecta? *</label>
              <div style={{ border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                {AMBITOS.map(a => {
                  const marcado = form.ambito.includes(a.valor);
                  return (
                    <label key={a.valor} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13.5,
                      fontWeight: marcado ? 700 : 400, color: marcado ? AZUL : '#333' }}>
                      <input type="checkbox" checked={marcado} onChange={() => alternarAmbito(a.valor)} />
                      {a.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {form.ambito.includes('departamento') && (
              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta}>Departamentos ({form.departamento.length}) *</label>
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                  {DEPARTAMENTOS.map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={form.departamento.includes(d)}
                        onChange={() => set('departamento', form.departamento.includes(d) ? form.departamento.filter(x => x !== d) : [...form.departamento, d])} />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.ambito.includes('equipo') && (
              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta}>Equipos ({form.equipos.length}) *</label>
                {equipos.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: '#92400e', padding: '10px 13px', borderRadius: 8, backgroundColor: '#fffbeb', border: '1px solid #fcd34d' }}>
                    {directivoCompleto
                      ? 'No hay equipos creados. Se crean en Gestión → Avisos → Equipos.'
                      : 'Los equipos de trabajo los gestiona dirección. Para avisar a un grupo de personas, usa «Elegir personas a dedo».'}
                  </div>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                    {equipos.map(eq => (
                      <label key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={form.equipos.includes(eq.id)}
                          onChange={() => set('equipos', form.equipos.includes(eq.id) ? form.equipos.filter(x => x !== eq.id) : [...form.equipos, eq.id])} />
                        <strong>{eq.nombre}</strong>
                        <span style={{ color: '#94a3b8', fontSize: 11.5 }}>{(eq.miembros || []).length} miembros</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {form.ambito.includes('manual') && (
              <div style={{ marginBottom: 14 }}>
                <label style={etiqueta}>Personas ({form.destinatarios.length}) *</label>
                <input value={buscaPersona} onChange={e => setBuscaPersona(e.target.value)} style={{ ...campo, marginBottom: 6 }}
                  placeholder="Buscar por apellido o nombre" />
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                  {personasFiltradas.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={form.destinatarios.includes(p.id)}
                        onChange={() => set('destinatarios', form.destinatarios.includes(p.id) ? form.destinatarios.filter(x => x !== p.id) : [...form.destinatarios, p.id])} />
                      {p.apellidos}, {p.nombre}
                      <span style={{ color: '#94a3b8', fontSize: 11.5 }}>{p.departamento}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ margin: '4px 0 16px', padding: '10px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              backgroundColor: form.ambito.includes('claustro') ? '#fffbeb' : '#f8fafc',
              border: `1.5px solid ${form.ambito.includes('claustro') ? '#fcd34d' : '#e2e8f0'}`,
              color: form.ambito.includes('claustro') ? '#92400e' : '#475569' }}>
              {form.ambito.length === 0 ? '⚠️ No has elegido a nadie todavía'
                : form.ambito.includes('claustro') ? '📣 Afecta a TODO EL CLAUSTRO'
                : `Afecta a: ${form.ambito.map(a => AMBITOS.find(x => x.valor === a)?.label.replace(/^\S+\s/, '') || a).join(' · ')}`}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={etiqueta}>Aviso en el banner «Hoy»</label>
              <select value={form.aviso_minutos === null ? '' : String(form.aviso_minutos)}
                onChange={e => set('aviso_minutos', e.target.value === '' ? null : Number(e.target.value))} style={campo}>
                {OPCIONES_AVISO.map(o => <option key={String(o.valor)} value={o.valor === null ? '' : String(o.valor)}>{o.label}</option>)}
              </select>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>
                Les sale a quienes afecta desde ese momento y se queda en el banner hasta que termina el evento.
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.visible_todos} onChange={e => set('visible_todos', e.target.checked)} style={{ marginTop: 2 }} />
              <span>Que lo vea todo el claustro en el calendario <span style={{ color: '#64748b' }}>(si lo desmarcas, solo lo ven aquellos a quienes afecta)</span></span>
            </label>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={guardar} disabled={guardando}
                style={{ padding: '13px 26px', borderRadius: 10, border: 'none', backgroundColor: AMBAR, color: 'white', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
                {guardando ? 'Guardando…' : form.id ? '💾 Guardar cambios' : '🗓️ Crear evento'}
              </button>
              <button onClick={() => setVista('calendario')}
                style={{ padding: '13px 20px', borderRadius: 10, border: '1.5px solid #cbd5e1', backgroundColor: 'white', color: '#475569', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
