'use client';
/**
 * Subir la hoja de servicios y tomar de ella la antigüedad en el cuerpo.
 * Se usa en Mis datos (el propio profesor) y en la ficha de secretaría
 * (con profesorId). El PDF se lee en el servidor y se descarta.
 */
import { useState } from 'react';

const PORTAL = 'https://portalpersonaldocente.jccm.es/misdatos/administrativosyformacion';
const azul = '#1e3a5f';

const fechaES = f => (f ? f.split('-').reverse().join('/') : '');
const tiempo = t => `${t.a} años, ${t.m} meses y ${t.d} días`;
const deDias = n => ({ a: Math.floor(n / 360), m: Math.floor((n % 360) / 30), d: n % 30 });
const trozo = t => `${t.a} a · ${t.m} m · ${t.d} d`;

export default function HojaServicios({ profesorId = null, ficha = {}, onGuardado }) {
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [lectura, setLectura] = useState(null);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [verComo, setVerComo] = useState(false);

  const origen = ficha.servicios_origen;

  async function leer() {
    setError(''); setHecho(''); setLectura(null);
    if (!archivo) { setError('Elige primero el PDF de la hoja de servicios.'); return; }
    setLeyendo(true);
    try {
      const fd = new FormData();
      fd.append('hoja', archivo);
      if (profesorId) fd.append('profesor_id', profesorId);
      const r = await fetch('/api/hoja-servicios', { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido leer la hoja.');
      setLectura(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLeyendo(false);
    }
  }

  async function confirmar() {
    setGuardando(true); setError('');
    try {
      const r = await fetch('/api/hoja-servicios', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comprobante: lectura.comprobante }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido guardar.');
      setHecho(`Guardado: ${tiempo(lectura.total)} de servicio a ${fechaES(lectura.fecha)}.`);
      setLectura(null); setArchivo(null);
      onGuardado?.({ servicios_dias: lectura.dias, servicios_fecha: lectura.fecha, servicios_origen: 'hoja', anio_cuerpo: d.anio_cuerpo });
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '14px 16px', backgroundColor: '#f8fbff', marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: azul, marginBottom: 6 }}>📄 Antigüedad desde la hoja de servicios</div>

      {/* Estado actual */}
      {origen === 'hoja' && ficha.servicios_dias != null && (
        <div style={{ fontSize: 12.5, color: '#166534', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 11px', marginBottom: 10, lineHeight: 1.5 }}>
          ✅ Dato oficial: <strong>{tiempo(deDias(ficha.servicios_dias))}</strong> de servicio,
          según la hoja de servicios a {fechaES(ficha.servicios_fecha)}.
        </div>
      )}
      {origen === 'manual' && (
        <div style={{ fontSize: 12.5, color: '#92400e', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 11px', marginBottom: 10, lineHeight: 1.5 }}>
          ✏️ El año se cambió a mano después de subir la hoja. Sube una hoja nueva para que vuelva a ser el dato oficial.
        </div>
      )}
      {!origen && (
        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10, lineHeight: 1.5 }}>
          Aún no se ha subido. Con la hoja, la antigüedad deja de depender de lo que cada uno escriba
          y sale del registro oficial de la Junta.
        </div>
      )}

      {/* Dónde se descarga */}
      <button type="button" onClick={() => setVerComo(v => !v)} style={{ padding: 0, border: 'none', background: 'none', color: '#1e40af', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
        {verComo ? '▾' : '▸'} ¿Dónde consigo mi hoja de servicios?
      </button>
      {verComo && (
        <div style={{ fontSize: 12.5, color: '#1e3a5f', lineHeight: 1.65, backgroundColor: '#eff6ff', borderRadius: 8, padding: '10px 13px', marginBottom: 10 }}>
          <p style={{ margin: '0 0 6px' }}>
            Se descarga del <strong>Portal del Personal Docente</strong> de la Junta, en el apartado
            de datos administrativos y formación:
          </p>
          <a href={PORTAL} target="_blank" rel="noopener noreferrer" style={{ color: '#1e40af', fontWeight: 700, wordBreak: 'break-all' }}>{PORTAL}</a>
          <p style={{ margin: '8px 0 0' }}>
            Descárgala en PDF tal cual, sin escanear ni fotografiar: el portal lee el documento
            original. Cuenta <strong>todo tu servicio docente</strong> (de carrera, como interino y en
            prácticas), igual que para trienios y sexenios.
          </p>
        </div>
      )}

      {/* Subida */}
      {!lectura && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="file" accept="application/pdf,.pdf"
            onChange={e => { setArchivo(e.target.files?.[0] || null); setError(''); setHecho(''); }}
            style={{ fontSize: 12.5, flex: '1 1 220px' }} />
          <button type="button" onClick={leer} disabled={leyendo} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: azul, color: 'white',
            fontSize: 13, fontWeight: 700, cursor: leyendo ? 'wait' : 'pointer', opacity: leyendo ? 0.7 : 1,
          }}>{leyendo ? 'Leyendo…' : 'Leer hoja'}</button>
        </div>
      )}

      {/* Lo leído, para confirmar */}
      {lectura && (
        <div style={{ backgroundColor: 'white', border: '1px solid #cbd5e1', borderRadius: 9, padding: '11px 13px' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: azul, marginBottom: 8 }}>Esto es lo que dice la hoja</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '4px 6px' }}>Bloque</th>
                  <th style={{ padding: '4px 6px' }}>Carrera</th>
                  <th style={{ padding: '4px 6px' }}>Interino / prácticas</th>
                  <th style={{ padding: '4px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lectura.bloques.map((b, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #e2e8f0', color: b.cuenta ? '#0f172a' : '#94a3b8' }}>
                    <td style={{ padding: '5px 6px' }}>{b.cabecera.replace(/^Hoja de servicios /i, '')}</td>
                    <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{trozo(b.carrera)}</td>
                    <td style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>{trozo(b.interino)}</td>
                    <td style={{ padding: '5px 6px', whiteSpace: 'nowrap', fontWeight: 700 }}>{b.cuenta ? 'Cuenta' : 'No cuenta*'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lectura.bloques.some(b => !b.cuenta) && (
            <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 6 }}>
              * El tiempo como cargo directivo ya está contado en el bloque de funcionario: sumarlo sería contarlo dos veces.
            </div>
          )}
          <div style={{ fontSize: 14, color: azul, margin: '10px 0', lineHeight: 1.5 }}>
            Total de servicio docente: <strong>{tiempo(lectura.total)}</strong>, a {fechaES(lectura.fecha)}.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={confirmar} disabled={guardando} style={{
              padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#15803d', color: 'white',
              fontSize: 13, fontWeight: 700, cursor: guardando ? 'wait' : 'pointer',
            }}>{guardando ? 'Guardando…' : 'Es correcto, guardar'}</button>
            <button type="button" onClick={() => { setLectura(null); setArchivo(null); }} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', backgroundColor: 'white',
              color: '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {error && <div style={{ marginTop: 9, fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>❌ {error}</div>}
      {hecho && <div style={{ marginTop: 9, fontSize: 12.5, color: '#15803d', fontWeight: 700 }}>✅ {hecho}</div>}

      <div style={{ marginTop: 9, fontSize: 11, color: '#94a3b8' }}>
        🔒 El PDF no se guarda: se lee, se toma el tiempo de servicio y se descarta.
      </div>
    </div>
  );
}
