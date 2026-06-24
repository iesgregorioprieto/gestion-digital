'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const GRUPOS = {
  ESO: {
    emoji: '🏫',
    label: 'ESO',
    cursos: ['1º ESO', '2º ESO', '3º ESO', '4º ESO'],
    grupos: ['A', 'B', 'C', 'D', 'E', 'Otro'],
  },
  BACH: {
    emoji: '🎓',
    label: 'Bachillerato',
    cursos: ['1º Humanidades y CC.SS.', '2º Humanidades y CC.SS.', 'Otro'],
    grupos: null,
  },
  GM: {
    emoji: '🔧',
    label: 'FP Grado Medio',
    cursos: [
      '1º CAR', '2º CAR',
      '1º SMR', '2º SMR',
      '1º COC', '2º COC',
      '1º EVA', '2º EVA',
      '1º GAD', '2º GAD',
      '1º IEA', '2º IEA',
      '1º ITE', '2º ITE',
      '1º ACC', '2º ACC',
      '1º AOV', '2º AOV',
      'Otro'
    ],
    grupos: null,
  },
  GS: {
    emoji: '🎯',
    label: 'FP Grado Superior',
    cursos: [
      '1º DAW', '2º DAW',
      '1º DAM', '2º DAM',
      '1º ASIR', '2º ASIR',
      '1º AFI', '2º AFI',
      '1º AUT', '2º AUT',
      '1º DDC', '2º DDC',
      '1º GVEC', '2º GVEC',
      '1º SEA', '2º SEA',
      '1º STI', '2º STI',
      '1º TLO', '2º TLO',
      '1º VIT',
      'Otro'
    ],
    grupos: null,
  },
  OTRO: {
    emoji: '📝',
    label: 'Otro',
    cursos: null,
    grupos: null,
  },
};

const TIPOS_DLD = [
  { valor: 'no_lectivo', emoji: '🌙', label: 'DLD en período no lectivo' },
  { valor: '1_lectivo', emoji: '📚', label: '1º DLD en período lectivo' },
  { valor: '2_lectivo', emoji: '📖', label: '2º DLD en período lectivo' },
];

const TIPOS_GUARDIA = [
  { valor: 'cuadrante_general', emoji: '📋', label: 'Guardias del cuadrante general' },
  { valor: 'familias_profesionales', emoji: '🏭', label: 'Guardias de familias profesionales' },
  { valor: 'otras', emoji: '📝', label: 'Otras situaciones' },
];

