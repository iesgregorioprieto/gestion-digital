'use client';

/**
 * CONFLICTOS DE NOMBRES
 *
 * El horario viene de Delphos, con el nombre que escribe la
 * Administración. La ficha la rellena cada profesor al registrarse. Nadie
 * obliga a que coincidan, y cuando no coinciden ese profesor no existe
 * para el motor de guardias: no se le generan guardias ni se le puede
 * asignar como sustituto.
 *
 * Antes eso pasaba en silencio y solo se descubría cuando alguien
 * echaba en falta a un compañero en el cuadrante. Aquí se ve, y se
 * resuelve confirmando a mano quién es quién.
 */

import { useState, useEffect } from 'react';

const VERDE = '#166534';
const AMBAR = '#92400e';
const ROJO  = '#991b1b';
const AZUL  = '#1e3a5f';

export default function PanelConflictos() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState(null);
  const [trabajando, setTrabajando] = useState(null);
  const [verResueltos, setVerResueltos] = useState(false);
  const [eleccion, setEleccion] = useState({});

  useEffect(() => { cargar(); }, []);

  async function cargar() {
    setCargando(true);
    try {
      const r = await fetch('/api/equivalencias');
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setDatos(d);
    } catch (e) {
      aviso(e.message || 'No se han podido cruzar las listas', 'error');
    }
    setCargando(false);
  }

  function aviso(texto, tipo = 'ok') {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 5000);
  }

  async function confirmar(nombreHorario, profesorId) {
    if (!profesorId) return aviso('Elige a quién corresponde', 'error');
    setTrabajando(nombreHorario);
    try {
      const r = await fetch('/api/equivalencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'confirmar', nombre_horario: nombreHorario, profesor_id: profesorId }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      aviso('Confirmado. El motor de guardias ya lo reconoce.');
      cargar();
    } catch (e) {
      aviso(e.message || 'No se ha podido confirmar', 'error');
    }
    setTrabajando(null);
  }

  async function deshacer(nombreHorario) {
    setTrabajando(nombreHorario);
    try {
      await fetch('/api/equivalencias', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'deshacer', nombre_horario: nombreHorario }),
      });
      aviso('Confirmación deshecha');
      cargar();
    } catch (e) {
      aviso('No se ha podido deshacer', 'error');
    }
    setTrabajando(null);
  }

  const caja = {
    backgroundColor: 'white', borderRadius: 11, padding: 15,
    border: '1px solid #e5e7eb', marginBottom: 10,
  };

  const selector = (nombre, porDefecto = '') => (
    <select
      value={eleccion[nombre] ?? porDefecto}
      onChange={e => setEleccion(prev => ({ ...prev, [nombre]: e.target.value }))}
      style={{ padding: '8px 11px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13, minWidth: 250 }}>
      <option value="">— Elige a quién corresponde —</option>
      {(datos?.profesores || []).map(p => (
        <option key={p.id} value={p.id}>
          {p.apellidos}, {p.nombre}{p.departamento ? ` · ${p.departamento}` : ''}
        </option>
      ))}
    </select>
  );

  const cuenta = x => {
    const t = [];
    if (x.clases) t.push(`${x.clases} clase${x.clases !== 1 ? 's' : ''}`);
    if (x.guardias) t.push(`${x.guardias} guardia${x.guardias !== 1 ? 's' : ''}`);
    return t.join(' · ');
  };

  if (cargando) return <div style={{ color: '#888', fontSize: 13, padding: 20 }}>Cruzando las listas…</div>;
  if (!datos) return <div style={{ color: '#888', fontSize: 13, padding: 20 }}>No se han podido cargar los datos.</div>;

  const { resueltos = [], dudosos = [], sinCasar = [] } = datos;
  const pendientes = dudosos.length + sinCasar.length;

  return (
    <div>
      <p style={{ fontSize: 13, color: '#666', margin: '0 0 16px', lineHeight: 1.6 }}>
        Cruza los nombres del horario importado con las fichas del profesorado.
        Si un nombre no se reconoce, ese profesor no existe para el módulo de
        guardias: no se le generan guardias ni puede cubrir a nadie.
      </p>

      {mensaje && (
        <div style={{
          padding: '11px 15px', borderRadius: 9, marginBottom: 14, fontSize: 13.5, fontWeight: 600,
          backgroundColor: mensaje.tipo === 'ok' ? '#f0fdf4' : '#fef2f2',
          border: `1.5px solid ${mensaje.tipo === 'ok' ? '#bbf7d0' : '#fecaca'}`,
          color: mensaje.tipo === 'ok' ? VERDE : ROJO,
        }}>{mensaje.texto}</div>
      )}

      {/* Resumen */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 130, padding: 14, borderRadius: 11, textAlign: 'center',
          backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: VERDE }}>{resueltos.length}</div>
          <div style={{ fontSize: 12, color: VERDE, fontWeight: 600 }}>reconocidos</div>
        </div>
        <div style={{ flex: 1, minWidth: 130, padding: 14, borderRadius: 11, textAlign: 'center',
          backgroundColor: dudosos.length ? '#fffbeb' : '#fafafa',
          border: `1.5px solid ${dudosos.length ? '#fcd34d' : '#eee'}` }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: dudosos.length ? AMBAR : '#bbb' }}>{dudosos.length}</div>
          <div style={{ fontSize: 12, color: dudosos.length ? AMBAR : '#bbb', fontWeight: 600 }}>por confirmar</div>
        </div>
        <div style={{ flex: 1, minWidth: 130, padding: 14, borderRadius: 11, textAlign: 'center',
          backgroundColor: sinCasar.length ? '#fef2f2' : '#fafafa',
          border: `1.5px solid ${sinCasar.length ? '#fecaca' : '#eee'}` }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: sinCasar.length ? ROJO : '#bbb' }}>{sinCasar.length}</div>
          <div style={{ fontSize: 12, color: sinCasar.length ? ROJO : '#bbb', fontWeight: 600 }}>sin reconocer</div>
        </div>
      </div>

      {pendientes === 0 && (
        <div style={{ ...caja, backgroundColor: '#f0fdf4', border: '1.5px solid #bbf7d0',
          textAlign: 'center', color: VERDE, fontWeight: 700, padding: 26 }}>
          ✅ Todos los nombres del horario se reconocen
        </div>
      )}

      {/* Se parecen: proponemos */}
      {dudosos.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: AMBAR, margin: '18px 0 10px' }}>
            Por confirmar ({dudosos.length})
          </h3>
          {dudosos.map(d => (
            <div key={d.nombre} style={{ ...caja, borderLeft: `4px solid #fcd34d` }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: AZUL }}>{d.nombre}</div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 9 }}>en el horario · {cuenta(d)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#475569' }}>¿Es</span>
                <strong style={{ fontSize: 13.5, color: AZUL }}>
                  {d.propuesta.apellidos}, {d.propuesta.nombre}
                </strong>
                <span style={{ fontSize: 13, color: '#475569' }}>?</span>
                <button onClick={() => confirmar(d.nombre, d.propuesta.id)} disabled={trabajando === d.nombre}
                  style={{ padding: '7px 15px', borderRadius: 8, border: 'none', backgroundColor: VERDE,
                    color: 'white', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
                  Sí, es la misma persona
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>No, es otra:</span>
                {selector(d.nombre)}
                <button onClick={() => confirmar(d.nombre, eleccion[d.nombre])}
                  disabled={!eleccion[d.nombre] || trabajando === d.nombre}
                  style={{ padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${AZUL}`,
                    backgroundColor: 'white', color: AZUL, fontWeight: 700, fontSize: 12.5,
                    cursor: eleccion[d.nombre] ? 'pointer' : 'default', opacity: eleccion[d.nombre] ? 1 : 0.5 }}>
                  Confirmar
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Sin candidato */}
      {sinCasar.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: ROJO, margin: '22px 0 10px' }}>
            Sin reconocer ({sinCasar.length})
          </h3>
          {sinCasar.map(x => (
            <div key={x.nombre} style={{ ...caja, borderLeft: `4px solid #fca5a5` }}>
              <div style={{ fontWeight: 700, fontSize: 14.5, color: AZUL }}>{x.nombre}</div>
              <div style={{ fontSize: 11.5, color: '#94a3b8', marginBottom: 10 }}>en el horario · {cuenta(x)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {selector(x.nombre)}
                <button onClick={() => confirmar(x.nombre, eleccion[x.nombre])}
                  disabled={!eleccion[x.nombre] || trabajando === x.nombre}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none',
                    backgroundColor: eleccion[x.nombre] ? VERDE : '#e2e8f0',
                    color: eleccion[x.nombre] ? 'white' : '#94a3b8',
                    fontWeight: 700, fontSize: 12.5, cursor: eleccion[x.nombre] ? 'pointer' : 'default' }}>
                  Confirmar
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Ya resueltos */}
      {resueltos.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button onClick={() => setVerResueltos(v => !v)}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', padding: 0 }}>
            {verResueltos ? '▼' : '▶'} Ver los {resueltos.length} reconocidos
          </button>
          {verResueltos && (
            <div style={{ marginTop: 10 }}>
              {resueltos.map(r => (
                <div key={r.nombre} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  fontSize: 12.5, borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap',
                }}>
                  <span style={{ color: '#64748b', minWidth: 200 }}>{r.nombre}</span>
                  <span style={{ color: '#94a3b8' }}>→</span>
                  <strong style={{ color: AZUL }}>
                    {r.profesor ? `${r.profesor.apellidos}, ${r.profesor.nombre}` : '—'}
                  </strong>
                  {r.via === 'confirmado' && (
                    <>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: VERDE,
                        backgroundColor: '#f0fdf4', padding: '2px 7px', borderRadius: 10 }}>
                        confirmado a mano
                      </span>
                      <button onClick={() => deshacer(r.nombre)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8',
                          fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>
                        deshacer
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
