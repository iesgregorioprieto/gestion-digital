'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';
import { getCursoActual } from '@/lib/curso';

const azul = '#1e3a5f';
const verde = '#1e6b2e';
const rojo = '#b91c1c';
const naranja = '#b45309';

// Tablas que se incluyen en la copia
const TABLAS = [
  { nombre: 'profesores',          label: 'Profesorado',            emoji: '👥' },
  { nombre: 'grupos',              label: 'Grupos',                 emoji: '🏫' },
  { nombre: 'alumnos',             label: 'Alumnado',               emoji: '🎓' },
  { nombre: 'horarios_profesores', label: 'Horarios',               emoji: '🕐' },
  { nombre: 'ausencias',           label: 'Ausencias',              emoji: '🏥' },
  { nombre: 'dld',                 label: 'Días libre disposición', emoji: '📄' },
  { nombre: 'apoyos_asignados',    label: 'Apoyos de guardia',      emoji: '🛡️' },
  { nombre: 'apoyos_guardia',      label: 'Apoyos (histórico)',     emoji: '🔄' },
  { nombre: 'apoyos_realizados',   label: 'Apoyos realizados',      emoji: '✅' },
  { nombre: 'guardias_manuales',   label: 'Guardias manuales',      emoji: '✏️' },
  { nombre: 'mantenimiento',       label: 'Mantenimiento',          emoji: '🔧' },
  { nombre: 'compras',             label: 'Compras',                emoji: '🛒' },
  { nombre: 'actividades',         label: 'Actividades complementarias', emoji: '🎒' },
  { nombre: 'config_centro',       label: 'Datos del curso',        emoji: '📅' },
  { nombre: 'periodos_no_lectivos',label: 'Vacaciones y festivos',  emoji: '🏖️' },
  { nombre: 'avisos_sala',         label: 'Avisos de sala',         emoji: '📢' },
];

const CLAVE_ULTIMA = 'ies_ultima_copia';

