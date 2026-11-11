"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { hoyLocal } from '@/lib/fechas';

const HORAS = [
  { id: '1', label: '1ª', rango: '8:30–9:25' },
  { id: '2', label: '2ª', rango: '9:25–10:20' },
  { id: '3', label: '3ª', rango: '10:20–11:15' },
  { id: '4', label: '4ª', rango: '11:45–12:40' },
  { id: '5', label: '5ª', rango: '12:40–13:35' },
  { id: '6', label: '6ª', rango: '13:35–14:30' },
];

const DIAS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];

function horaActual() {
  const h = new Date().getHours();
  const m = new Date().getMinutes();
  const t = h * 60 + m;
  if (t < 565) return '1'; // antes 9:25
  if (t < 615) return '2'; // antes 10:15... aprox
  if (t < 675) return '3';
  if (t < 760) return '4';
  if (t < 815) return '5';
  return '6';
}

export default function SalaProfesores() {
  const [ausencias, setAusencias] = useState([]);
  const [dlds, setDlds] = useState([]);
  const [apoyos, setApoyos] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [noticias, setNoticias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [semana, setSemana] = useState(null);
  // La caja de la derecha alterna sola: un minuto avisos, un minuto noticias
  const [modoPanel, setModoPanel] = useState('avisos');
  const modosRef = useRef([]);
  // Carteles (avisos con foto): salen a pantalla completa 10 segundos
  // cada vez que la caja de la derecha cambia, uno cada vez, por turnos.
  const [cartel, setCartel] = useState(null);
  const cartelesRef = useRef([]);
  const turnoCartelRef = useRef(0);
  const cajaAvisosRef = useRef(null);
  const cajaAusentesRef = useRef(null);
  const cajaGuardiasRef = useRef(null);
  const [reloj, setReloj] = useState(new Date());
  const [ultimaCarga, setUltimaCarga] = useState(null);

  const hoy = hoyLocal();

  // La sala es siempre el escenario de hoy. Se recalcula en cada
  // render (el reloj refresca cada segundo), así que a medianoche cambia
  // solo de día aunque la tele se quede encendida.
  const dia = hoy;
  const esHoy = dia === hoy;

  const diaIdx = new Date(dia + 'T12:00:00').getDay();
  const diaNombre = DIAS[diaIdx];
  const horaAct = horaActual();

  // Hora que se está mirando. Por defecto la hora actual, pero se puede
  // cambiar para ver las guardias de otra franja sin cambiar de día.
  // Al volver a "hoy" se resetea a la hora real.
  const [horaVista, setHoraVista] = useState(null); // null = usar la real
  const horaEfectiva = (esHoy && !horaVista) ? horaAct : (horaVista || horaAct);

  // En una tele se lee de lejos: "Juan Ruiz" antes que "Ruiz Fernandez, Juan".
  function nombreCortoSala(largo) {
    if (!largo) return '';
    if (!largo.includes(',')) return largo;
    const [apellidos, nombre] = largo.split(',');
    const ap = (apellidos || '').trim().split(/\s+/)[0] || '';
    const no = (nombre || '').trim().split(/\s+/)[0] || '';
    return `${no} ${ap}`.trim();
  }

  const cargarDatos = useCallback(async () => {
    // Todo llega de una sola llamada al servidor. Esta pantalla no tiene
    // sesión (la enciende cualquiera por la mañana), así que el servidor
    // devuelve solo lo del día y sin motivos ni justificaciones.
    try {
      const r = await fetch(`/api/sala?fecha=${dia}`);
      const d = await r.json();
      setAusencias(d.ausencias || []);
      setDlds(d.dlds || []);
      setApoyos(d.apoyos || []);
      setAvisos(d.avisos || []);
      cartelesRef.current = (d.avisos || []).filter(a => a.imagen_url);
      setActividades(d.actividades || []);
      setSemana(d.semana || null);
    } catch (e) {
      console.error('No se pudieron cargar los datos de la sala:', e);
    }

    setUltimaCarga(new Date());
  }, [dia]);

  // El cuadrante se pone al día treinta minutos antes de que acabe cada
  // hora. Esta pantalla está encendida todo el día en la sala de
  // profesores, así que es la que mejor puede dispararlo. Si no hay nadie
  // mirando, lo hará el primer profesor que abra sus guardias.
  useEffect(() => {
    // Solo dentro de los treinta minutos antes de cada timbre, que es cuando
    // sirve. Antes llamaba cada minuto, todo el día, y cada llamada cuenta
    // en el límite gratuito de Vercel: pasado ese límite, pausan la
    // aplicación entera.
    const VENTANAS = [[535,565],[590,620],[645,675],[675,705],[730,760],[785,815],[840,870]];
    // Y una sola llamada por ventana: el servidor solo recalcula la primera
    // vez, así que las otras 29 de cada media hora eran gasto de Vercel sin
    // ningún efecto. Si la llamada falla, se reintenta al minuto siguiente.
    const hechas = new Set();
    const alDia = () => {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      const v = VENTANAS.findIndex(([a, b]) => m >= a && m < b);
      if (v < 0) return;
      const clave = `${d.toDateString()}|${v}`;
      if (hechas.has(clave)) return;
      hechas.add(clave);
      fetch('/api/guardias/al-dia', { method: 'POST' })
        .then(r => { if (!r.ok) hechas.delete(clave); })
        .catch(() => hechas.delete(clave));
    };
    alDia();
    const t = setInterval(alDia, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Solo refresca en horario de centro: de lunes a viernes, de 7:30 a
    // 14:00. Fuera de ahí la tele se queda con lo último que cargó; si
    // está encendida por la noche o el fin de semana, no gasta nada.
    const enHorario = () => {
      const d = new Date();
      const m = d.getHours() * 60 + d.getMinutes();
      return d.getDay() >= 1 && d.getDay() <= 5 && m >= 450 && m < 840;
    };
    cargarDatos();
    const intervalo = setInterval(() => { if (enHorario()) cargarDatos(); }, 120000); // cada 2 minutos: sobra para una tele

    // Noticias de la web del centro (se refrescan cada media hora)
    const traerNoticias = () => {
      fetch('/api/noticias')
        .then(r => r.json())
        .then(d => setNoticias(d.noticias || []))
        .catch(() => {});
    };
    traerNoticias();
    const intervaloNoticias = setInterval(() => { if (enHorario()) traerNoticias(); }, 1800000);

    // Cada minuto la banda de arriba pasa a la siguiente sección, pero solo
    // entre las que tienen algo que mostrar: si no hay avisos, no se pierde
    // un minuto enseñando "Sin avisos".
    const alternancia = setInterval(() => {
      setModoPanel(m => {
        const ms = modosRef.current;
        if (ms.length === 0) return m;
        const i = ms.indexOf(m);
        return ms[(i + 1) % ms.length];
      });
      if (cajaAvisosRef.current) cajaAvisosRef.current.scrollTop = 0;
      const carteles = cartelesRef.current;
      if (carteles.length > 0) {
        const c = carteles[turnoCartelRef.current % carteles.length];
        turnoCartelRef.current++;
        setCartel(c);
        setTimeout(() => setCartel(null), 10000);
      }
    }, 60000);
    const relojInterval = setInterval(() => setReloj(new Date()), 1000);

    // Los tres listados bajan y suben solos: la pantalla está en la
    // pared y nadie va a mover la barra. Si cabe todo, no se mueve nada.
    // Guardias y noticias ya no se mueven: con tanto movimiento la
    // pantalla mareaba y despistaba. Solo baja sola la lista de ausentes,
    // y únicamente si no cabe entera.
    const cajas = [
      { ref: cajaAusentesRef, bajando: true, espera: 0 },
    ];
    const vaiven = setInterval(() => {
      for (const c of cajas) {
        const caja = c.ref.current;
        if (!caja) continue;
        const sobra = caja.scrollHeight - caja.clientHeight;
        // Si la caja es muy baja, mejor no moverse: el vaivén en un
        // espacio de dos líneas marea y no deja leer nada.
        if (caja.clientHeight < 140) continue;
        // Margen amplio: si solo sobresalen unos pocos píxeles no merece
        // la pena moverse, quedaría un temblor raro en la pantalla.
        if (sobra <= 24) continue;

        if (c.espera > 0) { c.espera--; continue; }

        caja.scrollTop += c.bajando ? 1 : -1;

        // Pausa de 4 segundos arriba y abajo, para dar tiempo a leer
        if (c.bajando && caja.scrollTop >= sobra - 1) { c.bajando = false; c.espera = 80; }
        if (!c.bajando && caja.scrollTop <= 1)        { c.bajando = true;  c.espera = 80; }
      }
    }, 50);
    return () => { clearInterval(intervalo); clearInterval(relojInterval); clearInterval(vaiven); clearInterval(intervaloNoticias); clearInterval(alternancia); };
  }, [cargarDatos]);

  // Al cambiar de día, resetear la hora seleccionada
  useEffect(() => { setHoraVista(null); }, [dia]);

  // Profesores ausentes con sus horas
  const profesAusentes = {};
  for (const a of ausencias) {
    const nombre = a.profesor_nombre || '?';
    if (!profesAusentes[nombre]) profesAusentes[nombre] = { horas: [], tipo: 'ausencia' };
    // El servidor ya da las horas de hoy; null = el día entero
    const horasHoy = Array.isArray(a.horas_hoy) ? a.horas_hoy : HORAS.map(h => h.id);
    horasHoy.forEach(h => {
      if (!profesAusentes[nombre].horas.includes(h)) profesAusentes[nombre].horas.push(h);
    });
  }
  for (const d of dlds) {
    const nombre = d.profesor_nombre || '?';
    if (!profesAusentes[nombre]) profesAusentes[nombre] = { horas: [], tipo: 'dld' };
    profesAusentes[nombre].tipo = 'dld';
    const horasReconstruidas = [];
    if (Array.isArray(d.horas)) {
      d.horas.forEach(h => {
        const horaId = typeof h === 'object' ? (h.hora || '').toString().replace(/[aª]/g, '') : h.toString().replace(/[aª]/g, '');
        if (horaId) horasReconstruidas.push(horaId);
      });
    } else if (Array.isArray(d.grupos_afectados)) {
      d.grupos_afectados.forEach(g => {
        const hs = Array.isArray(g.horas) ? g.horas : (g.hora ? [g.hora] : []);
        hs.forEach(h => {
          const horaId = typeof h === 'object' ? (h.hora || '').toString().replace(/[aª]/g, '') : h.toString().replace(/[aª]/g, '');
          if (horaId) horasReconstruidas.push(horaId);
        });
      });
    }
    horasReconstruidas.forEach(h => {
      if (!profesAusentes[nombre].horas.includes(h)) profesAusentes[nombre].horas.push(h);
    });
  }

  const totalAusentesAhora = Object.entries(profesAusentes).filter(([_, v]) => v.horas.includes(horaEfectiva)).length;
  const totalAusentesHoy = Object.keys(profesAusentes).length;

  const formatFecha = () => {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dia + 'T12:00:00').toLocaleDateString('es-ES', opciones);
  };

  // Secciones de la banda de arriba que tienen contenido. Las vacías no
  // salen; si no hay ninguna, la banda desaparece y las columnas crecen.
  const avisosTexto = avisos.filter(a => !a.imagen_url);
  const modos = [
    avisosTexto.length > 0 && 'avisos',
    actividades.length > 0 && 'extraescolares',
    noticias.length > 0 && 'noticias',
  ].filter(Boolean);
  modosRef.current = modos;
  const modoVisible = modos.includes(modoPanel) ? modoPanel : modos[0];

  const azul = '#1e3a5f';
  const verde = '#16a34a';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a', fontFamily: 'system-ui, sans-serif', color: 'white', padding: 0, overflow: 'hidden' }}>

      {/* CARTEL A PANTALLA COMPLETA (10 segundos) */}
      {cartel && (
        <div onClick={() => setCartel(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: '#000',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          overflow: 'hidden',
        }}>
          {/* Fondo: la misma foto ampliada y desenfocada, para no dejar franjas negras */}
          <div style={{
            position: 'absolute', inset: '-40px', backgroundImage: `url(${cartel.imagen_url})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(30px) brightness(0.55)',
          }} />
          <img src={cartel.imagen_url} alt={cartel.titulo || 'Cartel'}
            style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 0 40px rgba(0,0,0,0.6)' }} />
        </div>
      )}
      {/* Precarga de los carteles, para que salgan al instante */}
      <div style={{ display: 'none' }}>
        {avisos.filter(a => a.imagen_url).map(a => <img key={a.id} src={a.imagen_url} alt="" />)}
      </div>

      {/* ARRIBA: a la izquierda APrieto, la fecha, el reloj y las seis
          horas; a la derecha, todo el ancho que queda para avisos,
          extraescolares y noticias (solo las que tienen contenido). */}
      <div style={{ display: 'flex', gap: 14, padding: '12px 14px 0', flexShrink: 0, alignItems: 'stretch' }}>

        <div style={{ flexShrink: 0, background: `linear-gradient(135deg, ${azul} 0%, #0f172a 100%)`,
          borderRadius: 12, border: '1px solid #334155', padding: '10px 16px',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, whiteSpace: 'nowrap' }}>📋 APrieto · Sala de Profesores</h1>
          <div style={{ fontSize: 16, opacity: 0.85, textTransform: 'capitalize' }}>{formatFecha()}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 2 }}>
            <div>
              <div style={{ fontSize: 58, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {reloj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                Actualizado {ultimaCarga ? ultimaCarga.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </div>
            </div>

            {/* Las seis horas: se tocan para ver otra franja */}
            <div style={{ display: 'flex', gap: 4 }}>
              {HORAS.map(h => {
                const ausEstaHora = Object.entries(profesAusentes).filter(([_, v]) => v.horas.includes(h.id)).length;
                const activa = h.id === horaEfectiva;
                return (
                  <div key={h.id} onClick={() => setHoraVista(activa && horaVista ? null : h.id)}
                    title={h.rango}
                    style={{
                      width: 46, textAlign: 'center', padding: '5px 0', borderRadius: 7, cursor: 'pointer',
                      backgroundColor: activa ? '#1d4ed8' : '#0f172a',
                      border: activa ? '2px solid #3b82f6' : '1px solid #334155',
                    }}>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{h.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: ausEstaHora > 0 ? '#ef4444' : '#22c55e' }}>
                      {ausEstaHora > 0 ? `⚠️${ausEstaHora}` : '✓'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {esHoy && horaVista && (
            <div style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 11px', borderRadius: 7,
              backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6',
              fontSize: 13.5, fontWeight: 700, color: '#93c5fd' }}>
              👁️ Mostrando {HORAS.find(h => h.id === horaVista)?.label || horaVista}
              <button onClick={() => setHoraVista(null)} style={{ background: 'none', border: 'none',
                color: '#93c5fd', cursor: 'pointer', fontSize: 13, fontWeight: 700, padding: 0 }}>
                ← Hora actual
              </button>
            </div>
          )}
        </div>

        {modos.length > 0 && (
          <div ref={cajaAvisosRef} style={{ flex: 1, minWidth: 0, maxHeight: '28vh', backgroundColor: '#1e293b', borderRadius: 12, padding: '10px 14px', border: '1px solid #334155', overflow: 'hidden', position: 'relative' }}>
            {modos.length > 1 && (
              <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 6 }}>
                {modos.map(m => (
                  <span key={m} style={{ width: 10, height: 10, borderRadius: '50%',
                    backgroundColor: m === modoVisible ? '#3b82f6' : '#334155' }} />
                ))}
              </div>
            )}
            {modoVisible === 'avisos' ? (
              <>
                <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>📢 Avisos del equipo directivo</h2>
                {avisosTexto.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '8px 0', opacity: 0.5, fontSize: 14 }}>
                    📌 Sin avisos
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                    {avisosTexto.map((a, i) => (
                      <div key={a.id || i} style={{
                        backgroundColor: '#0f172a', borderRadius: 8, padding: '8px 12px',
                        borderLeft: `4px solid ${a.urgente ? '#ef4444' : '#3b82f6'}`,
                      }}>
                        <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 5 }}>
                          {a.urgente ? '🔴' : '📌'} {a.titulo}
                        </div>
                        <div style={{ fontSize: 15, opacity: 0.88, lineHeight: 1.45 }}>{a.mensaje}</div>
                        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 6 }}>{a.autor} · {new Date(a.created_at).toLocaleDateString('es-ES')}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : modoVisible === 'extraescolares' ? (
              <>
                <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>
                  🚌 Extraescolares de la semana
                  {semana && (
                    <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.5, marginLeft: 8 }}>
                      {new Date(semana.desde + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                      {' – '}
                      {new Date(semana.hasta + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </h2>
                {actividades.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '8px 0', opacity: 0.5, fontSize: 14 }}>
                    🚌 Ninguna actividad esta semana
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                    {actividades.map((a, i) => {
                      const ini = a.fecha_inicio ? new Date(a.fecha_inicio + 'T12:00:00') : null;
                      const fin = a.fecha_fin ? new Date(a.fecha_fin + 'T12:00:00') : null;
                      const fmt = f => f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
                      const cuando = ini
                        ? (fin && a.fecha_fin !== a.fecha_inicio ? `${fmt(ini)} – ${fmt(fin)}` : fmt(ini))
                        : '';
                      const grupos = Array.isArray(a.grupos) ? a.grupos.join(', ') : '';
                      const acomp = Array.isArray(a.acompanantes) ? a.acompanantes.length : 0;
                      return (
                        <div key={i} style={{
                          backgroundColor: '#0f172a', borderRadius: 8, padding: '8px 12px',
                          borderLeft: `4px solid ${a.estado === 'pendiente' ? '#f59e0b' : '#0ea5e9'}`,
                        }}>
                          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.titulo || 'Actividad'}
                            {a.estado === 'pendiente' && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', marginLeft: 8 }}>pendiente</span>
                            )}
                          </div>
                          <div style={{ fontSize: 14, opacity: 0.88, lineHeight: 1.35 }}>
                            <span style={{ textTransform: 'capitalize' }}>📅 {cuando}</span>
                            {grupos && <span style={{ marginLeft: 10 }}>👥 {grupos}</span>}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.45, marginTop: 3 }}>
                            {a.profesor_nombre || ''}{acomp > 0 ? ` +${acomp}` : ''}{a.lugar ? ` · ${a.lugar}` : ''}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>
                  📰 Noticias del centro
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.5, marginLeft: 8 }}>somosdelprieto.com</span>
                </h2>
                {noticias.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '8px 0', opacity: 0.5, fontSize: 14 }}>
                    📰 Sin noticias que mostrar
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8 }}>
                    {noticias.map((n, i) => (
                      <div key={n.id || i} style={{
                        backgroundColor: '#0f172a', borderRadius: 8, padding: '8px 12px',
                        borderLeft: '4px solid #10b981',
                        display: 'flex', gap: 12, alignItems: 'flex-start',
                      }}>
                        {n.imagen && (
                          <img src={n.imagen} alt="" style={{
                            width: 52, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0,
                          }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 3, lineHeight: 1.3,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {n.titulo}
                          </div>
                          <div style={{ fontSize: 11, opacity: 0.45 }}>
                            {n.fecha ? new Date(n.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* DOS COLUMNAS: ausentes a la izquierda, guardias a la derecha */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 14 }}>

        {/* COLUMNA IZQUIERDA: PROFESORES QUE FALTAN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden', minHeight: 0 }}>

          {/* LISTA DE AUSENTES */}
          <div ref={cajaAusentesRef} style={{ flex: 1, minHeight: 0, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, border: '1px solid #334155', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>🏥 Faltan {esHoy ? 'hoy' : 'ese día'}</h2>
              <span style={{ padding: '2px 10px', borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', color: '#fbbf24', fontSize: 15, fontWeight: 800 }}>
                {totalAusentesHoy} {esHoy ? 'hoy' : 'ese día'}
              </span>
              {esHoy && (
                <span style={{ padding: '2px 10px', borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: 15, fontWeight: 800 }}>
                  {totalAusentesAhora} a {HORAS.find(h => h.id === horaEfectiva)?.label || ''}
                </span>
              )}
            </div>
            {totalAusentesHoy === 0 ? (
              <div style={{ textAlign: 'center', padding: '8px 0', opacity: 0.5, fontSize: 14 }}>
                ✅ Sin ausencias {esHoy ? 'hoy' : 'ese día'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 6 }}>
                {Object.entries(profesAusentes).sort((a,b) => {
                  // Primero quien falta a la hora que se está mirando
                  const fa = a[1].horas.includes(horaEfectiva) ? 0 : 1;
                  const fb = b[1].horas.includes(horaEfectiva) ? 0 : 1;
                  return fa - fb || a[0].localeCompare(b[0]);
                }).map(([nombre, info]) => (
                  <div key={nombre} style={{
                    backgroundColor: info.horas.includes(horaEfectiva) ? '#7f1d1d' : '#0f172a',
                    borderRadius: 8, padding: '5px 10px', gap: 8,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: info.horas.includes(horaEfectiva) ? '1px solid #ef4444' : '1px solid #334155',
                  }}>
                    <div style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ fontWeight: 700, fontSize: 17 }}>{nombre}</span>
                      <span style={{
                        marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4,
                        backgroundColor: info.tipo === 'dld' ? '#1e40af' : '#92400e',
                        color: 'white',
                      }}>
                        {info.tipo === 'dld' ? 'DLD' : 'Ausencia'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                      {HORAS.map(h => (
                        <span key={h.id} style={{
                          width: 22, height: 22, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                          backgroundColor: info.horas.includes(h.id) ? (h.id === horaEfectiva ? '#ef4444' : '#475569') : 'transparent',
                          color: info.horas.includes(h.id) ? 'white' : '#475569',
                          border: h.id === horaEfectiva ? '2px solid #ef4444' : '1px solid #475569',
                        }}>
                          {h.label.replace('ª','')}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

          {/* COLUMNA DERECHA: GUARDIAS CON LAS CLASES ASIGNADAS */}
          <div ref={cajaGuardiasRef} style={{ flex: 1, minHeight: 0, backgroundColor: '#1e293b', borderRadius: 12, padding: 12, border: '1px solid #334155', overflow: 'hidden' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 800 }}>🛡️ Guardias: quién cubre cada clase</h2>
            {(() => {
              // Siempre tres horas fijas, sin moverse: la actual y las dos
              // siguientes. A 4ª, 5ª y 6ª se ven 4ª, 5ª y 6ª.
              const i = Math.max(0, HORAS.findIndex(h => h.id === horaEfectiva));
              const desde = Math.min(i, HORAS.length - 3);
              const ventana = HORAS.slice(desde, desde + 3);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, height: 'calc(100% - 40px)' }}>
                  {ventana.map(h => {
                    // La columna es 'hora', no 'hora_id'.
                    const apoyosHora = apoyos.filter(a => {
                      const hid = (a.hora || '').toString().toLowerCase().replace(/[aª\s]/g, '');
                      return hid === h.id;
                    });
                    const activa = h.id === horaEfectiva;
                    return (
                      <div key={h.id} style={{
                        backgroundColor: activa ? '#1e3a5f' : '#0f172a',
                        borderRadius: 8, padding: '8px 10px', minHeight: 0, overflow: 'hidden',
                        border: activa ? '2px solid #3b82f6' : '1px solid #334155',
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: activa ? '#93c5fd' : '#94a3b8', marginBottom: 6 }}>
                          {h.label} <span style={{ fontSize: 12, fontWeight: 600 }}>{h.rango}</span>
                          {activa && esHoy && !horaVista ? ' · AHORA' : ''}
                        </div>
                        {apoyosHora.length === 0 ? (
                          <div style={{ fontSize: 13, opacity: 0.45 }}>Sin guardias a esta hora</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {apoyosHora.map((a, k) => (
                              <div key={k} style={{
                                borderLeft: `3px solid ${a.estado === 'confirmado' ? '#22c55e' : a.estado === 'incidencia' ? '#f97316' : '#ef4444'}`,
                                paddingLeft: 8, minWidth: 0,
                              }}>
                                <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                  color: a.estado === 'confirmado' ? '#4ade80' : '#fca5a5' }}>
                                  {a.estado === 'confirmado' ? '✅' : '🔴'}{' '}
                                  {a.nombre_completo || nombreCortoSala(a.profesor_nombre_pdf) || 'Sin asignar'}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1',
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {a.grupo || ''}{a.aula ? ` · ${a.aula}` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

      </div>
    </div>
  );
}
