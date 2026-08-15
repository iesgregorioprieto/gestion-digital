'use client';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

const AZUL   = '#1e3a5f';
const VERDE  = '#1e6b2e';
const AMBAR  = '#b45309';
const ROJO   = '#991b1b';

export default function CambioCurso() {
  const [paso, setPaso]         = useState(0);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProc]   = useState(false);
  const [mensaje, setMensaje]   = useState(null);

  const [cursoActual, setCursoActual] = useState(null);
  const [resumen, setResumen] = useState({ profesores: 0, dld: 0, ausencias: 0 });

  const [profesores, setProfesores] = useState([]);
  const [continuan, setContinuan]   = useState({}); // id → true/false
  const [busqueda, setBusqueda]     = useState('');

  const [copiaHecha, setCopiaHecha] = useState(false);
  const [resultado, setResultado]   = useState(null);

  const aviso = (texto, tipo = 'ok') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  };

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const [{ data: cfgs }, { data: profs }, { count: nDld }, { count: nAus }] = await Promise.all([
        getSupabase().from('config_centro').select('*').eq('activo', true),
        getSupabase().from('profesores').select('id, nombre, apellidos, email, departamento, estado, titular_id').eq('estado', 'activo').order('apellidos'),
        getSupabase().from('dld').select('id', { count: 'exact', head: true }),
        getSupabase().from('ausencias').select('id', { count: 'exact', head: true }),
      ]);

      const cfg = (cfgs || [])[0] || null;
      setCursoActual(cfg);

      const lista = profs || [];
      setProfesores(lista);
      // Por defecto continúan todos
      const marcados = {};
      lista.forEach(p => { marcados[p.id] = true; });
      setContinuan(marcados);

      setResumen({ profesores: lista.length, dld: nDld || 0, ausencias: nAus || 0 });
    } catch (e) {
      aviso('Error al cargar: ' + e.message, 'error');
    }
    setCargando(false);
  }

  const nContinuan = Object.values(continuan).filter(Boolean).length;
  const nSalen     = profesores.length - nContinuan;

  const filtrados = profesores.filter(p => {
    if (!busqueda.trim()) return true;
    const t = `${p.nombre} ${p.apellidos} ${p.departamento || ''}`.toLowerCase();
    return t.includes(busqueda.toLowerCase());
  });

  function marcarTodos(valor) {
    const m = {};
    profesores.forEach(p => { m[p.id] = valor; });
    setContinuan(m);
  }

  // ── Ejecutar el cierre de curso ──
  async function ejecutar() {
    const salen = profesores.filter(p => !continuan[p.id]);

    const texto = salen.length > 0
      ? `Se van a dar de baja ${salen.length} profesor(es) y se reiniciarán los contadores de DLD.\n\nNADIE se elimina: los que se van quedan como inactivos y conservan todo su historial.\n\n¿Continuar?`
      : `Se reiniciarán los contadores de DLD para el nuevo curso.\n\n¿Continuar?`;

    if (!confirm(texto)) return;

    setProc(true);
    try {
      let bajas = 0;
      const fallos = [];

      // 1. Los que no continúan → inactivos (nunca se borran)
      for (const p of salen) {
        const { error } = await getSupabase()
          .from('profesores')
          .update({ estado: 'inactivo', baja_curso: cursoActual?.curso || null })
          .eq('id', p.id);

        if (error) {
          fallos.push(`${p.apellidos}, ${p.nombre} — ${error.message}`);
          continue;
        }
        bajas++;
      }

      // 2. Archivar las solicitudes de DLD del curso que termina
      const { data: dldCurso } = await getSupabase()
        .from('dld')
        .select('id')
        .is('curso_archivado', null);

      let dldArchivados = 0;
      if (dldCurso && dldCurso.length > 0) {
        const _ra = await fetch('/api/dld', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'archivar_curso', datos: { curso: cursoActual?.curso || 'anterior' } }),
        });
        const errDld = _ra.ok ? null : await _ra.json();

        if (errDld) fallos.push(`Archivo de DLD — ${errDld.error || 'error al archivar'}`);
        else dldArchivados = dldCurso.length;
      }

      setResultado({
        bajas,
        continuan: nContinuan,
        dldArchivados,
        fallos,
      });
      setPaso(4);
    } catch (e) {
      aviso('Error: ' + e.message, 'error');
    }
    setProc(false);
  }

  if (cargando) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#888' }}>⏳ Cargando datos del curso...</div>;
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 800, color: AZUL, marginBottom: 6 }}>
        🔄 Cierre de curso y apertura del siguiente
      </div>
      <div style={{ fontSize: 13, color: '#777', lineHeight: 1.6, marginBottom: 18 }}>
        Prepara la aplicación para el curso nuevo. <strong>No se borra nada</strong>:
        el historial de DLD y ausencias se conserva íntegro.
      </div>

      {mensaje && (
        <div style={{
          padding: '11px 16px', borderRadius: 10, marginBottom: 16, fontSize: 13.5, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'ok' ? '#dcfce7' : '#fee2e2',
          color:           mensaje.tipo === 'ok' ? '#166534' : '#991b1b',
          border: `1.5px solid ${mensaje.tipo === 'ok' ? '#86efac' : '#fca5a5'}`,
        }}>{mensaje.texto}</div>
      )}

      {/* PASOS */}
      <div style={{ display: 'flex', marginBottom: 22, backgroundColor: '#f9fafb', borderRadius: 12, overflow: 'hidden', border: '1px solid #eee' }}>
        {['Resumen', 'Copia', 'Profesorado', 'Confirmar'].map((etiqueta, i) => (
          <div key={i} style={{
            flex: 1, padding: '11px 6px', textAlign: 'center',
            backgroundColor: paso === i ? AZUL : paso > i ? '#f0fdf4' : 'transparent',
            borderRight: i < 3 ? '1px solid #eee' : 'none',
          }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: paso === i ? 'white' : paso > i ? '#166534' : '#ccc' }}>
              {paso > i ? '✓' : i + 1}
            </div>
            <div style={{ fontSize: 11, marginTop: 2, color: paso === i ? '#a7f3d0' : paso > i ? '#166534' : '#bbb' }}>
              {etiqueta}
            </div>
          </div>
        ))}
      </div>

      {/* ── PASO 0: RESUMEN ── */}
      {paso === 0 && (
        <div>
          {!cursoActual && (
            <Nota fondo="#fef3c7" borde="#fbbf24" color="#78350f">
              ⚠️ No hay ningún curso marcado como actual. Configúralo primero en
              la pestaña <strong>📅 Datos del curso</strong>.
            </Nota>
          )}

          <div style={{ backgroundColor: '#f9fafb', border: '1px solid #eee', borderRadius: 12, padding: 20, marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Curso que finaliza</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: AZUL, marginBottom: 18 }}>
              {cursoActual?.curso || '— sin configurar —'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
              <Dato emoji="👥" n={resumen.profesores} label="profesores activos" />
              <Dato emoji="📅" n={resumen.dld} label="solicitudes de DLD" />
              <Dato emoji="🏥" n={resumen.ausencias} label="ausencias" />
            </div>
          </div>

          <Nota fondo="#eff6ff" borde="#bfdbfe" color="#1e40af">
            <strong>Qué va a pasar:</strong>
            <div style={{ lineHeight: 2, marginTop: 8 }}>
              ✅ Marcarás quién continúa el curso que viene<br />
              ✅ Los que no continúan pasarán a <strong>inactivos</strong><br />
              ✅ Su historial se conserva: si vuelven, lo recuperan entero<br />
              ✅ Los contadores de DLD se archivan y empiezan de cero<br />
              🔒 <strong>No se elimina ningún dato</strong>
            </div>
          </Nota>

          <Boton onClick={() => setPaso(1)} disabled={!cursoActual}>
            Empezar →
          </Boton>
        </div>
      )}

      {/* ── PASO 1: COPIA DE SEGURIDAD ── */}
      {paso === 1 && (
        <div>
          <Nota fondo="#fffbeb" borde="#fde68a" color="#78350f">
            <strong>⚠️ Antes de nada, haz una copia de seguridad.</strong>
            <div style={{ marginTop: 8, lineHeight: 1.6 }}>
              Aunque este proceso no borra nada, conviene tener un respaldo
              descargado antes de cambiar de curso.
            </div>
          </Nota>

          <a
            href="/gestion/copia"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setCopiaHecha(true)}
            style={{
              display: 'block', textAlign: 'center', padding: '14px',
              backgroundColor: VERDE, color: 'white', borderRadius: 10,
              textDecoration: 'none', fontWeight: 700, fontSize: 14.5, marginBottom: 10,
            }}
          >
            💾 Descargar la copia de seguridad
          </a>

          <a
            href="https://drive.google.com/drive/folders/1eEYOlqW9KoKSVyYqXnz_hL6tyBQIcFv3"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', textAlign: 'center', padding: '13px',
              backgroundColor: 'white', color: AZUL, borderRadius: 10,
              border: `1.5px solid ${AZUL}`,
              textDecoration: 'none', fontWeight: 700, fontSize: 14, marginBottom: 16,
            }}
          >
            📂 Guardarla en el Drive del centro
          </a>

          <div
            onClick={() => setCopiaHecha(!copiaHecha)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '12px 15px', borderRadius: 10, marginBottom: 18,
              border: `1.5px solid ${copiaHecha ? VERDE : '#ddd'}`,
              backgroundColor: copiaHecha ? '#f0fdf4' : 'white',
            }}
          >
            <div style={{
              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
              border: `2px solid ${copiaHecha ? VERDE : '#ccc'}`,
              backgroundColor: copiaHecha ? VERDE : 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 13, fontWeight: 700,
            }}>{copiaHecha ? '✓' : ''}</div>
            <div style={{ fontSize: 13.5, color: copiaHecha ? VERDE : '#555', fontWeight: copiaHecha ? 700 : 400 }}>
              Ya he descargado la copia de seguridad
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <BotonSec onClick={() => setPaso(0)}>← Atrás</BotonSec>
            <Boton onClick={() => setPaso(2)} disabled={!copiaHecha}>Continuar →</Boton>
          </div>
        </div>
      )}

      {/* ── PASO 2: PROFESORADO ── */}
      {paso === 2 && (
        <div>
          <div style={{ fontSize: 13.5, color: '#555', lineHeight: 1.6, marginBottom: 14 }}>
            Desmarca a quienes <strong>no continúan</strong> el curso que viene.
            Pasarán a inactivos, conservando todo su historial.
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar por nombre o departamento..."
              style={{ flex: 1, minWidth: 200, padding: '10px 13px', borderRadius: 9, border: '1.5px solid #ddd', fontSize: 13.5 }}
            />
            <button onClick={() => marcarTodos(true)} style={btnMini(VERDE)}>Todos siguen</button>
            <button onClick={() => marcarTodos(false)} style={btnMini(ROJO)}>Ninguno</button>
          </div>

          <div style={{
            display: 'flex', gap: 16, padding: '12px 16px', marginBottom: 14,
            backgroundColor: '#f9fafb', border: '1px solid #eee', borderRadius: 10,
            fontSize: 13.5, fontWeight: 700, flexWrap: 'wrap',
          }}>
            <span style={{ color: VERDE }}>✅ {nContinuan} continúan</span>
            <span style={{ color: nSalen > 0 ? AMBAR : '#bbb' }}>📤 {nSalen} se van</span>
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'grid', gap: 6, marginBottom: 18 }}>
            {filtrados.map(p => {
              const sigue = continuan[p.id];
              return (
                <div
                  key={p.id}
                  onClick={() => setContinuan(c => ({ ...c, [p.id]: !c[p.id] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                    padding: '10px 14px', borderRadius: 9,
                    border: `1.5px solid ${sigue ? '#bbf7d0' : '#fde68a'}`,
                    backgroundColor: sigue ? '#f0fdf4' : '#fffbeb',
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${sigue ? VERDE : '#d97706'}`,
                    backgroundColor: sigue ? VERDE : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 12, fontWeight: 700,
                  }}>{sigue ? '✓' : ''}</div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: '#333', fontSize: 13.5 }}>
                      {p.apellidos}, {p.nombre}
                    </div>
                    <div style={{ fontSize: 11.5, color: '#888' }}>
                      {p.departamento || '—'}
                      {p.titular_id && ' · sustituto/a'}
                    </div>
                  </div>

                  <div style={{ fontSize: 11.5, fontWeight: 700, color: sigue ? VERDE : AMBAR, whiteSpace: 'nowrap' }}>
                    {sigue ? 'Continúa' : 'Se va'}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <BotonSec onClick={() => setPaso(1)}>← Atrás</BotonSec>
            <Boton onClick={() => setPaso(3)}>Continuar →</Boton>
          </div>
        </div>
      )}

      {/* ── PASO 3: CONFIRMAR ── */}
      {paso === 3 && (
        <div>
          <Nota fondo="#eff6ff" borde="#bfdbfe" color="#1e40af">
            <strong>Resumen de lo que se va a hacer:</strong>
            <div style={{ lineHeight: 2, marginTop: 8 }}>
              ✅ <strong>{nContinuan}</strong> profesores siguen activos<br />
              📤 <strong>{nSalen}</strong> pasan a inactivos (conservan su historial)<br />
              📦 Se archivan las solicitudes de DLD del curso {cursoActual?.curso}<br />
              🔒 No se elimina ningún dato
            </div>
          </Nota>

          <Nota fondo="#fffbeb" borde="#fde68a" color="#78350f">
            <strong>Después de esto tendrás que:</strong>
            <div style={{ lineHeight: 2, marginTop: 8 }}>
              1. Crear el curso nuevo en <strong>📅 Datos del curso</strong><br />
              2. Cargar los grupos y horarios nuevos desde Delphos<br />
              3. Los profesores nuevos se registrarán ellos mismos
            </div>
          </Nota>

          <div style={{ display: 'flex', gap: 10 }}>
            <BotonSec onClick={() => setPaso(2)}>← Atrás</BotonSec>
            <button
              onClick={ejecutar}
              disabled={procesando}
              style={{
                flex: 2, padding: '14px', borderRadius: 10, border: 'none',
                backgroundColor: AMBAR, color: 'white', fontWeight: 800, fontSize: 14.5,
                cursor: procesando ? 'not-allowed' : 'pointer', opacity: procesando ? 0.7 : 1,
              }}
            >
              {procesando ? '⏳ Procesando...' : '🔄 Cerrar el curso'}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 4: HECHO ── */}
      {paso === 4 && resultado && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>🎉</div>
          <h3 style={{ color: VERDE, margin: '0 0 12px', fontSize: 20 }}>Curso cerrado correctamente</h3>

          <div style={{
            backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0', color: '#166534',
            borderRadius: 12, padding: '16px 20px', margin: '0 0 20px',
            fontSize: 13.5, lineHeight: 2, textAlign: 'left',
          }}>
            ✅ <strong>{resultado.continuan}</strong> profesores continúan activos<br />
            📤 <strong>{resultado.bajas}</strong> pasaron a inactivos<br />
            📦 <strong>{resultado.dldArchivados}</strong> solicitudes de DLD archivadas
          </div>

          {resultado.fallos?.length > 0 && (
            <div style={{
              backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5', color: ROJO,
              borderRadius: 12, padding: '14px 18px', margin: '0 0 20px',
              fontSize: 13, lineHeight: 1.7, textAlign: 'left',
            }}>
              <strong>⚠️ {resultado.fallos.length} operación(es) no se completaron:</strong>
              <div style={{ marginTop: 7 }}>
                {resultado.fallos.map((f, i) => <div key={i}>· {f}</div>)}
              </div>
              <div style={{ marginTop: 8 }}>
                Vuelve a ejecutar el cierre para reintentar solo lo que falta.
              </div>
            </div>
          )}

          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.7, marginBottom: 20 }}>
            Ahora crea el curso nuevo en <strong>📅 Datos del curso</strong> y
            carga los grupos y horarios desde Delphos.
          </div>

          <button onClick={() => { setPaso(0); cargar(); }} style={{
            padding: '12px 26px', borderRadius: 10, border: '1.5px solid #ddd',
            backgroundColor: 'white', color: '#555', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>
            Volver al inicio
          </button>
        </div>
      )}
    </div>
  );
}

// ── Auxiliares ──

function Dato({ emoji, n, label }) {
  return (
    <div style={{ backgroundColor: 'white', border: '1px solid #eee', borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{emoji}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a5f' }}>{n}</div>
      <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Nota({ fondo, borde, color, children }) {
  return (
    <div style={{
      backgroundColor: fondo, border: `1.5px solid ${borde}`, color,
      borderRadius: 10, padding: '14px 18px', marginBottom: 16,
      fontSize: 13.5, lineHeight: 1.6,
    }}>{children}</div>
  );
}

function Boton({ onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      flex: 2, width: '100%', padding: '13px', borderRadius: 10, border: 'none',
      backgroundColor: '#1e3a5f', color: 'white', fontWeight: 700, fontSize: 14.5,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

function BotonSec({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '13px', borderRadius: 10, border: '1.5px solid #ddd',
      backgroundColor: 'white', color: '#666', fontWeight: 700, fontSize: 14, cursor: 'pointer',
    }}>{children}</button>
  );
}

function btnMini(color) {
  return {
    padding: '10px 14px', borderRadius: 9, cursor: 'pointer',
    border: `1.5px solid ${color}`, backgroundColor: 'white',
    color, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap',
  };
}
