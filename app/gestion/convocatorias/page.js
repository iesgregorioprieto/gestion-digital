'use client';
export const dynamic = 'force-dynamic';

/**
 * GESTIÓN DE CONVOCATORIAS OFICIALES
 *
 * Reemplaza a la parte de «Convocatorias» del módulo antiguo de
 * comunicaciones, que no llegó a funcionar. Módulo aparte: no toca
 * /gestion/comunicaciones ni /gestion/votaciones.
 *
 * Ciclo: se prepara en borrador (orden del día, convocados, votaciones
 * ya escritas) → se convoca (la lista de convocados queda fijada) →
 * se inicia la reunión (fichaje, lanzar las votaciones una a una) →
 * se cierra y queda el borrador del acta, que solo se puede completar
 * (desarrollo de cada punto, quién preside y quién hace de secretario).
 */

import { useState, useEffect } from 'react';
import { DEPARTAMENTOS } from '@/lib/sectores';
import GraficoCircularVotacion from '@/components/GraficoCircularVotacion';

const AZUL   = '#1e3a5f';
const VERDE  = '#1e6b2e';
const ROJO   = '#991b1b';
const AMBAR  = '#b45309';
const MORADO = '#7e22ce';

const ORGANOS = [
  { valor: 'claustro', label: '👥 Claustro' },
  { valor: 'ccp', label: '📂 CCP' },
  { valor: 'departamento', label: '🏫 Departamento' },
  { valor: 'equipo_directivo', label: '🏛️ Equipo directivo' },
  { valor: 'equipo', label: '👥 Equipo de trabajo' },
  { valor: 'otro', label: '✋ Otro' },
];

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fechaLarga(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fechaCorta(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
const ESTADO_LABEL = {
  borrador: { t: '✏️ Borrador', c: '#64748b', bg: '#f1f5f9' },
  convocada: { t: '📅 Convocada', c: AZUL, bg: '#eff6ff' },
  en_curso: { t: '🔴 En curso', c: AMBAR, bg: '#fffbeb' },
  cerrada: { t: '✅ Cerrada', c: VERDE, bg: '#f0fdf4' },
};

const vacia = () => ({
  id: null, titulo: '', organo: 'claustro', convocados_texto: '', convocados: [],
  fecha: '', hora: '', lugar: '', orden_dia: [{ texto: '', desarrollo: '' }],
  preside: '', secretaria: '', estado: 'borrador',
});

export default function GestionConvocatorias() {
  const [vista, setVista] = useState('lista');     // lista | form | sesion
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  const [censo, setCenso] = useState([]);
  const [equipos, setEquipos] = useState([]);

  const [form, setForm] = useState(vacia());
  const [buscar, setBuscar] = useState('');
  const [dptoElegido, setDptoElegido] = useState(DEPARTAMENTOS[0]);
  const [equipoElegido, setEquipoElegido] = useState('');

  const [sesionDetalle, setSesionDetalle] = useState(null); // detalle completo de la convocatoria abierta
  const [minutosFichaje, setMinutosFichaje] = useState('10');
  const [votacionesForm, setVotacionesForm] = useState([]); // votaciones preparadas, vistas desde el formulario (antes de la reunión)
  const [nuevaVot, setNuevaVot] = useState(null); // { convId, origen, punto, pregunta, opciones, duracion_seg, votacion_id? }
  const [vistaCircular, setVistaCircular] = useState({}); // { [votacion_id]: true } — resultado como gráfico circular en vez de barras

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) { window.location.href = '/profesor'; return; }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargarLista();
    cargarCenso();
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(reloj);
  }, []);

  // Refresco automático: la lista cada 20s, la sesión en directo cada 4s
  useEffect(() => {
    const t = setInterval(() => {
      if (vista === 'lista') cargarLista();
      if (vista === 'sesion' && sesionDetalle) cargarDetalle(sesionDetalle.convocatoria.id, true);
    }, vista === 'sesion' ? 4000 : 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, sesionDetalle?.convocatoria?.id]);

  function aviso(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), tipo === 'error' ? 6000 : 3500);
  }

  async function apiPost(accion, datos) {
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, datos }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { aviso(d.error || 'No se ha podido completar', 'error'); return null; }
    return d;
  }

  async function cargarLista() {
    try {
      const r = await fetch('/api/convocatorias?modo=lista');
      const d = await r.json();
      setLista(d.convocatorias || []);
    } catch (e) { /* se queda con lo anterior */ }
    setCargando(false);
  }

  async function cargarCenso() {
    try {
      const r = await fetch('/api/convocatorias?modo=censo');
      const d = await r.json();
      setCenso(d.profesores || []);
      setEquipos(d.equipos || []);
    } catch (e) { /* silencioso: el formulario se queda sin picker fino */ }
  }

  async function cargarDetalle(id, silencioso) {
    try {
      const r = await fetch(`/api/convocatorias?modo=detalle&id=${id}`);
      const d = await r.json();
      if (d.error) { if (!silencioso) aviso(d.error, 'error'); return; }
      setSesionDetalle(d);
    } catch (e) { /* mantiene lo último visto */ }
  }

  // Las votaciones ya preparadas de una convocatoria que todavía no ha
  // empezado (borrador o convocada): se preparan desde el propio
  // formulario, antes de llegar a la reunión en directo.
  async function cargarVotacionesForm(id) {
    try {
      const r = await fetch(`/api/convocatorias?modo=detalle&id=${id}`);
      const d = await r.json();
      if (d.error) return;
      setVotacionesForm(d.votaciones || []);
    } catch (e) { /* se queda con lo último visto */ }
  }

  // ─── Formulario: crear / editar ──────────────────────────────────

  function nueva() {
    setForm(vacia());
    setVotacionesForm([]);
    setNuevaVot(null);
    setVista('form');
  }

  async function editar(c) {
    const r = await fetch(`/api/convocatorias?modo=detalle&id=${c.id}`);
    const d = await r.json();
    if (d.error) { aviso(d.error, 'error'); return; }
    setForm({
      id: d.convocatoria.id, titulo: d.convocatoria.titulo, organo: d.convocatoria.organo,
      convocados_texto: d.convocatoria.convocados_texto || '', convocados: d.convocatoria.convocados || [],
      fecha: d.convocatoria.fecha || '', hora: d.convocatoria.hora || '', lugar: d.convocatoria.lugar || '',
      orden_dia: d.convocatoria.orden_dia?.length ? d.convocatoria.orden_dia : [{ texto: '', desarrollo: '' }],
      preside: d.convocatoria.preside || '', secretaria: d.convocatoria.secretaria || '',
      estado: d.convocatoria.estado,
    });
    setVotacionesForm(d.votaciones || []);
    setNuevaVot(null);
    setVista('form');
  }

  function toggleConvocado(id) {
    setForm(f => ({ ...f, convocados: f.convocados.includes(id) ? f.convocados.filter(x => x !== id) : [...f.convocados, id] }));
  }
  function anadirGrupo(ids) {
    setForm(f => ({ ...f, convocados: [...new Set([...f.convocados, ...ids])] }));
  }
  function quitarTodos() { setForm(f => ({ ...f, convocados: [] })); }

  function cambiarPunto(i, campo, valor) {
    setForm(f => { const op = [...f.orden_dia]; op[i] = { ...op[i], [campo]: valor }; return { ...f, orden_dia: op }; });
  }
  function anadirPunto() { setForm(f => ({ ...f, orden_dia: [...f.orden_dia, { texto: '', desarrollo: '' }] })); }
  function quitarPunto(i) { setForm(f => ({ ...f, orden_dia: f.orden_dia.filter((_, k) => k !== i) })); }

  async function guardarBorrador(seguirEditando) {
    if (!form.titulo.trim()) return aviso('Ponle un título', 'error');
    setGuardando(true);
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'guardar', datos: { ...form, orden_dia: form.orden_dia.filter(p => p.texto.trim()) } }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { aviso(d.error || 'No se ha podido guardar', 'error'); setGuardando(false); return; }
    aviso('💾 Guardado', 'ok');
    setGuardando(false);
    if (!seguirEditando) { setNuevaVot(null); setVista('lista'); cargarLista(); }
    else if (!form.id) setForm(f => ({ ...f, id: d.id }));
    return d.id || form.id;
  }

  async function convocar() {
    if (!form.fecha) return aviso('Indica el día de la reunión', 'error');
    if (form.convocados.length === 0) return aviso('Elige al menos un convocado', 'error');
    const esClaustro = form.convocados.length > 100;
    if (esClaustro && !confirm(`Vas a convocar a ${form.convocados.length} personas.\n\n¿Seguro?`)) return;
    setGuardando(true);
    const id = await guardarBorrador(true);
    if (!id) { setGuardando(false); return; }
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'convocar', datos: { id } }),
    });
    const d = await r.json().catch(() => ({}));
    setGuardando(false);
    if (!r.ok) return aviso(d.error || 'No se ha podido convocar', 'error');
    aviso(`📅 Convocada. Avisados ${d.avisados ?? 0} por notificación.`, 'ok');
    setNuevaVot(null); setVista('lista'); cargarLista();
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar «${c.titulo}»?\n\nSe borran también la asistencia y las votaciones. No se puede deshacer.`)) return;
    const r = await fetch('/api/convocatorias', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'eliminar', datos: { id: c.id } }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); return aviso(d.error || 'No se ha podido eliminar', 'error'); }
    aviso('🗑️ Eliminada', 'ok');
    cargarLista();
  }

  // ─── La reunión en directo ─────────────────────────────────────────

  async function abrirSesion(c) {
    setNuevaVot(null);
    await cargarDetalle(c.id);
    setVista('sesion');
  }

  async function accionSesion(accion, datos, confirmar) {
    if (confirmar && !confirm(confirmar)) return;
    const d = await apiPost(accion, datos);
    if (!d) return null;
    cargarDetalle(sesionDetalle.convocatoria.id);
    return d;
  }

  // Preparar una votación: vale tanto desde el formulario (antes de la
  // reunión) como desde la reunión en directo. Si se prepara desde un
  // borrador que aún no se ha guardado, se guarda primero para tener
  // dónde colgarla.
  async function prepararVotacionForm() {
    let id = form.id;
    if (!id) {
      id = await guardarBorrador(true);
      if (!id) return;
    }
    setNuevaVot({ convId: id, origen: 'form', punto: '', pregunta: '', opciones: ['A favor', 'En contra', 'Abstención'], duracion_seg: '180' });
  }

  async function guardarVotacion() {
    if (!nuevaVot.pregunta.trim()) return aviso('Escribe la pregunta', 'error');
    const opciones = nuevaVot.opciones.map(o => o.trim()).filter(Boolean);
    if (opciones.length < 2) return aviso('Pon al menos dos opciones', 'error');
    const d = await apiPost('guardar_votacion', {
      convocatoria_id: nuevaVot.convId, votacion_id: nuevaVot.votacion_id || null,
      punto: nuevaVot.punto || null, pregunta: nuevaVot.pregunta, opciones, duracion_seg: parseInt(nuevaVot.duracion_seg, 10) || 180,
    });
    if (!d) return;
    aviso('🗳️ Votación preparada', 'ok');
    if (nuevaVot.origen === 'sesion') cargarDetalle(nuevaVot.convId);
    else cargarVotacionesForm(nuevaVot.convId);
    setNuevaVot(null);
  }

  async function borrarVotacionForm(v) {
    const d = await apiPost('borrar_votacion', { votacion_id: v.id });
    if (d) cargarVotacionesForm(form.id);
  }

  // El formulario de pregunta+opciones de una votación, igual sirva para
  // prepararla desde el propio formulario (antes de la reunión) que
  // desde la reunión en directo. «ordenDia» es la lista de puntos de la
  // convocatoria que corresponda en cada caso, para el desplegable.
  function editorVotacion(ordenDia) {
    return (
      <div style={{ padding: 13, borderRadius: 10, backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={nuevaVot.punto} onChange={e => setNuevaVot(v => ({ ...v, punto: e.target.value }))} style={{ ...campo, width: 180, fontSize: 13 }}>
            <option value="">Sin punto asociado</option>
            {(ordenDia || []).map((p, i) => <option key={i} value={i + 1}>Punto {i + 1}: {(p.texto || '').slice(0, 30)}</option>)}
          </select>
          <input type="number" min="30" max="3600" value={nuevaVot.duracion_seg} onChange={e => setNuevaVot(v => ({ ...v, duracion_seg: e.target.value }))}
            style={{ ...campo, width: 110, fontSize: 13 }} placeholder="segundos" />
          <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>segundos</span>
        </div>
        <input value={nuevaVot.pregunta} onChange={e => setNuevaVot(v => ({ ...v, pregunta: e.target.value }))}
          placeholder="¿Qué se vota?" style={{ ...campo, marginBottom: 8, fontSize: 13.5 }} />
        {nuevaVot.opciones.map((o, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input value={o} onChange={e => setNuevaVot(v => { const op = [...v.opciones]; op[i] = e.target.value; return { ...v, opciones: op }; })}
              style={{ ...campo, fontSize: 13 }} />
            {nuevaVot.opciones.length > 2 && (
              <button onClick={() => setNuevaVot(v => ({ ...v, opciones: v.opciones.filter((_, k) => k !== i) }))}
                style={{ border: 'none', background: 'none', color: ROJO, cursor: 'pointer' }}>✕</button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setNuevaVot(v => ({ ...v, opciones: [...v.opciones, ''] }))} style={{ ...btnSecundario, padding: '6px 12px', fontSize: 12 }}>+ Opción</button>
          <button onClick={guardarVotacion} style={{ ...btnPrimario(MORADO), padding: '6px 14px', fontSize: 12.5 }}>Guardar</button>
          <button onClick={() => setNuevaVot(null)} style={{ ...btnSecundario, padding: '6px 12px', fontSize: 12 }}>Cancelar</button>
        </div>
      </div>
    );
  }

  // ─── Acta en PDF ────────────────────────────────────────────────

  function abrirActa(c) {
    cargarActa(c.id);
  }
  async function cargarActa(id) {
    const r = await fetch(`/api/convocatorias?modo=detalle&id=${id}`);
    const d = await r.json();
    if (d.error) return aviso(d.error, 'error');
    generarActaPDF(d);
  }

  function generarActaPDF(d) {
    const e = t => String(t ?? '').replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const c = d.convocatoria;
    const personas = d.personas || [];
    const presentes = personas.filter(p => p.fichado_at);
    const ausentes = personas.filter(p => !p.fichado_at);
    const siAsistiran = personas.filter(p => p.asistira === true).length;

    const puntosHtml = (c.orden_dia || []).map((p, i) => `
      <h2>${i + 1}. ${e(p.texto)}</h2>
      ${p.desarrollo ? `<div class="desarrollo">${e(p.desarrollo).replace(/\n/g, '<br>')}</div>` : '<div class="pendiente">(sin desarrollo todavía)</div>'}
      ${(d.votaciones || []).filter(v => v.punto === i + 1 && v.estado === 'cerrada').map(v => {
        const total = v.totalVotos || 0;
        const filas = (v.opciones || []).map(o => {
          const n = v.recuento?.[o] || 0;
          const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0,0';
          return `<tr><td>${e(o)}</td><td class="c">${n}</td><td class="c">${pct}%</td></tr>`;
        }).join('');
        return `<div class="votacion"><div class="vpreg">🗳️ ${e(v.pregunta)}</div>
          <table><tr><th>Opción</th><th class="c">Votos</th><th class="c">%</th></tr>${filas}</table>
          <div class="vpie">${total} ${total === 1 ? 'voto' : 'votos'} · ${v.participantes} participantes</div></div>`;
      }).join('')}
    `).join('');

    const otrasVotaciones = (d.votaciones || []).filter(v => !v.punto && v.estado === 'cerrada');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Acta — ${e(c.titulo)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11.5px; color: #222; margin: 32px; }
  h1 { font-size: 18px; color: #1e3a5f; margin: 0 0 4px; }
  h2 { font-size: 13px; color: #1e3a5f; margin: 20px 0 6px; border-bottom: 1.5px solid #1e3a5f; padding-bottom: 3px; }
  .sub { color: #666; margin-bottom: 14px; }
  .datos { background: #f1f5f9; padding: 11px 15px; border-radius: 6px; margin-bottom: 16px; line-height: 1.75; }
  .desarrollo { padding: 8px 2px 4px; color: #333; white-space: pre-wrap; line-height: 1.6; }
  .pendiente { padding: 8px 2px 4px; color: #aaa; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th { background: #1e3a5f; color: white; padding: 6px; text-align: left; font-size: 10.5px; }
  td { padding: 5px 7px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  .c { text-align: center; }
  .votacion { margin: 8px 0 14px; padding: 10px 13px; background: #faf5ff; border-radius: 6px; }
  .vpreg { font-weight: bold; font-size: 12.5px; margin-bottom: 5px; }
  .vpie { font-size: 10px; color: #666; }
  .nota { margin-top: 20px; padding: 11px 14px; background: #eff6ff; border-left: 4px solid #1e40af; font-size: 10px; color: #1e3a5f; line-height: 1.6; }
  .pie { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; color: #888; font-size: 9.5px; }
</style></head><body>
  <h1>Acta de reunión</h1>
  <div class="sub">IES Gregorio Prieto · Valdepeñas (Ciudad Real)</div>
  <h2 style="border:none;margin:14px 0 4px;">${e(c.titulo)}</h2>

  <div class="datos">
    <strong>Convocados:</strong> ${e(c.convocados_texto || (ORGANOS.find(o => o.valor === c.organo)?.label.replace(/^\S+\s/, '') || c.organo))}<br>
    ${c.fecha ? `<strong>Fecha:</strong> ${e(fechaLarga(c.fecha))}${c.hora ? ` · ${e(c.hora)}` : ''}<br>` : ''}
    ${c.lugar ? `<strong>Lugar:</strong> ${e(c.lugar)}<br>` : ''}
    ${c.preside ? `<strong>Preside:</strong> ${e(c.preside)}<br>` : ''}
    ${c.secretaria ? `<strong>Secretaría:</strong> ${e(c.secretaria)}<br>` : ''}
    <strong>Convocados:</strong> ${personas.length} · <strong>Asistieron:</strong> ${presentes.length} · <strong>No asistieron:</strong> ${ausentes.length}
    ${siAsistiran ? ` · <strong>Habían confirmado asistencia:</strong> ${siAsistiran}` : ''}
  </div>

  <h2>Orden del día</h2>
  ${puntosHtml || '<div class="pendiente">(sin puntos)</div>'}

  ${otrasVotaciones.length ? `<h2>Otras votaciones</h2>${otrasVotaciones.map(v => {
    const total = v.totalVotos || 0;
    const filas = (v.opciones || []).map(o => {
      const n = v.recuento?.[o] || 0; const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0,0';
      return `<tr><td>${e(o)}</td><td class="c">${n}</td><td class="c">${pct}%</td></tr>`;
    }).join('');
    return `<div class="votacion"><div class="vpreg">🗳️ ${e(v.pregunta)}</div><table><tr><th>Opción</th><th class="c">Votos</th><th class="c">%</th></tr>${filas}</table>
      <div class="vpie">${total} ${total === 1 ? 'voto' : 'votos'} · ${v.participantes} participantes</div></div>`;
  }).join('')}` : ''}

  <h2>Control de asistencia</h2>
  <table>
    <tr><th>Profesor/a</th><th>Departamento</th><th class="c">Confirmó</th><th class="c">Presente</th><th class="c">Hora</th></tr>
    ${personas.map(p => `<tr><td>${e(p.nombre)}</td><td>${e(p.departamento)}</td>
      <td class="c">${p.asistira === true ? 'Sí' : p.asistira === false ? 'No' : '—'}</td>
      <td class="c">${p.fichado_at ? 'Sí' : 'No'}</td>
      <td class="c">${p.fichado_at ? new Date(p.fichado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}</td></tr>`).join('')}
  </table>

  ${(d.votaciones || []).some(v => v.estado === 'cerrada') ? `<div class="nota">
    <strong>Sobre el secreto del voto.</strong> La aplicación nunca guarda un voto individual: cada opción
    lleva solo un contador que sube al votar. No existe ningún registro, ni en la base de datos ni en las
    copias de seguridad, que permita determinar el sentido del voto de ninguna persona.
  </div>` : ''}

  <div class="pie">Borrador generado el ${e(new Date().toLocaleString('es-ES'))} por ${e(usuario)} · Pendiente de aprobación en la siguiente sesión · APrieto</div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return aviso('El navegador ha bloqueado la ventana. Permite las ventanas emergentes.', 'error');
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 400);
  }

  // ─── Estilos ────────────────────────────────────────────────────

  const campo = { width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' };
  const btnPrimario = (color) => ({ padding: '11px 18px', borderRadius: 10, border: 'none', backgroundColor: color, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' });
  const btnSecundario = { padding: '11px 18px', borderRadius: 10, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#555', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
  const censoFiltrado = censo.filter(p => !buscar.trim() || p.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 60 }}>
      <div style={{ backgroundColor: AZUL, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>📅 Convocatorias oficiales</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>IES Gregorio Prieto · {usuario}</div>
        </div>
        <a href={vista === 'lista' ? '/gestion' : '#'} onClick={e => { if (vista !== 'lista') { e.preventDefault(); setNuevaVot(null); setVista('lista'); cargarLista(); } }}
          style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>
          ← {vista === 'lista' ? 'Inicio' : 'Volver a la lista'}
        </a>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>
        {mensaje && (
          <div style={{ padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'error' ? '#fef2f2' : '#f0fdf4', color: mensaje.tipo === 'error' ? ROJO : VERDE,
            border: `1.5px solid ${mensaje.tipo === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
            {mensaje.texto}
          </div>
        )}

        {/* ───────── LISTA ───────── */}
        {vista === 'lista' && (
          <>
            <button onClick={nueva} style={{ ...btnPrimario(VERDE), width: '100%', padding: 14, marginBottom: 18, fontSize: 15 }}>
              ➕ Nueva convocatoria
            </button>
            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
            ) : lista.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
                Todavía no has convocado ninguna reunión
              </div>
            ) : lista.map(c => {
              const est = ESTADO_LABEL[c.estado];
              return (
                <div key={c.id} style={{ backgroundColor: 'white', borderRadius: 12, marginBottom: 12, padding: '15px 18px',
                  border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20, color: est.c, backgroundColor: est.bg }}>{est.t}</span>
                      <div style={{ fontSize: 16.5, fontWeight: 800, color: '#1e293b', marginTop: 6 }}>{c.titulo}</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>
                        {c.fecha ? fechaCorta(c.fecha) : 'sin fecha'}{c.hora ? ` · ${c.hora}` : ''} · {c.totalConvocados} convocados
                        {c.estado !== 'borrador' && ` · ${c.presentes} presentes`}
                        {c.votaciones > 0 && ` · ${c.votacionesHechas}/${c.votaciones} votaciones`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {c.estado === 'borrador' && <>
                        <button onClick={() => editar(c)} style={btnSecundario}>✏️ Editar</button>
                        <button onClick={() => eliminar(c)} style={{ ...btnSecundario, color: ROJO, borderColor: '#fecaca' }}>🗑️</button>
                      </>}
                      {c.estado === 'convocada' && <>
                        <button onClick={() => editar(c)} style={btnSecundario}>👁️ Ver</button>
                        <button onClick={() => abrirSesion(c)} style={btnPrimario(AMBAR)}>▶️ Iniciar reunión</button>
                      </>}
                      {c.estado === 'en_curso' && <button onClick={() => abrirSesion(c)} style={btnPrimario(AMBAR)}>🔴 Ir a la reunión</button>}
                      {c.estado === 'cerrada' && <>
                        <button onClick={() => editar(c)} style={btnSecundario}>📝 Completar acta</button>
                        <button onClick={() => abrirActa(c)} style={btnPrimario(AZUL)}>📄 Acta en PDF</button>
                        <button onClick={() => eliminar(c)} style={{ ...btnSecundario, color: ROJO, borderColor: '#fecaca' }}>🗑️</button>
                      </>}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ───────── FORMULARIO ───────── */}
        {vista === 'form' && (() => {
          const editable = ['borrador', 'convocada'].includes(form.estado);
          const soloActa = form.estado === 'cerrada';
          return (
            <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 22, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: AZUL, marginBottom: 16 }}>
                {soloActa ? '📝 Completar el acta' : form.id ? '✏️ Editar convocatoria' : '➕ Nueva convocatoria'}
              </div>

              <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Título</label>
              <input value={form.titulo} disabled={!editable} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                placeholder="Claustro ordinario de octubre" style={{ ...campo, marginTop: 4, marginBottom: 14 }} />

              {editable && <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Fecha</label>
                    <input type="date" min={hoyISO()} value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={{ ...campo, marginTop: 4 }} />
                  </div>
                  <div style={{ flex: '1 1 120px' }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Hora</label>
                    <input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} style={{ ...campo, marginTop: 4 }} />
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Lugar</label>
                    <input value={form.lugar} onChange={e => setForm(f => ({ ...f, lugar: e.target.value }))} placeholder="Salón de actos" style={{ ...campo, marginTop: 4 }} />
                  </div>
                </div>

                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Cómo sale en el acta (opcional)</label>
                <input value={form.convocados_texto} onChange={e => setForm(f => ({ ...f, convocados_texto: e.target.value }))}
                  placeholder="Claustro de profesores" style={{ ...campo, marginTop: 4, marginBottom: 14 }} />

                {/* Convocados */}
                <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 10 }}>
                    👥 Convocados — {form.convocados.length}
                  </div>
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
                    <button onClick={() => anadirGrupo(censo.map(p => p.id))} style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5 }}>+ Todo el claustro</button>
                    <button onClick={() => anadirGrupo(censo.filter(p => p.jefeDpto || p.directivo).map(p => p.id))} style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5 }}>+ CCP</button>
                    <button onClick={() => anadirGrupo(censo.filter(p => p.tutor).map(p => p.id))} style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5 }}>+ Tutores</button>
                    <button onClick={() => anadirGrupo(censo.filter(p => p.directivo).map(p => p.id))} style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5 }}>+ Equipo directivo</button>
                    <button onClick={quitarTodos} style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5, color: ROJO }}>Vaciar</button>
                  </div>
                  <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                    <select value={dptoElegido} onChange={e => setDptoElegido(e.target.value)} style={{ ...campo, flex: 1, padding: '7px 10px', fontSize: 12.5 }}>
                      {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <button onClick={() => anadirGrupo(censo.filter(p => p.departamento === dptoElegido).map(p => p.id))}
                      style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>+ Añadir</button>
                  </div>
                  {equipos.length > 0 && (
                    <div style={{ display: 'flex', gap: 7, marginBottom: 10 }}>
                      <select value={equipoElegido} onChange={e => setEquipoElegido(e.target.value)} style={{ ...campo, flex: 1, padding: '7px 10px', fontSize: 12.5 }}>
                        <option value="">— elige un equipo —</option>
                        {equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
                      </select>
                      <button onClick={() => { const eq = equipos.find(x => String(x.id) === equipoElegido); if (eq) anadirGrupo(eq.miembros); }}
                        style={{ ...btnSecundario, padding: '7px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>+ Añadir</button>
                    </div>
                  )}
                  <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre…" style={{ ...campo, marginBottom: 8, fontSize: 13 }} />
                  <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: 'white' }}>
                    {censoFiltrado.map(p => (
                      <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                        backgroundColor: form.convocados.includes(p.id) ? '#eff6ff' : 'white' }}>
                        <input type="checkbox" checked={form.convocados.includes(p.id)} onChange={() => toggleConvocado(p.id)} />
                        <span style={{ flex: 1 }}>{p.nombre}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.departamento}</span>
                      </label>
                    ))}
                    {censoFiltrado.length === 0 && <div style={{ padding: 14, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Sin resultados</div>}
                  </div>
                </div>
              </>}

              {/* Orden del día */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Orden del día</label>
                {form.orden_dia.map((p, i) => (
                  <div key={i} style={{ marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fafafa' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: '#94a3b8', width: 20 }}>{i + 1}.</span>
                      <input value={p.texto} onChange={e => cambiarPunto(i, 'texto', e.target.value)} placeholder="Punto del orden del día"
                        style={{ ...campo, flex: 1, padding: '8px 10px', fontSize: 13.5 }} />
                      {form.orden_dia.length > 1 && (
                        <button onClick={() => quitarPunto(i)} style={{ border: 'none', background: 'none', color: ROJO, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
                      )}
                    </div>
                    {soloActa && (
                      <textarea value={p.desarrollo} onChange={e => cambiarPunto(i, 'desarrollo', e.target.value)}
                        placeholder="Desarrollo de este punto, para el acta…" rows={3}
                        style={{ ...campo, marginTop: 7, fontSize: 13, resize: 'vertical' }} />
                    )}
                  </div>
                ))}
                {editable && (
                  <button onClick={anadirPunto} style={{ ...btnSecundario, marginTop: 8, padding: '7px 14px', fontSize: 12.5 }}>+ Añadir punto</button>
                )}
              </div>

              {/* Votaciones preparadas para esta convocatoria. Se pueden ir
                  dejando listas desde aquí, antes de que llegue el día de la
                  reunión; se lanzan ya en la reunión en directo. */}
              {(editable || (soloActa && votacionesForm.length > 0)) && (
                <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: MORADO }}>🗳️ Votaciones preparadas</div>
                    {editable && !nuevaVot && (
                      <button onClick={prepararVotacionForm} style={{ ...btnSecundario, padding: '7px 13px', fontSize: 12.5 }}>+ Preparar votación</button>
                    )}
                  </div>

                  {nuevaVot && nuevaVot.origen === 'form' && editorVotacion(form.orden_dia)}

                  {votacionesForm.length === 0 && !nuevaVot && (
                    <div style={{ textAlign: 'center', padding: 14, color: '#aaa', fontSize: 13 }}>
                      {editable ? 'Todavía no hay ninguna votación preparada' : 'No se preparó ninguna votación'}
                    </div>
                  )}

                  {votacionesForm.map(v => (
                    <div key={v.id} style={{ backgroundColor: 'white', borderRadius: 9, padding: '11px 13px', marginBottom: 8, border: '1px solid #e9d5ff' }}>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 }}>
                        <div style={{ flex: 1, minWidth: 160, fontWeight: 700, fontSize: 13.5, color: '#333' }}>
                          {v.punto ? `P${v.punto} · ` : ''}{v.pregunta}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, color: v.estado === 'cerrada' ? '#64748b' : '#94a3b8' }}>
                          {v.estado === 'cerrada' ? '🔒 CERRADA' : '⏸️ PREPARADA'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: editable ? 8 : 0 }}>
                        {(v.opciones || []).map(o => (
                          <span key={o} style={{ padding: '3px 11px', borderRadius: 20, fontSize: 12, backgroundColor: '#faf5ff', color: MORADO, border: '1px solid #e9d5ff', fontWeight: 600 }}>{o}</span>
                        ))}
                      </div>
                      {v.estado === 'cerrada' && v.recuento && (
                        <div style={{ marginTop: 6 }}>
                          <button onClick={() => setVistaCircular(s => ({ ...s, [v.id]: !s[v.id] }))}
                            style={{ border: 'none', background: 'none', color: MORADO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 7 }}>
                            {vistaCircular[v.id] ? '📊 Ver como barras' : '🥧 Ver como gráfico circular'}
                          </button>
                          {vistaCircular[v.id] ? (
                            <GraficoCircularVotacion opciones={v.opciones} recuento={v.recuento} size={130} />
                          ) : (
                            (v.opciones || []).map(o => {
                              const total = v.totalVotos || 0;
                              const n = v.recuento[o] || 0; const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                              return (
                                <div key={o} style={{ marginTop: 5 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{o}</span><span><strong>{n}</strong> · {pct}%</span></div>
                                  <div style={{ height: 6, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: MORADO, borderRadius: 3 }} />
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                      {editable && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => setNuevaVot({ convId: form.id, origen: 'form', votacion_id: v.id, punto: v.punto || '', pregunta: v.pregunta, opciones: v.opciones, duracion_seg: String(v.duracion_seg) })}
                            style={{ ...btnSecundario, padding: '7px 14px', fontSize: 12.5 }}>✏️ Editar</button>
                          <button onClick={() => borrarVotacionForm(v)} style={{ ...btnSecundario, padding: '7px 14px', fontSize: 12.5, color: ROJO }}>🗑️</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {editable && (
                    <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                      Quedan guardadas, sin lanzar a nadie. Se lanzan una a una desde la reunión en directo, cuando toque.
                    </div>
                  )}
                </div>
              )}

              {soloActa && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Preside</label>
                    <input value={form.preside} onChange={e => setForm(f => ({ ...f, preside: e.target.value }))} style={{ ...campo, marginTop: 4 }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12.5, fontWeight: 700, color: '#555' }}>Secretaría</label>
                    <input value={form.secretaria} onChange={e => setForm(f => ({ ...f, secretaria: e.target.value }))} style={{ ...campo, marginTop: 4 }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
                <button onClick={() => guardarBorrador(false)} disabled={guardando} style={btnPrimario(AZUL)}>
                  {guardando ? 'Guardando…' : '💾 Guardar'}
                </button>
                {form.estado === 'borrador' && (
                  <button onClick={convocar} disabled={guardando} style={btnPrimario(VERDE)}>📅 Convocar</button>
                )}
                <button onClick={() => { setNuevaVot(null); setVista('lista'); cargarLista(); }} style={btnSecundario}>Cancelar</button>
              </div>
            </div>
          );
        })()}

        {/* ───────── SESIÓN EN DIRECTO ───────── */}
        {vista === 'sesion' && sesionDetalle && (() => {
          const c = sesionDetalle.convocatoria;
          const personas = sesionDetalle.personas || [];
          const votaciones = sesionDetalle.votaciones || [];
          const presentes = personas.filter(p => p.fichado_at);
          const abierta = votaciones.find(v => v.estado === 'abierta');
          let restanteFichaje = null;
          if (c.fichajeAbierto && c.fichaje_fin) {
            const falta = new Date(c.fichaje_fin).getTime() - ahora;
            restanteFichaje = `${Math.max(0, Math.floor(falta / 60000))}:${String(Math.max(0, Math.floor((falta % 60000) / 1000))).padStart(2, '0')}`;
          }

          return (
            <>
              <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 18, border: `2px solid ${AMBAR}`, marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: AMBAR, letterSpacing: 0.5 }}>🔴 REUNIÓN EN CURSO</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b', marginTop: 4 }}>{c.titulo}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>{presentes.length} de {personas.length} han fichado</div>

                {/* Fichaje */}
                <div style={{ marginTop: 14, padding: 14, borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 10 }}>✋ Control de asistencia</div>
                  {c.fichajeAbierto ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: VERDE, fontVariantNumeric: 'tabular-nums' }}>{restanteFichaje}</span>
                      <button onClick={() => accionSesion('cerrar_fichaje', { id: c.id }, '¿Cerrar el control de asistencia ahora?')}
                        style={btnPrimario(AMBAR)}>🔒 Cerrar el fichaje</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input type="number" min="1" max="120" value={minutosFichaje} onChange={e => setMinutosFichaje(e.target.value)}
                        style={{ width: 80, padding: '9px 11px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, boxSizing: 'border-box' }} />
                      <span style={{ fontSize: 13, color: '#555' }}>minutos</span>
                      <button onClick={() => accionSesion('abrir_fichaje', { id: c.id, minutos: minutosFichaje })} style={btnPrimario(VERDE)}>✋ Abrir el fichaje</button>
                    </div>
                  )}
                </div>

                {/* Lista de asistentes, con fichaje a mano */}
                <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  {personas.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: 14 }}>{p.fichado_at ? '✅' : '⬜'}</span>
                      <span style={{ flex: 1 }}>{p.nombre}</span>
                      {p.fichado_a_mano_por && <span style={{ fontSize: 10.5, color: '#94a3b8' }}>a mano</span>}
                      {p.fichado_at ? (
                        <button onClick={() => accionSesion('fichar_a_mano', { id: c.id, profesor_id: p.id, quitar: true })}
                          style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>quitar</button>
                      ) : (
                        <button onClick={() => accionSesion('fichar_a_mano', { id: c.id, profesor_id: p.id })}
                          style={{ border: '1px solid #ddd', borderRadius: 6, background: 'white', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>fichar a mano</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Votaciones */}
              <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 18, border: '1px solid #e9d5ff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: MORADO }}>🗳️ Votaciones</div>
                  {!nuevaVot && <button onClick={() => setNuevaVot({ convId: c.id, origen: 'sesion', punto: '', pregunta: '', opciones: ['A favor', 'En contra', 'Abstención'], duracion_seg: '180' })}
                    style={{ ...btnSecundario, padding: '7px 13px', fontSize: 12.5 }}>+ Preparar votación</button>}
                </div>

                {nuevaVot && nuevaVot.origen === 'sesion' && editorVotacion(c.orden_dia)}

                {votaciones.length === 0 && !nuevaVot && (
                  <div style={{ textAlign: 'center', padding: 20, color: '#aaa', fontSize: 13 }}>Todavía no hay ninguna votación preparada</div>
                )}

                {votaciones.map(v => (
                  <div key={v.id} style={{ backgroundColor: v.estado === 'abierta' ? '#faf5ff' : 'white', borderRadius: 9, padding: '11px 13px', marginBottom: 8, border: '1px solid #e9d5ff' }}>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 }}>
                      <div style={{ flex: 1, minWidth: 160, fontWeight: 700, fontSize: 13.5, color: '#333' }}>
                        {v.punto ? `P${v.punto} · ` : ''}{v.pregunta}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: v.estado === 'abierta' ? VERDE : v.estado === 'cerrada' ? '#64748b' : '#94a3b8' }}>
                        {v.estado === 'abierta' ? '🟢 ABIERTA' : v.estado === 'cerrada' ? '🔒 CERRADA' : '⏸️ PREPARADA'}
                      </span>
                    </div>

                    {v.estado === 'preparada' && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => accionSesion('lanzar_votacion', { votacion_id: v.id })} disabled={!!abierta}
                          style={{ ...btnPrimario(VERDE), padding: '7px 14px', fontSize: 12.5, opacity: abierta ? 0.5 : 1 }}>
                          🗳️ Lanzar
                        </button>
                        <button onClick={() => setNuevaVot({ convId: c.id, origen: 'sesion', votacion_id: v.id, punto: v.punto || '', pregunta: v.pregunta, opciones: v.opciones, duracion_seg: String(v.duracion_seg) })}
                          style={{ ...btnSecundario, padding: '7px 14px', fontSize: 12.5 }}>✏️ Editar</button>
                        <button onClick={() => accionSesion('borrar_votacion', { votacion_id: v.id })} style={{ ...btnSecundario, padding: '7px 14px', fontSize: 12.5, color: ROJO }}>🗑️</button>
                      </div>
                    )}

                    {v.estado === 'abierta' && (
                      <>
                        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 8 }}>{v.participantes} {v.participantes === 1 ? 'voto emitido' : 'votos emitidos'}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <a href={`/gestion/votaciones/tablero?votacion=${v.id}`} target="_blank" rel="noreferrer"
                            style={{ ...btnSecundario, padding: '7px 14px', fontSize: 12.5, textDecoration: 'none', display: 'inline-block' }}>📺 Tablero</a>
                          <button onClick={() => accionSesion('cerrar_votacion', { votacion_id: v.id })} style={{ ...btnPrimario(AMBAR), padding: '7px 14px', fontSize: 12.5 }}>🔒 Cerrar ahora</button>
                        </div>
                      </>
                    )}

                    {v.estado === 'cerrada' && v.recuento && (
                      <div>
                        <button onClick={() => setVistaCircular(s => ({ ...s, [v.id]: !s[v.id] }))}
                          style={{ border: 'none', background: 'none', color: MORADO, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 7 }}>
                          {vistaCircular[v.id] ? '📊 Ver como barras' : '🥧 Ver como gráfico circular'}
                        </button>
                        {vistaCircular[v.id] ? (
                          <GraficoCircularVotacion opciones={v.opciones} recuento={v.recuento} size={130} />
                        ) : (
                          (v.opciones || []).map(o => {
                            const total = v.totalVotos || 0;
                            const n = v.recuento[o] || 0; const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                            return (
                              <div key={o} style={{ marginBottom: 5 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{o}</span><span><strong>{n}</strong> · {pct}%</span></div>
                                <div style={{ height: 7, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: MORADO, borderRadius: 4 }} />
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={() => accionSesion('finalizar', { id: c.id }, '¿Finalizar la reunión? Cierra el fichaje y las votaciones abiertas, y se pasa a redactar el acta.')
                .then(r => { if (r) { setNuevaVot(null); setVista('lista'); cargarLista(); } })}
                style={{ ...btnPrimario(ROJO), width: '100%', marginTop: 16, padding: 14, fontSize: 15 }}>
                🏁 Finalizar reunión
              </button>
            </>
          );
        })()}
      </div>
    </div>
  );
}
