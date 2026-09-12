'use client';

/**
 * BAJAS Y SUSTITUCIONES
 *
 * Antes esto vivía dentro de la ficha de cada profesor, y obligaba a
 * jefatura a acordarse de a quién abrir para enterarse de algo que quiere
 * ver de un vistazo: quién falta hoy y quién le está cubriendo.
 *
 * Una baja no es una propiedad de la ficha: es un suceso con fechas.
 * Empieza, a veces llega un sustituto, y termina. Por eso tiene pantalla
 * propia, y es el único sitio desde el que se toca.
 *
 * Cada baja mueve dos cosas a la vez, y las dos se hacen aquí para que no
 * se queden descuadradas:
 *   - la ficha del profesor (en_baja, tipo_baja, sustituto)
 *   - una ausencia abierta, que es lo que hace salir a sus grupos en el
 *     cuadrante de guardias
 */

import { useState, useEffect } from 'react';
import { consulta } from '@/lib/consulta';
import { getCursoActual } from '@/lib/curso';

const azul = '#1a56db';

// Buscar sin que las tildes importen: "cardenas" tiene que encontrar
// a "Cárdenas". Comparar letra a letra dejaba fuera justo los nombres
// que es más probable que alguien escriba rápido, sin tildes.
function sinTildes(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function diasDesde(fecha) {
  if (!fecha) return 0;
  const ini = new Date(fecha + 'T12:00:00');
  return Math.max(0, Math.round((Date.now() - ini.getTime()) / 86400000));
}

function fechaLarga(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function PanelBajas() {

  const [cargando, setCargando] = useState(true);
  const [profesores, setProfesores] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  // Alta de baja
  const [abriendo, setAbriendo] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(null);
  const [fechaInicio, setFechaInicio] = useState(hoyISO());

  // Asignación de sustituto
  const [asignandoA, setAsignandoA] = useState(null);
  const [busquedaSust, setBusquedaSust] = useState('');
  const [fechaIncorporacion, setFechaIncorporacion] = useState(hoyISO());

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    // 'profesores_gestion' y no 'profesores': la lista de columnas
    // permitidas para 'profesores' no incluye fecha_baja, así que pedirla
    // ahí rechazaba la consulta entera en silencio y dejaba esta pantalla
    // sin nadie que buscar. 'profesores_gestion' es la misma tabla, con
    // más columnas, solo para equipo directivo — que es justo quien usa
    // esta pantalla.
    const { data, error } = await consulta('profesores_gestion')
      .select('id,nombre,apellidos,email,departamento,estado,en_baja,tipo_baja,fecha_baja,sustituto_id,titular_id');
    if (error) console.error('cargar profesores (bajas):', error.message);
    setProfesores(data || []);
    setCargando(false);
  }

  function aviso(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  const deBaja = profesores
    .filter(p => p.en_baja)
    .sort((a, b) => (a.fecha_baja || '').localeCompare(b.fecha_baja || ''));

  const disponibles = profesores.filter(p =>
    !p.en_baja && p.estado === 'activo' && !p.titular_id);

  // ─── Acciones ───

  async function registrarBaja() {
    if (!elegido || !fechaInicio) return;
    setTrabajando(true);
    try {
      await fetch('/api/profesores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'baja', id: elegido.id,
          datos: { en_baja: true, tipo_baja: 'temporal', fecha_baja: fechaInicio },
        }),
      });

      // Ausencia abierta: es lo que hace que sus grupos salgan en el
      // cuadrante de guardias mientras no haya sustituto.
      await fetch('/api/ausencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'crear',
          datos: {
            profesor_id: elegido.id,
            profesor_nombre: `${elegido.nombre} ${elegido.apellidos}`,
            departamento: elegido.departamento || null,
            fecha_inicio: fechaInicio,
            fecha_fin: null,
            horas: null,
            categoria: 'baja_sin_sustituto',
            estado: 'aprobada',
          },
        }),
      });

      aviso(`Baja registrada. Sus grupos ya salen en el cuadrante de guardias.`);
      setAbriendo(false); setElegido(null); setBusqueda(''); setFechaInicio(hoyISO());
      cargar();
    } catch (e) {
      aviso('No se ha podido registrar: ' + e.message, 'error');
    }
    setTrabajando(false);
  }

  async function asignarSustituto(titular, sustituto) {
    if (!confirm(
      `¿Asignar a ${sustituto.nombre} ${sustituto.apellidos} como sustituto de ` +
      `${titular.nombre} ${titular.apellidos}?\n\n` +
      `Se le copiará el horario completo del titular y se incorporará el ` +
      `${fechaLarga(fechaIncorporacion)}.\n\n` +
      `Las guardias de sus grupos se mantienen hasta el día anterior.`
    )) return;

    setTrabajando(true);
    try {
      // 1. Enlazar titular y sustituto
      await fetch('/api/profesores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'baja', id: titular.id,
          datos: { sustituto_id: sustituto.id, tipo_baja: 'con_sustituto' } }),
      });
      await fetch('/api/profesores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'baja', id: sustituto.id,
          datos: { titular_id: titular.id } }),
      });

      // 2. Copiar el horario. Lo hace el servidor, que identifica al
      //    titular por su ficha en vez de por un parecido en el apellido.
      const r = await fetch('/api/horarios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'copiar_horario',
          titular_id: titular.id, sustituto_id: sustituto.id }),
      });
      const copia = await r.json();
      if (copia.error) throw new Error(copia.error);

      // 3. Cerrar la ausencia abierta el día ANTES de la incorporación:
      //    hasta entonces siguen cubriendo los de guardia.
      const vispera = new Date(fechaIncorporacion + 'T12:00:00');
      vispera.setDate(vispera.getDate() - 1);
      await fetch('/api/ausencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cerrar_baja',
          datos: { profesor_id: titular.id, fecha_fin: vispera.toISOString().slice(0, 10) } }),
      });

      aviso(`Sustituto asignado. Horario copiado (${copia.copiados || 0} registros).`);
      setAsignandoA(null); setBusquedaSust(''); setFechaIncorporacion(hoyISO());
      cargar();
    } catch (e) {
      aviso('No se ha podido asignar: ' + e.message, 'error');
    }
    setTrabajando(false);
  }

  async function darDeAlta(titular) {
    const sustituto = titular.sustituto_id
      ? profesores.find(p => p.id === titular.sustituto_id) : null;

    if (!confirm(
      `¿${titular.nombre} ${titular.apellidos} se incorpora?\n\n` +
      (sustituto
        ? `${sustituto.nombre} ${sustituto.apellidos} perderá el horario copiado y quedará desactivado.`
        : `Sus grupos dejarán de salir en el cuadrante de guardias.`)
    )) return;

    setTrabajando(true);
    try {
      if (sustituto) {
        await fetch('/api/horarios', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'borrar_de_profesor', profesor_id: sustituto.id }),
        });
        await fetch('/api/profesores', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'baja', id: sustituto.id,
            datos: { titular_id: null, estado: 'inactivo' } }),
        });
      }

      await fetch('/api/profesores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'baja', id: titular.id,
          datos: { en_baja: false, tipo_baja: null, fecha_baja: null, sustituto_id: null } }),
      });

      // Cierra la ausencia abierta si quedaba alguna, y con ella se van
      // las guardias pendientes que ya no hacen falta.
      await fetch('/api/ausencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'cerrar_baja',
          datos: { profesor_id: titular.id, fecha_fin: hoyISO() } }),
      });

      aviso('Titular incorporado.');
      cargar();
    } catch (e) {
      aviso('No se ha podido dar de alta: ' + e.message, 'error');
    }
    setTrabajando(false);
  }

  // ─── Pantalla ───

  const caja = {
    backgroundColor: 'white', borderRadius: 12, padding: 16,
    border: '1px solid #e5e7eb', marginBottom: 12,
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 18px' }}>
        Mientras no hay sustituto, los grupos del profesor de baja salen en el
        cuadrante de guardias y los cubren los compañeros por rotación.
      </p>

      {mensaje && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'error' ? '#fef2f2' : '#d1fae5',
          color: mensaje.tipo === 'error' ? '#b91c1c' : '#065f46',
        }}>{mensaje.texto}</div>
      )}

      {!abriendo && (
        <button onClick={() => setAbriendo(true)}
          style={{ padding: '11px 18px', borderRadius: 9, border: 'none', backgroundColor: azul,
                   color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 18 }}>
          + Registrar baja
        </button>
      )}

      {/* ─── Alta de una baja ─── */}
      {abriendo && (
        <div style={{ ...caja, border: `2px solid ${azul}` }}>
          <div style={{ fontWeight: 800, color: azul, marginBottom: 12 }}>Registrar una baja</div>

          {!elegido ? (
            <>
              <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Busca al profesor por nombre o apellidos"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }} />
              <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8 }}>
                {busqueda.length >= 2 && disponibles
                  .filter(p => sinTildes(`${p.nombre} ${p.apellidos}`).toLowerCase().includes(sinTildes(busqueda).toLowerCase()))
                  .slice(0, 12)
                  .map(p => (
                    <button key={p.id} onClick={() => setElegido(p)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                               border: '1px solid #eee', borderRadius: 8, backgroundColor: 'white',
                               cursor: 'pointer', marginBottom: 5, fontSize: 13 }}>
                      <strong>{p.apellidos}, {p.nombre}</strong>
                      <span style={{ color: '#888' }}> · {p.departamento || 'sin departamento'}</span>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                {elegido.apellidos}, {elegido.nombre}
                <button onClick={() => setElegido(null)}
                  style={{ marginLeft: 10, background: 'none', border: 'none', color: azul, cursor: 'pointer', fontSize: 12 }}>
                  cambiar
                </button>
              </div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 4 }}>
                Primer día de la baja
              </label>
              <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 14 }} />
              <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>
                Se registra sin sustituto. Cuando llegue, se le asigna desde esta
                misma pantalla y se le copia el horario.
              </div>
              <button onClick={registrarBaja} disabled={trabajando}
                style={{ padding: '11px 18px', borderRadius: 9, border: 'none', backgroundColor: '#b91c1c',
                         color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {trabajando ? 'Registrando…' : 'Registrar baja'}
              </button>
            </>
          )}

          <button onClick={() => { setAbriendo(false); setElegido(null); setBusqueda(''); }}
            style={{ marginLeft: 10, background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 }}>
            Cancelar
          </button>
        </div>
      )}

      {/* ─── Bajas activas ─── */}
      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#444', margin: '22px 0 10px' }}>
        Bajas activas {deBaja.length > 0 && <span style={{ color: '#888', fontWeight: 600 }}>({deBaja.length})</span>}
      </h2>

      {cargando && <div style={{ color: '#888', fontSize: 13 }}>Cargando…</div>}

      {!cargando && deBaja.length === 0 && (
        <div style={{ ...caja, color: '#888', fontSize: 13, textAlign: 'center' }}>
          No hay ninguna baja activa.
        </div>
      )}

      {deBaja.map(p => {
        const sustituto = p.sustituto_id ? profesores.find(x => x.id === p.sustituto_id) : null;
        const dias = diasDesde(p.fecha_baja);
        const largaSinSustituto = !sustituto && dias >= 10;

        return (
          <div key={p.id} style={{ ...caja, borderLeft: `4px solid ${sustituto ? '#059669' : '#f59e0b'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{p.apellidos}, {p.nombre}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                  {p.departamento || 'sin departamento'} · desde el {fechaLarga(p.fecha_baja)}
                  {dias > 0 && ` · ${dias} día${dias !== 1 ? 's' : ''}`}
                </div>
                <div style={{ fontSize: 13, marginTop: 6, fontWeight: 600,
                              color: sustituto ? '#065f46' : '#92400e' }}>
                  {sustituto
                    ? `Sustituido por ${sustituto.nombre} ${sustituto.apellidos}`
                    : 'Sin sustituto — sus grupos los cubren los de guardia'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!sustituto && (
                  <button onClick={() => { setAsignandoA(p.id); setBusquedaSust(''); }}
                    disabled={trabajando}
                    style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${azul}`,
                             backgroundColor: 'white', color: azul, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Asignar sustituto
                  </button>
                )}
                <button onClick={() => darDeAlta(p)} disabled={trabajando}
                  style={{ padding: '8px 14px', borderRadius: 8, border: 'none',
                           backgroundColor: '#059669', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                  Se incorpora
                </button>
              </div>
            </div>

            {largaSinSustituto && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                            backgroundColor: '#fffbeb', border: '1px solid #fde68a',
                            fontSize: 12, color: '#92400e', fontWeight: 600 }}>
                Lleva {dias} días cubierta con guardias de los compañeros.
              </div>
            )}

            {/* Asignar sustituto */}
            {asignandoA === p.id && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee' }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#555', display: 'block', marginBottom: 4 }}>
                  Fecha de incorporación del sustituto
                </label>
                <input type="date" value={fechaIncorporacion} onChange={e => setFechaIncorporacion(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, marginBottom: 10 }} />
                <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
                  Hasta el día anterior siguen cubriendo los compañeros de guardia.
                </div>

                <input value={busquedaSust} onChange={e => setBusquedaSust(e.target.value)}
                  placeholder="Busca al sustituto (debe estar registrado en la aplicación)"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14 }} />

                <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 8 }}>
                  {busquedaSust.length >= 2 && disponibles
                    .filter(x => x.id !== p.id &&
                      sinTildes(`${x.nombre} ${x.apellidos} ${x.email || ''}`).toLowerCase().includes(sinTildes(busquedaSust).toLowerCase()))
                    .slice(0, 10)
                    .map(x => (
                      <button key={x.id} onClick={() => asignarSustituto(p, x)} disabled={trabajando}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                                 border: '1px solid #eee', borderRadius: 8, backgroundColor: 'white',
                                 cursor: 'pointer', marginBottom: 5, fontSize: 13 }}>
                        <strong>{x.apellidos}, {x.nombre}</strong>
                        <span style={{ color: '#888' }}> · {x.email}</span>
                      </button>
                    ))}
                  {busquedaSust.length >= 2 && disponibles.filter(x => x.id !== p.id &&
                    sinTildes(`${x.nombre} ${x.apellidos} ${x.email || ''}`).toLowerCase().includes(sinTildes(busquedaSust).toLowerCase())).length === 0 && (
                    <div style={{ fontSize: 12, color: '#92400e', padding: '8px 0' }}>
                      No aparece nadie con ese nombre. El sustituto tiene que registrarse
                      antes en la aplicación para poder asignarlo.
                    </div>
                  )}
                </div>

                <button onClick={() => setAsignandoA(null)}
                  style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13, marginTop: 6 }}>
                  Cancelar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
