'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';

/**
 * AULAS DIVERSIFICADAS Y MATERIALES — pantalla del profesor
 *
 * Pestañas:
 *   · Reservar        → elige aula o material, día(s) y hora(s)
 *                       Puntual: un día y sus horas.
 *                       Periódica: primero las horas y luego se marcan
 *                       los días en el calendario (sin tope).
 *   · Aulas libres    → día y hora, y salen las aulas sin clase ni reserva
 *   · Mis solicitudes → estado de cada una; retirar o anular
 *   · Gestionar       → solo responsables de un recurso y equipo directivo:
 *                       pendientes (aceptar, ajustar quitando días o
 *                       denegar), próximas (cambiar o anular), ahora en
 *                       las aulas y registro descargable.
 *                       Las altas directas se hacen desde «Reservar».
 *
 * Todo pasa por /api/reservas, que es quien comprueba huecos y permisos.
 */

const COLOR = '#0f766e';
const FONDO = '#f0fdfa';
const VERDE = '#166534';
const ROJO  = '#991b1b';
const AMBAR = '#b45309';

const HORAS = [1, 2, 3, 4, 5, 6];
const TRAMOS = {
  1: '8:30–9:25', 2: '9:25–10:20', 3: '10:20–11:15',
  4: '11:45–12:40', 5: '12:40–13:35', 6: '13:35–14:30',
};

const ESTADOS = {
  pendiente: { label: 'Pendiente',  emoji: '⏳', bg: '#fffbeb', color: '#78350f', borde: '#fcd34d' },
  aceptada:  { label: 'Aceptada',   emoji: '✅', bg: '#f0fdf4', color: VERDE,     borde: '#86efac' },
  denegada:  { label: 'Denegada',   emoji: '❌', bg: '#fef2f2', color: ROJO,      borde: '#fca5a5' },
  anulada:   { label: 'Anulada',    emoji: '↩️', bg: '#f3f4f6', color: '#4b5563', borde: '#d1d5db' },
};

