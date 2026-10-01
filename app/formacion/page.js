'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';
import CambiarEstadoFormacion from '@/components/CambiarEstadoFormacion';

/**
 * FORMACIÓN — solicitudes de cursos y jornadas (sugerencia #93)
 *
 * Pestañas:
 *   · Mis solicitudes  → todo el profesorado
 *   · Pedir            → todo el profesorado
 *   · Mi departamento  → solo jefes de departamento: aprobar o denegar
 *   · Dirección        → equipo directivo lo ve; solo el director resuelve
 *
 * Todo pasa por /api/formacion, que es quien comprueba quién puede qué.
 */

const MORADO = '#5b21b6';
const VERDE  = '#166534';
const ROJO   = '#991b1b';
const AMBAR  = '#b45309';

const ESTADOS = {
  pendiente_jefe:     { label: 'Pendiente del jefe de dpto.', emoji: '⏳', bg: '#fffbeb', color: '#78350f', borde: '#fcd34d' },
  pendiente_director: { label: 'Pendiente de dirección',      emoji: '⏳', bg: '#eff6ff', color: '#1e40af', borde: '#93c5fd' },
  autorizada:         { label: 'Autorizada',                  emoji: '✅', bg: '#f0fdf4', color: VERDE,     borde: '#86efac' },
  denegada_jefe:      { label: 'Denegada por el jefe de dpto.', emoji: '❌', bg: '#fef2f2', color: ROJO,  borde: '#fca5a5' },
  denegada_director:  { label: 'Denegada por dirección',      emoji: '❌', bg: '#fef2f2', color: ROJO,      borde: '#fca5a5' },
  retirada:           { label: 'Retirada',                    emoji: '↩️', bg: '#f3f4f6', color: '#4b5563', borde: '#d1d5db' },
};

const MODALIDADES = [
  { valor: 'presencial', label: '🏫 Presencial' },
  { valor: 'online',     label: '💻 Online' },
  { valor: 'mixta',      label: '🔀 Mixta' },
];

