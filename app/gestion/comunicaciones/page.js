'use client';
export const dynamic = 'force-dynamic';

/**
 * COMUNICACIONES Y CONVOCATORIAS
 *
 * Donde dirección avisa al claustro o convoca una reunión, ve quién se
 * ha dado por enterado, quién confirma asistencia, abre el control de
 * asistencia el día de la reunión y ficha a mano a quien no tenga la
 * aplicación.
 */

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { DEPARTAMENTOS } from '@/lib/sectores';

const VERDE = '#1e6b2e';
const AZUL  = '#1e3a5f';
const ROJO  = '#991b1b';
const AMBAR = '#b45309';

const AMBITOS = [
  { valor: 'claustro',        label: '👥 Todo el claustro' },
  { valor: 'ccp',             label: '📂 CCP — jefes de departamento y equipo directivo' },
  { valor: 'jefes_dpto',      label: '📂 Jefes de departamento' },
  { valor: 'tutores',         label: '🤝 Tutores' },
  { valor: 'equipo_directivo',label: '🏛️ Equipo directivo' },
  { valor: 'jefes_estudios',  label: '📋 Jefatura de estudios' },
  { valor: 'director',        label: '👔 Dirección' },
  { valor: 'secretario',      label: '📁 Secretaría' },
  { valor: 'departamento',    label: '🏫 Un departamento concreto' },
  { valor: 'manual',          label: '✋ Elegir personas a dedo' },
];

