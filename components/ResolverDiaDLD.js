'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const VERDE  = '#1e6b2e';
const ROJO   = '#991b1b';
const AMBAR  = '#b45309';

function etiquetaTipo(t) {
  if (t === 'no_lectivo') return '🌙 No lectivo';
  if (t === '1_lectivo')  return '📚 1º lectivo';
  if (t === '2_lectivo')  return '📖 2º lectivo';
  if (t === '3_lectivo')  return '📗 3º lectivo';
  return t || '—';
}

export default function ResolverDiaDLD({ totalProfesores = 150, nombreUsuario = '', onTerminado }) {
  const [fecha, setFecha]         = useState('');
  const [cargando, setCargando]   = useState(false);
  const [solicitudes, setSol]     = useState([]);
  const [propuesta, setPropuesta] = useState(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [ajustes, setAjustes]     = useState({}); // id → 'aprobar' | 'rechazar'

  // Fechas que tienen solicitudes pendientes, para el desplegable
  const [fechasConPendientes, setFechas] = useState([]);

  useEffect(() => { cargarFechas(); }, []);

  async function cargarFechas() {
    const { data } = await getSupabase()
      .from('dld')
      .select('fecha_solicitada')
      .eq('estado', 'pendiente')
      .order('fecha_solicitada');

    const unicas = [...new Set((data || []).map(d => d.fecha_solicitada))];
    setFechas(unicas);
    if (unicas.length > 0 && !fecha) setFecha(unicas[0]);
  }

  async function analizar(f = fecha) {
    if (!f) return;
    setCargando(true);
    setResultado(null);
    setAjustes({});

    try {
      // Todas las del día que cuentan (pendientes + aprobadas)
      const { data } = await getSupabase()
        .from('dld')
        .select('*')
        .eq('fecha_solicitada', f)
        .in('estado', ['pendiente', 'aprobada']);

      const lista = data || [];
      setSol(lista);

      if (lista.length === 0) { setPropuesta(null); setCargando(false); return; }

      // Días ya disfrutados por cada profesor (para el criterio de desempate)
      const ids = [...new Set(lista.map(s => s.profesor_id))];
      const { data: historico } = await getSupabase()
        .from('dld')
        .select('profesor_id, fecha_solicitada')
        .in('profesor_id', ids)
        .eq('estado', 'aprobada');

      const disfrutados = {};
      for (const h of (historico || [])) {
        if (h.fecha_solicitada === f) continue; // no contar el propio día
        disfrutados[h.profesor_id] = (disfrutados[h.profesor_id] || 0) + 1;
      }

      // Límite del día según el tipo MAYORITARIO (un error puntual no debe
      // disparar el límite de todo el día)
      const nNoLectivo = lista.filter(s => s.tipo_dld === 'no_lectivo').length;
      const hayNoLectivo = nNoLectivo > lista.length / 2;
      const maxLectivo = totalProfesores > 60 ? 4 : totalProfesores > 40 ? 3 : totalProfesores > 20 ? 2 : 1;
      const maxNoLectivo = Math.floor(totalProfesores / 3);
      const limite = hayNoLectivo ? maxNoLectivo : maxLectivo;
      const tiposMezclados = nNoLectivo > 0 && nNoLectivo < lista.length;

      // Ordenar por prelación (art. 2.3 y 12 de la normativa)
      const ordenadas = lista.map(s => ({
        ...s,
        dias_disfrutados: disfrutados[s.profesor_id] || 0,
      })).sort((a, b) => {
        // a) Causa sobrevenida primero
        if (!!a.causa_sobrevenida !== !!b.causa_sobrevenida) return a.causa_sobrevenida ? -1 : 1;
        // b) Menos días disfrutados
        if (a.dias_disfrutados !== b.dias_disfrutados) return a.dias_disfrutados - b.dias_disfrutados;
        // c) Mayor antigüedad en el centro
        const ac = (a.antiguedad_centro || 0), bc = (b.antiguedad_centro || 0);
        if (ac !== bc) return bc - ac;
        // d) Mayor antigüedad en el cuerpo
        return (b.antiguedad_cuerpo || 0) - (a.antiguedad_cuerpo || 0);
      });

      // Asignar acción propuesta
      const conAccion = ordenadas.map((s, i) => {
        const dentro = i < limite;
        let accion, motivo;

        if (dentro && s.estado === 'aprobada')      { accion = 'mantener'; }
        else if (dentro)                             { accion = 'aprobar'; }
        else if (s.estado === 'aprobada')            { accion = 'revocar'; motivo = `Revocado: hay ${limite} compañeros con mayor prelación para el ${f}. Límite del centro: ${limite} profesores ese día.`; }
        else                                          { accion = 'rechazar'; motivo = `Se ha alcanzado el límite de ${limite} profesores para el ${f}. Los criterios de prelación (causa sobrevenida, días disfrutados y antigüedad) sitúan tu solicitud en la posición ${i + 1}.`; }

        return { ...s, posicion: i + 1, dentro, accion, motivo };
      });

      setPropuesta({ limite, hayNoLectivo, tiposMezclados, lista: conAccion });
    } catch (e) {
      setResultado({ error: e.message });
    }
    setCargando(false);
  }

  function accionFinal(s) {
    const manual = ajustes[s.id];
    if (!manual) return s.accion;
    if (manual === 'aprobar')  return s.estado === 'aprobada' ? 'mantener' : 'aprobar';
    if (manual === 'rechazar') return s.estado === 'aprobada' ? 'revocar'  : 'rechazar';
    return s.accion;
  }

  function alternar(s) {
    const actual = accionFinal(s);
    const nueva = (actual === 'aprobar' || actual === 'mantener') ? 'rechazar' : 'aprobar';
    setAjustes(a => ({ ...a, [s.id]: nueva }));
  }

  async function aplicar() {
    if (!propuesta) return;
    const cambios = propuesta.lista.filter(s => {
      const a = accionFinal(s);
      return a !== 'mantener';
    });
    if (cambios.length === 0) { setResultado({ ok: true, aprobadas: 0, rechazadas: 0 }); return; }

    if (!confirm(`Se van a resolver ${cambios.length} solicitud(es) del ${fecha}. ¿Continuar?`)) return;

    setAplicando(true);
    let aprobadas = 0, rechazadas = 0;
    const fallos = [];

    try {
      for (const s of propuesta.lista) {
        const a = accionFinal(s);
        if (a === 'mantener') continue;

        const esAprobar = (a === 'aprobar');

        const _rm = await fetch('/api/dld', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'resolver',
            id: s.id,
            datos: esAprobar
              ? { estado: 'aprobada', resuelto_por: nombreUsuario, motivo_rechazo: null }
              : { estado: 'rechazada', resuelto_por: nombreUsuario, motivo_rechazo: s.motivo || 'Resuelto por criterios de prelación.' },
          }),
        });
        const error = _rm.ok ? null : await _rm.json();

        // Si la base de datos falla NO se avisa al profesor: mandarle un correo
        // diciendo "aprobado" cuando en el sistema sigue pendiente sería peor
        // que no mandar nada.
        if (error) {
          fallos.push({
            nombre: s.profesor_nombre,
            motivo: error.error === 'ya_resuelta'
              ? 'Ya la había resuelto otra persona'
              : (error.error || 'Error al guardar'),
          });
          continue;
        }

        if (esAprobar) aprobadas++; else rechazadas++;
        await avisar(s, esAprobar);
      }

      setResultado({ ok: true, aprobadas, rechazadas, fallos });
      setPropuesta(null);
      cargarFechas();
      if (onTerminado) onTerminado();
    } catch (e) {
      setResultado({ error: e.message });
    }
    setAplicando(false);
  }

  async function avisar(s, aprobada) {
    // Email
    try {
      const { data: rows } = await getSupabase()
        .from('profesores').select('nombre,apellidos,email').eq('id', s.profesor_id);
      const prof = (rows || [])[0];
      if (prof?.email) {
        await fetch('/api/enviar-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: aprobada ? 'dld_aprobada' : 'dld_rechazada',
            datos: {
              nombre: prof.nombre + ' ' + prof.apellidos,
              email: prof.email,
              fecha_solicitada: s.fecha_solicitada,
              tipo_dld: s.tipo_dld,
              motivo_rechazo: s.motivo || '',
            },
          }),
        });
      }
    } catch (_) {}

    // Push
    try {
      await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'enviar',
          profesor_id: s.profesor_id,
          titulo: aprobada ? '✅ DLD aprobado' : '❌ DLD denegado',
          cuerpo: aprobada
            ? `Tu solicitud para el ${s.fecha_solicitada} ha sido aprobada.`
            : `Tu solicitud para el ${s.fecha_solicitada} no ha sido aprobada. Consulta el motivo.`,
          url: '/dld',
        }),
      });
    } catch (_) {}
  }

  const resumen = propuesta ? {
    aprobar:  propuesta.lista.filter(s => accionFinal(s) === 'aprobar').length,
    mantener: propuesta.lista.filter(s => accionFinal(s) === 'mantener').length,
    rechazar: propuesta.lista.filter(s => accionFinal(s) === 'rechazar').length,
    revocar:  propuesta.lista.filter(s => accionFinal(s) === 'revocar').length,
  } : null;

  return (
    <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

      <div style={{ fontSize: 16, fontWeight: 800, color: '#333', marginBottom: 6 }}>
        ⚖️ Resolver todas las solicitudes de un día
      </div>
      <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, marginBottom: 18 }}>
        Ordena todas las solicitudes de esa fecha según los criterios de la normativa,
        propone qué corresponde a cada una y las resuelve de una vez.
      </div>

      {/* Selector de fecha */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <select
          value={fecha}
          onChange={e => { setFecha(e.target.value); setPropuesta(null); setResultado(null); }}
          style={{ flex: 1, minWidth: 180, padding: '11px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }}
        >
          <option value="">— Elige una fecha —</option>
          {fechasConPendientes.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button
          onClick={() => analizar()}
          disabled={!fecha || cargando}
          style={{
            padding: '11px 22px', borderRadius: 8, border: 'none',
            backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 14,
            cursor: (!fecha || cargando) ? 'not-allowed' : 'pointer',
            opacity: (!fecha || cargando) ? 0.6 : 1,
          }}
        >
          {cargando ? '⏳ Analizando...' : '🔍 Analizar día'}
        </button>
      </div>

      {fechasConPendientes.length === 0 && !propuesta && (
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '12px 16px', fontSize: 13 }}>
          ✅ No hay solicitudes pendientes.
        </div>
      )}

      {resultado?.ok && (
        <div style={{ backgroundColor: '#dcfce7', border: '1.5px solid #86efac', color: '#166534', borderRadius: 10, padding: '13px 16px', fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
          ✅ Resuelto: {resultado.aprobadas} aprobada(s), {resultado.rechazadas} denegada(s).
          Se han enviado los avisos por correo y notificación.
        </div>
      )}

      {resultado?.fallos?.length > 0 && (
        <div style={{ backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5', color: ROJO, borderRadius: 10, padding: '13px 16px', fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
          <strong>⚠️ {resultado.fallos.length} solicitud(es) no se pudieron resolver:</strong>
          <div style={{ marginTop: 7 }}>
            {resultado.fallos.map((f, i) => (
              <div key={i}>· {f.nombre} — {f.motivo}</div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 12.5 }}>
            Esos profesores <strong>no</strong> han recibido aviso. Vuelve a intentarlo.
          </div>
        </div>
      )}

      {resultado?.error && (
        <div style={{ backgroundColor: '#fee2e2', border: '1.5px solid #fca5a5', color: ROJO, borderRadius: 10, padding: '13px 16px', fontSize: 13, marginBottom: 14 }}>
          ⚠️ {resultado.error}
        </div>
      )}

      {/* PROPUESTA */}
      {propuesta && (
        <div>
          <div style={{
            backgroundColor: '#eff6ff', border: '1.5px solid #bfdbfe', color: '#1e40af',
            borderRadius: 10, padding: '12px 16px', fontSize: 13, lineHeight: 1.6, marginBottom: 16,
          }}>
            <strong>{propuesta.hayNoLectivo ? 'Período NO LECTIVO' : 'Período LECTIVO'}</strong> ·
            Límite del centro: <strong>{propuesta.limite} profesores</strong> ese día ·
            Solicitudes analizadas: <strong>{propuesta.lista.length}</strong>
          </div>

          {propuesta.tiposMezclados && (
            <div style={{
              backgroundColor: '#fffbeb', border: '1.5px solid #fde68a', color: '#78350f',
              borderRadius: 10, padding: '12px 16px', fontSize: 13, lineHeight: 1.6, marginBottom: 16,
            }}>
              ⚠️ <strong>Atención:</strong> ese día hay solicitudes de tipo lectivo y no lectivo
              mezcladas. Se ha aplicado el límite del tipo mayoritario. Revisa que el tipo
              de cada solicitud sea correcto antes de resolver.
            </div>
          )}

          <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
            {propuesta.lista.map(s => {
              const a = accionFinal(s);
              const positiva = (a === 'aprobar' || a === 'mantener');
              const color = positiva ? VERDE : (a === 'revocar' ? AMBAR : ROJO);
              const fondo = positiva ? '#f0fdf4' : (a === 'revocar' ? '#fffbeb' : '#fef2f2');
              const borde = positiva ? '#bbf7d0' : (a === 'revocar' ? '#fde68a' : '#fecaca');
              const texto = { aprobar: '✅ Aprobar', mantener: '✅ Ya aprobada', rechazar: '❌ Denegar', revocar: '⚠️ Revocar' }[a];

              return (
                <div key={s.id} style={{
                  border: `1.5px solid ${borde}`, backgroundColor: fondo,
                  borderRadius: 10, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: s.posicion <= 3 ? color : '#e5e7eb',
                    color: s.posicion <= 3 ? 'white' : '#666',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 13,
                  }}>
                    {s.posicion}
                  </div>

                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, color: '#333', fontSize: 14 }}>
                      {s.profesor_nombre}
                      {s.causa_sobrevenida && (
                        <span style={{ marginLeft: 8, fontSize: 11, backgroundColor: '#fef3c7', color: '#78350f', padding: '2px 7px', borderRadius: 10, fontWeight: 700 }}>
                          CAUSA SOBREVENIDA
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#777', marginTop: 3 }}>
                      {etiquetaTipo(s.tipo_dld)} · {s.dias_disfrutados} día(s) ya disfrutado(s) ·
                      centro {s.antiguedad_centro || 0}a · cuerpo {s.antiguedad_cuerpo || 0}a
                    </div>
                  </div>

                  <button
                    onClick={() => alternar(s)}
                    style={{
                      padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `1.5px solid ${color}`, backgroundColor: 'white',
                      color, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap',
                    }}
                    title="Pulsa para cambiar la decisión"
                  >
                    {texto}
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.6 }}>
            💡 Puedes pulsar sobre cualquier decisión para cambiarla antes de aplicar.
            Los motivos de denegación se redactan solos citando la normativa, sin mencionar
            nombres de compañeros.
          </div>

          <div style={{
            backgroundColor: '#f9fafb', border: '1px solid #eee', borderRadius: 10,
            padding: '12px 16px', fontSize: 13, color: '#555', marginBottom: 14, lineHeight: 1.8,
          }}>
            <strong>Resumen:</strong><br />
            ✅ {resumen.aprobar} aprobar · ✅ {resumen.mantener} ya aprobadas ·
            ❌ {resumen.rechazar} denegar{resumen.revocar > 0 ? ` · ⚠️ ${resumen.revocar} revocar` : ''}
          </div>

          <button
            onClick={aplicar}
            disabled={aplicando}
            style={{
              width: '100%', padding: '14px', borderRadius: 10, border: 'none',
              backgroundColor: VERDE, color: 'white', fontWeight: 800, fontSize: 15,
              cursor: aplicando ? 'not-allowed' : 'pointer', opacity: aplicando ? 0.7 : 1,
            }}
          >
            {aplicando ? '⏳ Resolviendo y avisando...' : `⚖️ Resolver todo el día ${fecha}`}
          </button>
        </div>
      )}
    </div>
  );
}