function fmtFecha(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long' });
}
function fmtRango(s) {
  if (!s.fecha_fin || s.fecha_fin === s.fecha_inicio) return fmtFecha(s.fecha_inicio);
  return `${fmtFecha(s.fecha_inicio)} → ${fmtFecha(s.fecha_fin)}`;
}
function fmtHora(h) { return h ? String(h).slice(0, 5) : ''; }
function fmtMomento(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const FORM_VACIO = {
  titulo: '', entidad: '', modalidad: 'presencial', lugar: '',
  fecha_inicio: '', fecha_fin: '', hora_inicio: '', hora_fin: '', observaciones: '',
};

export default function Formacion() {
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil]     = useState({ soyJefe: false, soyDirector: false, soyDirectivo: false, departamento: '' });
  const [vista, setVista]       = useState('mias');
  const [mensaje, setMensaje]   = useState(null);

  const [mias, setMias]         = useState([]);
  const [delDpto, setDelDpto]   = useState([]);
  const [todas, setTodas]       = useState([]);

  const [form, setForm]         = useState(FORM_VACIO);
  const [enviando, setEnviando] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const avisar = (texto, tipo = 'error') => {
    setMensaje({ texto, tipo });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
    setTimeout(() => setMensaje(null), 6000);
  };

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    const p = new URLSearchParams(window.location.search).get('vista');
    cargar(p);
  }, []);

  async function leer(v) {
    const r = await fetch(`/api/formacion?vista=${v}`);
    if (r.status === 401) { window.location.href = '/login'; return null; }
    return r.ok ? r.json() : null;
  }

  async function cargar(vistaInicial = null) {
    setCargando(true);
    try {
      const d = await leer('mias');
      if (!d) return;
      const pf = { soyJefe: d.soyJefe, soyDirector: d.soyDirector, soyDirectivo: d.soyDirectivo, departamento: d.departamento };
      setPerfil(pf);
      setMias(d.solicitudes || []);

      const [dj, dd] = await Promise.all([
        pf.soyJefe ? leer('jefe') : null,
        pf.soyDirectivo ? leer('direccion') : null,
      ]);
      setDelDpto(dj?.solicitudes || []);
      setTodas(dd?.solicitudes || []);

      // Al entrar desde un correo o desde las tareas pendientes
      if (vistaInicial === 'jefe' && pf.soyJefe) setVista('jefe');
      else if (vistaInicial === 'direccion' && pf.soyDirectivo) setVista('direccion');
      else if (vistaInicial === 'nueva') setVista('nueva');
    } finally {
      setCargando(false);
    }
  }

  async function post(accion, id, datos) {
    const r = await fetch('/api/formacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, id, datos }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'No se ha podido guardar');
    return d;
  }

  async function enviar() {
    if (!form.titulo.trim()) return avisar('Escribe el nombre del curso o jornada.');
    if (!form.fecha_inicio) return avisar('Indica la fecha de inicio.');
    if (form.fecha_fin && form.fecha_fin < form.fecha_inicio) return avisar('La fecha de fin es anterior a la de inicio.');
    if (form.hora_inicio && form.hora_fin && form.hora_fin <= form.hora_inicio) return avisar('La hora de fin tiene que ser posterior a la de inicio.');

    setEnviando(true);
    try {
      const d = await post('crear', null, form);
      setForm(FORM_VACIO);
      setVista('mias');
      await cargar();
      avisar(d.solicitud?.estado === 'pendiente_jefe'
        ? '✅ Solicitud enviada a tu jefe de departamento.'
        : '✅ Solicitud enviada a dirección.', 'ok');
    } catch (e) {
      avisar(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function retirar(s) {
    if (!confirm(`¿Retirar la solicitud «${s.titulo}»?`)) return;
    try { await post('retirar', s.id); await cargar(); avisar('Solicitud retirada.', 'ok'); }
    catch (e) { avisar(e.message); }
  }

  async function resolver(accion, s, decision, motivo) {
    try {
      await post(accion, s.id, { decision, motivo });
      await cargar();
      const txt = { aprobada: 'Aprobada y enviada a dirección.', autorizada: 'Formación autorizada. Se ha avisado al profesor.', denegada: 'Solicitud denegada. Se ha avisado al profesor.' };
      avisar('✅ ' + (txt[decision] || 'Guardado.'), 'ok');
      return true;
    } catch (e) {
      avisar(e.message);
      return false;
    }
  }

  if (cargando) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f3ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#888' }}>
        ⏳ Cargando formación...
      </div>
    );
  }

  const pendJefe = delDpto.filter(s => s.estado === 'pendiente_jefe');
  const pendDir  = todas.filter(s => s.estado === 'pendiente_director');

  const pestañas = [
    { id: 'mias',  label: '📋 Mis solicitudes' },
    { id: 'nueva', label: '➕ Pedir' },
    perfil.soyJefe && { id: 'jefe', label: '👥 Mi departamento', n: pendJefe.length },
    perfil.soyDirectivo && { id: 'direccion', label: '🏛️ Dirección', n: pendDir.length },
  ].filter(Boolean);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f3ff', fontFamily: 'system-ui, sans-serif' }}>

      <div style={{ backgroundColor: MORADO, color: 'white', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => window.location.href = '/profesor'} style={{ background: 'none', border: 'none', color: 'white', fontSize: 22, cursor: 'pointer' }}>←</button>
        <span style={{ fontSize: 22 }}>🎓</span>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Formación</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{perfil.departamento || 'IES Gregorio Prieto'}</div>
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {pestañas.map(t => (
            <button key={t.id} onClick={() => setVista(t.id)} style={{
              flex: '1 1 140px', padding: '11px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700,
              border: vista === t.id ? 'none' : '1.5px solid #ddd',
              backgroundColor: vista === t.id ? MORADO : 'white',
              color: vista === t.id ? 'white' : '#666', fontFamily: 'inherit',
            }}>
              {t.label}
              {t.n > 0 && (
                <span style={{ marginLeft: 7, backgroundColor: '#dc2626', color: 'white', borderRadius: 20, padding: '1px 8px', fontSize: 12 }}>{t.n}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── MIS SOLICITUDES ── */}
        {vista === 'mias' && (
          <div>
            <div style={nota('#f5f3ff', '#c4b5fd', '#4c1d95')}>
              Primero se pide aquí la formación. La aprueba tu jefe de departamento y la autoriza
              el director. <strong>Cuando esté autorizada</strong>, registra la ausencia como cualquier otra.
            </div>

            {mias.length === 0 ? (
              <div style={{ ...tarjeta, textAlign: 'center', padding: 36 }}>
                <div style={{ fontSize: 42, marginBottom: 10 }}>🎓</div>
                <div style={{ fontWeight: 700, color: '#555', marginBottom: 18 }}>No has pedido ninguna formación este curso</div>
                <button onClick={() => setVista('nueva')} style={{ ...boton, padding: '11px 24px' }}>➕ Pedir una formación</button>
              </div>
            ) : mias.map(s => (
              <Tarjeta key={s.id} s={s}>
                {['pendiente_jefe', 'pendiente_director'].includes(s.estado) && (
                  <button onClick={() => retirar(s)} style={{ ...botonSec, marginTop: 10 }}>↩️ Retirar solicitud</button>
                )}
                {s.estado === 'autorizada' && (
                  <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, backgroundColor: '#fffbeb', border: '1.5px solid #fcd34d', fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
                    <strong>Concedida.</strong> Registra la ausencia aquí y <strong>solicita también el permiso en Delphos</strong>: la autorización del centro no sustituye la solicitud oficial.
                  </div>
                )}
                {s.estado === 'autorizada' && !s.ausencia_id && (
                  <a href={`/ausencias?formacion=${s.id}&fecha=${s.fecha_inicio}`} style={{
                    display: 'inline-block', marginTop: 10, padding: '9px 16px', borderRadius: 8,
                    backgroundColor: VERDE, color: 'white', fontWeight: 700, fontSize: 13, textDecoration: 'none',
                  }}>Registrar la ausencia →</a>
                )}
                {s.estado === 'autorizada' && s.ausencia_id && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: VERDE, fontWeight: 600 }}>✓ Ausencia registrada</div>
                )}
              </Tarjeta>
            ))}
          </div>
        )}

        {/* ── PEDIR ── */}
        {vista === 'nueva' && (
          <div style={tarjeta}>
            <Sub2>Nueva solicitud de formación</Sub2>

            <Campo label="Curso o jornada *">
              <input style={input} value={form.titulo} maxLength={300}
                placeholder="Ej.: Jornada de reparación de aluminio en carrocería"
                onChange={e => set('titulo', e.target.value)} />
            </Campo>

            <Campo label="Quién lo organiza">
              <input style={input} value={form.entidad} maxLength={200}
                placeholder="Ej.: CRFP, Centro de Profesorado, fabricante…"
                onChange={e => set('entidad', e.target.value)} />
            </Campo>

            <Campo label="Modalidad">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {MODALIDADES.map(m => (
                  <Chip key={m.valor} activo={form.modalidad === m.valor} onClick={() => set('modalidad', m.valor)}>{m.label}</Chip>
                ))}
              </div>
            </Campo>

            {form.modalidad !== 'online' && (
              <Campo label="Lugar">
                <input style={input} value={form.lugar} maxLength={200}
                  placeholder="Ej.: Ciudad Real"
                  onChange={e => set('lugar', e.target.value)} />
              </Campo>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Campo label="Fecha de inicio *">
                <input type="date" style={input} min={hoyLocal()} value={form.fecha_inicio}
                  onChange={e => set('fecha_inicio', e.target.value)} />
              </Campo>
              <Campo label="Fecha de fin">
                <input type="date" style={input} min={form.fecha_inicio || hoyLocal()} value={form.fecha_fin}
                  onChange={e => set('fecha_fin', e.target.value)} />
                <Pista>Déjala vacía si es un solo día.</Pista>
              </Campo>
              <Campo label="Hora de inicio">
                <input type="time" style={input} value={form.hora_inicio}
                  onChange={e => set('hora_inicio', e.target.value)} />
              </Campo>
              <Campo label="Hora de fin">
                <input type="time" style={input} value={form.hora_fin}
                  onChange={e => set('hora_fin', e.target.value)} />
              </Campo>
            </div>

            <Campo label="Observaciones">
              <textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={form.observaciones} maxLength={2000}
                placeholder="Relación con tu módulo, enlace a la convocatoria…"
                onChange={e => set('observaciones', e.target.value)} />
            </Campo>

            <div style={nota('#fffbeb', '#fcd34d', '#78350f')}>
              {perfil.soyJefe
                ? 'Como eres jefe de departamento, tu solicitud va directamente al director.'
                : 'Tu solicitud llegará primero a tu jefe de departamento y, si la aprueba, al director.'}
              {' '}No registres la ausencia hasta que esté autorizada.
            </div>

            <button onClick={enviar} disabled={enviando} style={{ ...boton, width: '100%', opacity: enviando ? 0.6 : 1 }}>
              {enviando ? '⏳ Enviando…' : '📨 Enviar solicitud'}
            </button>
          </div>
        )}

        {/* ── MI DEPARTAMENTO (jefes) ── */}
        {vista === 'jefe' && perfil.soyJefe && (
          <div>
            <Sub>Pendientes de tu aprobación</Sub>
            {pendJefe.length === 0
              ? <Vacio texto="No tienes solicitudes pendientes." />
              : pendJefe.map(s => (
                <Tarjeta key={s.id} s={s} verNombre>
                  <div style={{ fontSize: 12, color: AMBAR, fontWeight: 600, marginTop: 6 }}>
                    Plazo hasta el {fmtFecha(s.jefe_limite)}. Si no contestas, pasa sola al director.
                  </div>
                  <Resolver
                    opciones={[{ valor: 'aprobada', label: '✅ Aprobar', color: VERDE }, { valor: 'denegada', label: '❌ Denegar', color: ROJO }]}
                    onResolver={(dec, mot) => resolver('resolver_jefe', s, dec, mot)} />
                </Tarjeta>
              ))}

            {delDpto.some(s => s.estado !== 'pendiente_jefe') && (
              <>
                <Sub>Historial del departamento</Sub>
                {delDpto.filter(s => s.estado !== 'pendiente_jefe').map(s => <Tarjeta key={s.id} s={s} verNombre />)}
              </>
            )}
          </div>
        )}

        {/* ── DIRECCIÓN ── */}
        {vista === 'direccion' && perfil.soyDirectivo && (
          <PanelDireccion todas={todas} puedeResolver={perfil.soyDirector} resolver={resolver}
            alCambiar={async msg => { await cargar(); avisar(msg, 'ok'); }} />
        )}
      </div>
    </div>
  );
}

// ── Panel de dirección ──

function PanelDireccion({ todas, puedeResolver, resolver, alCambiar }) {
  const [filtro, setFiltro] = useState('todas');

  const pendDir = todas.filter(s => s.estado === 'pendiente_director');
  const enJefe  = todas.filter(s => s.estado === 'pendiente_jefe');
  const denJefe = todas.filter(s => s.estado === 'denegada_jefe');
  const resto   = todas.filter(s => ['autorizada', 'denegada_director', 'retirada'].includes(s.estado))
    .filter(s => filtro === 'todas' || s.estado === filtro);

  const opcionesDir = [
    { valor: 'autorizada', label: '✅ Autorizar', color: VERDE },
    { valor: 'denegada', label: '❌ Denegar', color: ROJO },
  ];

  return (
    <div>
      {!puedeResolver && (
        <div style={nota('#eff6ff', '#93c5fd', '#1e40af')}>
          Solo el director autoriza o deniega. Desde aquí puedes consultarlas.
        </div>
      )}

      <Sub>Pendientes de autorizar ({pendDir.length})</Sub>
      {pendDir.length === 0
        ? <Vacio texto="No hay solicitudes pendientes de dirección." />
        : pendDir.map(s => (
          <Tarjeta key={s.id} s={s} verNombre>
            {puedeResolver && <Resolver opciones={opcionesDir} onResolver={(dec, mot) => resolver('resolver_director', s, dec, mot)} />}
            {puedeResolver && <CambiarEstadoFormacion solicitud={s} onHecho={alCambiar} />}
          </Tarjeta>
        ))}

      {denJefe.length > 0 && (
        <>
          <Sub>Denegadas por el jefe de departamento ({denJefe.length})</Sub>
          {denJefe.map(s => (
            <Tarjeta key={s.id} s={s} verNombre>
              {puedeResolver && (
                <Resolver textoAbrir="Revisar decisión" opciones={[opcionesDir[0]]}
                  onResolver={(dec, mot) => resolver('resolver_director', s, dec, mot)} />
              )}
              {puedeResolver && <CambiarEstadoFormacion solicitud={s} onHecho={alCambiar} />}
            </Tarjeta>
          ))}
        </>
      )}

      {enJefe.length > 0 && (
        <>
          <Sub>En manos del jefe de departamento ({enJefe.length})</Sub>
          {enJefe.map(s => (
            <Tarjeta key={s.id} s={s} verNombre>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
                Pasa a dirección el {fmtFecha(s.jefe_limite)} si el jefe no contesta.
              </div>
              {puedeResolver && (
                <Resolver textoAbrir="Resolver sin esperar al jefe" opciones={opcionesDir}
                  onResolver={(dec, mot) => resolver('resolver_director', s, dec, mot)} />
              )}
              {puedeResolver && <CambiarEstadoFormacion solicitud={s} onHecho={alCambiar} />}
            </Tarjeta>
          ))}
        </>
      )}

      <Sub>Resueltas</Sub>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['todas', 'Todas'], ['autorizada', 'Autorizadas'], ['denegada_director', 'Denegadas'], ['retirada', 'Retiradas']].map(([v, l]) => (
          <Chip key={v} activo={filtro === v} onClick={() => setFiltro(v)}>{l}</Chip>
        ))}
      </div>
      {resto.length === 0 ? <Vacio texto="Nada que mostrar." /> : resto.map(s => (
        <Tarjeta key={s.id} s={s} verNombre>
          {s.estado === 'autorizada' && (
            <div style={{ marginTop: 6, fontSize: 12.5, fontWeight: 600, color: s.ausencia_id ? VERDE : AMBAR }}>
              {s.ausencia_id ? '✓ Ausencia registrada' : '⚠️ Aún no ha registrado la ausencia'}
            </div>
          )}
          {puedeResolver && <CambiarEstadoFormacion solicitud={s} onHecho={alCambiar} />}
        </Tarjeta>
      ))}
    </div>
  );
}

// ── Componentes ──

function Tarjeta({ s, verNombre = false, children }) {
  const est = ESTADOS[s.estado] || ESTADOS.pendiente_jefe;
  const d = new Date(s.fecha_inicio + 'T12:00:00');
  const modalidad = MODALIDADES.find(m => m.valor === s.modalidad);
  const horario = s.hora_inicio ? `${fmtHora(s.hora_inicio)}${s.hora_fin ? '–' + fmtHora(s.hora_fin) : ''}` : '';

  return (
    <div style={{
      display: 'flex', gap: 13, padding: '13px 15px', marginBottom: 9,
      backgroundColor: 'white', borderRadius: 10,
      border: '1px solid #e5e7eb', borderLeft: `4px solid ${est.borde}`,
    }}>
      <div style={{ flexShrink: 0, width: 50, textAlign: 'center', backgroundColor: '#f5f3ff', borderRadius: 8, padding: '7px 4px', alignSelf: 'flex-start' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: MORADO, lineHeight: 1 }}>{d.getDate()}</div>
        <div style={{ fontSize: 9.5, color: '#888', textTransform: 'uppercase', marginTop: 2 }}>
          {d.toLocaleDateString('es-ES', { month: 'short' })}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {verNombre && (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: MORADO, marginBottom: 2 }}>
            {s.profesor_nombre}{s.departamento ? ` · ${s.departamento}` : ''}
          </div>
        )}
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{s.titulo}</div>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
          📅 {fmtRango(s)}{horario && ` · 🕐 ${horario}`}
          {(s.entidad || modalidad || s.lugar) && <br />}
          {[s.entidad, modalidad?.label, s.lugar].filter(Boolean).join(' · ')}
        </div>
        {s.observaciones && (
          <div style={{ fontSize: 12, color: '#4b5563', marginTop: 5, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s.observaciones}</div>
        )}

        <div style={{ marginTop: 7 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            backgroundColor: est.bg, color: est.color, border: `1px solid ${est.borde}`,
          }}>{est.emoji} {est.label}</span>
        </div>

        <Recorrido s={s} />
        {children}
      </div>
    </div>
  );
}

/** Lo que ha dicho cada uno, en orden */
function Recorrido({ s }) {
  const pasos = [];
  if (s.jefe_decision === 'aprobada' || s.jefe_decision === 'denegada') {
    pasos.push({
      ok: s.jefe_decision === 'aprobada',
      texto: `${s.jefe_decision === 'aprobada' ? 'Aprobada' : 'Denegada'} por ${s.jefe_nombre || 'el jefe de departamento'} · ${fmtMomento(s.jefe_fecha)}`,
      motivo: s.jefe_motivo,
    });
  } else if (s.jefe_decision === 'escalada') {
    pasos.push({ neutro: true, texto: `El jefe de departamento no contestó en plazo · pasó a dirección el ${fmtMomento(s.jefe_fecha)}` });
  }
  if (s.director_fecha) {
    pasos.push({
      ok: s.estado === 'autorizada',
      texto: `${s.estado === 'autorizada' ? 'Autorizada' : 'Denegada'} por ${s.director_nombre || 'dirección'} · ${fmtMomento(s.director_fecha)}`,
      motivo: s.director_motivo,
    });
  }
  (Array.isArray(s.historial) ? s.historial : []).forEach(h => {
    pasos.push({ neutro: true, texto: `Cambio de estado por ${h.por || 'dirección'} · ${fmtMomento(h.fecha)}: ${(ESTADOS[h.de] || {}).label || h.de} → ${(ESTADOS[h.a] || {}).label || h.a}`, motivo: h.motivo });
  });
  if (!pasos.length) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {pasos.map((p, i) => (
        <div key={i} style={{
          fontSize: 12, lineHeight: 1.5, padding: '6px 10px', borderRadius: 7, marginBottom: 5,
          backgroundColor: p.neutro ? '#f3f4f6' : p.ok ? '#f0fdf4' : '#fef2f2',
          color: p.neutro ? '#4b5563' : p.ok ? VERDE : ROJO,
        }}>
          <div style={{ fontWeight: 600 }}>{p.texto}</div>
          {p.motivo && <div style={{ marginTop: 2 }}>{p.motivo}</div>}
        </div>
      ))}
    </div>
  );
}