export default function CopiaSeguridad() {
  const [nombre, setNombre] = useState('');
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: TABLAS.length, tabla: '' });
  const [resultado, setResultado] = useState(null);
  const [ultimaCopia, setUltimaCopia] = useState(null);

  // ── Restaurar ──
  const [copiaLeida, setCopiaLeida] = useState(null);     // el archivo, ya leído
  const [marcadas, setMarcadas] = useState({});           // qué tablas restaurar
  const [restaurando, setRestaurando] = useState(false);
  const [informe, setInforme] = useState(null);

  /**
   * Leer la copia NO restaura nada: solo la abre y enseña lo que trae,
   * para que se vea de qué fecha es y cuántas filas hay de cada cosa
   * antes de decidir. Ninguna tabla va marcada de entrada: hay que
   * elegirlas a propósito.
   */
  async function leerCopia(archivo) {
    setInforme(null);
    if (!archivo) return;
    try {
      const c = JSON.parse(await archivo.text());
      if (!c || !c.datos || typeof c.datos !== 'object') throw new Error();
      setCopiaLeida(c);
      setMarcadas({});
    } catch {
      alert('Ese archivo no es una copia de la aplicación. Tiene que ser el copia-portal-ies-AAAA-MM-DD.json que se descarga aquí.');
      setCopiaLeida(null);
    }
  }

  async function restaurar() {
    const tablas = Object.keys(marcadas).filter(t => marcadas[t]);
    if (tablas.length === 0) return;
    const fecha = copiaLeida.generada
      ? new Date(copiaLeida.generada).toLocaleString('es-ES') : 'fecha desconocida';
    if (!confirm(
      `Vas a restaurar ${tablas.length === 1 ? '1 tabla' : `${tablas.length} tablas`} ` +
      `desde la copia del ${fecha}.\n\n` +
      `Lo que tenía la copia se vuelve a escribir. NO se borra nada: lo que ` +
      `se haya creado después de la copia se queda como está.\n\n¿Continuar?`
    )) return;

    setRestaurando(true);
    const resultado = [];
    for (const t of tablas) {
      const filas = copiaLeida.datos[t] || [];
      try {
        const r = await fetch('/api/copia/restaurar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tabla: t, filas }),
        });
        const d = await r.json();
        resultado.push(r.ok
          ? { tabla: t, bien: true, texto: `${d.repuestas} filas repuestas` }
          : { tabla: t, bien: false, texto: d.error || 'error' });
      } catch {
        resultado.push({ tabla: t, bien: false, texto: 'sin conexión' });
      }
    }
    setInforme(resultado);
    setRestaurando(false);
  }

  useEffect(() => {
    const id = sessionStorage.getItem('profesor_id');
    const rol = sessionStorage.getItem('profesor_rol_gestion');
    if (!id || !['director', 'secretario', 'jefe_estudios'].includes(rol)) {
      window.location.href = '/login';
      return;
    }
    setNombre(sessionStorage.getItem('profesor_nombre') || '');
    try {
      const guardada = localStorage.getItem(CLAVE_ULTIMA);
      if (guardada) setUltimaCopia(guardada);
    } catch (e) {
      console.warn('No se pudo leer la fecha de la última copia:', e);
    }
  }, []);

  // Días transcurridos desde la última copia
  const diasDesdeUltima = ultimaCopia
    ? Math.floor((Date.now() - new Date(ultimaCopia).getTime()) / 86400000)
    : null;

  const tocaCopia = diasDesdeUltima === null || diasDesdeUltima >= 30;

  async function generarCopia() {
    setGenerando(true);
    setResultado(null);
    const supabase = getSupabase();
    const datos = {};
    const errores = [];
    let totalFilas = 0;

    for (let i = 0; i < TABLAS.length; i++) {
      const t = TABLAS[i];
      setProgreso({ actual: i + 1, total: TABLAS.length, tabla: t.label });

      try {
        // Paginación: Supabase devuelve como máximo 1000 filas por consulta
        let todas = [];
        let desde = 0;
        const tamano = 1000;
        while (true) {
          const { data, error } = await supabase
            .from(t.nombre)
            .select('*')
            .range(desde, desde + tamano - 1);
          if (error) throw error;
          todas = todas.concat(data || []);
          if (!data || data.length < tamano) break;
          desde += tamano;
        }
        datos[t.nombre] = todas;
        totalFilas += todas.length;
      } catch (e) {
        errores.push({ tabla: t.label, mensaje: e.message || 'Error desconocido' });
        datos[t.nombre] = [];
      }
    }

    // Construir el archivo
    const ahora = new Date();
    const copia = {
      centro: 'IES Gregorio Prieto — Valdepeñas',
      generada: ahora.toISOString(),
      generada_por: nombre,
      curso: await getCursoActual(),
      version_formato: 1,
      resumen: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, v.length])),
      datos,
    };

    const json = JSON.stringify(copia, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const fecha = ahora.toISOString().split('T')[0];
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `copia-portal-ies-${fecha}.json`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);

    // Registrar la fecha
    try {
      localStorage.setItem(CLAVE_ULTIMA, ahora.toISOString());
      setUltimaCopia(ahora.toISOString());
    } catch (e) {
      // La copia se ha hecho igualmente; solo no queda anotada la fecha.
      console.warn('No se pudo anotar la fecha de esta copia:', e);
    }

    setResultado({
      totalFilas,
      tablas: Object.entries(datos).map(([k, v]) => ({
        nombre: TABLAS.find(t => t.nombre === k)?.label || k,
        emoji: TABLAS.find(t => t.nombre === k)?.emoji || '📁',
        filas: v.length,
      })),
      errores,
      tamano: (blob.size / 1024 / 1024).toFixed(2),
    });
    setGenerando(false);
    setProgreso({ actual: 0, total: TABLAS.length, tabla: '' });
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f0f4f0', fontFamily: 'system-ui, sans-serif' }}>

      {/* CABECERA */}
      <div style={{ backgroundColor: azul, color: 'white', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/gestion" style={{ color: 'white', textDecoration: 'none', fontSize: 20 }}>←</a>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>💾 Copia de seguridad</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{nombre}</div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>

        {/* AVISO SEGÚN ANTIGÜEDAD */}
        {tocaCopia ? (
          <div style={{
            backgroundColor: '#fffbeb', border: '2px solid #fbbf24', borderRadius: 12,
            padding: '16px 18px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: naranja, marginBottom: 6 }}>
              ⚠️ Toca hacer una copia
            </div>
            <div style={{ fontSize: 13, color: '#78350f', lineHeight: 1.55 }}>
              {diasDesdeUltima === null
                ? 'No hay constancia de que se haya hecho ninguna copia desde este navegador. Conviene generar una y guardarla en el Drive del centro.'
                : `Han pasado ${diasDesdeUltima} días desde la última copia. Lo recomendable es hacer una al mes.`}
            </div>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12,
            padding: '14px 18px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: verde, marginBottom: 4 }}>
              ✅ Copia reciente
            </div>
            <div style={{ fontSize: 13, color: '#166534' }}>
              La última se hizo hace {diasDesdeUltima} día{diasDesdeUltima !== 1 ? 's' : ''}
              {' '}({new Date(ultimaCopia).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}).
            </div>
          </div>
        )}

        {/* EXPLICACIÓN */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 18, marginBottom: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: azul, marginBottom: 10 }}>
            ¿Para qué sirve esto?
          </div>
          <div style={{ fontSize: 13, color: '#444', lineHeight: 1.6 }}>
            Supabase guarda copias automáticas de los últimos <strong>7 días</strong>. Si algo se borra por
            error y nadie lo advierte en ese plazo, no hay forma de recuperarlo.
            <br /><br />
            Este botón descarga un archivo con <strong>todos los datos del portal</strong>. Guárdalo en el
            Drive del centro una vez al mes y tendrás un histórico al que volver.
          </div>
        </div>

        {/* QUÉ SE INCLUYE */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 18, marginBottom: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: azul, marginBottom: 10 }}>
            Qué se incluye ({TABLAS.length} tablas)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TABLAS.map(t => (
              <span key={t.nombre} style={{
                padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                backgroundColor: '#f3f4f6', color: '#475569', border: '1px solid #e5e7eb',
              }}>
                {t.emoji} {t.label}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
            No se incluyen los archivos adjuntos (justificantes, fotos). Esos están en el
            almacenamiento de Supabase y se conservan aparte.
          </div>
        </div>

        {/* BOTÓN */}
        {!generando && (
          <>
            <button
              onClick={generarCopia}
              style={{
                width: '100%', padding: '16px', borderRadius: 12, border: 'none',
                backgroundColor: tocaCopia ? naranja : azul, color: 'white',
                fontSize: 16, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
              }}
            >
              💾 Generar y descargar copia
            </button>

            {/* RESTAURAR UNA COPIA */}
            <div style={{
              marginTop: 18, backgroundColor: 'white', borderRadius: 12,
              padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              border: '1.5px solid #fde68a',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>
                ♻️ Restaurar una copia
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.6, marginBottom: 12 }}>
                Primero se abre la copia y se ve lo que trae; no se toca nada
                hasta que elijas qué tablas y confirmes. <strong>Nunca se borra
                nada</strong>: lo que tenía la copia se vuelve a escribir, y lo
                que se haya creado después se queda.
              </div>

              <label style={{ display: 'block', padding: '11px 14px', borderRadius: 9,
                border: '1.5px dashed #d97706', backgroundColor: '#fffbeb', color: '#92400e',
                fontSize: 13.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>
                📂 Abrir un archivo de copia (.json)
                <input type="file" accept=".json,application/json"
                  onChange={e => { leerCopia(e.target.files?.[0]); e.target.value = ''; }}
                  style={{ display: 'none' }} />
              </label>

              {copiaLeida && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, color: '#1f2937', marginBottom: 10 }}>
                    Copia del <strong>{copiaLeida.generada
                      ? new Date(copiaLeida.generada).toLocaleString('es-ES') : '—'}</strong>
                    {copiaLeida.generada_por ? <> · hecha por {copiaLeida.generada_por}</> : null}
                    {copiaLeida.curso ? <> · curso {copiaLeida.curso}</> : null}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                    Marca solo lo que quieras restaurar:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {TABLAS.filter(t => Array.isArray(copiaLeida.datos[t.nombre])).map(t => (
                      <label key={t.nombre} style={{ display: 'flex', alignItems: 'center', gap: 9,
                        padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                        backgroundColor: marcadas[t.nombre] ? '#fef3c7' : '#f8fafc',
                        border: `1px solid ${marcadas[t.nombre] ? '#fcd34d' : '#e2e8f0'}` }}>
                        <input type="checkbox" checked={!!marcadas[t.nombre]}
                          onChange={e => setMarcadas(m => ({ ...m, [t.nombre]: e.target.checked }))} />
                        <span style={{ flex: 1, fontSize: 13 }}>{t.emoji} {t.label}</span>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {copiaLeida.datos[t.nombre].length} filas
                        </span>
                      </label>
                    ))}
                  </div>
                  <button onClick={restaurar}
                    disabled={restaurando || !Object.values(marcadas).some(Boolean)}
                    style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 9,
                      border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                      backgroundColor: Object.values(marcadas).some(Boolean) ? '#b45309' : '#d1d5db',
                      color: 'white' }}>
                    {restaurando ? '⏳ Restaurando…' : '♻️ Restaurar lo marcado'}
                  </button>
                </div>
              )}

              {informe && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8,
                  backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  {informe.map(r => (
                    <div key={r.tabla} style={{ fontSize: 12.5, color: r.bien ? '#166534' : '#991b1b', padding: '2px 0' }}>
                      {r.bien ? '✅' : '❌'} {r.tabla}: {r.texto}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* GUARDAR EN DRIVE DEL CENTRO */}
            <div style={{
              marginTop: 18, backgroundColor: 'white', borderRadius: 12,
              padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: azul, marginBottom: 8 }}>
                ☁️ Guardar la copia en el Drive del centro
              </div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 14 }}>
                Una copia en tu ordenador se puede perder. Guárdala también en la
                carpeta compartida del centro para que esté disponible para el
                equipo directivo.
              </div>

              <div style={{
                backgroundColor: '#f8fafc', border: '1px solid #e2e8f0',
                borderRadius: 10, padding: '14px 16px', marginBottom: 14,
                fontSize: 13.5, color: '#334155', lineHeight: 2.1,
              }}>
                <strong>Cómo hacerlo:</strong><br />
                1. Pulsa arriba <strong>💾 Generar y descargar copia</strong><br />
                2. Abre la carpeta del centro con el botón de abajo<br />
                3. Arrastra ahí el archivo descargado
              </div>

              <a
                href="https://drive.google.com/drive/folders/1tFYGMxqae2aYFmboIlk0binDOr6yd4WT"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block', textAlign: 'center', padding: '14px',
                  backgroundColor: verde, color: 'white', borderRadius: 10,
                  textDecoration: 'none', fontWeight: 800, fontSize: 14.5,
                }}
              >
                📂 Abrir carpeta de copias en Drive
              </a>

              <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 10, lineHeight: 1.6, textAlign: 'center' }}>
                El archivo se llama <strong>copia-portal-ies-AAAA-MM-DD.json</strong>,
                así que quedan ordenados por fecha.
              </div>
            </div>
          </>
        )}

        {/* PROGRESO */}
        {generando && (
          <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: azul, marginBottom: 10, textAlign: 'center' }}>
              Descargando {progreso.tabla}…
            </div>
            <div style={{ height: 10, backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{
                height: '100%', width: `${(progreso.actual / progreso.total) * 100}%`,
                backgroundColor: verde, transition: 'width .3s',
              }} />
            </div>
            <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
              {progreso.actual} de {progreso.total} tablas
            </div>
          </div>
        )}

        {/* RESULTADO */}
        {resultado && (
          <div style={{
            marginTop: 18, backgroundColor: '#f0fdf4', border: '2px solid #86efac',
            borderRadius: 12, padding: 18,
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: verde, marginBottom: 8 }}>
              ✅ Copia descargada
            </div>
            <div style={{ fontSize: 13, color: '#166534', marginBottom: 14 }}>
              {resultado.totalFilas.toLocaleString('es-ES')} registros · {resultado.tamano} MB
              <br />
              <strong>Guárdala ahora en el Drive del centro.</strong>
            </div>

            <details>
              <summary style={{ fontSize: 12, fontWeight: 700, color: '#166534', cursor: 'pointer' }}>
                Ver detalle por tabla
              </summary>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {resultado.tablas.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    fontSize: 12, padding: '5px 10px', backgroundColor: 'white', borderRadius: 6,
                  }}>
                    <span>{t.emoji} {t.nombre}</span>
                    <strong style={{ color: t.filas > 0 ? verde : '#94a3b8' }}>
                      {t.filas.toLocaleString('es-ES')}
                    </strong>
                  </div>
                ))}
              </div>
            </details>

            {resultado.errores.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 12px', backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: rojo, marginBottom: 4 }}>
                  No se pudieron leer {resultado.errores.length} tabla(s):
                </div>
                {resultado.errores.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#7f1d1d' }}>
                    · {e.tabla}: {e.mensaje}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CÓMO RESTAURAR */}
        <div style={{ marginTop: 24, padding: '14px 18px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>
            Si alguna vez hay que restaurar
          </div>
          <div style={{ fontSize: 12, color: '#1e3a8a', lineHeight: 1.55 }}>
            El archivo es un JSON legible con todos los registros. Restaurarlo requiere ayuda técnica:
            hay que volcarlo a las tablas de Supabase respetando las relaciones entre ellas.
            No es algo que se pueda hacer desde el portal, pero teniendo el archivo la recuperación
            siempre es posible.
          </div>
        </div>

      </div>
    </div>
  );
}
