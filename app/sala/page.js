"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { hoyLocal } from '@/lib/fechas';
import { getSupabase } from "../../lib/supabase";

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
  const cajaAvisosRef = useRef(null);
  const [reloj, setReloj] = useState(new Date());
  const [ultimaCarga, setUltimaCarga] = useState(null);

  const hoy = hoyLocal();
  const diaIdx = new Date().getDay();
  const diaNombre = DIAS[diaIdx];
  const horaAct = horaActual();

  const cargarDatos = useCallback(async () => {
    const sb = getSupabase();

    // Ausencias de hoy
    try {
      const { data } = await sb.from('ausencias')
        .select('profesor_nombre, horas, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', hoy)
        .or(`fecha_fin.gte.${hoy},fecha_fin.is.null`);
      setAusencias(data || []);
    } catch(e) {}

    // DLD aprobados de hoy
    try {
      const { data } = await sb.from('dld')
        .select('profesor_nombre, horas, grupos_afectados, guardias_horario')
        .eq('fecha_solicitada', hoy)
        .eq('estado', 'aprobada');
      setDlds(data || []);
    } catch(e) {}

    // Apoyos de guardia asignados hoy
    try {
      const { data } = await sb.from('apoyos_asignados')
        .select('*')
        .eq('fecha', hoy);
      setApoyos(data || []);
    } catch(e) { setApoyos([]); }

    // Avisos del equipo directivo
    try {
      const { data } = await sb.from('avisos_sala')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false });
      setAvisos(data || []);
    } catch(e) { setAvisos([]); }

    setUltimaCarga(new Date());
  }, [hoy]);

  useEffect(() => {
    cargarDatos();
    const intervalo = setInterval(cargarDatos, 120000); // cada 2 min
    const relojInterval = setInterval(() => setReloj(new Date()), 1000);

    // Los avisos bajan y suben solos: la pantalla está en la pared y
    // nadie va a mover la barra de desplazamiento. Si caben todos, no
    // se mueve nada.
    let bajando = true;
    let esperando = 0;
    const vaiven = setInterval(() => {
      const caja = cajaAvisosRef.current;
      if (!caja) return;
      const sobra = caja.scrollHeight - caja.clientHeight;
      if (sobra <= 4) return;              // caben todos: quieto

      if (esperando > 0) { esperando--; return; }

      caja.scrollTop += bajando ? 1 : -1;

      // Pausa de 4 segundos al llegar arriba y abajo, para dar tiempo a leer
      if (bajando && caja.scrollTop >= sobra - 1) { bajando = false; esperando = 100; }  // 5 s de pausa
      if (!bajando && caja.scrollTop <= 1)        { bajando = true;  esperando = 100; }
    }, 50);
    return () => { clearInterval(intervalo); clearInterval(relojInterval); clearInterval(vaiven); };
  }, [cargarDatos]);

  // Profesores ausentes con sus horas
  const profesAusentes = {};
  for (const a of ausencias) {
    const nombre = a.profesor_nombre || '?';
    if (!profesAusentes[nombre]) profesAusentes[nombre] = { horas: [], tipo: 'ausencia' };
    if (Array.isArray(a.horas)) {
      a.horas.forEach(h => {
        const horaId = typeof h === 'object' ? (h.hora || '').toString().replace(/[aª]/g, '') : h.toString().replace(/[aª]/g, '');
        if (horaId && !profesAusentes[nombre].horas.includes(horaId)) {
          profesAusentes[nombre].horas.push(horaId);
        }
      });
    } else {
      // Ausencia prolongada sin horas específicas → todas las horas
      HORAS.forEach(h => { if (!profesAusentes[nombre].horas.includes(h.id)) profesAusentes[nombre].horas.push(h.id); });
    }
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

  const totalAusentesAhora = Object.entries(profesAusentes).filter(([_, v]) => v.horas.includes(horaAct)).length;
  const totalAusentesHoy = Object.keys(profesAusentes).length;

  const formatFecha = () => {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('es-ES', opciones);
  };

  const azul = '#1e3a5f';
  const verde = '#16a34a';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', fontFamily: 'system-ui, sans-serif', color: 'white', padding: 0, overflow: 'hidden' }}>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg, ${azul} 0%, #0f172a 100%)`, padding: '20px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>📋 APrieto · Sala de Profesores</h1>
          <p style={{ margin: '4px 0 0', fontSize: 16, opacity: 0.8, textTransform: 'capitalize' }}>{formatFecha()}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 82, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {reloj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 13, opacity: 0.6 }}>
            Actualizado {ultimaCarga ? ultimaCarga.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 20, padding: 20, height: 'calc(100vh - 150px)' }}>

        {/* COLUMNA IZQUIERDA: AUSENCIAS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

          {/* RESUMEN */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid #334155' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#f59e0b' }}>{totalAusentesHoy}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Ausentes hoy</div>
            </div>
            <div style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 16, textAlign: 'center', border: '1px solid #334155' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444' }}>{totalAusentesAhora}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>Ausentes ahora ({HORAS.find(h => h.id === horaAct)?.label || ''})</div>
            </div>
          </div>

          {/* LISTA DE AUSENTES */}
          <div style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155', overflow: 'auto' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>🏥 Profesores ausentes hoy</h2>
            {totalAusentesHoy === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, opacity: 0.5 }}>
                <div style={{ fontSize: 40 }}>✅</div>
                <p>Sin ausencias hoy</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(profesAusentes).sort((a,b) => a[0].localeCompare(b[0])).map(([nombre, info]) => (
                  <div key={nombre} style={{
                    backgroundColor: info.horas.includes(horaAct) ? '#7f1d1d' : '#0f172a',
                    borderRadius: 8, padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: info.horas.includes(horaAct) ? '1px solid #ef4444' : '1px solid #334155',
                  }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{nombre}</span>
                      <span style={{
                        marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        backgroundColor: info.tipo === 'dld' ? '#1e40af' : '#92400e',
                        color: 'white',
                      }}>
                        {info.tipo === 'dld' ? 'DLD' : 'Ausencia'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {HORAS.map(h => (
                        <span key={h.id} style={{
                          width: 26, height: 26, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700,
                          backgroundColor: info.horas.includes(h.id) ? (h.id === horaAct ? '#ef4444' : '#475569') : 'transparent',
                          color: info.horas.includes(h.id) ? 'white' : '#475569',
                          border: h.id === horaAct ? '2px solid #ef4444' : '1px solid #475569',
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

        {/* COLUMNA DERECHA: GUARDIAS + AVISOS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>

          {/* FRANJA HORARIA ACTUAL */}
          <div style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>🕐 Franjas del día</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {HORAS.map(h => (
                <div key={h.id} style={{
                  flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 8,
                  backgroundColor: h.id === horaAct ? '#1d4ed8' : '#0f172a',
                  border: h.id === horaAct ? '2px solid #3b82f6' : '1px solid #334155',
                  transition: 'all 0.3s',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{h.label}</div>
                  <div style={{ fontSize: 10, opacity: 0.6 }}>{h.rango}</div>
                  {(() => {
                    const ausEstaHora = Object.entries(profesAusentes).filter(([_, v]) => v.horas.includes(h.id)).length;
                    return ausEstaHora > 0 ? (
                      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: '#ef4444' }}>⚠️ {ausEstaHora}</div>
                    ) : (
                      <div style={{ marginTop: 4, fontSize: 12, color: '#22c55e' }}>✓</div>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>

          {/* GUARDIAS ASIGNADAS */}
          <div style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155', flex: apoyos.length > 0 ? 1 : 'none', overflow: 'auto' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>🛡️ Guardias asignadas hoy</h2>
            {apoyos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 16, opacity: 0.5, fontSize: 13 }}>
                Sin guardias asignadas
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {HORAS.map(h => {
                  const apoyosHora = apoyos.filter(a => {
                    const horaId = (a.hora_id || '').toString().replace(/[aª]/g, '');
                    return horaId === h.id;
                  });
                  if (apoyosHora.length === 0) return null;
                  return (
                    <div key={h.id} style={{
                      backgroundColor: h.id === horaAct ? '#1e3a5f' : '#0f172a',
                      borderRadius: 8, padding: '8px 12px',
                      border: h.id === horaAct ? '1.5px solid #3b82f6' : '1px solid #334155',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>{h.label} ({h.rango})</div>
                      {apoyosHora.map((a, i) => (
                        <div key={i} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                          <span style={{ fontWeight: 600 }}>👤 {a.profesor_nombre || 'Profesor'}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {a.grupo ? `→ ${a.grupo}` : ''} {a.aula ? `(${a.aula})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AVISOS */}
          <div ref={cajaAvisosRef} style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 12, padding: 16, border: '1px solid #334155', overflow: 'hidden' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 800 }}>📢 Avisos del equipo directivo</h2>
            {avisos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, opacity: 0.5 }}>
                <div style={{ fontSize: 30 }}>📌</div>
                <p style={{ fontSize: 13 }}>Sin avisos</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {avisos.map((a, i) => (
                  <div key={a.id || i} style={{
                    backgroundColor: '#0f172a', borderRadius: 10, padding: '16px 18px',
                    borderLeft: `6px solid ${a.urgente ? '#ef4444' : '#3b82f6'}`,
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>
                      {a.urgente ? '🔴' : '📌'} {a.titulo}
                    </div>
                    <div style={{ fontSize: 17, opacity: 0.9, lineHeight: 1.45 }}>{a.mensaje}</div>
                    <div style={{ fontSize: 12, opacity: 0.45, marginTop: 8 }}>{a.autor} · {new Date(a.created_at).toLocaleDateString('es-ES')}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