function fechaLarga(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES',
    { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function GestionComunicaciones() {
  const [vista, setVista] = useState('lista');
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [profesores, setProfesores] = useState([]);
  const [ahora, setAhora] = useState(Date.now());

  // Formulario
  const [tipo, setTipo] = useState('aviso');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [ambito, setAmbito] = useState('claustro');
  const [dpto, setDpto] = useState('');
  const [elegidos, setElegidos] = useState([]);
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [lugar, setLugar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [minutosFichaje, setMinutosFichaje] = useState('10');
  // Votaciones de la reunión
  const [votaciones, setVotaciones] = useState([]);
  const [nuevaVot, setNuevaVot] = useState(null);   // id de la convocatoria en la que se está creando
  const [vPregunta, setVPregunta] = useState('');
  const [vOpciones, setVOpciones] = useState(['A favor', 'En contra', 'Abstención']);
  const [vMinutos, setVMinutos] = useState('3');

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/profesor'; return;
    }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargar();
    cargarProfesores();
    cargarVotaciones();
    const t = setInterval(cargar, 15000);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(reloj); };
  }, []);

  function hoyISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function borrarViejas(viejas) {
    const ok = confirm(
      `Se van a eliminar ${viejas.length} comunicaciones ya cerradas o de reuniones pasadas.\n\n` +
      `Se borran también las respuestas y los fichajes, y no se puede deshacer.\n\n` +
      `Descarga antes las actas que necesites conservar.\n\n¿Continuar?`
    );
    if (!ok) return;
    for (const c of viejas) {
      await fetch('/api/comunicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'eliminar', id: c.id }),
      });
    }
    aviso(`🗑️ ${viejas.length} eliminadas`, 'ok');
    cargar();
  }

  async function cargar() {
    try {
      const r = await fetch('/api/comunicaciones?todas=1');
      const d = await r.json();
      setLista(d.comunicaciones || []);
    } catch (e) { /* mantiene lo anterior */ }
    setCargando(false);
  }

  /** Cruza destinatarios con respuestas: quien no contestó también sale */
  function filasInforme(c) {
    const resp = c.respuestas || [];
    const lista = c.listaDestinatarios || [];
    return lista.map(d => {
      const r = resp.find(x => x.profesor_id === d.id);
      return {
        nombre: d.nombre,
        departamento: d.departamento,
        leida: r?.leida_at ? 'Sí' : 'No',
        asistira: r?.asistira === true ? 'Sí' : r?.asistira === false ? 'No' : '—',
        fichado: r?.fichado_at ? 'Sí' : 'No',
        horaFichaje: r?.fichado_at
          ? new Date(r.fichado_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
          : '',
        aMano: r?.a_mano_por || '',
      };
    });
  }

  function informeCSV(c) {
    const filas = filasInforme(c);
    const esConv = c.tipo === 'convocatoria';
    const cab = esConv
      ? ['Profesor/a', 'Departamento', 'Leída', 'Asistirá', 'Presente', 'Hora', 'Fichado a mano por']
      : ['Profesor/a', 'Departamento', 'Leída'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [cab.map(esc).join(';')];
    filas.forEach(f => {
      const fila = esConv
        ? [f.nombre, f.departamento, f.leida, f.asistira, f.fichado, f.horaFichaje, f.aMano]
        : [f.nombre, f.departamento, f.leida];
      lineas.push(fila.map(esc).join(';'));
    });
    const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${esConv ? 'convocatoria' : 'aviso'}_${(c.fecha_reunion || c.created_at || '').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function informePDF(c) {
    const e = t => String(t ?? '').replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const filas = filasInforme(c);
    const esConv = c.tipo === 'convocatoria';
    const suyas = votaciones.filter(v => v.comunicacion_id === c.id);

    const presentes = filas.filter(f => f.fichado === 'Sí');
    const ausentes  = filas.filter(f => f.fichado !== 'Sí');

    const filasHtml = filas.map(f => esConv
      ? `<tr><td>${e(f.nombre)}</td><td>${e(f.departamento)}</td><td class="c">${f.leida}</td><td class="c">${f.asistira}</td><td class="c">${f.fichado}</td><td class="c">${e(f.horaFichaje)}</td></tr>`
      : `<tr><td>${e(f.nombre)}</td><td>${e(f.departamento)}</td><td class="c">${f.leida}</td></tr>`
    ).join('');

    const votHtml = suyas.map(v => {
      const total = v.totalVotos || 0;
      const ops = (v.opciones || []).map(o => {
        const n = v.recuento?.[o] || 0;
        const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0,0';
        return `<tr><td>${e(o)}</td><td class="c">${n}</td><td class="c">${pct}%</td></tr>`;
      }).join('');
      return `<div class="votacion">
        <div class="vpreg">${e(v.pregunta)}</div>
        <table><tr><th>Opción</th><th class="c">Votos</th><th class="c">%</th></tr>${ops}</table>
        <div class="vpie">${total} ${total === 1 ? 'voto' : 'votos'} · ${v.participantes} participantes</div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${esConv ? 'Acta de reunión' : 'Registro de aviso'}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11.5px; color: #222; margin: 32px; }
  h1 { font-size: 17px; color: #1e3a5f; margin: 0 0 4px; }
  h2 { font-size: 13px; color: #1e3a5f; margin: 22px 0 8px; border-bottom: 1.5px solid #1e3a5f; padding-bottom: 3px; }
  .sub { color: #666; margin-bottom: 16px; }
  .datos { background: #f1f5f9; padding: 11px 15px; border-radius: 6px; margin-bottom: 16px; line-height: 1.7; }
  .mensaje { padding: 12px 15px; border-left: 4px solid #cbd5e1; color: #444; margin-bottom: 16px; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #1e3a5f; color: white; padding: 7px; text-align: left; font-size: 10.5px; }
  td { padding: 6px 7px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  .c { text-align: center; }
  .votacion { margin-bottom: 18px; padding: 12px 14px; background: #faf5ff; border-radius: 6px; }
  .vpreg { font-weight: bold; font-size: 13px; margin-bottom: 6px; }
  .vpie { font-size: 10.5px; color: #666; }
  .nota { margin-top: 22px; padding: 12px 15px; background: #eff6ff; border-left: 4px solid #1e40af; font-size: 10.5px; color: #1e3a5f; line-height: 1.65; }
  .pie { margin-top: 28px; padding-top: 9px; border-top: 1px solid #ccc; color: #888; font-size: 10px; }
</style></head><body>
  <h1>${esConv ? 'Acta de reunión' : 'Registro de comunicación'}</h1>
  <div class="sub">IES Gregorio Prieto · Valdepeñas (Ciudad Real)</div>

  <h2>${e(c.titulo)}</h2>
  <div class="mensaje">${e(c.mensaje)}</div>

  <div class="datos">
    <strong>Convocados:</strong> ${e(AMBITOS.find(a => a.valor === c.ambito)?.label.replace(/^[^\s]+\s/, '') || c.ambito)}${c.departamento ? ` — ${e(c.departamento)}` : ''}<br>
    ${c.fecha_reunion ? `<strong>Fecha:</strong> ${e(fechaLarga(c.fecha_reunion))}${c.hora_reunion ? ` · ${e(c.hora_reunion)}` : ''}<br>` : ''}
    ${c.lugar ? `<strong>Lugar:</strong> ${e(c.lugar)}<br>` : ''}
    <strong>Destinatarios:</strong> ${filas.length}
    ${esConv ? `<br><strong>Asistentes:</strong> ${presentes.length} · <strong>Ausentes:</strong> ${ausentes.length}` : ''}
  </div>

  <h2>${esConv ? 'Control de asistencia' : 'Lectura'}</h2>
  <table>
    <tr><th>Profesor/a</th><th>Departamento</th><th class="c">Leída</th>${esConv ? '<th class="c">Asistirá</th><th class="c">Presente</th><th class="c">Hora</th>' : ''}</tr>
    ${filasHtml}
  </table>

  ${suyas.length > 0 ? `<h2>Votaciones</h2>${votHtml}
  <div class="nota">
    <strong>Sobre el secreto del voto.</strong>
    La aplicación registra por separado, en dos almacenamientos que no pueden cruzarse,
    la opción votada y la identidad de quien participa. Ninguno conserva la hora de
    emisión, lo que impide emparejarlos por orden de llegada. No es posible determinar
    el sentido del voto de ninguna persona. Solo pudieron votar quienes constan como
    presentes en el control de asistencia.
  </div>` : ''}

  <div class="pie">
    Generado el ${e(new Date().toLocaleString('es-ES'))} por ${e(usuario)} ·
    APrieto, portal de gestión del IES Gregorio Prieto
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { aviso('El navegador ha bloqueado la ventana. Permite las ventanas emergentes.', 'error'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  async function cargarVotaciones() {
    try {
      const r = await fetch('/api/votaciones');
      const d = await r.json();
      setVotaciones(d.votaciones || []);
    } catch (e) { /* se queda con lo anterior */ }
  }

  async function accionVotacion(nombre, id) {
    const r = await fetch('/api/votaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: nombre, id }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido completar', 'error');
    } else { cargarVotaciones(); }
  }

  async function lanzarVotacion(comunicacionId) {
    const ops = vOpciones.map(o => o.trim()).filter(Boolean);
    if (!vPregunta.trim()) return aviso('Escribe la cuestión.', 'error');
    if (ops.length < 2)    return aviso('Pon al menos dos opciones.', 'error');

    const r = await fetch('/api/votaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear',
        datos: {
          pregunta: vPregunta, opciones: ops,
          duracion_minutos: vMinutos || null,
          comunicacion_id: comunicacionId,
        },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      return aviso(e.error || 'No se ha podido crear', 'error');
    }
    const creada = await r.json().catch(() => ({}));
    if (creada.id) {
      await fetch('/api/votaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'abrir', id: creada.id }),
      });
    }
    aviso('🗳️ Votación lanzada a quienes han pasado lista.', 'ok');
    setNuevaVot(null); setVPregunta(''); setVMinutos('3');
    setVOpciones(['A favor', 'En contra', 'Abstención']);
    cargarVotaciones();
  }

  async function cargarProfesores() {
    const { data } = await getSupabase()
      .from('profesores').select('id, nombre, apellidos, departamento')
      .eq('estado', 'activo').order('apellidos');
    setProfesores(data || []);
  }

  function aviso(t, tipoMsg) {
    setMensaje({ texto: t, tipo: tipoMsg });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    setTimeout(() => setMensaje(null), 4500);
  }

  async function accion(nombre, id, extra, confirmar) {
    if (confirmar && !confirm(confirmar)) return;
    const r = await fetch('/api/comunicaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: nombre, id, datos: extra || {} }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido completar', 'error');
    } else {
      aviso('✅ Hecho', 'ok');
      cargar();
    }
  }

  async function publicar() {
    if (!titulo.trim()) return aviso('Ponle un título.', 'error');
    if (!texto.trim())  return aviso('Escribe el mensaje.', 'error');
    if (ambito === 'departamento' && !dpto) return aviso('Elige el departamento.', 'error');
    if (ambito === 'manual' && elegidos.length === 0) return aviso('Elige al menos una persona.', 'error');
    if (tipo === 'convocatoria' && !fecha) return aviso('Indica el día de la reunión.', 'error');

    setGuardando(true);
    const r = await fetch('/api/comunicaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear',
        datos: {
          tipo, titulo, mensaje: texto, ambito,
          departamento: dpto, destinatarios: elegidos,
          fecha_reunion: fecha || null, hora_reunion: hora || null, lugar: lugar || null,
        },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido publicar', 'error');
    } else {
      aviso(tipo === 'convocatoria'
        ? '📅 Convocatoria publicada. Ya le ha saltado a los convocados.'
        : '📢 Aviso publicado. Ya le ha saltado a quien corresponde.', 'ok');
      setTitulo(''); setTexto(''); setFecha(''); setHora(''); setLugar('');
      setElegidos([]); setAmbito('claustro'); setDpto(''); setTipo('aviso');
      setVista('lista');
      cargar();
    }
    setGuardando(false);
  }

  const btn = (activo) => ({
    padding: '9px 16px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${activo ? AZUL : '#ddd'}`,
    backgroundColor: activo ? AZUL : 'white', color: activo ? 'white' : '#555',
  });

  const campo = { width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>📢 Comunicaciones y convocatorias</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>IES Gregorio Prieto · {usuario}</div>
        </div>
        <a href="/gestion" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>← Inicio</a>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: 16 }}>

        {mensaje && (
          <div style={{
            padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            color: mensaje.tipo === 'ok' ? VERDE : ROJO,
          }}>{mensaje.texto}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setVista('lista')} style={btn(vista === 'lista')}>📋 Publicadas</button>
          <button onClick={() => setVista('nueva')} style={btn(vista === 'nueva')}>➕ Nueva</button>
          {(() => {
            // Las de reuniones ya pasadas o cerradas se acumulan; se
            // pueden borrar de golpe, pero descargando el acta antes.
            const viejas = lista.filter(c =>
              c.estado === 'cerrada' ||
              (c.fecha_reunion && c.fecha_reunion < hoyISO())
            );
            if (viejas.length === 0) return null;
            return (
              <button onClick={() => borrarViejas(viejas)}
                style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${ROJO}`, backgroundColor: 'white', color: ROJO, marginLeft: 'auto' }}>
                🗑️ Limpiar {viejas.length} obsoleta{viejas.length !== 1 ? 's' : ''}
              </button>
            );
          })()}
        </div>

        {/* ─── NUEVA ─── */}
        {vista === 'nueva' && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>

            <div style={{ display: 'flex', gap: 9, marginBottom: 18, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setTipo('aviso')}
                style={{ flex: 1, minWidth: 150, padding: '13px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14,
                  border: `2px solid ${tipo === 'aviso' ? AMBAR : '#ddd'}`,
                  backgroundColor: tipo === 'aviso' ? '#fffbeb' : 'white',
                  color: tipo === 'aviso' ? AMBAR : '#666' }}>
                📢 Aviso
              </button>
              <button type="button" onClick={() => setTipo('convocatoria')}
                style={{ flex: 1, minWidth: 150, padding: '13px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 14,
                  border: `2px solid ${tipo === 'convocatoria' ? AZUL : '#ddd'}`,
                  backgroundColor: tipo === 'convocatoria' ? '#eff6ff' : 'white',
                  color: tipo === 'convocatoria' ? AZUL : '#666' }}>
                📅 Convocatoria
              </button>
            </div>

            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18, lineHeight: 1.6, padding: '10px 13px', borderRadius: 8, backgroundColor: '#f8fafc' }}>
              {tipo === 'aviso'
                ? 'Llega a la aplicación y no les deja seguir hasta que se dan por enterados. Verás quién lo ha leído.'
                : 'Además del aviso, confirman si van a asistir. El día de la reunión abres el control de asistencia y fichan los que estén.'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>Título *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} style={campo}
                placeholder={tipo === 'aviso' ? 'Ej: Revisad vuestra antigüedad en Mis datos' : 'Ej: Claustro ordinario'} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>Mensaje *</label>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5}
                style={{ ...campo, resize: 'vertical', lineHeight: 1.5 }}
                placeholder={tipo === 'convocatoria' ? 'Orden del día, documentación a revisar...' : 'Lo que quieres comunicar.'} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>¿A quién? *</label>
              <select value={ambito} onChange={e => setAmbito(e.target.value)} style={campo}>
                {AMBITOS.map(a => <option key={a.valor} value={a.valor}>{a.label}</option>)}
              </select>
            </div>

            {ambito === 'departamento' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>Departamento *</label>
                <select value={dpto} onChange={e => setDpto(e.target.value)} style={campo}>
                  <option value="">— Elige —</option>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            {ambito === 'manual' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                  Personas ({elegidos.length} elegidas) *
                </label>
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                  {profesores.map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={elegidos.includes(p.id)}
                        onChange={() => setElegidos(prev => prev.includes(p.id)
                          ? prev.filter(x => x !== p.id) : [...prev, p.id])} />
                      {p.apellidos}, {p.nombre}
                      <span style={{ color: '#94a3b8', fontSize: 11.5 }}>{p.departamento}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tipo === 'convocatoria' && (
              <div style={{ padding: 15, borderRadius: 10, backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 11 }}>Datos de la reunión</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 4 }}>Día *</label>
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={campo} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 4 }}>Hora</label>
                    <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={campo} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 4 }}>Lugar</label>
                    <input value={lugar} onChange={e => setLugar(e.target.value)} style={campo} placeholder="Salón de actos" />
                  </div>
                </div>
              </div>
            )}

            <button onClick={publicar} disabled={guardando}
              style={{ padding: '14px 28px', borderRadius: 10, border: 'none',
                backgroundColor: tipo === 'convocatoria' ? AZUL : AMBAR,
                color: 'white', fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
              {guardando ? 'Publicando...' : tipo === 'convocatoria' ? '📅 Publicar convocatoria' : '📢 Publicar aviso'}
            </button>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
              Les saltará en la aplicación en menos de medio minuto.
            </div>
          </div>
        )}

        {/* ─── LISTA ─── */}
        {vista === 'lista' && (
          cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📢</div>
              Todavía no has publicado nada
            </div>
          ) : (
            lista.map(c => {
              const esConv = c.tipo === 'convocatoria';
              const resp = c.respuestas || [];
              const leidas = resp.filter(r => r.leida_at).length;
              const siran  = resp.filter(r => r.asistira === true).length;
              const noiran = resp.filter(r => r.asistira === false).length;
              const fichados = resp.filter(r => r.fichado_at).length;
              const total = c.totalDestinatarios || 0;
              const abiertaEsta = abierta === c.id;

              let restante = null;
              if (c.fichajeAbierto && c.fichajeCierre) {
                const falta = new Date(c.fichajeCierre).getTime() - ahora;
                const m = Math.max(0, Math.floor(falta / 60000));
                const s = Math.max(0, Math.floor((falta % 60000) / 1000));
                restante = `${m}:${String(s).padStart(2, '0')}`;
              }

              return (
                <div key={c.id} style={{
                  backgroundColor: 'white', borderRadius: 12, marginBottom: 13,
                  border: `2px solid ${c.fichajeAbierto ? '#bbf7d0' : esConv ? '#bfdbfe' : '#fde68a'}`,
                  overflow: 'hidden',
                }}>
                  <div onClick={() => setAbierta(abiertaEsta ? null : c.id)} style={{ padding: '15px 17px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 190 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: esConv ? AZUL : AMBAR, marginBottom: 4 }}>
                          {esConv ? '📅 CONVOCATORIA' : '📢 AVISO'}
                          {c.estado === 'cerrada' && ' · CERRADA'}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#222', lineHeight: 1.35 }}>{c.titulo}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                          {AMBITOS.find(a => a.valor === c.ambito)?.label.replace(/^[^\s]+\s/, '') || c.ambito}
                          {c.departamento ? ` · ${c.departamento}` : ''}
                          {c.fecha_reunion ? ` · ${fechaLarga(c.fecha_reunion)}` : ''}
                        </div>
                      </div>
                      {c.fichajeAbierto && (
                        <div style={{ padding: '7px 14px', borderRadius: 10, textAlign: 'center', backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: VERDE, fontVariantNumeric: 'tabular-nums' }}>{restante || '—'}</div>
                          <div style={{ fontSize: 10, color: '#666' }}>fichaje</div>
                        </div>
                      )}
                    </div>

                    {/* Recuento */}
                    <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
                      <span><strong style={{ color: AZUL }}>{leidas}</strong>/{total} leído</span>
                      {esConv && <>
                        <span style={{ color: VERDE }}><strong>{siran}</strong> asistirán</span>
                        <span style={{ color: ROJO }}><strong>{noiran}</strong> no podrán</span>
                        {fichados > 0 && <span style={{ color: VERDE }}>✋ <strong>{fichados}</strong> fichados</span>}
                      </>}
                    </div>
                  </div>

                  {abiertaEsta && (
                    <div style={{ padding: '0 17px 16px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ paddingTop: 13, fontSize: 13.5, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                        {c.mensaje}
                      </div>

                      {/* Control de asistencia */}
                      {esConv && (
                        <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 14 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 10 }}>✋ Control de asistencia</div>
                          {c.fichajeAbierto ? (
                            <button onClick={() => accion('cerrar_fichaje', c.id, {}, '¿Cerrar el control de asistencia ahora?')}
                              style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: AMBAR, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                              🔒 Cerrar el fichaje
                            </button>
                          ) : (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <input type="number" min="1" max="120" value={minutosFichaje}
                                onChange={e => setMinutosFichaje(e.target.value)}
                                style={{ width: 80, padding: '9px 11px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, boxSizing: 'border-box' }} />
                              <span style={{ fontSize: 13, color: '#555' }}>minutos</span>
                              <button onClick={() => accion('abrir_fichaje', c.id, { minutos: minutosFichaje })}
                                style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                                ✋ Abrir el fichaje
                              </button>
                            </div>
                          )}
                          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                            Al abrirlo, a los convocados les salta un botón para fichar. Ábrelo
                            cuando empiece la reunión, con la gente ya sentada.
                          </div>
                        </div>
                      )}

                      {/* Votaciones de la reunión */}
                      {esConv && (() => {
                        const suyas = votaciones.filter(v => v.comunicacion_id === c.id);
                        return (
                          <div style={{ padding: 14, borderRadius: 10, backgroundColor: '#faf5ff', border: '1px solid #d8b4fe', marginBottom: 14 }}>
                            <div style={{ fontWeight: 800, fontSize: 13, color: '#7e22ce', marginBottom: 10 }}>
                              🗳️ Votaciones de esta reunión
                            </div>

                            {suyas.map(v => {
                              const total = v.totalVotos || 0;
                              return (
                                <div key={v.id} style={{ backgroundColor: 'white', borderRadius: 9, padding: '11px 13px', marginBottom: 8, border: '1px solid #e9d5ff' }}>
                                  <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 6 }}>
                                    <div style={{ flex: 1, minWidth: 160, fontWeight: 700, fontSize: 13.5, color: '#333' }}>
                                      {v.pregunta}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: v.abierta ? VERDE : '#64748b' }}>
                                      {v.abierta ? '🟢 ABIERTA' : '🔒 CERRADA'}
                                    </span>
                                  </div>
                                  {v.abierta ? (
                                    <>
                                      <div style={{ fontSize: 12.5, color: '#475569' }}>
                                        {v.participantes} {v.participantes === 1 ? 'voto emitido' : 'votos emitidos'}
                                      </div>
                                      <button onClick={() => accionVotacion('cerrar', v.id)}
                                        style={{ marginTop: 8, padding: '7px 14px', borderRadius: 8, border: 'none', backgroundColor: AMBAR, color: 'white', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                                        🔒 Cerrar ahora
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {(v.opciones || []).map(o => {
                                        const n = v.recuento?.[o] || 0;
                                        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                                        return (
                                          <div key={o} style={{ marginBottom: 5 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                                              <span>{o}</span><span><strong>{n}</strong> · {pct}%</span>
                                            </div>
                                            <div style={{ height: 7, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
                                              <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#7e22ce', borderRadius: 4 }} />
                                            </div>
                                          </div>
                                        );
                                      })}
                                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 6 }}>
                                        {total} {total === 1 ? 'voto' : 'votos'} · {v.participantes} participantes
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}

                            {nuevaVot === c.id ? (
                              <div style={{ backgroundColor: 'white', borderRadius: 9, padding: 13, border: '1.5px solid #d8b4fe' }}>
                                <input value={vPregunta} onChange={e => setVPregunta(e.target.value)}
                                  placeholder="¿Qué se somete a votación?"
                                  style={{ ...campo, marginBottom: 9 }} />
                                {vOpciones.map((o, i) => (
                                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                                    <input value={o} onChange={e => setVOpciones(ops => ops.map((x, j) => j === i ? e.target.value : x))}
                                      style={{ ...campo, padding: '9px 11px', fontSize: 13 }} />
                                    {vOpciones.length > 2 && (
                                      <button type="button" onClick={() => setVOpciones(ops => ops.filter((_, j) => j !== i))}
                                        style={{ padding: '0 12px', borderRadius: 8, border: '1.5px solid #fecaca', backgroundColor: 'white', color: ROJO, cursor: 'pointer' }}>✕</button>
                                    )}
                                  </div>
                                ))}
                                <button type="button" onClick={() => setVOpciones(ops => [...ops, ''])}
                                  style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px dashed #cbd5e1', backgroundColor: 'white', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
                                  + Otra opción
                                </button>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 11 }}>
                                  <input type="number" min="1" max="60" value={vMinutos} onChange={e => setVMinutos(e.target.value)}
                                    style={{ width: 72, padding: '9px 11px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, boxSizing: 'border-box' }} />
                                  <span style={{ fontSize: 12.5, color: '#555' }}>minutos</span>
                                </div>
                                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                                  <button onClick={() => lanzarVotacion(c.id)}
                                    style={{ padding: '11px 20px', borderRadius: 9, border: 'none', backgroundColor: '#7e22ce', color: 'white', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                                    🚀 Lanzar votación
                                  </button>
                                  <button onClick={() => setNuevaVot(null)}
                                    style={{ padding: '11px 16px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <button onClick={() => setNuevaVot(c.id)}
                                  style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: '#7e22ce', color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                                  ➕ Nueva votación
                                </button>
                                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                                  Solo podrán votar quienes hayan pasado lista en esta reunión.
                                  El voto es secreto.
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {/* Quién ha respondido */}
                      {resp.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 8 }}>Respuestas</div>
                          {resp.map((r, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', fontSize: 13 }}>
                              <span style={{ flex: 1, minWidth: 0 }}>{r.profesor_nombre}</span>
                              {r.fichado_at && <span title="Fichó" style={{ color: VERDE, fontWeight: 700, fontSize: 12 }}>✋ presente</span>}
                              {esConv && r.asistira === true  && !r.fichado_at && <span style={{ color: VERDE, fontSize: 12 }}>asistirá</span>}
                              {esConv && r.asistira === false && <span style={{ color: ROJO, fontSize: 12 }}>no podrá</span>}
                              {!esConv && r.leida_at && <span style={{ color: '#94a3b8', fontSize: 12 }}>leído</span>}
                              {r.a_mano_por && <span style={{ color: AMBAR, fontSize: 11 }}>a mano</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fichar a mano */}
                      {esConv && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: AZUL, marginBottom: 6 }}>
                            Fichar a mano a quien no use la aplicación
                          </div>
                          <select defaultValue="" style={{ ...campo, maxWidth: 340 }}
                            onChange={e => {
                              if (!e.target.value) return;
                              accion('fichar_a_mano', c.id, { profesor_id: e.target.value });
                              e.target.value = '';
                            }}>
                            <option value="">— Elige a quien esté presente —</option>
                            {profesores
                              .filter(p => !resp.some(r => r.profesor_id === p.id && r.fichado_at))
                              .map(p => <option key={p.id} value={p.id}>{p.apellidos}, {p.nombre}</option>)}
                          </select>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        <button onClick={() => informePDF(c)}
                          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', backgroundColor: AZUL, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          📄 {esConv ? 'Acta en PDF' : 'Informe en PDF'}
                        </button>
                        <button onClick={() => informeCSV(c)}
                          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          📊 CSV
                        </button>
                        {c.estado !== 'cerrada' && (
                          <button onClick={() => accion('cerrar', c.id, {}, '¿Cerrarla? Dejará de saltarle a nadie.')}
                            style={{ padding: '9px 16px', borderRadius: 9, border: '1.5px solid #ddd', backgroundColor: 'white', color: '#666', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            🔒 Cerrar
                          </button>
                        )}
                        <button onClick={() => accion('eliminar', c.id, {}, `¿Eliminar "${c.titulo}"?\n\nSe borran también las respuestas y no se puede deshacer.`)}
                          style={{ padding: '9px 16px', borderRadius: 9, border: `1.5px solid ${ROJO}`, backgroundColor: 'white', color: ROJO, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