/** Botonera para decidir, con motivo (obligatorio al denegar) */
function Resolver({ opciones, onResolver, textoAbrir = null }) {
  const [abierto, setAbierto] = useState(!textoAbrir);
  const [motivo, setMotivo]   = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!abierto) {
    return <button onClick={() => setAbierto(true)} style={{ ...botonSec, marginTop: 10 }}>{textoAbrir}</button>;
  }

  const decidir = async (valor) => {
    if (valor === 'denegada' && !motivo.trim()) {
      alert('Para denegar hay que escribir el motivo.');
      return;
    }
    setEnviando(true);
    const ok = await onResolver(valor, motivo.trim());
    setEnviando(false);
    if (ok) setMotivo('');
  };

  return (
    <div style={{ marginTop: 10, padding: 10, backgroundColor: '#fafafa', borderRadius: 8, border: '1px solid #eee' }}>
      <textarea style={{ ...input, minHeight: 56, fontSize: 13, resize: 'vertical' }} value={motivo} maxLength={1000}
        placeholder="Motivo u observaciones (obligatorio si deniegas)"
        onChange={e => setMotivo(e.target.value)} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {opciones.map(o => (
          <button key={o.valor} disabled={enviando} onClick={() => decidir(o.valor)} style={{
            ...boton, flex: 1, padding: '10px 14px', fontSize: 13.5, backgroundColor: o.color, opacity: enviando ? 0.6 : 1,
          }}>{enviando ? '⏳' : o.label}</button>
        ))}
      </div>
    </div>
  );
}

function Vacio({ texto }) {
  return <div style={{ ...tarjeta, textAlign: 'center', color: '#888', fontSize: 13.5, padding: 22 }}>{texto}</div>;
}

function Chip({ activo, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
      fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
      border: `1.5px solid ${activo ? MORADO : '#ddd'}`,
      backgroundColor: activo ? '#f5f3ff' : 'white',
      color: activo ? MORADO : '#666',
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
  backgroundColor: MORADO, color: 'white', fontWeight: 700,
  fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
};

const botonSec = {
  padding: '8px 14px', borderRadius: 8, border: '1.5px solid #d1d5db',
  backgroundColor: 'white', color: '#4b5563', fontWeight: 600,
  fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
};