const ICONOS = { aula: '🏫', material: '🧰', libres: '🔎' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fmtFecha(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtFechaLarga(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}
const dos = n => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${dos(m + 1)}-${dos(d)}`;
const finDeMes = (a, m) => new Date(a, m + 1, 0).getDate();

const DATOS_VACIOS = { actividad: '', grupos: [], recursos_uso: '' };

export default function Reservas() {
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil]     = useState({ nombre: '', email: '', misRecursos: [], soyDirectivo: false });
  const [recursos, setRecursos] = useState([]);
  const [grupos, setGrupos]     = useState([]);
  const [vista, setVista]       = useState('reservar');
  const [mensaje, setMensaje]   = useState(null);
  const [mias, setMias]         = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [gest, setGest]         = useState([]);
  const [profesores, setProfesores] = useState([]);
  const [alta, setAlta]         = useState({ activa: false, profesor_id: '' });

  // Reservar
  const [recursoId, setRecursoId] = useState('');
  const [modo, setModo]           = useState('puntual');   // puntual | periodica
  const [fecha, setFecha]         = useState('');
  const [horas, setHoras]         = useState([]);
  const [dias, setDias]           = useState([]);
  const [mes, setMes]             = useState(() => { const h = new Date(); return { a: h.getFullYear(), m: h.getMonth() }; });
  const [ocu, setOcu]             = useState({});
  const [cargandoOcu, setCargandoOcu] = useState(false);
  const [datos, setDatos]         = useState(DATOS_VACIOS);

  // Aulas libres
  const [libFecha, setLibFecha]   = useState('');
  const [libHoras, setLibHoras]   = useState([]);
  const [libres, setLibres]       = useState(null);
  const [aulaLibre, setAulaLibre] = useState('');

  const hoy = hoyLocal();
  const recurso = recursos.find(r => r.id === recursoId);

  const avisar = (texto, tipo = 'error') => {
    setMensaje({ texto, tipo });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    setTimeout(() => setMensaje(null), 7000);
  };

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const p = new URLSearchParams(window.location.search).get('vista');
    if (['reservar', 'libres', 'mias', 'gestion'].includes(p)) setVista(p);
    cargar();
  }, []);

  async function leer(q) {
    const r = await fetch(`/api/reservas?${q}`);
    if (r.status === 401) { window.location.href = '/login'; return null; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se ha podido cargar');
    return d;
  }

  async function cargar() {
    setCargando(true);
    try {
      const [d, m, g] = await Promise.all([
        leer('vista=recursos'),
        leer('vista=mias'),
        fetch('/api/alumnos?grupos=1').then(r => r.json()).catch(() => ({ grupos: [] })),
      ]);
      if (!d) return;
      setPerfil({ nombre: d.nombre, email: d.email, misRecursos: d.misRecursos || [], soyDirectivo: d.soyDirectivo });
      setRecursos(d.recursos || []);
      setMias(m?.solicitudes || []);
      setGrupos(g?.grupos || []);
      if ((d.misRecursos || []).length) {
        const [ge, pr] = await Promise.all([leer('vista=gestion'), leer('vista=profesores')]);
        setGest(ge?.solicitudes || []);
        setProfesores(pr?.profesores || []);
      }
    } catch (e) {
      avisar(e.message);
    } finally {
      setCargando(false);
    }
  }

  async function recargarMias() {
    try { const m = await leer('vista=mias'); setMias(m?.solicitudes || []); } catch (e) {}
  }

  async function recargarGestion() {
    if (!perfil.misRecursos.length) return;
    try { const g = await leer('vista=gestion'); setGest(g?.solicitudes || []); } catch (e) {}
  }

  const gestiono = id => perfil.misRecursos.includes(id);
  const esAlta = id => alta.activa && gestiono(id);

  async function post(accion, d) {
    const r = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, datos: d }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se ha podido guardar');
    return j;
  }

  // ─── Ocupación del recurso elegido ───

  async function cargarOcupacion(rid, desde, hasta) {
    if (!rid || !desde) return;
    setCargandoOcu(true);
    try {
      const d = await leer(`vista=ocupacion&recurso=${encodeURIComponent(rid)}&desde=${desde}&hasta=${hasta || desde}`);
      if (d?.dias) setOcu(o => ({ ...o, ...d.dias }));
    } catch (e) {
      avisar(e.message);
    } finally {
      setCargandoOcu(false);
    }
  }

  function elegirRecurso(id) {
    setRecursoId(id);
    setAlta({ activa: false, profesor_id: '' });
    setOcu({});
    setHoras([]);
    setDias([]);
    setFecha('');
  }

  // Puntual: al elegir el día se cargan sus 6 horas
  useEffect(() => {
    if (modo === 'puntual' && recursoId && fecha) cargarOcupacion(recursoId, fecha, fecha);
  }, [modo, recursoId, fecha]);

  // Periódica: se carga el mes que se está viendo
  useEffect(() => {
    if (modo === 'periodica' && recursoId) {
      cargarOcupacion(recursoId, iso(mes.a, mes.m, 1), iso(mes.a, mes.m, finDeMes(mes.a, mes.m)));
    }
  }, [modo, recursoId, mes.a, mes.m]);

  function cambiarModo(m) {
    setModo(m);
    setHoras([]);
    setDias([]);
    setFecha('');
  }

  const libreA = (f, h) => {
    const c = ocu[f]?.horas?.[h];
    return !!c && (c.estado === 'libre' || c.estado === 'pendiente');
  };

  /** En periódica, ¿se puede marcar este día con las horas elegidas? */
  function estadoDia(f) {
    const d = ocu[f];
    if (f < hoy) return 'pasado';
    if (!d) return 'cargando';
    if (d.noLectivo) return 'no_lectivo';
    if (!horas.length) return 'sin_horas';
    if (horas.some(h => !libreA(f, h))) return 'ocupado';
    if (horas.some(h => d.horas[h]?.estado === 'pendiente')) return 'pedido';
    return 'libre';
  }

  function alternarHoraPeriodica(h) {
    const nuevas = horas.includes(h) ? horas.filter(x => x !== h) : [...horas, h].sort();
    setHoras(nuevas);
    // Fuera los días que con esas horas ya no se pueden pedir
    setDias(ds => ds.filter(f => nuevas.length && nuevas.every(x => libreA(f, x))));
  }

  function alternarDia(f) {
    setDias(ds => ds.includes(f) ? ds.filter(x => x !== f) : [...ds, f].sort());
  }

  function moverMes(n) {
    setMes(({ a, m }) => {
      const d = new Date(a, m + n, 1);
      return { a: d.getFullYear(), m: d.getMonth() };
    });
  }

  // ─── Enviar ───

  function comprobarDatos() {
    if (!datos.actividad.trim()) return 'Indica la actividad o proyecto.';
    if (!datos.grupos.length) return 'Añade el grupo o grupos con los que vas.';
    return null;
  }

  async function solicitar() {
    const fechas = modo === 'puntual' ? (fecha ? [fecha] : []) : dias;
    if (!recursoId) return avisar('Elige el aula o el material.');
    if (!fechas.length) return avisar(modo === 'puntual' ? 'Elige el día.' : 'Marca al menos un día en el calendario.');
    if (!horas.length) return avisar('Marca al menos una hora.');
    const falta = comprobarDatos();
    if (falta) return avisar(falta);

    setEnviando(true);
    try {
      const directa = esAlta(recursoId);
      const r = await post(directa ? 'alta' : 'solicitar', {
        recurso_id: recursoId, fechas, horas,
        actividad: datos.actividad, grupos: datos.grupos, recursos_uso: datos.recursos_uso,
        ...(directa && alta.profesor_id ? { profesor_id: alta.profesor_id } : {}),
      });
      avisar(directa
        ? `Reserva dada de alta (${r.horas} ${r.horas === 1 ? 'hora' : 'horas'}). Se ha avisado al profesor.`
        : `Solicitud enviada (${r.horas} ${r.horas === 1 ? 'hora' : 'horas'}). Te llegará un aviso cuando la resuelvan.`, 'ok');
      elegirRecurso('');
      setDatos(DATOS_VACIOS);
      await Promise.all([recargarMias(), recargarGestion()]);
      setVista(directa ? 'gestion' : 'mias');
    } catch (e) {
      avisar(e.message);
      if (modo === 'puntual' && fecha) cargarOcupacion(recursoId, fecha, fecha);
    } finally {
      setEnviando(false);
    }
  }

  // ─── Aulas libres ───

  async function buscarLibres() {
    if (!libFecha) return avisar('Elige el día.');
    if (!libHoras.length) return avisar('Marca al menos una hora.');
    setAulaLibre('');
    setLibres(null);
    try {
      const d = await leer(`vista=libres&fecha=${libFecha}&horas=${libHoras.join(',')}`);
      setLibres(d?.noLectivo ? 'no_lectivo' : (d?.aulas || []));
    } catch (e) {
      avisar(e.message);
    }
  }

  async function solicitarLibre() {
    if (!aulaLibre) return avisar('Elige el aula.');
    const falta = comprobarDatos();
    if (falta) return avisar(falta);
    setEnviando(true);
    try {
      const directa = esAlta('LIBRES');
      await post(directa ? 'alta' : 'solicitar', {
        recurso_id: 'LIBRES', aula_libre: aulaLibre, fechas: [libFecha], horas: libHoras,
        actividad: datos.actividad, grupos: datos.grupos, recursos_uso: datos.recursos_uso,
        ...(directa && alta.profesor_id ? { profesor_id: alta.profesor_id } : {}),
      });
      avisar(directa ? `Aula ${aulaLibre} dada de alta.` : `Solicitud del aula ${aulaLibre} enviada al equipo directivo.`, 'ok');
      setLibFecha(''); setLibHoras([]); setLibres(null); setAulaLibre('');
      setAlta({ activa: false, profesor_id: '' });
      setDatos(DATOS_VACIOS);
      await Promise.all([recargarMias(), recargarGestion()]);
      setVista(directa ? 'gestion' : 'mias');
    } catch (e) {
      avisar(e.message);
    } finally {
      setEnviando(false);
    }
  }

  // ─── Mis solicitudes ───

  async function retirar(s, ids = null) {
    const vivas = s.filas.filter(f => ['pendiente', 'aceptada'].includes(f.estado) && f.fecha >= hoy);
    const cuantas = ids ? ids.length : vivas.length;
    const texto = ids
      ? '¿Anular esta hora?'
      : s.estado === 'pendiente' ? '¿Retirar esta solicitud?' : `¿Anular las ${cuantas} horas que quedan de esta reserva?`;
    if (!confirm(texto)) return;
    try {
      await post('retirar', { serie_id: s.serie_id, ids: ids || vivas.map(f => f.id) });
      avisar('Hecho. Se ha avisado al responsable si ya estaba aceptada.', 'ok');
      await recargarMias();
    } catch (e) {
      avisar(e.message);
    }
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: FONDO, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#888' }}>
        ⏳ Cargando reservas...
      </div>
    );
  }

  const activas = mias.filter(s => s.filas.some(f => ['pendiente', 'aceptada'].includes(f.estado) && f.fecha >= hoy));
  const historial = mias.filter(s => !activas.includes(s));
  const pendientes = mias.filter(s => s.estado === 'pendiente').length;

  const pestañas = [
    { id: 'reservar', label: '📅 Reservar' },
    { id: 'libres',   label: '🔎 Aulas libres' },
    { id: 'mias',     label: '📋 Mis solicitudes', n: pendientes },
    perfil.misRecursos.length > 0 && { id: 'gestion', label: '🛠️ Gestionar', n: gest.filter(s => s.filas.some(f => f.estado === 'pendiente')).length, rojo: true },
  ].filter(Boolean);

  const aulas = recursos.filter(r => r.tipo === 'aula');
  const materiales = recursos.filter(r => r.tipo === 'material');
  const horasMarcadasPuntual = fecha ? horas.filter(h => libreA(fecha, h)) : [];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: FONDO, fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: COLOR, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🏫</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Aulas Diversificadas y Materiales</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Reserva de aulas y material</div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 50px' }}>

        {mensaje && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13.5, fontWeight: 600,
            backgroundColor: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
            color:           mensaje.tipo === 'ok' ? '#166534' : '#991b1b',
            border: `1.5px solid ${mensaje.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
          }}>{mensaje.texto}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {pestañas.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)} style={{
              flex: '1 1 140px', padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              border: vista === t.id ? 'none' : '1.5px solid #ddd',
              backgroundColor: vista === t.id ? COLOR : 'white',
              color: vista === t.id ? 'white' : '#666', fontFamily: 'inherit',
            }}>
              {t.label}
              {t.n > 0 && (
                <span style={{ marginLeft: 7, backgroundColor: t.rojo ? '#dc2626' : '#f59e0b', color: 'white', borderRadius: 20, padding: '1px 8px', fontSize: 12 }}>{t.n}</span>
              )}
            </button>
          ))}
        </div>

        {/* ══ RESERVAR ══ */}
        {vista === 'reservar' && (
          <div>
            <div style={tarjeta}>
              <Sub2>1 · ¿Qué quieres reservar?</Sub2>
              <Etiqueta>Aulas</Etiqueta>
              <Rejilla>
                {aulas.map(r => <BotonRecurso key={r.id} r={r} activo={recursoId === r.id} onClick={() => elegirRecurso(r.id)} />)}
              </Rejilla>
              {materiales.length > 0 && (
                <>
                  <Etiqueta>Material (los carros se piden completos)</Etiqueta>
                  <Rejilla>
                    {materiales.map(r => <BotonRecurso key={r.id} r={r} activo={recursoId === r.id} onClick={() => elegirRecurso(r.id)} />)}
                  </Rejilla>
                </>
              )}
              <Pista>¿Necesitas otra aula del centro (más grande, para un examen…)? Búscala en <a href="#" onClick={e => { e.preventDefault(); setVista('libres'); }} style={{ color: COLOR, fontWeight: 600 }}>Aulas libres</a>.</Pista>
            </div>

            {recurso && (
              <div style={tarjeta}>
                <Sub2>2 · ¿Cuándo?</Sub2>
                <div style={{ fontSize: 12.5, color: '#4b5563', marginBottom: 12 }}>
                  Lo resuelve: <strong>{recurso.responsable === 'Equipo directivo' ? 'el equipo directivo' : recurso.responsable}</strong>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <Chip activo={modo === 'puntual'} onClick={() => cambiarModo('puntual')}>Un día</Chip>
                  <Chip activo={modo === 'periodica'} onClick={() => cambiarModo('periodica')}>Varios días (periódica)</Chip>
                </div>

                {modo === 'puntual' && (
                  <>
                    <Campo label="Día">
                      <input type="date" style={{ ...input, maxWidth: 240 }} min={hoy} value={fecha}
                        onChange={e => { setFecha(e.target.value); setHoras([]); }} />
                    </Campo>
                    {fecha && (
                      cargandoOcu && !ocu[fecha] ? <div style={{ color: '#888', fontSize: 13 }}>⏳ Mirando el horario…</div>
                      : ocu[fecha]?.noLectivo ? <div style={nota('#f3f4f6', '#d1d5db', '#4b5563')}>El {fmtFechaLarga(fecha)} no es lectivo.</div>
                      : ocu[fecha] && (
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
                            Marca las horas que quieres ({fmtFechaLarga(fecha)}):
                          </div>
                          {HORAS.map(h => (
                            <FilaHora key={h} h={h} celda={ocu[fecha].horas[h]} marcada={horas.includes(h)}
                              onClick={() => setHoras(hs => hs.includes(h) ? hs.filter(x => x !== h) : [...hs, h].sort())} />
                          ))}
                        </div>
                      )
                    )}
                  </>
                )}

                {modo === 'periodica' && (
                  <>
                    <Campo label="Primero, las horas (las mismas todos los días)">
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {HORAS.map(h => (
                          <Chip key={h} activo={horas.includes(h)} onClick={() => alternarHoraPeriodica(h)}>{h}ª <span style={{ opacity: 0.7, fontWeight: 400 }}>{TRAMOS[h]}</span></Chip>
                        ))}
                      </div>
                    </Campo>
                    <Calendario mes={mes} moverMes={moverMes} hoy={hoy} estadoDia={estadoDia}
                      dias={dias} alternarDia={alternarDia} cargando={cargandoOcu} />
                    {dias.length > 0 && (
                      <div style={{ marginTop: 10, fontSize: 13, color: COLOR, fontWeight: 600 }}>
                        {dias.length} {dias.length === 1 ? 'día marcado' : 'días marcados'} · {horas.map(h => h + 'ª').join(', ')}
                        <button onClick={() => setDias([])} style={{ ...botonSec, marginLeft: 10, padding: '4px 10px', fontSize: 12 }}>Quitar todos</button>
                      </div>
                    )}
                    <Pista>No hay tope de días, pero piensa en los demás grupos: el responsable puede ajustar la solicitud si hace falta dejar sitio.</Pista>
                  </>
                )}
              </div>
            )}

            {recurso && (modo === 'puntual' ? horasMarcadasPuntual.length > 0 : (dias.length > 0 && horas.length > 0)) && (
              <div style={tarjeta}>
                <Sub2>3 · Datos de la actividad</Sub2>
                {gestiono(recurso.id) && <CajaAlta alta={alta} setAlta={setAlta} profesores={profesores} />}
                <FormDatos datos={datos} setDatos={setDatos} grupos={grupos} perfil={perfil}
                  material={recurso.tipo === 'material'} titular={esAlta(recurso.id) ? profesores.find(p => p.id === alta.profesor_id) : null} />
                <button onClick={solicitar} disabled={enviando} style={{ ...boton, width: '100%', opacity: enviando ? 0.6 : 1 }}>
                  {enviando ? '⏳ Enviando…' : esAlta(recurso.id) ? '✅ Dar de alta la reserva' : '📨 Enviar solicitud'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ AULAS LIBRES ══ */}
        {vista === 'libres' && (
          <div>
            <div style={tarjeta}>
              <Sub2>¿Qué día y a qué hora?</Sub2>
              <Campo label="Día">
                <input type="date" style={{ ...input, maxWidth: 240 }} min={hoy} value={libFecha}
                  onChange={e => { setLibFecha(e.target.value); setLibres(null); setAulaLibre(''); }} />
              </Campo>
              <Campo label="Horas">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {HORAS.map(h => (
                    <Chip key={h} activo={libHoras.includes(h)} onClick={() => {
                      setLibHoras(hs => hs.includes(h) ? hs.filter(x => x !== h) : [...hs, h].sort());
                      setLibres(null); setAulaLibre('');
                    }}>{h}ª <span style={{ opacity: 0.7, fontWeight: 400 }}>{TRAMOS[h]}</span></Chip>
                  ))}
                </div>
              </Campo>
              <button onClick={buscarLibres} style={boton}>🔎 Buscar aulas libres</button>
              <Pista>Salen las aulas del centro que a esas horas no tienen clase en el horario ni otra reserva. Lo resuelve el equipo directivo.</Pista>
            </div>

            {libres === 'no_lectivo' && <div style={nota('#f3f4f6', '#d1d5db', '#4b5563')}>Ese día no es lectivo.</div>}
            {Array.isArray(libres) && (
              <div style={tarjeta}>
                <Sub2>{libres.length ? `${libres.length} aulas libres` : 'No hay ninguna aula libre a esas horas'}</Sub2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {libres.map(a => (
                    <button key={a.aula} onClick={() => setAulaLibre(a.aula)} style={{
                      padding: '10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                      border: `2px solid ${aulaLibre === a.aula ? COLOR : '#e5e7eb'}`,
                      backgroundColor: aulaLibre === a.aula ? FONDO : 'white',
                    }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#111' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, backgroundColor: a.color, marginRight: 6 }} />
                        {a.aula}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3 }}>{a.edificio} · {a.planta}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {aulaLibre && (
              <div style={tarjeta}>
                <Sub2>Aula {aulaLibre} · {fmtFechaLarga(libFecha)} · {libHoras.map(h => h + 'ª').join(', ')}</Sub2>
                {gestiono('LIBRES') && <CajaAlta alta={alta} setAlta={setAlta} profesores={profesores} />}
                <FormDatos datos={datos} setDatos={setDatos} grupos={grupos} perfil={perfil}
                  titular={esAlta('LIBRES') ? profesores.find(p => p.id === alta.profesor_id) : null} />
                <button onClick={solicitarLibre} disabled={enviando} style={{ ...boton, width: '100%', opacity: enviando ? 0.6 : 1 }}>
                  {enviando ? '⏳ Enviando…' : esAlta('LIBRES') ? '✅ Dar de alta el aula' : '📨 Pedir el aula'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ══ MIS SOLICITUDES ══ */}
        {vista === 'mias' && (
          <div>
            {mias.length === 0 ? (
              <div style={{ ...tarjeta, textAlign: 'center', padding: 36 }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>🏫</div>
                <div style={{ fontWeight: 700, color: '#555', marginBottom: 18 }}>No has pedido ninguna reserva</div>
                <button onClick={() => setVista('reservar')} style={{ ...boton, padding: '11px 24px' }}>📅 Reservar un aula o material</button>
              </div>
            ) : (
              <>
                <Sub>Activas</Sub>
                {activas.length === 0 && <Vacio texto="No tienes reservas pendientes ni próximas." />}
                {activas.map(s => <TarjetaSolicitud key={s.serie_id} s={s} hoy={hoy} retirar={retirar} />)}
                {historial.length > 0 && (
                  <>
                    <Sub>Historial</Sub>
                    {historial.map(s => <TarjetaSolicitud key={s.serie_id} s={s} hoy={hoy} />)}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ GESTIONAR ══ */}
        {vista === 'gestion' && perfil.misRecursos.length > 0 && (
          <Gestionar gest={gest} recursos={recursos} perfil={perfil} hoy={hoy}
            post={post} leer={leer} avisar={avisar} recargar={recargarGestion} />
        )}
      </div>
    </div>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────

function BotonRecurso({ r, activo, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
      border: `2px solid ${activo ? COLOR : '#e5e7eb'}`,
      backgroundColor: activo ? FONDO : 'white', color: '#111',
      fontSize: 13, fontWeight: activo ? 700 : 600, lineHeight: 1.35,
    }}>
      {ICONOS[r.tipo] || '🏫'} {r.nombre}
    </button>
  );
}

function FilaHora({ h, celda, marcada, onClick }) {
  const e = celda?.estado;
  const pedible = e === 'libre' || e === 'pendiente';
  let txt = 'Libre', bg = 'white', borde = '#e5e7eb', color = VERDE;
  if (e === 'clase') { txt = `Clase: ${celda.grupo}${celda.materia ? ' · ' + celda.materia : ''}`; bg = '#f9fafb'; color = '#6b7280'; }
  if (e === 'reservada') { txt = `Reservada: ${celda.quien}${celda.actividad ? ' · ' + celda.actividad : ''}`; bg = '#fef2f2'; color = ROJO; borde = '#fecaca'; }
  if (e === 'pendiente') { txt = `Libre · ya hay ${celda.solicitudes === 1 ? 'otra solicitud pendiente' : celda.solicitudes + ' solicitudes pendientes'}`; color = AMBAR; }
  if (marcada && pedible) { bg = FONDO; borde = COLOR; }
  return (
    <button onClick={pedible ? onClick : undefined} disabled={!pedible} style={{
      display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginBottom: 6,
      padding: '10px 12px', borderRadius: 10, textAlign: 'left', fontFamily: 'inherit',
      border: `2px solid ${borde}`, backgroundColor: bg, cursor: pedible ? 'pointer' : 'not-allowed',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `2px solid ${pedible ? COLOR : '#d1d5db'}`, backgroundColor: marcada && pedible ? COLOR : 'white',
        color: 'white', fontSize: 13, fontWeight: 800,
      }}>{marcada && pedible ? '✓' : ''}</span>
      <span style={{ fontWeight: 800, width: 30, color: '#111' }}>{h}ª</span>
      <span style={{ fontSize: 12, color: '#6b7280', width: 82 }}>{TRAMOS[h]}</span>
      <span style={{ fontSize: 12.5, color, fontWeight: 600, flex: 1 }}>{pedible ? '' : '🔒 '}{txt}</span>
    </button>
  );
}

function Calendario({ mes, moverMes, hoy, estadoDia, dias, alternarDia, cargando }) {
  const total = finDeMes(mes.a, mes.m);
  const hueco = (new Date(mes.a, mes.m, 1).getDay() + 6) % 7;   // lunes primero
  const celdas = [...Array(hueco).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const [aHoy, mHoy] = hoy.split('-').map(Number);
  const puedeAtras = mes.a > aHoy || (mes.a === aHoy && mes.m + 1 > mHoy);

  const estilos = {
    libre:      { bg: 'white',   color: '#111',    borde: '#d1d5db', puede: true },
    pedido:     { bg: '#fffbeb', color: AMBAR,     borde: '#fcd34d', puede: true },
    ocupado:    { bg: '#fef2f2', color: '#fca5a5', borde: '#fee2e2', puede: false },
    no_lectivo: { bg: '#f3f4f6', color: '#c4c4c4', borde: '#f3f4f6', puede: false },
    pasado:     { bg: 'white',   color: '#d1d5db', borde: '#f3f4f6', puede: false },
    sin_horas:  { bg: 'white',   color: '#9ca3af', borde: '#e5e7eb', puede: false },
    cargando:   { bg: 'white',   color: '#d1d5db', borde: '#f3f4f6', puede: false },
  };

  return (
    <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={() => moverMes(-1)} disabled={!puedeAtras} style={{ ...botonSec, opacity: puedeAtras ? 1 : 0.3 }}>‹</button>
        <div style={{ fontWeight: 800, color: '#111', textTransform: 'capitalize' }}>
          {MESES[mes.m]} {mes.a} {cargando && <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>⏳</span>}
        </div>
        <button onClick={() => moverMes(1)} style={botonSec}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', paddingBottom: 4 }}>{d}</div>
        ))}
        {celdas.map((n, i) => {
          if (!n) return <div key={'v' + i} />;
          const f = iso(mes.a, mes.m, n);
          const est = estadoDia(f);
          const st = estilos[est] || estilos.cargando;
          const marcado = dias.includes(f);
          return (
            <button key={f} disabled={!st.puede && !marcado} onClick={() => alternarDia(f)} title={est === 'ocupado' ? 'Ocupado a alguna de esas horas' : est === 'pedido' ? 'Hay otra solicitud pendiente' : ''}
              style={{
                aspectRatio: '1', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                border: `2px solid ${marcado ? COLOR : st.borde}`,
                backgroundColor: marcado ? COLOR : st.bg,
                color: marcado ? 'white' : st.color,
                cursor: st.puede || marcado ? 'pointer' : 'default',
                textDecoration: est === 'ocupado' ? 'line-through' : 'none',
              }}>{n}</button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 11.5, color: '#6b7280' }}>
        <Leyenda bg={COLOR} borde={COLOR}>Marcado</Leyenda>
        <Leyenda bg="white" borde="#d1d5db">Libre</Leyenda>
        <Leyenda bg="#fffbeb" borde="#fcd34d">Otra solicitud pendiente</Leyenda>
        <Leyenda bg="#fef2f2" borde="#fee2e2">Ocupado</Leyenda>
        <Leyenda bg="#f3f4f6" borde="#f3f4f6">No lectivo</Leyenda>
      </div>
    </div>
  );
}

function Leyenda({ bg, borde, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: bg, border: `1.5px solid ${borde}` }} />
      {children}
    </span>
  );
}

function FormDatos({ datos, setDatos, grupos, perfil, material = false, titular = null }) {
  const [elegido, setElegido] = useState('');
  const set = (k, v) => setDatos(d => ({ ...d, [k]: v }));
  const añadir = g => {
    if (g && !datos.grupos.includes(g)) set('grupos', [...datos.grupos, g]);
    setElegido('');
  };
  return (
    <>
      <div style={{ fontSize: 12.5, color: '#4b5563', marginBottom: 14, padding: '8px 12px', backgroundColor: '#f9fafb', borderRadius: 8 }}>
        {titular ? 'A nombre de' : 'Solicitante'}: <strong>{titular ? titular.nombre : perfil.nombre}</strong> · {titular ? titular.email : perfil.email}
      </div>
      <Campo label="Actividad o proyecto *">
        <textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={datos.actividad} maxLength={1000}
          placeholder="Ej.: Grabación de un podcast con 2º de Bachillerato"
          onChange={e => set('actividad', e.target.value)} />
      </Campo>
      <Campo label="Grupo o grupos *">
        <select style={{ ...input, maxWidth: 320 }} value={elegido} onChange={e => añadir(e.target.value)}>
          <option value="">— Añadir un grupo —</option>
          {grupos.filter(g => !datos.grupos.includes(g)).map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {datos.grupos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {datos.grupos.map(g => (
              <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, backgroundColor: FONDO, border: `1.5px solid ${COLOR}`, color: COLOR, fontSize: 12.5, fontWeight: 700 }}>
                {g}
                <button onClick={() => set('grupos', datos.grupos.filter(x => x !== g))} style={{ background: 'none', border: 'none', color: COLOR, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </Campo>
      <Campo label={material ? 'Qué vas a usar' : 'Recursos que vas a usar'}>
        <textarea style={{ ...input, minHeight: 50, resize: 'vertical' }} value={datos.recursos_uso} maxLength={1000}
          placeholder={material ? 'Ej.: el carro completo con los cargadores' : 'Ej.: pantalla croma, micrófonos, proyector…'}
          onChange={e => set('recursos_uso', e.target.value)} />
      </Campo>
    </>
  );
}

function TarjetaSolicitud({ s, hoy, retirar }) {
  const [abierta, setAbierta] = useState(false);
  const est = ESTADOS[s.estado] || ESTADOS.anulada;
  const vivasFuturas = s.filas.filter(f => ['pendiente', 'aceptada'].includes(f.estado) && f.fecha >= hoy);
  const fechas = [...new Set(s.filas.map(f => f.fecha))];
  const horas = [...new Set(s.filas.map(f => f.hora))].sort((a, b) => a - b);
  const resumen = fechas.length === 1
    ? `${fmtFechaLarga(fechas[0])} · ${horas.map(h => h + 'ª').join(', ')}`
    : `${fechas.length} días desde el ${fmtFecha(fechas[0])} · ${horas.map(h => h + 'ª').join(', ')}`;
  const motivos = [...new Set(s.filas.filter(f => f.motivo).map(f => f.motivo))];
  const cuenta = e => s.filas.filter(f => f.estado === e).length;
  const mezcla = new Set(s.filas.map(f => f.estado)).size > 1;

  return (
    <div style={{ ...tarjeta, borderLeft: `5px solid ${est.borde}`, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: '#111', fontSize: 15 }}>
          {s.recurso}{s.aula_libre ? ` · ${s.aula_libre}` : ''}
        </div>
        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, backgroundColor: est.bg, color: est.color, border: `1.5px solid ${est.borde}` }}>
          {est.emoji} {est.label}
        </span>
      </div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 6, textTransform: 'capitalize' }}>{resumen}</div>
      <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>{s.actividad}</div>
      {s.grupos?.length > 0 && <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>Grupos: {s.grupos.join(', ')}</div>}
      {mezcla && (
        <div style={{ fontSize: 12.5, color: '#4b5563', marginTop: 6 }}>
          {['aceptada', 'pendiente', 'denegada', 'anulada'].filter(e => cuenta(e)).map(e => `${ESTADOS[e].emoji} ${cuenta(e)} ${ESTADOS[e].label.toLowerCase()}`).join(' · ')}
        </div>
      )}
      {motivos.length > 0 && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 8, backgroundColor: '#f9fafb', border: '1px solid #eee', fontSize: 12.5, color: '#4b5563' }}>
          {motivos.map(m => <div key={m}>💬 {m}</div>)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {s.filas.length > 1 && (
          <button onClick={() => setAbierta(a => !a)} style={botonSec}>{abierta ? '▲ Ocultar días' : `▼ Ver los ${s.filas.length} huecos`}</button>
        )}
        {retirar && vivasFuturas.length > 0 && (
          <button onClick={() => retirar(s)} style={botonSec}>
            {s.estado === 'pendiente' && !vivasFuturas.some(f => f.estado === 'aceptada') ? '↩️ Retirar solicitud' : '🚫 Anular lo que queda'}
          </button>
        )}
      </div>

      {abierta && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {s.filas.map(f => {
            const e = ESTADOS[f.estado];
            const anulable = retirar && ['pendiente', 'aceptada'].includes(f.estado) && f.fecha >= hoy;
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '6px 10px', borderRadius: 8, backgroundColor: e.bg }}>
                <span style={{ width: 120, textTransform: 'capitalize', color: '#111', fontWeight: 600 }}>{fmtFecha(f.fecha)}</span>
                <span style={{ width: 30, fontWeight: 700 }}>{f.hora}ª</span>
                <span style={{ flex: 1, color: e.color }}>{e.emoji} {e.label}</span>
                {anulable && (
                  <button onClick={() => retirar(s, [f.id])} title="Anular esta hora" style={{ background: 'none', border: 'none', color: ROJO, cursor: 'pointer', fontSize: 15 }}>×</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CajaAlta({ alta, setAlta, profesores }) {
  return (
    <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: `1.5px dashed ${COLOR}`, backgroundColor: FONDO }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: COLOR, cursor: 'pointer' }}>
        <input type="checkbox" checked={alta.activa} onChange={e => setAlta(a => ({ ...a, activa: e.target.checked }))} />
        Gestionas este recurso: darla de alta ya aceptada
      </label>
      {alta.activa && (
        <div style={{ marginTop: 10 }}>
          <select style={{ ...input, maxWidth: 420 }} value={alta.profesor_id} onChange={e => setAlta(a => ({ ...a, profesor_id: e.target.value }))}>
            <option value="">A mi nombre</option>
            {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <Pista>No pasa por solicitud: entra directamente en el calendario y se avisa al profesor, a los responsables y al equipo directivo.</Pista>
        </div>
      )}
    </div>
  );
}

// ─── Gestionar (responsables y equipo directivo) ──────────────────

function Gestionar({ gest, recursos, perfil, hoy, post, leer, avisar, recargar }) {
  const [sub, setSub] = useState('pendientes');
  const [filtro, setFiltro] = useState('');
  const mios = recursos.filter(r => perfil.misRecursos.includes(r.id));
  const delFiltro = s => !filtro || s.recurso_id === filtro;
  const pendientes = gest.filter(s => s.filas.some(f => f.estado === 'pendiente')).filter(delFiltro)
    .sort((a, b) => a.creada_en.localeCompare(b.creada_en));
  const proximas = gest.filter(s => s.filas.some(f => f.estado === 'aceptada' && f.fecha >= hoy)).filter(delFiltro)
    .sort((a, b) => (a.filas.find(f => f.estado === 'aceptada' && f.fecha >= hoy)?.fecha || '')
      .localeCompare(b.filas.find(f => f.estado === 'aceptada' && f.fecha >= hoy)?.fecha || ''));

  const subs = [
    { id: 'pendientes', label: '⏳ Pendientes', n: pendientes.length },
    { id: 'proximas',   label: '📆 Próximas' },
    { id: 'ahora',      label: '📍 Ahora en las aulas' },
    { id: 'registro',   label: '📥 Registro' },
  ];

  return (
    <div>
      <div style={nota('#f0fdfa', '#99f6e4', '#134e4a')}>
        {perfil.soyDirectivo
          ? 'Como equipo directivo gestionas todos los recursos.'
          : `Gestionas: ${mios.map(r => r.nombre).join(', ')}.`}
        {' '}Para dar de alta una reserva directamente, hazlo desde «Reservar».
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {subs.map(t => (
          <Chip key={t.id} activo={sub === t.id} onClick={() => setSub(t.id)}>
            {t.label}{t.n > 0 && <span style={{ marginLeft: 6, backgroundColor: '#dc2626', color: 'white', borderRadius: 20, padding: '0 7px', fontSize: 11 }}>{t.n}</span>}
          </Chip>
        ))}
      </div>

      {(sub === 'pendientes' || sub === 'proximas') && mios.length > 1 && (
        <select style={{ ...input, maxWidth: 360, marginBottom: 14 }} value={filtro} onChange={e => setFiltro(e.target.value)}>
          <option value="">Todos mis recursos</option>
          {mios.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      )}

      {sub === 'pendientes' && (
        pendientes.length === 0 ? <Vacio texto="No hay solicitudes pendientes." />
          : pendientes.map(s => <TarjetaResolver key={s.serie_id} s={s} hoy={hoy} post={post} avisar={avisar} recargar={recargar} />)
      )}

      {sub === 'proximas' && (
        proximas.length === 0 ? <Vacio texto="No hay reservas aceptadas próximas." />
          : proximas.map(s => <TarjetaProxima key={s.serie_id} s={s} hoy={hoy} post={post} avisar={avisar} recargar={recargar} />)
      )}

      {sub === 'ahora' && <AhoraEnAulas leer={leer} avisar={avisar} />}
      {sub === 'registro' && <Registro leer={leer} avisar={avisar} hoy={hoy} />}
    </div>
  );
}

function CabeceraGestion({ s }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: '#111', fontSize: 15 }}>{s.recurso}{s.aula_libre ? ` · ${s.aula_libre}` : ''}</div>
        <div style={{ fontSize: 11.5, color: '#9ca3af' }}>Pedida el {new Date(s.creada_en).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <div style={{ fontSize: 13.5, color: '#111', marginTop: 4 }}>👤 <strong>{s.solicitante_nombre}</strong> <span style={{ color: '#6b7280', fontSize: 12.5 }}>· {s.solicitante_email}</span></div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 4 }}>{s.actividad}</div>
      {s.grupos?.length > 0 && <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>Grupos: {s.grupos.join(', ')}</div>}
      {s.recursos_uso && <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 3 }}>Usará: {s.recursos_uso}</div>}
    </>
  );
}

function TarjetaResolver({ s, hoy, post, avisar, recargar }) {
  const pend = s.filas.filter(f => f.estado === 'pendiente');
  const [marcadas, setMarcadas] = useState(() => pend.map(f => f.id));
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const alternar = id => setMarcadas(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);
  const quitadas = pend.filter(f => !marcadas.includes(f.id));

  async function resolver(decision) {
    if (decision === 'denegar' && !motivo.trim()) return avisar('Para denegar hay que escribir el motivo.');
    if (decision === 'aceptar' && !marcadas.length) return avisar('No has dejado ninguna hora marcada: si no aceptas nada, deniégala con el motivo.');
    setEnviando(true);
    try {
      const r = await post('resolver', { serie_id: s.serie_id, decision, quitar: quitadas.map(f => f.id), motivo: motivo.trim() });
      avisar(decision === 'denegar'
        ? 'Solicitud denegada. Se ha avisado al profesor.'
        : `Aceptadas ${r.aceptadas} horas${r.denegadas ? `, ${r.denegadas} quitadas` : ''}${r.conflictos ? ` (${r.conflictos} ya estaban reservadas por otro)` : ''}. Se ha avisado al profesor.`, 'ok');
      await recargar();
    } catch (e) {
      avisar(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ ...tarjeta, borderLeft: '5px solid #fcd34d', padding: 16 }}>
      <CabeceraGestion s={s} />
      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#4b5563', margin: '12px 0 6px' }}>
        {pend.length === 1 ? 'Hora pedida:' : `${pend.length} horas pedidas. Desmarca las que quieras quitar:`}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
        {pend.map(f => (
          <label key={f.id} style={{
            display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '6px 9px', borderRadius: 8, cursor: 'pointer',
            backgroundColor: marcadas.includes(f.id) ? FONDO : '#f9fafb',
            border: `1.5px solid ${marcadas.includes(f.id) ? COLOR : '#e5e7eb'}`,
            textDecoration: marcadas.includes(f.id) ? 'none' : 'line-through', color: f.fecha < hoy ? '#9ca3af' : '#111',
          }}>
            <input type="checkbox" checked={marcadas.includes(f.id)} onChange={() => alternar(f.id)} />
            <span style={{ textTransform: 'capitalize' }}>{fmtFecha(f.fecha)}</span> · <strong>{f.hora}ª</strong>
          </label>
        ))}
      </div>
      <textarea style={{ ...input, minHeight: 52, fontSize: 13, resize: 'vertical', marginTop: 10 }} value={motivo} maxLength={1000}
        placeholder={quitadas.length ? 'Motivo de los días quitados (opcional; obligatorio si deniegas)' : 'Motivo (obligatorio si deniegas)'}
        onChange={e => setMotivo(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button disabled={enviando} onClick={() => resolver('aceptar')} style={{ ...boton, flex: 1, backgroundColor: VERDE, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? '⏳' : quitadas.length ? `✅ Aceptar ${marcadas.length} de ${pend.length}` : '✅ Aceptar'}
        </button>
        <button disabled={enviando} onClick={() => resolver('denegar')} style={{ ...boton, flex: 1, backgroundColor: ROJO, opacity: enviando ? 0.6 : 1 }}>
          {enviando ? '⏳' : '❌ Denegar'}
        </button>
      </div>
    </div>
  );
}

function TarjetaProxima({ s, hoy, post, avisar, recargar }) {
  const vivas = s.filas.filter(f => f.estado === 'aceptada' && f.fecha >= hoy);
  const [editando, setEditando] = useState(null);   // { id, fecha, hora }
  const [abierta, setAbierta] = useState(vivas.length <= 6);

  async function hacer(accion, d, ok) {
    try {
      await post(accion, { serie_id: s.serie_id, ...d });
      avisar(ok, 'ok');
      setEditando(null);
      await recargar();
    } catch (e) {
      avisar(e.message);
    }
  }

  function anular(ids) {
    const motivo = prompt(ids.length === 1 ? 'Motivo para anular esta hora:' : `Motivo para anular las ${ids.length} horas que quedan:`);
    if (motivo == null) return;
    if (!motivo.trim()) return avisar('Hay que escribir el motivo.');
    hacer('anular', { ids, motivo: motivo.trim() }, 'Anulada. Se ha avisado al profesor.');
  }

  function editarActividad() {
    const nueva = prompt('Actividad o proyecto:', s.actividad || '');
    if (nueva == null || !nueva.trim() || nueva.trim() === s.actividad) return;
    hacer('modificar', { id: vivas[0].id, actividad: nueva.trim() }, 'Actividad cambiada.');
  }

  return (
    <div style={{ ...tarjeta, borderLeft: '5px solid #86efac', padding: 16 }}>
      <CabeceraGestion s={s} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {vivas.length > 6 && <button onClick={() => setAbierta(a => !a)} style={botonSec}>{abierta ? '▲ Ocultar' : `▼ Ver las ${vivas.length} horas`}</button>}
        <button onClick={editarActividad} style={botonSec}>✏️ Cambiar actividad</button>
        <button onClick={() => anular(vivas.map(f => f.id))} style={{ ...botonSec, color: ROJO }}>🚫 Anular todo lo que queda</button>
      </div>
      {abierta && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {vivas.map(f => (
            <div key={f.id} style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 8, backgroundColor: '#f0fdf4' }}>
              {editando?.id === f.id ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" min={hoy} value={editando.fecha} onChange={e => setEditando(x => ({ ...x, fecha: e.target.value }))} style={{ ...input, width: 160, padding: '6px 8px', fontSize: 13 }} />
                  <select value={editando.hora} onChange={e => setEditando(x => ({ ...x, hora: Number(e.target.value) }))} style={{ ...input, width: 90, padding: '6px 8px', fontSize: 13 }}>
                    {HORAS.map(h => <option key={h} value={h}>{h}ª</option>)}
                  </select>
                  <button onClick={() => hacer('modificar', { id: f.id, fecha: editando.fecha, hora: editando.hora }, 'Cambiada. Se ha avisado al profesor.')} style={{ ...boton, padding: '6px 12px', fontSize: 12.5 }}>Guardar</button>
                  <button onClick={() => setEditando(null)} style={{ ...botonSec, padding: '6px 10px' }}>Cancelar</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 120, textTransform: 'capitalize', fontWeight: 600 }}>{fmtFecha(f.fecha)}</span>
                  <span style={{ width: 30, fontWeight: 700 }}>{f.hora}ª</span>
                  <span style={{ flex: 1, color: '#6b7280' }}>{TRAMOS[f.hora]}</span>
                  <button onClick={() => setEditando({ id: f.id, fecha: f.fecha, hora: f.hora })} title="Cambiar día u hora" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                  <button onClick={() => anular([f.id])} title="Anular esta hora" style={{ background: 'none', border: 'none', color: ROJO, cursor: 'pointer', fontSize: 15 }}>×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AhoraEnAulas({ leer, avisar }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    leer('vista=ahora').then(setD).catch(e => avisar(e.message));
  }, []);
  if (!d) return <Vacio texto="⏳ Cargando…" />;
  const porHora = HORAS.map(h => ({ h, filas: (d.reservas || []).filter(r => r.hora === h) }));
  return (
    <div style={tarjeta}>
      <Sub2>Hoy, {fmtFechaLarga(d.fecha)}{d.hora ? ` · ahora es ${d.hora}ª hora` : ' · fuera del horario lectivo'}</Sub2>
      {porHora.map(({ h, filas }) => (
        <div key={h} style={{
          display: 'flex', gap: 12, padding: '9px 10px', borderRadius: 10, marginBottom: 6,
          backgroundColor: d.hora === h ? FONDO : 'white', border: `2px solid ${d.hora === h ? COLOR : '#f3f4f6'}`,
        }}>
          <div style={{ width: 70, flexShrink: 0 }}>
            <div style={{ fontWeight: 800 }}>{h}ª</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{TRAMOS[h]}</div>
          </div>
          <div style={{ flex: 1, fontSize: 13 }}>
            {filas.length === 0 ? <span style={{ color: '#9ca3af' }}>Sin reservas</span> : filas.map(r => (
              <div key={r.id} style={{ marginBottom: 3 }}>
                <strong>{r.recurso}{r.aula_libre ? ` · ${r.aula_libre}` : ''}</strong> — {r.solicitante_nombre}
                <span style={{ color: '#6b7280' }}> · {(r.grupos || []).join(', ')} · {r.actividad}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Pista>Solo salen las reservas aceptadas de los recursos que gestionas. Las clases fijas del horario no aparecen aquí.</Pista>
    </div>
  );
}

function Registro({ leer, avisar, hoy }) {
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoy);
  const [filas, setFilas] = useState(null);

  async function buscar() {
    try {
      const d = await leer(`vista=registro&desde=${desde}&hasta=${hasta}`);
      setFilas(d?.filas || []);
    } catch (e) {
      avisar(e.message);
    }
  }

  function descargar() {
    const cab = ['Fecha', 'Hora', 'Recurso', 'Aula', 'Profesor', 'Correo', 'Actividad', 'Grupos', 'Recursos usados', 'Estado', 'Motivo'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const lineas = (filas || []).map(r => [
      r.fecha, `${r.hora}ª`, r.recurso, r.aula_libre || '', r.solicitante_nombre, r.solicitante_email,
      r.actividad, (r.grupos || []).join(', '), r.recursos_uso || '', ESTADOS[r.estado]?.label || r.estado, r.motivo || '',
    ].map(esc).join(';'));
    const csv = '﻿' + [cab.map(esc).join(';'), ...lineas].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `reservas_${desde}_${hasta}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const cuenta = e => (filas || []).filter(r => r.estado === e).length;

  return (
    <div style={tarjeta}>
      <Sub2>Registro de uso por fechas</Sub2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Campo label="Desde"><input type="date" style={{ ...input, width: 170 }} value={desde} onChange={e => { setDesde(e.target.value); setFilas(null); }} /></Campo>
        <Campo label="Hasta"><input type="date" style={{ ...input, width: 170 }} value={hasta} onChange={e => { setHasta(e.target.value); setFilas(null); }} /></Campo>
        <div style={{ marginBottom: 14 }}><button onClick={buscar} style={boton}>Buscar</button></div>
      </div>
      {filas && (
        <div>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 10 }}>
            {filas.length} horas en total · ✅ {cuenta('aceptada')} aceptadas · ⏳ {cuenta('pendiente')} pendientes · ❌ {cuenta('denegada')} denegadas · ↩️ {cuenta('anulada')} anuladas
          </div>
          {filas.length > 0 && <button onClick={descargar} style={boton}>📥 Descargar CSV (Excel)</button>}
        </div>
      )}
      <Pista>Una fila por hora reservada, con quién, para qué, con qué grupos y cómo terminó.</Pista>
    </div>
  );
}

function Rejilla({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginBottom: 12 }}>{children}</div>;
}

function Etiqueta({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, margin: '4px 0 8px' }}>{children}</div>;
}

function Vacio({ texto }) {
  return <div style={{ ...tarjeta, textAlign: 'center', color: '#888', fontSize: 13.5, padding: 22 }}>{texto}</div>;
}

function Chip({ activo, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
      fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
      border: `1.5px solid ${activo ? COLOR : '#ddd'}`,
      backgroundColor: activo ? FONDO : 'white',
      color: activo ? COLOR : '#666',
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
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#4b5563', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Pista({ children }) {
  return <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 8, lineHeight: 1.5 }}>{children}</div>;
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
  backgroundColor: COLOR, color: 'white', fontWeight: 700,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};

const botonSec = {
  padding: '8px 14px', borderRadius: 8, border: '1.5px solid #d1d5db',
  backgroundColor: 'white', color: '#4b5563', fontWeight: 600,
  fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
};
