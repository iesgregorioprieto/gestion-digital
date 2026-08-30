'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { etiquetaMotivo } from '@/lib/motivosAusencia';

// Escenario de un dia concreto: quien falta y por que.
// Orden de prioridad fijado por direccion:
//   1. Ausencias  2. Extraescolares  3. Formacion  4. DLD
// Se usa desde Ausencias, DLD, Actividades y Jefatura.

const BLOQUES = [
  { id: 'ausencias',    orden: 1, emoji: '🏥', titulo: 'Ausencias',      color: '#991b1b', bg: '#fef2f2', borde: '#fecaca' },
  { id: 'extraescolar', orden: 2, emoji: '🚌', titulo: 'Extraescolares', color: '#1e40af', bg: '#eff6ff', borde: '#bfdbfe' },
  { id: 'formacion',    orden: 3, emoji: '🎓', titulo: 'Formación',      color: '#92400e', bg: '#fffbeb', borde: '#fde68a' },
  { id: 'dld',          orden: 4, emoji: '🗓️', titulo: 'DLD',            color: '#166534', bg: '#f0fdf4', borde: '#bbf7d0' },
];

const TIPOS_DLD = {
  canoso:      '🦳 CANOSO',
  no_lectivo:  '🌙 Moscoso no lectivo',
  '1_lectivo': '📚 1º Moscoso lectivo',
  '2_lectivo': '📖 2º Moscoso lectivo',
  '3_lectivo': '📗 3º Moscoso lectivo',
};

export default function EscenarioDia({ fecha, compacto = false }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!fecha) { setItems([]); setCargando(false); return; }
    let cancelado = false;

    (async () => {
      setCargando(true);
      setError('');
      try {
        const sb = getSupabase();
        const [rAus, rAct, rDld] = await Promise.all([
          sb.from('ausencias')
            .select('id, profesor_nombre, fecha_inicio, fecha_fin, subtipo, motivo, horas, estado')
            .lte('fecha_inicio', fecha).gte('fecha_fin', fecha),
          sb.from('actividades')
            .select('id, titulo, profesor_nombre, acompanantes, grupos, fecha_inicio, fecha_fin, estado')
            .lte('fecha_inicio', fecha).gte('fecha_fin', fecha),
          sb.from('dld')
            .select('id, profesor_nombre, tipo_dld, fecha_solicitada, horas, estado')
            .eq('fecha_solicitada', fecha),
        ]);

        if (cancelado) return;
        if (rAus.error || rAct.error || rDld.error) {
          setError('No se ha podido cargar el escenario del día.');
          setCargando(false);
          return;
        }

        const lista = [];

        // 1 y 3. Ausencias -> las de formacion van a su propio bloque
        (rAus.data || []).forEach(a => {
          const esFormacion = a.subtipo === 'permiso_formacion';
          lista.push({
            bloque: esFormacion ? 'formacion' : 'ausencias',
            profesor: a.profesor_nombre || '—',
            detalle: a.subtipo ? etiquetaMotivo(a.subtipo) : (a.motivo || 'Sin especificar'),
            nHoras: Array.isArray(a.horas) ? a.horas.length : 0,
            estado: a.estado,
          });
        });

        // 2. Extraescolares: cuenta al responsable y a los acompanantes
        (rAct.data || []).filter(a => a.estado !== 'rechazada').forEach(a => {
          const acomp = Array.isArray(a.acompanantes) ? a.acompanantes : [];
          const nombres = [a.profesor_nombre, ...acomp].filter(Boolean);
          const grupos = Array.isArray(a.grupos) && a.grupos.length ? ` · ${a.grupos.join(', ')}` : '';
          nombres.forEach(n => {
            lista.push({
              bloque: 'extraescolar',
              profesor: typeof n === 'string' ? n : (n?.nombre || '—'),
              detalle: `${a.titulo || 'Actividad'}${grupos}`,
              nHoras: 0,
              estado: a.estado,
            });
          });
        });

        // 4. DLD: solo los que cuentan (aprobados y pendientes de resolver)
        (rDld.data || []).filter(d => d.estado === 'aprobada' || d.estado === 'pendiente').forEach(d => {
          lista.push({
            bloque: 'dld',
            profesor: d.profesor_nombre || '—',
            detalle: TIPOS_DLD[d.tipo_dld] || d.tipo_dld || 'DLD',
            nHoras: Array.isArray(d.horas) ? d.horas.length : 0,
            estado: d.estado,
          });
        });

        setItems(lista);
      } catch (e) {
        if (!cancelado) setError('No se ha podido cargar el escenario del día.');
      }
      if (!cancelado) setCargando(false);
    })();

    return () => { cancelado = true; };
  }, [fecha]);

  const totalProfes = new Set(items.map(i => i.profesor)).size;

  if (!fecha) return null;

  if (cargando) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#666', fontSize: 13 }}>
        ⏳ Cargando el escenario del día...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 12, borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* RESUMEN */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '10px 14px', borderRadius: 10, marginBottom: 12,
        backgroundColor: totalProfes === 0 ? '#f0fdf4' : totalProfes >= 8 ? '#fef2f2' : '#fffbeb',
        border: `1.5px solid ${totalProfes === 0 ? '#bbf7d0' : totalProfes >= 8 ? '#fecaca' : '#fde68a'}`,
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: totalProfes === 0 ? '#166534' : totalProfes >= 8 ? '#991b1b' : '#92400e' }}>
          {totalProfes}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#444' }}>
          {totalProfes === 0
            ? 'No hay nadie fuera del centro este día.'
            : `${totalProfes === 1 ? 'profesor/a fuera' : 'profesores/as fuera'} del centro este día.`}
        </span>
      </div>

      {/* BLOQUES POR PRIORIDAD */}
      {BLOQUES.map(b => {
        const propios = items.filter(i => i.bloque === b.id);
        if (propios.length === 0) return null;
        return (
          <div key={b.id} style={{
            marginBottom: 10, borderRadius: 10, overflow: 'hidden',
            border: `1.5px solid ${b.borde}`, backgroundColor: b.bg,
          }}>
            <div style={{
              padding: '7px 12px', fontSize: 13, fontWeight: 800, color: b.color,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>{b.orden}º</span>
              <span>{b.emoji} {b.titulo}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                backgroundColor: 'white', padding: '2px 8px', borderRadius: 20, color: b.color,
              }}>
                {propios.length}
              </span>
            </div>
            <div style={{ backgroundColor: 'white' }}>
              {propios.map((p, i) => (
                <div key={i} style={{
                  padding: '8px 12px', fontSize: 12.5, lineHeight: 1.4,
                  borderTop: `1px solid ${b.borde}`,
                  display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                }}>
                  <span style={{ fontWeight: 700, color: '#333' }}>{p.profesor}</span>
                  <span style={{ color: '#666' }}>{p.detalle}</span>
                  {!compacto && p.nHoras > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>
                      {p.nHoras} {p.nHoras === 1 ? 'hora' : 'horas'}
                    </span>
                  )}
                  {p.estado === 'pendiente' && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#92400e', backgroundColor: '#fef3c7', padding: '1px 7px', borderRadius: 20 }}>
                      pendiente
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
