'use client';
export const dynamic = 'force-dynamic';

/**
 * INFORME DE GUARDIAS
 *
 * Consulta de un día, una semana o un mes: quién faltó, quién lo cubrió
 * y si esa persona confirmó la guardia. Descargable en CSV para hacer
 * cuentas y en PDF para archivar o enviar.
 *
 * Sin el motivo de las ausencias, que ya queda en el registro de la
 * propia ausencia y aquí no hace falta.
 */

import { useState, useEffect } from 'react';
import { hoyLocal } from '@/lib/fechas';

const azul = '#1e3a5f';
const verde = '#166534';

function primerDiaSemana(f) {
  const d = new Date(f + 'T12:00:00');
  const dia = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dia);
  return d.toISOString().slice(0, 10);
}
function ultimoDiaSemana(f) {
  const d = new Date(primerDiaSemana(f) + 'T12:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
function primerDiaMes(f) { return f.slice(0, 8) + '01'; }
function ultimoDiaMes(f) {
  const d = new Date(f + 'T12:00:00');
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function fechaLarga(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fechaCorta(f) {
  if (!f) return '';
  return new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

export default function InformeGuardias() {
  const [periodo, setPeriodo] = useState('dia');
  const [referencia, setReferencia] = useState(hoyLocal());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [usuario, setUsuario] = useState('');

  useEffect(() => {
    if (!sessionStorage.getItem('profesor_id')) { window.location.href = '/login'; return; }
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
  }, []);

  const desde = periodo === 'dia' ? referencia
              : periodo === 'semana' ? primerDiaSemana(referencia)
              : primerDiaMes(referencia);
  const hasta = periodo === 'dia' ? referencia
              : periodo === 'semana' ? ultimoDiaSemana(referencia)
              : ultimoDiaMes(referencia);

  useEffect(() => { cargar(); }, [periodo, referencia]);

  async function cargar() {
    setCargando(true);
    setError('');
    try {
      const r = await fetch(`/api/guardias/informe?desde=${desde}&hasta=${hasta}`);
      const d = await r.json();
      if (!r.ok) {
        setError(d.error === 'sin_permisos'
          ? 'Este informe es solo para el equipo directivo.'
          : 'No se ha podido cargar el informe.');
        setDatos(null);
      } else {
        setDatos(d);
      }
    } catch (e) {
      setError('No se ha podido cargar el informe.');
      setDatos(null);
    }
    setCargando(false);
  }

  function descargarCSV() {
    if (!datos?.filas?.length) return;
    const cab = ['Fecha', 'Hora', 'Profesor ausente', 'Departamento', 'Cubre', 'Departamento', 'Grupo', 'Aula', 'Materia', 'Confirmada'];
    const escapar = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [cab.map(escapar).join(';')];
    datos.filas.forEach(f => {
      lineas.push([
        f.fecha, f.horaTexto, f.ausente, f.departamentoAusente,
        f.cubre, f.departamentoCubre, f.grupo, f.aula, f.materia,
        f.confirmada ? 'Sí' : 'No',
      ].map(escapar).join(';'));
    });
    // BOM para que Excel respete los acentos
    const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `guardias_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function descargarPDF() {
    if (!datos?.filas?.length) return;
    const e = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const titulo = periodo === 'dia'
      ? fechaLarga(desde)
      : `Del ${fechaLarga(desde)} al ${fechaLarga(hasta)}`;

    const filasHtml = datos.filas.map(f => `
      <tr>
        <td>${e(fechaCorta(f.fecha))}</td>
        <td>${e(f.horaTexto)}</td>
        <td><strong>${e(f.ausente)}</strong></td>
        <td>${e(f.cubre)}</td>
        <td>${e(f.grupo)}</td>
        <td>${e(f.aula)}</td>
        <td style="text-align:center">${f.confirmada ? 'Sí' : '—'}</td>
      </tr>`).join('');

    const recuentoHtml = datos.porProfesor.map(p => `
      <tr>
        <td>${e(p.nombre)}</td>
        <td>${e(p.departamento)}</td>
        <td style="text-align:center">${p.total}</td>
        <td style="text-align:center">${p.confirmadas}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Informe de guardias</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 28px; }
  h1 { font-size: 17px; color: #1e3a5f; margin: 0 0 3px; }
  h2 { font-size: 13px; color: #1e3a5f; margin: 22px 0 7px; border-bottom: 1.5px solid #1e3a5f; padding-bottom: 3px; }
  .sub { color: #666; margin-bottom: 14px; font-size: 12px; }
  .resumen { background: #f1f5f9; padding: 9px 13px; border-radius: 6px; margin-bottom: 16px; }
  .resumen span { margin-right: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #1e3a5f; color: white; padding: 6px; text-align: left; font-size: 10px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f8fafc; }
  .pie { margin-top: 26px; padding-top: 9px; border-top: 1px solid #ccc; color: #888; font-size: 10px; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>Informe de guardias</h1>
  <div class="sub">IES Gregorio Prieto · ${e(titulo)}</div>

  <div class="resumen">
    <span><strong>${datos.resumen.guardias}</strong> guardias</span>
    <span><strong>${datos.resumen.confirmadas}</strong> confirmadas</span>
    <span><strong>${datos.resumen.sinConfirmar}</strong> sin confirmar</span>
    <span><strong>${datos.resumen.dias}</strong> días con guardias</span>
  </div>

  <h2>Detalle</h2>
  <table>
    <tr><th>Fecha</th><th>Hora</th><th>Profesor/a ausente</th><th>Cubre</th><th>Grupo</th><th>Aula</th><th>Conf.</th></tr>
    ${filasHtml}
  </table>

  <h2>Guardias por profesor</h2>
  <table>
    <tr><th>Profesor/a</th><th>Departamento</th><th>Guardias</th><th>Confirmadas</th></tr>
    ${recuentoHtml}
  </table>

  <div class="pie">
    Generado el ${e(new Date().toLocaleString('es-ES'))} por ${e(usuario)} · APrieto, portal de gestión del IES Gregorio Prieto
  </div>
</body></html>`;

    const v = window.open('', '_blank');
    if (!v) { alert('El navegador ha bloqueado la ventana. Permite las ventanas emergentes e inténtalo otra vez.'); return; }
    v.document.write(html);
    v.document.close();
    setTimeout(() => v.print(), 400);
  }

  const btn = (activo) => ({
    padding: '9px 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${activo ? azul : '#ddd'}`,
    backgroundColor: activo ? azul : 'white',
    color: activo ? 'white' : '#555',
  });

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: azul, color: 'white', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>📄 Informe de guardias</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{usuario}</div>
        </div>
        <a href="/gestion/guardias" style={{ color: 'white', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 13, textDecoration: 'none' }}>
          ← Cuadrante
        </a>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>

        {/* PERIODO */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setPeriodo('dia')} style={btn(periodo === 'dia')}>📅 Un día</button>
            <button onClick={() => setPeriodo('semana')} style={btn(periodo === 'semana')}>🗓️ Una semana</button>
            <button onClick={() => setPeriodo('mes')} style={btn(periodo === 'mes')}>📆 Un mes</button>
          </div>
          <input type="date" value={referencia} onChange={ev => setReferencia(ev.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 14, width: '100%', maxWidth: 240, boxSizing: 'border-box' }} />
          {periodo !== 'dia' && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: '#666' }}>
              Del <strong>{fechaLarga(desde)}</strong> al <strong>{fechaLarga(hasta)}</strong>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: 13, borderRadius: 9, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', fontSize: 13.5, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {cargando && <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>⏳ Cargando...</div>}

        {!cargando && datos && datos.filas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🛡️</div>
            No hay guardias registradas en este periodo.
          </div>
        )}

        {!cargando && datos && datos.filas.length > 0 && (
          <>
            {/* RESUMEN Y DESCARGAS */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 10, marginBottom: 14 }}>
                {[
                  { l: 'Guardias', v: datos.resumen.guardias, c: azul },
                  { l: 'Confirmadas', v: datos.resumen.confirmadas, c: verde },
                  { l: 'Sin confirmar', v: datos.resumen.sinConfirmar, c: '#b45309' },
                  { l: 'Días', v: datos.resumen.dias, c: '#475569' },
                ].map(s => (
                  <div key={s.l} style={{ textAlign: 'center', padding: 10, borderRadius: 9, backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 11.5, color: '#666' }}>{s.l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={descargarCSV} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: verde, color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                  📊 Descargar CSV
                </button>
                <button onClick={descargarPDF} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: '#991b1b', color: 'white', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                  📄 Descargar PDF
                </button>
              </div>
            </div>

            {/* DETALLE */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13.5, color: azul, borderBottom: '1px solid #e5e7eb' }}>
                Detalle
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                      {['Fecha', 'Hora', 'Ausente', 'Cubre', 'Grupo', 'Aula', ''].map(h => (
                        <th key={h} style={{ padding: '7px 9px', textAlign: 'left', fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.filas.map((f, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '7px 9px', whiteSpace: 'nowrap' }}>{fechaCorta(f.fecha)}</td>
                        <td style={{ padding: '7px 9px', whiteSpace: 'nowrap' }}>{f.horaTexto}</td>
                        <td style={{ padding: '7px 9px', fontWeight: 700 }}>{f.ausente}</td>
                        <td style={{ padding: '7px 9px' }}>{f.cubre}</td>
                        <td style={{ padding: '7px 9px' }}>{f.grupo}</td>
                        <td style={{ padding: '7px 9px' }}>{f.aula}</td>
                        <td style={{ padding: '7px 9px', textAlign: 'center' }}>
                          {f.confirmada
                            ? <span title="Confirmada">✅</span>
                            : <span title="Sin confirmar" style={{ opacity: 0.4 }}>⏳</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* REPARTO */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13.5, color: azul, borderBottom: '1px solid #e5e7eb' }}>
                Guardias por profesor
              </div>
              {datos.porProfesor.map((p, i) => (
                <div key={i} style={{ padding: '9px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{p.nombre}</div>
                    <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{p.departamento}</div>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#475569', whiteSpace: 'nowrap' }}>
                    <strong>{p.total}</strong> · {p.confirmadas} conf.
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
