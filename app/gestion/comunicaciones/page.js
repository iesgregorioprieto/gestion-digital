'use client';
export const dynamic = 'force-dynamic';

/**
 * AVISOS AL CLAUSTRO
 *
 * Donde dirección avisa al claustro, a un departamento o a quien elija.
 * Dos formas: a pantalla completa (hay que darse por enterado) o solo
 * en el banner «Hoy» hasta una fecha.
 *
 * Las convocatorias oficiales de reunión (orden del día, fichaje,
 * votaciones en el momento) tienen su propio módulo aparte, en
 * /gestion/convocatorias. Este de aquí es solo para avisos.
 */

import { useState, useEffect } from 'react';
import { consulta } from '@/lib/consulta';
import { DEPARTAMENTOS } from '@/lib/sectores';
import PanelEquipos from './PanelEquipos';

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
  { valor: 'equipo',          label: '👥 Un equipo de trabajo' },
  { valor: 'manual',          label: '✋ Elegir personas a dedo' },
];

export default function GestionComunicaciones() {
  // Pestaña del módulo: avisos o equipos (quién compone cada equipo de
  // trabajo, reutilizable como destinatario).
  const [seccion, setSeccion] = useState('avisos');
  const [vista, setVista] = useState('lista');
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [mensaje, setMensaje] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [profesores, setProfesores] = useState([]);

  // Formulario
  // «ventana» (pantalla completa, hay que leerlo) o «banner» (una línea
  // en el banner «Hoy» hasta una fecha)
  const [modoAviso, setModoAviso] = useState('ventana');
  const [hastaBanner, setHastaBanner] = useState('');
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [ambitos, setAmbitos] = useState(['claustro']);
  const [equipos, setEquipos] = useState([]);
  const [equiposElegidos, setEquiposElegidos] = useState([]);
  const [dptos, setDptos] = useState([]);
  const [elegidos, setElegidos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch('/api/equipos')
      .then(r => r.ok ? r.json() : { equipos: [] })
      .then(d => setEquipos(d.equipos || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('seccion');
    if (['avisos', 'equipos'].includes(q)) setSeccion(q);
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const rol = sessionStorage.getItem('profesor_rol_gestion') || '';
    if (!['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/profesor'; return;
    }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargar();
    cargarProfesores();
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, []);

  async function borrarViejas(viejas) {
    const ok = confirm(
      `Se van a eliminar ${viejas.length} avisos ya cerrados.\n\n` +
      `Se borran también las respuestas, y no se puede deshacer.\n\n¿Continuar?`
    );
    if (!ok) return;
    for (const c of viejas) {
      await fetch('/api/comunicaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'eliminar', id: c.id }),
      });
    }
    aviso(`🗑️ ${viejas.length} eliminados`, 'ok');
    cargar();
  }

  async function cargar() {
    try {
      const r = await fetch('/api/comunicaciones?todas=1');
      const d = await r.json();
      // Lo de tipo «convocatoria» es historial del módulo antiguo; las
      // convocatorias de verdad viven ahora en /gestion/convocatorias.
      setLista((d.comunicaciones || []).filter(c => c.tipo !== 'convocatoria'));
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
      };
    });
  }

  function informeCSV(c) {
    const filas = filasInforme(c);
    const cab = ['Profesor/a', 'Departamento', 'Leída'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [cab.map(esc).join(';')];
    filas.forEach(f => lineas.push([f.nombre, f.departamento, f.leida].map(esc).join(';')));
    const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `aviso_${(c.created_at || '').slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function informePDF(c) {
    const e = t => String(t ?? '').replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
    const filas = filasInforme(c);

    const _ambs = Array.isArray(c.ambito) ? c.ambito : [c.ambito];
    const ambitoLabel = _ambs.map(a => AMBITOS.find(x => x.valor === a)?.label.replace(/^[^\s]+\s/, '') || a).join(', ')
      + (c.departamento ? ' \u2014 ' + (Array.isArray(c.departamento) ? c.departamento.join(', ') : c.departamento) : '');

    const filasHtml = filas.map(f =>
      `<tr><td>${e(f.nombre)}</td><td>${e(f.departamento)}</td><td class="c">${f.leida}</td></tr>`
    ).join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Registro de aviso</title>
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
  .pie { margin-top: 28px; padding-top: 9px; border-top: 1px solid #ccc; color: #888; font-size: 10px; }
</style></head><body>
  <h1>Registro de comunicación</h1>
  <div class="sub">IES Gregorio Prieto · Valdepeñas (Ciudad Real)</div>

  <h2>${e(c.titulo)}</h2>
  <div class="mensaje">${e(c.mensaje)}</div>

  <div class="datos">
    <strong>Convocados:</strong> ${e(ambitoLabel)}<br>
    <strong>Destinatarios:</strong> ${filas.length}
  </div>

  <h2>Lectura</h2>
  <table>
    <tr><th>Profesor/a</th><th>Departamento</th><th class="c">Leída</th></tr>
    ${filasHtml}
  </table>

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

  async function cargarProfesores() {
    const { data } = await consulta('profesores').select('id, nombre, apellidos, departamento')
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
    if (ambitos.length === 0) return aviso('Elige a quién va dirigida.', 'error');

    // Mandar algo a 155 personas sin querer es muy caro de deshacer: se
    // pide confirmación expresa.
    if (ambitos.includes('claustro')) {
      if (!confirm('Vas a enviar este aviso a TODO EL CLAUSTRO.\n\n¿Seguro?')) return;
    }
    if (ambitos.includes('departamento') && dptos.length === 0) return aviso('Elige al menos un departamento.', 'error');
    if (ambitos.includes('manual') && elegidos.length === 0) return aviso('Elige al menos una persona.', 'error');
    if (ambitos.includes('equipo') && equiposElegidos.length === 0) return aviso('Elige al menos un equipo.', 'error');
    const enBanner = modoAviso === 'banner';
    if (enBanner && !hastaBanner) return aviso('Indica hasta qué día se muestra en el banner.', 'error');

    setGuardando(true);
    const r = await fetch('/api/comunicaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion: 'crear',
        datos: {
          tipo: enBanner ? 'banner' : 'aviso', titulo, mensaje: texto, ambito: ambitos,
          caduca_at: enBanner ? new Date(`${hastaBanner}T23:59:59`).toISOString() : null,
          departamento: ambitos.includes('departamento') ? dptos : null,
          destinatarios: ambitos.includes('manual') ? elegidos : null,
          equipos: ambitos.includes('equipo') ? equiposElegidos : null,
        },
      }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      aviso(e.error || 'No se ha podido publicar', 'error');
    } else {
      aviso(enBanner
        ? `📌 Publicado en el banner de sus destinatarios hasta el ${hastaBanner.split('-').reverse().join('/')}.`
        : '📢 Aviso publicado. Ya le ha saltado a quien corresponde.', 'ok');
      setTitulo(''); setTexto(''); setModoAviso('ventana'); setHastaBanner('');
      setElegidos([]); setAmbitos(['claustro']); setDptos([]); setEquiposElegidos([]);
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

  // Pestañas del módulo. La activa se une a la página; las otras llevan
  // fuera sin pasar por el panel.
  const pestana = (activo) => ({
    padding: '9px 15px', borderRadius: '10px 10px 0 0', fontSize: 13.5, fontWeight: 700,
    textDecoration: 'none', display: 'inline-block',
    border: '1px solid #e2e8f0', borderBottom: activo ? '1px solid #f0f4f0' : '1px solid #e2e8f0',
    marginBottom: -1,
    backgroundColor: activo ? '#f0f4f0' : '#f8fafc',
    color: activo ? VERDE : '#64748b',
  });

  const campo = { width: '100%', padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: VERDE, color: 'white', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>📢 Avisos</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>IES Gregorio Prieto · {usuario}</div>
        </div>
        <a href="/gestion" style={{ color: 'white', padding: '6px 13px', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 7, fontSize: 13.5, textDecoration: 'none' }}>← Inicio</a>
      </div>

      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '9px 16px 0', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => { setSeccion('avisos'); setVista('lista'); }}
          style={{ ...pestana(seccion === 'avisos'), border: 'none', cursor: 'pointer', font: 'inherit' }}>
          📢 Avisos
        </button>
        <a href="/gestion/convocatorias" style={pestana(false)}>📅 Convocatorias oficiales</a>
        <a href="/gestion/votaciones" style={pestana(false)}>🗳️ Votaciones sueltas</a>
        <button onClick={() => { setSeccion('equipos'); setVista('lista'); }}
          style={{ ...pestana(seccion === 'equipos'), border: 'none', cursor: 'pointer', font: 'inherit' }}>
          👥 Equipos
        </button>
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

        {seccion === 'equipos' && <PanelEquipos />}

        {seccion === 'avisos' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button onClick={() => setVista('lista')} style={btn(vista === 'lista')}>📋 Publicados</button>
          <button onClick={() => setVista('nueva')} style={btn(vista === 'nueva')}>➕ Nuevo aviso</button>
          {(() => {
            const viejas = lista.filter(c => c.estado === 'cerrada');
            if (viejas.length === 0) return null;
            return (
              <button onClick={() => borrarViejas(viejas)}
                style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${ROJO}`, backgroundColor: 'white', color: ROJO, marginLeft: 'auto' }}>
                🗑️ Limpiar {viejas.length} obsoleto{viejas.length !== 1 ? 's' : ''}
              </button>
            );
          })()}
        </div>
        )}

        {/* ─── NUEVA ─── */}
        {seccion === 'avisos' && vista === 'nueva' && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, border: '1px solid #e5e7eb' }}>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>¿Cómo se muestra?</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['ventana', '🪟 Ventana al abrir', 'A pantalla completa; hay que darse por enterado. Para lo importante.'],
                  ['banner', '📌 Solo en el banner', 'Una línea arriba del panel hasta el día que elijas. Para recordatorios.']].map(([v, t, d]) => (
                  <button key={v} type="button" onClick={() => setModoAviso(v)} style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${modoAviso === v ? AZUL : '#e2e8f0'}`, backgroundColor: modoAviso === v ? '#eff6ff' : 'white',
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 13.5, color: AZUL }}>{t}</div>
                    <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>{d}</div>
                  </button>
                ))}
              </div>
              {modoAviso === 'banner' && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12.5, fontWeight: 700, color: AZUL }}>Mostrar hasta el día (incluido) *</label>
                  <input type="date" value={hastaBanner} min={new Date().toLocaleDateString('sv-SE')}
                    onChange={e => setHastaBanner(e.target.value)} style={{ ...campo, marginTop: 4 }} />
                </div>
              )}
            </div>

            <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 18, lineHeight: 1.6, padding: '10px 13px', borderRadius: 8, backgroundColor: '#f8fafc' }}>
              {modoAviso === 'banner'
                ? 'Sale como una línea en el banner «Hoy» de sus destinatarios, arriba del panel, hasta el día que elijas. No interrumpe ni pide confirmación.'
                : 'Llega a la aplicación y no les deja seguir hasta que se dan por enterados. Verás quién lo ha leído.'}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>Título *</label>
              <input value={titulo} onChange={e => setTitulo(e.target.value)} style={campo}
                placeholder="Ej: Revisad vuestra antigüedad en Mis datos" />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>Mensaje *</label>
              <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={5}
                style={{ ...campo, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Lo que quieres comunicar." />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>¿A quién? *</label>
              <div style={{ border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                {AMBITOS.map(a => {
                  const marcado = ambitos.includes(a.valor);
                  return (
                    <label key={a.valor} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', cursor: 'pointer', fontSize: 13.5,
                      fontWeight: marcado ? 700 : 400, color: marcado ? AZUL : '#333' }}>
                      <input type="checkbox" checked={marcado}
                        onChange={() => {
                          if (a.valor === 'claustro') {
                            setAmbitos(['claustro']);
                            setDptos([]); setElegidos([]);
                          } else {
                            setAmbitos(prev => {
                              const sin = prev.filter(x => x !== 'claustro' && x !== a.valor);
                              // Al desmarcar el último ámbito NO se pone
                              // "todo el claustro". Antes sí, y era muy
                              // peligroso: si marcabas "personas a dedo" y
                              // luego lo desmarcabas para cambiar de idea,
                              // quedaba seleccionado el claustro entero sin
                              // avisar, y el aviso salía a los 155.
                              // Mejor quedarse sin nadie: el botón de
                              // publicar se bloquea y se ve el motivo.
                              if (marcado) return sin;
                              return [...sin, a.valor];
                            });
                          }
                        }} />
                      {a.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* A cuánta gente va, siempre a la vista. Publicar algo al
                claustro entero sin querer es muy fácil y muy caro: esto
                lo pone delante antes de pulsar. */}
            <div style={{
              margin: '10px 0 16px', padding: '10px 14px', borderRadius: 9, fontSize: 13,
              backgroundColor: ambitos.includes('claustro') ? '#fffbeb' : '#f8fafc',
              border: `1.5px solid ${ambitos.includes('claustro') ? '#fcd34d' : '#e2e8f0'}`,
              color: ambitos.includes('claustro') ? '#92400e' : '#475569', fontWeight: 600,
            }}>
              {ambitos.length === 0
                ? '⚠️ No has elegido a nadie todavía'
                : ambitos.includes('claustro')
                  ? '📣 Va a TODO EL CLAUSTRO'
                  : `Va a: ${ambitos.map(a => AMBITOS.find(x => x.valor === a)?.label.replace(/^[^\s]+\s/, '') || a).join(' · ')}`}
            </div>

            {ambitos.includes('departamento') && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: AZUL, display: 'block', marginBottom: 6 }}>
                  Departamentos ({dptos.length} elegidos) *
                </label>
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                  {DEPARTAMENTOS.map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={dptos.includes(d)}
                        onChange={() => setDptos(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])} />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {ambitos.includes('equipo') && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12.5, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
                  Equipos ({equiposElegidos.length} elegido{equiposElegidos.length !== 1 ? 's' : ''}) *
                </label>
                {equipos.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: '#92400e', padding: '10px 13px', borderRadius: 8, backgroundColor: '#fffbeb', border: '1px solid #fcd34d' }}>
                    Todavía no hay equipos creados. Créalos en la pestaña 👥 Equipos.
                  </div>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1.5px solid #ddd', borderRadius: 8, padding: 8 }}>
                    {equipos.map(eq => (
                      <label key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={equiposElegidos.includes(eq.id)}
                          onChange={() => setEquiposElegidos(prev => prev.includes(eq.id)
                            ? prev.filter(x => x !== eq.id) : [...prev, eq.id])} />
                        <strong>{eq.nombre}</strong>
                        <span style={{ color: '#94a3b8', fontSize: 11.5 }}>
                          {(eq.miembros || []).length} miembro{(eq.miembros || []).length !== 1 ? 's' : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {ambitos.includes('manual') && (
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

            <button onClick={publicar} disabled={guardando}
              style={{ padding: '14px 28px', borderRadius: 10, border: 'none',
                backgroundColor: AMBAR, color: 'white', fontWeight: 800, fontSize: 15.5, cursor: 'pointer' }}>
              {guardando ? 'Publicando...' : '📢 Publicar aviso'}
            </button>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
              Les saltará en la aplicación en menos de medio minuto.
            </div>
          </div>
        )}

        {/* ─── LISTA ─── */}
        {seccion === 'avisos' && vista === 'lista' && (
          cargando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>Cargando...</div>
          ) : lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 50, color: '#aaa', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📢</div>
              Todavía no has publicado ningún aviso
            </div>
          ) : (
            lista.map(c => {
              const resp = c.respuestas || [];
              const leidas = resp.filter(r => r.leida_at).length;
              const total = c.totalDestinatarios || 0;
              const abiertaEsta = abierta === c.id;

              return (
                <div key={c.id} style={{
                  backgroundColor: 'white', borderRadius: 12, marginBottom: 13,
                  border: `2px solid ${AMBAR}55`,
                  overflow: 'hidden',
                }}>
                  <div onClick={() => setAbierta(abiertaEsta ? null : c.id)} style={{ padding: '15px 17px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 190 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: AMBAR, marginBottom: 4 }}>
                          📢 AVISO{c.estado === 'cerrada' && ' · CERRADO'}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#222', lineHeight: 1.35 }}>{c.titulo}</div>
                        {c.tipo === 'banner' && (
                          <div style={{ marginTop: 4, display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 10,
                            backgroundColor: c.caduca_at && new Date(c.caduca_at) < new Date() ? '#f1f5f9' : '#eff6ff',
                            color: c.caduca_at && new Date(c.caduca_at) < new Date() ? '#64748b' : '#1e40af' }}>
                            📌 {c.caduca_at && new Date(c.caduca_at) < new Date() ? 'Ya no sale en el banner' : `En el banner hasta el ${new Date(c.caduca_at).toLocaleDateString('es-ES')}`}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                          {(Array.isArray(c.ambito) ? c.ambito : [c.ambito]).map(a => AMBITOS.find(x => x.valor === a)?.label.replace(/^[^\s]+\s/, '') || a).join(', ')}
                          {c.departamento ? ` · ${Array.isArray(c.departamento) ? c.departamento.join(', ') : c.departamento}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', fontSize: 12.5 }}>
                      <span><strong style={{ color: AZUL }}>{leidas}</strong>/{total} leído</span>
                    </div>
                  </div>

                  {abiertaEsta && (
                    <div style={{ padding: '0 17px 16px', borderTop: '1px solid #f1f5f9' }}>
                      <div style={{ paddingTop: 13, fontSize: 13.5, color: '#444', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                        {c.mensaje}
                      </div>

                      {/* Quién ha respondido */}
                      {resp.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontWeight: 800, fontSize: 13, color: AZUL, marginBottom: 8 }}>Respuestas</div>
                          {resp.map((r, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', fontSize: 13 }}>
                              <span style={{ flex: 1, minWidth: 0 }}>{r.profesor_nombre}</span>
                              {r.leida_at && <span style={{ color: '#94a3b8', fontSize: 12 }}>leído</span>}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        <button onClick={() => informePDF(c)}
                          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', backgroundColor: AZUL, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          📄 Informe en PDF
                        </button>
                        <button onClick={() => informeCSV(c)}
                          style={{ padding: '9px 16px', borderRadius: 9, border: 'none', backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          📊 CSV
                        </button>
                        {c.estado !== 'cerrada' && (
                          <button onClick={() => accion('cerrar', c.id, {}, '¿Cerrarlo? Dejará de saltarle a nadie.')}
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
