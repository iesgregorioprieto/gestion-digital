'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import { getSupabase } from '@/lib/supabase';
import { getConfigCurso, esDiaLectivo } from '@/lib/curso';

const FAMILIAS = {
  'ESO':  'ESO',            'BTO':  'Bachillerato',
  'GB':   'FP Básica',      'GM':   'Grado Medio',
  'GS':   'Grado Superior', 'CA':   'Cursos Espec.',
  'FPPE': 'FP Permanente',
};

/** Agrupa los códigos de grupo por etapa, en el orden del catálogo */
function agruparPorFamilia(codigos) {
  const bloques = {};
  const sueltos = [];
  (codigos || []).forEach(g => {
    const G = (g || '').trim().toUpperCase();
    const fam = Object.keys(FAMILIAS).find(p => G.startsWith(p + '-') || G.startsWith(p + ' '));
    if (fam) (bloques[fam] = bloques[fam] || []).push(g);
    else sueltos.push(g);
  });
  const orden = Object.keys(FAMILIAS).filter(f => bloques[f]?.length);
  const salida = orden.map(f => ({ familia: f, nombre: FAMILIAS[f], grupos: bloques[f].sort() }));
  if (sueltos.length) salida.push({ familia: 'OTROS', nombre: 'Otros', grupos: sueltos.sort() });
  return salida;
}

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
  const [vista, setVista]         = useState('lista'); // 'lista' | 'nueva'
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
    lugar: '', transporte: '', coste_alumno: '', descripcion: '', financiacion: '',
    profesor_guardia: '',
    en_pga: null,          // null = sin elegir todavía
    pga_seleccionada: '',  // id de la actividad de la PGA
  });
  const [pgaLista, setPgaLista] = useState([]);
  const [comision, setComision] = useState(null);   // documento de comisiones de servicio
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  const [alumnosPorGrupo, setAlumnosPorGrupo] = useState({});
  const [asistentes, setAsistentes] = useState({});
  const [cargandoAlumnos, setCargandoAlumnos] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Al elegir grupos se traen sus alumnos. Por defecto van todos,
  // que es lo habitual; el profesor va quitando a quien no vaya.
  useEffect(() => {
    const pendientes = form.grupos.filter(g => !alumnosPorGrupo[g]);
    if (pendientes.length === 0) return;
    let cancelado = false;
    setCargandoAlumnos(true);
    (async () => {
      const nuevos = {}, nuevosAsist = {};
      for (const g of pendientes) {
        try {
          const r = await fetch(`/api/alumnos?grupo=${encodeURIComponent(g)}`);
          const d = await r.json();
          const lista = d.alumnos || [];
          nuevos[g] = lista;
          nuevosAsist[g] = lista.map(a => a.id);
        } catch (e) {
          nuevos[g] = []; nuevosAsist[g] = [];
        }
      }
      if (cancelado) return;
      setAlumnosPorGrupo(prev => ({ ...prev, ...nuevos }));
      setAsistentes(prev => ({ ...prev, ...nuevosAsist }));
      setCargandoAlumnos(false);
    })();
    return () => { cancelado = true; };
  }, [form.grupos]);

  const alternarAlumno = (grupo, id) => {
    setAsistentes(prev => {
      const actual = prev[grupo] || [];
      return { ...prev, [grupo]: actual.includes(id) ? actual.filter(x => x !== id) : [...actual, id] };
    });
  };

  const todosDelGrupo = (grupo) => {
    const total = (alumnosPorGrupo[grupo] || []).length;
    return total > 0 && (asistentes[grupo] || []).length === total;
  };

  // Si alguien se queda en el centro, hace falta profesor de guardia
  const hayAlumnosQueSeQuedan = () =>
    form.grupos.some(g => (alumnosPorGrupo[g] || []).length > 0 && !todosDelGrupo(g));

  const totalVan = () => form.grupos.reduce((t, g) => t + (asistentes[g] || []).length, 0);
  const aviso = (texto, tipo = 'ok') => {
    setMensaje({ texto, tipo });
    // El aviso se dibuja al principio de la página y el botón de enviar
    // está al final: sin esto el profesor no ve por qué no se envía.
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
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
      const [{ data: acts }, { data: gs }, { data: pga }, { data: profs }, { data: yo }] = await Promise.all([
        getSupabase().from('actividades').select('*').order('fecha_inicio', { ascending: true }),
        getSupabase().from('grupos').select('codigo').order('codigo'),
        getSupabase().from('actividades_pga').select('id, actividad, localidad, departamento').order('departamento').order('actividad'),
        getSupabase().from('profesores').select('id, nombre, apellidos').eq('estado', 'activo').order('apellidos'),
        getSupabase().from('profesores').select('departamento').eq('id', id),
      ]);

      setActividades(acts || []);
      setGrupos((gs || []).map(g => g.codigo).filter(Boolean));
      setPgaLista(pga || []);
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

  async function subirComision() {
    if (!comision) return null;
    const ext = comision.name.split('.').pop();
    const nombre = `comisiones/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await getSupabase().storage.from('actividades-docs').upload(nombre, comision);
    if (error) { console.error('subir comisión:', error.message); return null; }
    const { data } = getSupabase().storage.from('actividades-docs').getPublicUrl(nombre);
    return data.publicUrl;
  }

  async function enviar() {
    if (form.en_pga === null)  return aviso('Indica si la actividad está aprobada en la PGA.', 'error');
    if (form.en_pga === true && !form.pga_seleccionada) return aviso('Elige la actividad de la PGA.', 'error');
    if (!form.titulo.trim())      return aviso('Ponle un título a la actividad.', 'error');
    if (!form.descripcion.trim()) return aviso('Describe en qué consiste la actividad.', 'error');
    if (!form.financiacion)       return aviso('Indica quién financia la actividad.', 'error');
    if (!form.fecha_inicio)    return aviso('Indica la fecha.', 'error');
    if (form.grupos.length === 0)       return aviso('Selecciona al menos un grupo.', 'error');
    if (form.acompanantes.length === 0) return aviso('Indica quién acompaña.', 'error');
    if (totalVan() === 0) return aviso('No has marcado ningún alumno que asista.', 'error');
    if (hayAlumnosQueSeQuedan() && !form.profesor_guardia) {
      return aviso('Asigna quién atiende al alumnado que se queda en el centro.', 'error');
    }

    setEnviando(true);
    setSubiendoDoc(!!comision);
    let urlComision = null;
    try {
      urlComision = await subirComision();
    } catch (e) {
      console.error('subir comisión:', e);
    }
    setSubiendoDoc(false);
    if (comision && !urlComision) {
      setEnviando(false);
      return aviso('No se ha podido subir el documento. Inténtalo de nuevo o envía la actividad sin él.', 'error');
    }

    try {
      const cfg = await getConfigCurso();
      const _ra = await fetch('/api/centro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabla: 'actividades', accion: 'crear', datos: {
        titulo: form.titulo.trim(),
        en_pga: form.en_pga === true,
        tipo: form.tipo,
        departamento: departamento || null,
        relacion_curricular: form.relacion_curricular.trim() || null,
        descripcion: form.descripcion.trim(),
        financiacion: form.financiacion,
        comision_servicio: urlComision,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || form.fecha_inicio,
        horas: form.horas,
        hora_salida: form.hora_salida || null,
        hora_regreso: form.hora_regreso || null,
        grupos: form.grupos,
        acompanantes: form.acompanantes,
        alumnos_asistentes: Object.fromEntries(
          form.grupos.map(g => [g, todosDelGrupo(g) ? 'todos' : (asistentes[g] || [])])
        ),
        necesita_guardia: hayAlumnosQueSeQuedan(),
        profesor_guardia: form.profesor_guardia || null,
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
        titulo: '', tipo: 'salida', relacion_curricular: '', en_pga: null, pga_seleccionada: '', profesor_guardia: '',
        fecha_inicio: '', fecha_fin: '', horas: [], hora_salida: '', hora_regreso: '',
        grupos: [], acompanantes: [], lugar: '', transporte: '', coste_alumno: '', descripcion: '', financiacion: '',
      });
      setComision(null);
      setAsistentes({});
      setAlumnosPorGrupo({});
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
        {vista === 'nueva' && (
          <div>
            <div style={{ ...nota('#eff6ff', '#bfdbfe', '#1e40af') }}>
              Los alumnos, horarios y grupos ya están en la aplicación.
              Solo tienes que indicar lo que no sabemos.
            </div>

            <div style={tarjeta}>
              <Sub2>Qué actividad es</Sub2>

              <Campo label="¿Está aprobada en la PGA? *">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setForm(f => ({ ...f, en_pga: true, pga_seleccionada: '', titulo: '', lugar: '' }))}
                    style={{ flex: 1, minWidth: 150, padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13.5,
                      border: `2px solid ${form.en_pga === true ? '#166534' : '#ddd'}`,
                      backgroundColor: form.en_pga === true ? '#f0fdf4' : 'white',
                      color: form.en_pga === true ? '#166534' : '#666' }}>
                    ✅ Sí, está en la PGA
                  </button>
                  <button type="button" onClick={() => setForm(f => ({ ...f, en_pga: false, pga_seleccionada: '' }))}
                    style={{ flex: 1, minWidth: 150, padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 13.5,
                      border: `2px solid ${form.en_pga === false ? '#b45309' : '#ddd'}`,
                      backgroundColor: form.en_pga === false ? '#fffbeb' : 'white',
                      color: form.en_pga === false ? '#b45309' : '#666' }}>
                    ⚠️ No está en la PGA
                  </button>
                </div>
              </Campo>

              {form.en_pga === false && (
                <div style={{ marginBottom: 14, padding: '13px 15px', borderRadius: 10, backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', fontSize: 13, color: '#78350f', lineHeight: 1.6 }}>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>⚠️ Necesita autorización del director</div>
                  Las actividades que no figuran en la Programación General Anual no están
                  aprobadas por el Consejo Escolar. Al enviar la propuesta se avisará a dirección
                  para que la autorice expresamente. Explica bien la relación con el currículo:
                  es lo que justifica la salida.
                </div>
              )}

              {form.en_pga === true && (
                <Campo label="Actividad de la PGA *">
                  {pgaLista.length === 0 ? (
                    <div style={{ padding: '11px 13px', borderRadius: 8, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', fontSize: 13, color: '#991b1b' }}>
                      Todavía no hay actividades de la PGA cargadas. Avisa a Secretaría.
                    </div>
                  ) : (
                    <select value={form.pga_seleccionada} style={input}
                      onChange={e => {
                        const elegida = pgaLista.find(a => String(a.id) === e.target.value);
                        setForm(f => ({
                          ...f,
                          pga_seleccionada: e.target.value,
                          titulo: elegida ? elegida.actividad : '',
                          lugar: elegida?.localidad || f.lugar,
                        }));
                      }}>
                      <option value="">-- Elige la actividad --</option>
                      {(() => {
                        // Agrupadas por departamento: con muchas actividades,
                        // una lista plana es imposible de recorrer.
                        const porDpto = {};
                        pgaLista.forEach(a => {
                          const d = a.departamento?.trim() || 'Sin departamento';
                          (porDpto[d] = porDpto[d] || []).push(a);
                        });
                        // El departamento propio primero, el resto alfabético
                        const nombres = Object.keys(porDpto).sort((x, y) => {
                          if (x === departamento) return -1;
                          if (y === departamento) return 1;
                          if (x === 'Sin departamento') return 1;
                          if (y === 'Sin departamento') return -1;
                          return x.localeCompare(y);
                        });
                        return nombres.map(d => (
                          <optgroup key={d} label={d === departamento ? `${d} (el tuyo)` : d}>
                            {porDpto[d].map(a => (
                              <option key={a.id} value={a.id}>
                                {a.actividad}{a.localidad ? ` · ${a.localidad}` : ''}
                              </option>
                            ))}
                          </optgroup>
                        ));
                      })()}
                    </select>
                  )}
                </Campo>
              )}

              {form.en_pga !== true && (
                <Campo label="Título *">
                  <input value={form.titulo} onChange={e => set('titulo', e.target.value)}
                    placeholder="Ej: Visita a la feria del automóvil" style={input} />
                </Campo>
              )}

              <Campo label="Tipo">
                <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={input}>
                  {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.emoji} {t.label}</option>)}
                </select>
              </Campo>

              <Campo label="Descripción de la actividad *">
                <textarea value={form.descripcion} rows={3}
                  onChange={e => set('descripcion', e.target.value)}
                  placeholder="En qué consiste: qué se va a ver, qué se va a hacer, cómo se desarrolla."
                  style={{ ...input, resize: 'vertical' }} />
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
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {grupos.length === 0 && <Pista>No hay grupos cargados todavía.</Pista>}
                  {agruparPorFamilia(grupos).map(bloque => (
                    <div key={bloque.familia} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5 }}>
                        {bloque.nombre}
                      </div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {bloque.grupos.map(g => (
                          <Chip key={g} activo={form.grupos.includes(g)} onClick={() => alternar('grupos', g)}>
                            {g}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Campo>

              {/* ALUMNADO QUE ASISTE */}
              {form.grupos.length > 0 && (
                <Campo label="Alumnado que asiste">
                  {cargandoAlumnos && <Pista>Cargando alumnos...</Pista>}
                  {form.grupos.map(g => {
                    const lista = alumnosPorGrupo[g] || [];
                    const van = asistentes[g] || [];
                    const completo = todosDelGrupo(g);
                    return (
                      <div key={g} style={{ marginBottom: 12, border: `1.5px solid ${completo ? '#bbf7d0' : '#fde68a'}`, borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ padding: '9px 12px', backgroundColor: completo ? '#f0fdf4' : '#fffbeb', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: 13.5, color: '#333' }}>{g}</strong>
                          <span style={{ fontSize: 12, color: completo ? '#166534' : '#92400e', fontWeight: 700 }}>
                            {completo ? '✅ va el grupo entero' : `⚠️ van ${van.length} de ${lista.length}`}
                          </span>
                          {lista.length > 0 && (
                            <button type="button"
                              onClick={() => setAsistentes(p => ({ ...p, [g]: completo ? [] : lista.map(a => a.id) }))}
                              style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 20, border: '1.5px solid #cbd5e1', backgroundColor: 'white', fontSize: 11.5, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
                              {completo ? 'Quitar todos' : 'Marcar todos'}
                            </button>
                          )}
                        </div>
                        {lista.length === 0 ? (
                          <div style={{ padding: '9px 12px', fontSize: 12, color: '#94a3b8' }}>
                            Sin alumnos cargados en este grupo.
                          </div>
                        ) : (
                          <div style={{ maxHeight: 170, overflowY: 'auto', backgroundColor: 'white' }}>
                            {lista.map(a => {
                              const marcado = van.includes(a.id);
                              const sinAuth = a.auth_salidas === false || a.auth_actividades === false;
                              return (
                                <label key={a.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px',
                                  borderTop: '1px solid #f1f5f9', fontSize: 13, cursor: 'pointer',
                                  backgroundColor: marcado && sinAuth ? '#fef2f2' : 'transparent',
                                }}>
                                  <input type="checkbox" checked={marcado}
                                    onChange={() => alternarAlumno(g, a.id)}
                                    style={{ width: 17, height: 17, cursor: 'pointer' }} />
                                  <span style={{ color: marcado ? '#111' : '#94a3b8' }}>
                                    {a.apellidos || ''}{a.apellidos ? ', ' : ''}{a.nombre || ''}
                                  </span>
                                  {sinAuth && (
                                    <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, color: '#991b1b', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: 20 }}>
                                      SIN AUTORIZACIÓN
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Pista>{totalVan()} alumnos asistirán en total.</Pista>
                </Campo>
              )}

              {/* PROFESOR DE GUARDIA PARA QUIEN SE QUEDA */}
              {hayAlumnosQueSeQuedan() && (
                <Campo label="Profesor/a que atiende a quien se queda *">
                  <div style={{ marginBottom: 9, padding: '11px 13px', borderRadius: 9, backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', fontSize: 12.5, color: '#78350f', lineHeight: 1.55 }}>
                    No va el grupo completo, así que queda alumnado en el centro.
                    Hay que asignar a alguien que lo atienda durante la actividad.
                  </div>
                  <select value={form.profesor_guardia} style={input}
                    onChange={e => set('profesor_guardia', e.target.value)}>
                    <option value="">-- Elige quién se queda con ellos --</option>
                    {profesores
                      .filter(p => !form.acompanantes.includes(p.id))
                      .map(p => (
                        <option key={p.id} value={`${p.apellidos || ''}, ${p.nombre || ''}`.trim()}>
                          {p.apellidos || ''}, {p.nombre || ''}
                        </option>
                      ))}
                  </select>
                </Campo>
              )}

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

              <Campo label="¿Quién la financia? *">
                <select value={form.financiacion} onChange={e => set('financiacion', e.target.value)} style={input}>
                  <option value="">— Selecciona —</option>
                  <option value="gratuita">Gratuita</option>
                  <option value="alumnado">La paga el alumnado</option>
                  <option value="centro">La paga el centro</option>
                  <option value="mixta">Mixta: alumnado y centro</option>
                </select>
              </Campo>

              <Campo label="Comisiones de servicio">
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 9,
                  padding: '12px 22px', borderRadius: 10, cursor: 'pointer',
                  backgroundColor: '#eff6ff', color: '#1e40af',
                  border: '1.5px solid #bfdbfe', fontWeight: 700, fontSize: 14,
                }}>
                  <span style={{ fontSize: 18 }}>📎</span>
                  {comision ? 'Cambiar el documento' : 'Adjuntar documento'}
                  <input type="file" accept=".pdf,.doc,.docx,image/*"
                    onChange={e => setComision(e.target.files[0] || null)}
                    style={{ display: 'none' }} />
                </label>
                <Pista>
                  Opcional. Si ya tienes el documento de comisiones de servicio, adjúntalo
                  aquí y quedará junto a la actividad.
                </Pista>
                {comision && (
                  <div style={{ marginTop: 6, fontSize: 12.5, color: VERDE, fontWeight: 600 }}>
                    📎 {comision.name}
                  </div>
                )}
              </Campo>
            </div>

            <button onClick={enviar} disabled={enviando} style={{
              ...boton, width: '100%', padding: 14, fontSize: 15,
              cursor: enviando ? 'not-allowed' : 'pointer', opacity: enviando ? 0.7 : 1,
            }}>
              {subiendoDoc ? '⏳ Subiendo el documento...' : enviando ? '⏳ Enviando...' : '📨 Enviar a jefatura de estudios'}
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