export default function DLD() {
  const [paso, setPaso] = useState(1);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');
  const [profesorNombre, setProfesorNombre] = useState('');
  const [profesorId, setProfesorId] = useState('');
  const [tipoContrato, setTipoContrato] = useState('');
  const [antiguedadCentro, setAntiguedadCentro] = useState(0);
  const [antiguedadCuerpo, setAntiguedadCuerpo] = useState(0);

  const [form, setForm] = useState({
    tipo_dld: '',
    fecha_solicitada: '',
    tipo_guardia: '',
    causa_sobrevenida: false,
    descripcion_causa: '',
    grupos: [], // array de grupos seleccionados
  });

  // Para añadir grupos
  const [etapaSeleccionada, setEtapaSeleccionada] = useState('');
  const [cursoSeleccionado, setCursoSeleccionado] = useState('');
  const [grupoSeleccionado, setGrupoSeleccionado] = useState('');
  const [textoOtro, setTextoOtro] = useState('');

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const nombre = sessionStorage.getItem('profesor_nombre');
    if (!id) { window.location.href = '/login'; return; }
    setProfesorId(id);
    setProfesorNombre(nombre || '');
    cargarDatosProfesor(id);
  }, []);

  async function cargarDatosProfesor(id) {
    const { data } = await supabase
      .from('profesores')
      .select('tipo_contrato, antiguedad_centro, antiguedad_cuerpo')
      .eq('id', id)
      .single();
    if (data) {
      setTipoContrato(data.tipo_contrato || '');
      setAntiguedadCentro(data.antiguedad_centro || 0);
      setAntiguedadCuerpo(data.antiguedad_cuerpo || 0);
    }
  }

  function diasCorrespondientes() {
    if (tipoContrato === 'Funcionario de carrera' || tipoContrato === 'Interino con vacante') return 3;
    if (tipoContrato === 'Interino sin vacante') return 2;
    return 1;
  }

  function añadirGrupo() {
    if (!etapaSeleccionada) return;
    let texto = '';
    if (etapaSeleccionada === 'OTRO') {
      if (!textoOtro.trim()) return;
      texto = textoOtro.trim();
    } else if (etapaSeleccionada === 'ESO') {
      if (!cursoSeleccionado) return;
      texto = `${cursoSeleccionado}${grupoSeleccionado ? ` ${grupoSeleccionado}` : ''}`;
    } else {
      if (!cursoSeleccionado) return;
      texto = cursoSeleccionado === 'Otro' ? textoOtro.trim() || 'Otro' : cursoSeleccionado;
    }
    if (!form.grupos.includes(texto)) {
      setForm(f => ({ ...f, grupos: [...f.grupos, texto] }));
    }
    setEtapaSeleccionada('');
    setCursoSeleccionado('');
    setGrupoSeleccionado('');
    setTextoOtro('');
  }

  function quitarGrupo(grupo) {
    setForm(f => ({ ...f, grupos: f.grupos.filter(g => g !== grupo) }));
  }

  async function enviar() {
    setError('');
    if (!form.tipo_dld) { setError('Selecciona el tipo de DLD.'); return; }
    if (!form.fecha_solicitada) { setError('Indica la fecha solicitada.'); return; }
    if (!form.tipo_guardia) { setError('Indica el tipo de guardia.'); return; }

    setEnviando(true);
    try {
      const { error: err } = await supabase.from('dld').insert([{
        profesor_id: profesorId,
        profesor_nombre: profesorNombre,
        tipo_contrato: tipoContrato,
        tipo_dld: form.tipo_dld,
        fecha_solicitada: form.fecha_solicitada,
        grupos_afectados: form.grupos,
        tipo_guardia: form.tipo_guardia,
        causa_sobrevenida: form.causa_sobrevenida,
        descripcion_causa: form.descripcion_causa.trim(),
        estado: 'pendiente',
        antiguedad_centro: antiguedadCentro,
        antiguedad_cuerpo: antiguedadCuerpo,
      }]);
      if (err) setError('Error al enviar: ' + err.message);
      else setEnviado(true);
    } catch (e) {
      setError('Error inesperado: ' + e.message);
    }
    setEnviando(false);
  }

  const verde = '#1e6b2e';
  const verdeClaro = '#e8f5e9';

  // ─── PANTALLA ÉXITO ───
  if (enviado) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ backgroundColor: 'white', borderRadius: 16, padding: 40, maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
          <h2 style={{ color: verde, marginBottom: 12 }}>¡Solicitud enviada!</h2>
          <p style={{ color: '#555', lineHeight: 1.6 }}>
            Tu solicitud de DLD para el <strong>{form.fecha_solicitada}</strong> ha sido registrada.<br />
            El director la resolverá en un máximo de 3 días hábiles.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center' }}>
            <button onClick={() => { setEnviado(false); setPaso(1); setForm({ tipo_dld: '', fecha_solicitada: '', tipo_guardia: '', causa_sobrevenida: false, descripcion_causa: '', grupos: [] }); }} style={{
              padding: '12px 20px', borderRadius: 10, border: `2px solid ${verde}`,
              backgroundColor: 'white', color: verde, fontWeight: 700, cursor: 'pointer', fontSize: 14
            }}>+ Nueva solicitud</button>
            <a href="/profesor" style={{
              padding: '12px 20px', borderRadius: 10, border: 'none',
              backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 14,
              textDecoration: 'none', display: 'inline-block'
            }}>← Volver</a>
          </div>
        </div>
      </div>
    );
  }

  const etapaActual = etapaSeleccionada ? GRUPOS[etapaSeleccionada] : null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* HEADER */}
      <div style={{ backgroundColor: verde, color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>📄 Días de Libre Disposición</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>IES Gregorio Prieto · {profesorNombre}</div>
        </div>
        <a href="/profesor" style={{ color: 'white', textDecoration: 'none', fontSize: 14 }}>← Volver</a>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>

        {/* INFO DÍAS DISPONIBLES */}
        <div style={{ backgroundColor: verdeClaro, border: `1.5px solid ${verde}`, borderRadius: 12, padding: 16, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontSize: 32 }}>📊</div>
          <div>
            <div style={{ fontWeight: 700, color: verde, fontSize: 15 }}>Tus días de libre disposición</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
              {tipoContrato} → <strong>{diasCorrespondientes()} días</strong> correspondientes este curso
            </div>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', borderRadius: 14, padding: 24, boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>

          {/* TIPO DE DLD */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...labelEstilo, fontSize: 15 }}>🌙 Tipo de DLD solicitado *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {TIPOS_DLD.map(t => (
                <label key={t.valor} onClick={() => setForm(f => ({ ...f, tipo_dld: t.valor }))} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderRadius: 10, border: `2px solid ${form.tipo_dld === t.valor ? verde : '#e0e0e0'}`,
                  backgroundColor: form.tipo_dld === t.valor ? verdeClaro : 'white',
                  cursor: 'pointer', fontSize: 14, fontWeight: form.tipo_dld === t.valor ? 700 : 400
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${form.tipo_dld === t.valor ? verde : '#ccc'}`, backgroundColor: form.tipo_dld === t.valor ? verde : 'white', flexShrink: 0 }} />
                  <span style={{ fontSize: 20 }}>{t.emoji}</span>
                  <span style={{ color: form.tipo_dld === t.valor ? verde : '#444' }}>{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* FECHA */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...labelEstilo, fontSize: 15 }}>📅 Día solicitado *</label>
            <input
              type="date"
              value={form.fecha_solicitada}
              onChange={e => setForm(f => ({ ...f, fecha_solicitada: e.target.value }))}
              style={{ ...inputEstilo, marginTop: 8 }}
            />
          </div>

          {/* GRUPOS AFECTADOS */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...labelEstilo, fontSize: 15 }}>👥 Grupos a los que afectará la ausencia</label>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>Añade todos los grupos que tengas ese día</div>

            {/* Grupos añadidos */}
            {form.grupos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {form.grupos.map(g => (
                  <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, backgroundColor: verdeClaro, border: `1px solid ${verde}`, borderRadius: 20, padding: '4px 12px', fontSize: 13, fontWeight: 600, color: verde }}>
                    {g}
                    <button onClick={() => quitarGrupo(g)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: verde, fontSize: 16, lineHeight: 1, padding: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Selector de etapa */}
            <div style={{ backgroundColor: '#f8fdf8', borderRadius: 10, padding: 14, border: '1.5px solid #c8e6c9' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: verde, marginBottom: 10 }}>➕ Añadir grupo</div>

              {/* Etapas */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                {Object.entries(GRUPOS).map(([key, val]) => (
                  <button key={key} onClick={() => { setEtapaSeleccionada(key); setCursoSeleccionado(''); setGrupoSeleccionado(''); setTextoOtro(''); }} style={{
                    padding: '8px 6px', borderRadius: 8, border: `1.5px solid ${etapaSeleccionada === key ? verde : '#ddd'}`,
                    backgroundColor: etapaSeleccionada === key ? verdeClaro : 'white',
                    color: etapaSeleccionada === key ? verde : '#555',
                    cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}>
                    {val.emoji} {val.label}
                  </button>
                ))}
              </div>

              {/* Cursos según etapa */}
              {etapaSeleccionada && etapaSeleccionada !== 'OTRO' && etapaActual?.cursos && (
                <div style={{ marginBottom: 10 }}>
                  <select value={cursoSeleccionado} onChange={e => setCursoSeleccionado(e.target.value)} style={{ ...inputEstilo, marginBottom: 8 }}>
                    <option value="">— Selecciona curso —</option>
                    {etapaActual.cursos.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  {/* Letra grupo (solo ESO) */}
                  {etapaSeleccionada === 'ESO' && cursoSeleccionado && (
                    <select value={grupoSeleccionado} onChange={e => setGrupoSeleccionado(e.target.value)} style={inputEstilo}>
                      <option value="">— Letra del grupo (opcional) —</option>
                      {etapaActual.grupos.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}

                  {/* Campo libre si selecciona Otro */}
                  {cursoSeleccionado === 'Otro' && (
                    <input type="text" value={textoOtro} onChange={e => setTextoOtro(e.target.value)} placeholder="Escribe el grupo..." style={{ ...inputEstilo, marginTop: 8 }} />
                  )}
                </div>
              )}

              {/* Campo libre para OTRO */}
              {etapaSeleccionada === 'OTRO' && (
                <input type="text" value={textoOtro} onChange={e => setTextoOtro(e.target.value)} placeholder="Describe el grupo o situación..." style={{ ...inputEstilo, marginBottom: 10 }} />
              )}

              {etapaSeleccionada && (
                <button onClick={añadirGrupo} style={{
                  width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                  backgroundColor: verde, color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14
                }}>➕ Añadir este grupo</button>
              )}
            </div>
          </div>

          {/* TIPO DE GUARDIA */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ ...labelEstilo, fontSize: 15 }}>🛡️ Desempeño de guardias *</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {TIPOS_GUARDIA.map(t => (
                <label key={t.valor} onClick={() => setForm(f => ({ ...f, tipo_guardia: t.valor }))} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderRadius: 10, border: `2px solid ${form.tipo_guardia === t.valor ? verde : '#e0e0e0'}`,
                  backgroundColor: form.tipo_guardia === t.valor ? verdeClaro : 'white',
                  cursor: 'pointer', fontSize: 14, fontWeight: form.tipo_guardia === t.valor ? 700 : 400
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${form.tipo_guardia === t.valor ? verde : '#ccc'}`, backgroundColor: form.tipo_guardia === t.valor ? verde : 'white', flexShrink: 0 }} />
                  <span style={{ fontSize: 20 }}>{t.emoji}</span>
                  <span style={{ color: form.tipo_guardia === t.valor ? verde : '#444' }}>{t.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* CAUSA SOBREVENIDA */}
          <div style={{ marginBottom: 24, backgroundColor: '#fffbeb', borderRadius: 10, padding: 16, border: '1.5px solid #fcd34d' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={form.causa_sobrevenida}
                onChange={e => setForm(f => ({ ...f, causa_sobrevenida: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: verde }}
              />
              ⚠️ Es una causa sobrevenida (enfermedad, hospitalización, fallecimiento familiar)
            </label>
            {form.causa_sobrevenida && (
              <textarea
                value={form.descripcion_causa}
                onChange={e => setForm(f => ({ ...f, descripcion_causa: e.target.value }))}
                placeholder="Describe brevemente la causa sobrevenida..."
                rows={3}
                style={{ ...inputEstilo, marginTop: 12, resize: 'vertical' }}
              />
            )}
          </div>

          {/* ERROR */}
          {error && (
            <div style={{ backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: 12, marginBottom: 16, color: '#b91c1c', fontSize: 14 }}>
              ⚠️ {error}
            </div>
          )}

          {/* BOTÓN ENVIAR */}
          <button onClick={enviar} disabled={enviando} style={{
            width: '100%', padding: 14, borderRadius: 10, border: 'none',
            backgroundColor: verde, color: 'white', fontWeight: 700,
            fontSize: 16, cursor: enviando ? 'not-allowed' : 'pointer',
            opacity: enviando ? 0.7 : 1
          }}>
            {enviando ? 'Enviando...' : '📨 Enviar solicitud'}
          </button>

          <div style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 10 }}>
            Recuerda: mínimo 2 días hábiles de antelación · Resolución en máximo 3 días hábiles
          </div>
        </div>
      </div>
    </div>
  );
}

const labelEstilo = { display: 'block', fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4 };
const inputEstilo = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  border: '1.5px solid #ddd', fontSize: 14,
  boxSizing: 'border-box', outline: 'none', fontFamily: 'system-ui, sans-serif'
};