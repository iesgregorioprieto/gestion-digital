'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getConfigCurso, esDiaLectivo, limiteDLD, dentroDelCurso } from '@/lib/curso';

const VERDE = '#1e6b2e';
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS  = ['L','M','X','J','V','S','D'];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function CalendarioDLD({ profesorId, onElegirFecha }) {
  const [mes, setMes]           = useState(new Date());
  const [cargando, setCargando] = useState(true);
  const [porDia, setPorDia]     = useState({});
  const [cfg, setCfg]           = useState(null);
  const [diaAbierto, setDia]    = useState(null);

  useEffect(() => { cargar(); }, [mes]);

  async function cargar() {
    setCargando(true);
    try {
      const desde = ymd(new Date(mes.getFullYear(), mes.getMonth(), 1));
      const hasta = ymd(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));

      const [{ data }, config] = await Promise.all([
        getSupabase()
          .from('dld')
          .select('fecha_solicitada, estado, profesor_id, profesor_nombre, tipo_dld')
          .gte('fecha_solicitada', desde)
          .lte('fecha_solicitada', hasta)
          .in('estado', ['aprobada', 'pendiente']),
        getConfigCurso(),
      ]);

      const mapa = {};
      for (const s of (data || [])) {
        const f = s.fecha_solicitada;
        if (!mapa[f]) mapa[f] = { aprobadas: 0, pendientes: 0, mia: null, noLectivo: false, gente: [] };
        if (s.estado === 'aprobada')  mapa[f].aprobadas++;
        if (s.estado === 'pendiente') mapa[f].pendientes++;
        if (s.profesor_id === profesorId) mapa[f].mia = s.estado;
        if (s.tipo_dld === 'no_lectivo') mapa[f].noLectivo = true;
        mapa[f].gente.push({
          nombre: s.profesor_nombre || 'Sin nombre',
          estado: s.estado,
          soyYo: s.profesor_id === profesorId,
        });
      }

      setPorDia(mapa);
      setCfg(config);
    } catch (e) {
      // sin datos, calendario vacío
    }
    setCargando(false);
  }

  // Rejilla del mes empezando en lunes
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const ultimo  = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  const desplazamiento = (primero.getDay() + 6) % 7;
  const celdas = [];
  for (let i = 0; i < desplazamiento; i++) celdas.push(null);
  for (let d = 1; d <= ultimo.getDate(); d++) celdas.push(new Date(mes.getFullYear(), mes.getMonth(), d));

  const hoy = ymd(new Date());

  // El límite depende de si ese día concreto es lectivo o no
  function limiteDia(fecha) {
    return limiteDLD(fecha, cfg).limite;
  }

  /**
   * Clasifica un día:
   *   'fuera'      → fin de semana o fuera del curso escolar: no se puede pedir
   *   'lectivo'    → hay clase (límite pequeño, normalmente 4)
   *   'no_lectivo' → dentro del curso pero sin clase: SÍ se puede pedir,
   *                  y además con el límite alto (1/3 de la plantilla).
   *                  Son los días de septiembre y junio sin alumnado y los
   *                  pegados a vacaciones: los más solicitados.
   */
  function tipoDia(fecha, d) {
    const finde = d.getDay() === 0 || d.getDay() === 6;
    if (finde) return 'fuera';
    if (cfg && !dentroDelCurso(fecha, cfg)) return 'fuera';
    if (!cfg) return 'lectivo';
    return esDiaLectivo(fecha, cfg).lectivo ? 'lectivo' : 'no_lectivo';
  }

  function colorDia(info, tipo, esPasado, lim) {
    if (tipo === 'fuera') return { bg: '#f9fafb', color: '#d1d5db', borde: 'transparent' };
    if (esPasado)         return { bg: '#fafafa', color: '#c7c7c7', borde: 'transparent' };

    const total = info ? info.aprobadas + info.pendientes : 0;
    const ratio = lim > 0 ? total / lim : 0;

    // Los no lectivos llevan un tinte azulado para distinguirlos de un vistazo
    if (ratio >= 1)   return { bg: '#fef2f2', color: '#991b1b', borde: '#fca5a5' };
    if (ratio >= 0.6) return { bg: '#fffbeb', color: '#92400e', borde: '#fcd34d' };

    return tipo === 'no_lectivo'
      ? { bg: '#eef2ff', color: '#3730a3', borde: '#c7d2fe' }
      : { bg: '#f0fdf4', color: '#166534', borde: '#86efac' };
  }

  const info = diaAbierto ? porDia[diaAbierto] : null;
  const infoLectivo = diaAbierto && cfg ? esDiaLectivo(diaAbierto, cfg) : null;
  const ocupados = info ? info.aprobadas + info.pendientes : 0;
  const limite = diaAbierto ? limiteDLD(diaAbierto, cfg).limite : 0;

  return (
    <div>
      <div style={{
        backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', color: '#1e40af',
        borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, lineHeight: 1.6,
      }}>
        Antes de pedir un día, mira aquí la carga que tiene. Los días en verde
        tienen sitio de sobra; los rojos están al límite y es probable que te lo denieguen.
      </div>

      {/* Navegación de meses */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} style={btnMes}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: VERDE, textTransform: 'capitalize' }}>
          {MESES[mes.getMonth()]} {mes.getFullYear()}
        </div>
        <button onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} style={btnMes}>›</button>
      </div>

      {/* Cabecera de días */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 5 }}>
        {DIAS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Rejilla */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16, opacity: cargando ? 0.5 : 1 }}>
        {celdas.map((d, i) => {
          if (!d) return <div key={i} />;

          const f = ymd(d);
          const inf = porDia[f];
          const tipo = tipoDia(f, d);
          const pedible = tipo !== 'fuera';
          const pasado = f < hoy;
          const lim = limiteDia(f);
          const c = colorDia(inf, tipo, pasado, lim);
          const total = inf ? inf.aprobadas + inf.pendientes : 0;

          return (
            <button
              key={i}
              onClick={() => pedible && !pasado && setDia(f)}
              style={{
                aspectRatio: '1', border: `1.5px solid ${c.borde}`,
                borderRadius: 9, backgroundColor: c.bg, color: c.color,
                cursor: (pedible && !pasado) ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit', padding: 2, position: 'relative',
                outline: f === hoy ? `2px solid ${VERDE}` : 'none',
                outlineOffset: -1,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>{d.getDate()}</span>
              {pedible && !pasado && total > 0 && (
                <span style={{ fontSize: 9.5, fontWeight: 700, marginTop: 2 }}>
                  {total}
                </span>
              )}
              {inf?.mia && (
                <span style={{
                  position: 'absolute', top: 3, right: 4, fontSize: 8,
                  color: inf.mia === 'aprobada' ? '#16a34a' : '#d97706',
                }}>●</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#6b7280', marginBottom: 16 }}>
        <Ley color="#f0fdf4" borde="#86efac">Con sitio</Ley>
        <Ley color="#fffbeb" borde="#fcd34d">Se va llenando</Ley>
        <Ley color="#fef2f2" borde="#fca5a5">Al límite</Ley>
        <Ley color="#f9fafb" borde="#e5e7eb">Sin clase</Ley>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ color: '#16a34a', fontSize: 12 }}>●</span> Tu solicitud
        </span>
      </div>

      {/* Detalle del día */}
      {diaAbierto && (
        <div style={{
          backgroundColor: 'white', border: '1.5px solid #e5e7eb',
          borderRadius: 12, padding: 18,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: VERDE }}>
              {new Date(diaAbierto + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <button onClick={() => setDia(null)} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>✕</button>
          </div>

          {infoLectivo && !infoLectivo.lectivo ? (
            <div style={{ fontSize: 13.5, color: '#666', lineHeight: 1.6 }}>
              🌙 Ese día no hay clase{infoLectivo.motivo ? ` — ${infoLectivo.motivo}` : ''}.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                <Dato n={info?.aprobadas || 0} label="concedidos" color="#166534" />
                <Dato n={info?.pendientes || 0} label="pendientes" color="#b45309" />
                <Dato n={Math.max(0, limite - ocupados)} label="quedan" color={ocupados >= limite ? '#991b1b' : VERDE} />
              </div>

              <div style={{
                backgroundColor: ocupados >= limite ? '#fef2f2' : ocupados >= limite * 0.6 ? '#fffbeb' : '#f0fdf4',
                border: `1.5px solid ${ocupados >= limite ? '#fca5a5' : ocupados >= limite * 0.6 ? '#fcd34d' : '#bbf7d0'}`,
                color: ocupados >= limite ? '#991b1b' : ocupados >= limite * 0.6 ? '#78350f' : '#166534',
                borderRadius: 9, padding: '11px 14px', fontSize: 13, lineHeight: 1.6, marginBottom: 14,
              }}>
                {ocupados >= limite
                  ? `Ya se ha alcanzado el máximo de ${limite} para ese día. Si lo pides, es probable que se deniegue salvo causa sobrevenida.`
                  : ocupados >= limite * 0.6
                  ? `Quedan ${limite - ocupados} plazas de ${limite}. Conviene pedirlo pronto.`
                  : `Hay sitio de sobra: ${limite - ocupados} plazas libres de ${limite}.`}
              </div>

              {info?.mia && (
                <div style={{
                  backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', color: '#1e40af',
                  borderRadius: 9, padding: '10px 14px', fontSize: 13, marginBottom: 14,
                }}>
                  {info.mia === 'aprobada' ? '✅ Ya tienes este día concedido.' : '⏳ Ya tienes una solicitud pendiente para este día.'}
                </div>
              )}

              {info?.gente?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>
                    Quién tiene el día
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {info.gente
                      .slice()
                      .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === 'aprobada' ? -1 : 1))
                      .map((p, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          padding: '8px 12px', borderRadius: 8, fontSize: 13,
                          backgroundColor: p.soyYo ? '#eff6ff' : '#f9fafb',
                          border: `1px solid ${p.soyYo ? '#bfdbfe' : '#f0f0f0'}`,
                        }}>
                          <span style={{ fontSize: 13 }}>
                            {p.estado === 'aprobada' ? '✅' : '⏳'}
                          </span>
                          <span style={{ flex: 1, fontWeight: p.soyYo ? 700 : 500, color: p.soyYo ? '#1e40af' : '#374151' }}>
                            {p.nombre}{p.soyYo ? ' (tú)' : ''}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>
                            {p.estado === 'aprobada' ? 'concedido' : 'pendiente'}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {onElegirFecha && !info?.mia && (
                <button
                  onClick={() => onElegirFecha(diaAbierto)}
                  style={{
                    width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                    backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 14,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  📅 Solicitar este día
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 14, lineHeight: 1.6 }}>
        El límite de cada día depende de si es lectivo o no, y sale de la
        plantilla del centro configurada por el equipo directivo.
      </div>
    </div>
  );
}

function Ley({ color, borde, children }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 13, height: 13, borderRadius: 4, backgroundColor: color, border: `1.5px solid ${borde}`, display: 'inline-block' }} />
      {children}
    </span>
  );
}

function Dato({ n, label, color }) {
  return (
    <div style={{ backgroundColor: '#f9fafb', borderRadius: 9, padding: '11px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{n}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const btnMes = {
  width: 38, height: 38, borderRadius: 9, cursor: 'pointer',
  border: '1.5px solid #ddd', backgroundColor: 'white',
  fontSize: 19, color: '#555', fontFamily: 'inherit', lineHeight: 1,
};
