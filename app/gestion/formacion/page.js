'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { hoyLocal } from '@/lib/fechas';
import CambiarEstadoFormacion from '@/components/CambiarEstadoFormacion';

/**
 * GESTIÓN · FORMACIÓN — registro e informes
 *
 * Para el equipo directivo. Resolver se hace en /formacion (pestaña
 * Dirección); aquí está el REGISTRO de todo lo pedido, con filtros por
 * fechas, profesor, departamento y estado, y los informes:
 *   · General (todo lo filtrado) en PDF y en CSV
 *   · Individual (un profesor) en PDF
 */

const MORADO = '#5b21b6';

const ESTADOS = {
  pendiente_jefe:     { label: 'Pendiente jefe dpto.',  corto: 'Pte. jefe',      color: '#78350f', bg: '#fffbeb' },
  pendiente_director: { label: 'Pendiente dirección',   corto: 'Pte. dirección', color: '#1e40af', bg: '#eff6ff' },
  autorizada:         { label: 'Autorizada',            corto: 'Autorizada',     color: '#166534', bg: '#f0fdf4' },
  denegada_jefe:      { label: 'Denegada por jefe',     corto: 'Deneg. jefe',    color: '#991b1b', bg: '#fef2f2' },
  denegada_director:  { label: 'Denegada por dirección', corto: 'Deneg. dir.',   color: '#991b1b', bg: '#fef2f2' },
  retirada:           { label: 'Retirada',              corto: 'Retirada',       color: '#4b5563', bg: '#f3f4f6' },
};
const MODALIDAD = { presencial: 'Presencial', online: 'Online', mixta: 'Mixta' };

function inicioCurso() {
  const h = hoyLocal();
  const [a, m] = h.split('-').map(Number);
  return m >= 9 ? `${a}-09-01` : `${a - 1}-09-01`;
}
function finCurso() {
  const [a] = inicioCurso().split('-').map(Number);
  return `${a + 1}-08-31`;
}
function fCorta(f) {
  return f ? new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}
function fLarga(f) {
  return f ? new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
}
function dias(s) {
  const a = new Date(s.fecha_inicio + 'T12:00:00'), b = new Date((s.fecha_fin || s.fecha_inicio) + 'T12:00:00');
  return Math.round((b - a) / 86400000) + 1;
}
function horasTotales(s) {
  if (!s.hora_inicio || !s.hora_fin) return null;
  const [h1, m1] = String(s.hora_inicio).split(':').map(Number);
  const [h2, m2] = String(s.hora_fin).split(':').map(Number);
  const porDia = ((h2 * 60 + m2) - (h1 * 60 + m1)) / 60;
  return porDia > 0 ? Math.round(porDia * dias(s) * 10) / 10 : null;
}
const hhmm = h => h ? String(h).slice(0, 5) : '';
const fechasTxt = s => s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? `${fCorta(s.fecha_inicio)} – ${fCorta(s.fecha_fin)}` : fCorta(s.fecha_inicio);
const horarioTxt = s => s.hora_inicio ? `${hhmm(s.hora_inicio)}${s.hora_fin ? '–' + hhmm(s.hora_fin) : ''}` : '';
function decisionJefe(s) {
  return {
    aprobada: `Aprobada (${s.jefe_nombre || 'jefe'})`,
    denegada: `Denegada (${s.jefe_nombre || 'jefe'})`,
    escalada: 'Sin respuesta en plazo',
    no_aplica: 'No pasa por jefe',
  }[s.jefe_decision] || (s.estado === 'pendiente_jefe' ? 'Pendiente' : '—');
}

export default function GestionFormacion() {
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [todas, setTodas]       = useState([]);
  const [usuario, setUsuario]   = useState('');
  const [soyDirector, setSoyDirector] = useState(false);
  const [aviso, setAviso] = useState('');

  const [desde, setDesde]       = useState(inicioCurso());
  const [hasta, setHasta]       = useState(finCurso());
  const [profesor, setProfesor] = useState('');
  const [dpto, setDpto]         = useState('');
  const [estado, setEstado]     = useState('');

  async function cargar() {
    try {
      const r = await fetch('/api/formacion?vista=direccion');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se ha podido cargar');
      setTodas(d.solicitudes || []);
      setSoyDirector(!!d.soyDirector);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    setUsuario(sessionStorage.getItem('profesor_nombre') || '');
    cargar();
  }, []);

  async function trasCambio(msg) {
    await cargar();
    setAviso(msg);
    setTimeout(() => setAviso(''), 7000);
  }

  const profesores = useMemo(() => {
    const m = new Map();
    todas.forEach(s => m.set(s.profesor_id, { id: s.profesor_id, nombre: s.profesor_nombre, departamento: s.departamento }));
    return [...m.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  }, [todas]);

  const departamentos = useMemo(() =>
    [...new Set(todas.map(s => s.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [todas]);

  // Una formación entra si se solapa con el periodo elegido
  const filtradas = useMemo(() => todas
    .filter(s => (!hasta || s.fecha_inicio <= hasta) && (!desde || (s.fecha_fin || s.fecha_inicio) >= desde))
    .filter(s => !profesor || s.profesor_id === profesor)
    .filter(s => !dpto || s.departamento === dpto)
    .filter(s => !estado || s.estado === estado)
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio) || (a.profesor_nombre || '').localeCompare(b.profesor_nombre || '', 'es')),
  [todas, desde, hasta, profesor, dpto, estado]);

  const resumen = useMemo(() => {
    const aut = filtradas.filter(s => s.estado === 'autorizada');
    return {
      total: filtradas.length,
      autorizadas: aut.length,
      pendientes: filtradas.filter(s => s.estado.startsWith('pendiente')).length,
      denegadas: filtradas.filter(s => s.estado.startsWith('denegada')).length,
      diasAut: aut.reduce((n, s) => n + dias(s), 0),
      sinAusencia: aut.filter(s => !s.ausencia_id && s.fecha_inicio <= hoyLocal()).length,
    };
  }, [filtradas]);

  const porProfesor = useMemo(() => {
    const m = new Map();
    filtradas.forEach(s => {
      const p = m.get(s.profesor_id) || { nombre: s.profesor_nombre, departamento: s.departamento, total: 0, autorizadas: 0, dias: 0, horas: 0 };
      p.total++;
      if (s.estado === 'autorizada') { p.autorizadas++; p.dias += dias(s); p.horas += horasTotales(s) || 0; }
      m.set(s.profesor_id, p);
    });
    return [...m.values()].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  }, [filtradas]);

  const profElegido = profesores.find(p => p.id === profesor);
  const periodoTxt = `Del ${fLarga(desde)} al ${fLarga(hasta)}`;
  const filtrosTxt = [
    dpto && `Departamento: ${dpto}`,
    estado && `Estado: ${ESTADOS[estado]?.label}`,
  ].filter(Boolean).join(' · ');

  // ── CSV ──
  function descargarCSV() {
    if (!filtradas.length) return;
    const cab = ['Profesor/a', 'Departamento', 'Curso o jornada', 'Organiza', 'Modalidad', 'Lugar',
      'Fecha inicio', 'Fecha fin', 'Días', 'Horario', 'Horas', 'Estado', 'Jefe de dpto.', 'Motivo jefe',
      'Fecha jefe', 'Dirección', 'Motivo dirección', 'Fecha dirección', 'Ausencia registrada', 'Solicitada el', 'Observaciones'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
    const lineas = [cab.map(esc).join(';')];
    filtradas.forEach(s => lineas.push([
      s.profesor_nombre, s.departamento, s.titulo, s.entidad, MODALIDAD[s.modalidad] || '', s.lugar,
      fCorta(s.fecha_inicio), fCorta(s.fecha_fin || s.fecha_inicio), dias(s), horarioTxt(s),
      (horasTotales(s) ?? '').toString().replace('.', ','),
      ESTADOS[s.estado]?.label || s.estado, decisionJefe(s), s.jefe_motivo,
      s.jefe_fecha ? new Date(s.jefe_fecha).toLocaleString('es-ES') : '',
      s.director_fecha ? `${s.estado === 'autorizada' ? 'Autorizada' : 'Denegada'} (${s.director_nombre || ''})` : '',
      s.director_motivo, s.director_fecha ? new Date(s.director_fecha).toLocaleString('es-ES') : '',
      s.estado === 'autorizada' ? (s.ausencia_id ? 'Sí' : 'No') : '',
      s.created_at ? new Date(s.created_at).toLocaleString('es-ES') : '', s.observaciones,
    ].map(esc).join(';')));
    const blob = new Blob(['\uFEFF' + lineas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const quien = profElegido ? '_' + (profElegido.nombre || '').replace(/\s+/g, '_') : '';
    a.download = `formacion${quien}_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── PDF (imprimir → guardar como PDF) ──
  function descargarPDF() {
    if (!filtradas.length) return;
    const e = t => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const individual = !!profElegido;

    const filas = filtradas.map(s => `
      <tr>
        <td>${e(fechasTxt(s))}${horarioTxt(s) ? `<br><span class="g">${e(horarioTxt(s))}</span>` : ''}</td>
        ${individual ? '' : `<td><strong>${e(s.profesor_nombre)}</strong><br><span class="g">${e(s.departamento)}</span></td>`}
        <td><strong>${e(s.titulo)}</strong><br><span class="g">${e([s.entidad, MODALIDAD[s.modalidad], s.lugar].filter(Boolean).join(' · '))}</span></td>
        <td style="text-align:center">${dias(s)}${horasTotales(s) ? `<br><span class="g">${e(String(horasTotales(s)).replace('.', ','))} h</span>` : ''}</td>
        <td>${e(decisionJefe(s))}${s.jefe_motivo ? `<br><span class="g">${e(s.jefe_motivo)}</span>` : ''}</td>
        <td><strong>${e(ESTADOS[s.estado]?.label || s.estado)}</strong>${s.director_motivo ? `<br><span class="g">${e(s.director_motivo)}</span>` : ''}
          ${s.estado === 'autorizada' ? `<br><span class="g">Ausencia: ${s.ausencia_id ? 'registrada' : 'sin registrar'}</span>` : ''}</td>
      </tr>`).join('');

    const recuento = individual ? '' : `
      <h2>Resumen por profesor/a</h2>
      <table>
        <tr><th>Profesor/a</th><th>Departamento</th><th>Solicitudes</th><th>Autorizadas</th><th>Días autorizados</th><th>Horas autorizadas</th></tr>
        ${porProfesor.map(p => `<tr><td>${e(p.nombre)}</td><td>${e(p.departamento)}</td>
          <td style="text-align:center">${p.total}</td><td style="text-align:center">${p.autorizadas}</td>
          <td style="text-align:center">${p.dias}</td><td style="text-align:center">${p.horas ? String(Math.round(p.horas * 10) / 10).replace('.', ',') : '—'}</td></tr>`).join('')}
      </table>`;

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>${individual ? 'Informe individual de formación' : 'Informe de formación'}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 28px; }
  h1 { font-size: 17px; color: ${MORADO}; margin: 0 0 3px; }
  h2 { font-size: 13px; color: ${MORADO}; margin: 22px 0 7px; border-bottom: 1.5px solid ${MORADO}; padding-bottom: 3px; }
  .sub { color: #666; margin-bottom: 14px; font-size: 12px; }
  .resumen { background: #f5f3ff; padding: 9px 13px; border-radius: 6px; margin-bottom: 16px; }
  .resumen span { margin-right: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: ${MORADO}; color: white; padding: 6px; text-align: left; font-size: 10px; }
  td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #faf9ff; }
  .g { color: #6b7280; font-size: 10px; }
  .firma { margin-top: 40px; display: flex; justify-content: flex-end; }
  .firma div { width: 240px; text-align: center; border-top: 1px solid #999; padding-top: 5px; color: #555; }
  .pie { margin-top: 26px; padding-top: 9px; border-top: 1px solid #ccc; color: #888; font-size: 10px; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>${individual ? 'Informe individual de formación' : 'Informe de formación del profesorado'}</h1>
  <div class="sub">IES Gregorio Prieto · ${e(periodoTxt)}${filtrosTxt ? ' · ' + e(filtrosTxt) : ''}</div>
  ${individual ? `<div class="resumen"><strong>${e(profElegido.nombre)}</strong>${profElegido.departamento ? ' · ' + e(profElegido.departamento) : ''}</div>` : ''}

  <div class="resumen">
    <span><strong>${resumen.total}</strong> solicitudes</span>
    <span><strong>${resumen.autorizadas}</strong> autorizadas</span>
    <span><strong>${resumen.denegadas}</strong> denegadas</span>
    <span><strong>${resumen.pendientes}</strong> pendientes</span>
    <span><strong>${resumen.diasAut}</strong> días de formación autorizados</span>
  </div>

  <h2>Detalle</h2>
  <table>
    <tr><th>Fechas</th>${individual ? '' : '<th>Profesor/a</th>'}<th>Curso o jornada</th><th>Días</th><th>Jefe de dpto.</th><th>Resolución</th></tr>
    ${filas}
  </table>
  ${recuento}

  <div class="firma"><div>La dirección</div></div>
  <div class="pie">Generado el ${e(new Date().toLocaleString('es-ES'))} por ${e(usuario)} · APrieto, portal de gestión del IES Gregorio Prieto</div>
</body></html>`;

    const v = window.open('', '_blank');
    if (!v) { alert('El navegador ha bloqueado la ventana. Permite las ventanas emergentes e inténtalo otra vez.'); return; }
    v.document.write(html);
    v.document.close();
    setTimeout(() => v.print(), 400);
  }

  const campo = { padding: '9px 11px', borderRadius: 8, border: '1.5px solid #ddd', fontSize: 13.5, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', backgroundColor: 'white' };
  const etiqueta = { display: 'block', fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4 };
  const pendDir = todas.filter(s => s.estado === 'pendiente_director').length;
  const pendJefe = todas.filter(s => s.estado === 'pendiente_jefe').length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif', paddingBottom: 50 }}>

      <div style={{ backgroundColor: MORADO, color: 'white', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>🎓 Formación del profesorado</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Registro e informes</div>
        </div>
        <a href="/gestion" style={{ color: 'white', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 6, fontSize: 13, textDecoration: 'none' }}>← Gestión</a>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 16 }}>

        {/* Por resolver */}
        <a href="/formacion?vista=direccion" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '14px 16px', borderRadius: 12, marginBottom: 14, textDecoration: 'none',
          backgroundColor: pendDir ? '#fef2f2' : 'white', border: `1.5px solid ${pendDir ? '#fca5a5' : '#e5e7eb'}`,
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14.5, color: pendDir ? '#991b1b' : '#374151' }}>
              {pendDir ? `${pendDir} solicitud${pendDir !== 1 ? 'es' : ''} pendiente${pendDir !== 1 ? 's' : ''} de autorizar` : 'Nada pendiente de autorizar'}
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>
              {pendJefe ? `${pendJefe} más en manos de los jefes de departamento` : 'Ninguna esperando a los jefes de departamento'}
            </div>
          </div>
          <span style={{ padding: '8px 15px', borderRadius: 8, backgroundColor: MORADO, color: 'white', fontWeight: 700, fontSize: 13 }}>
            Resolver →
          </span>
        </a>

        {/* Filtros */}
        <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
            <div><label style={etiqueta}>Desde</label><input type="date" style={campo} value={desde} onChange={e => setDesde(e.target.value)} /></div>
            <div><label style={etiqueta}>Hasta</label><input type="date" style={campo} value={hasta} onChange={e => setHasta(e.target.value)} /></div>
            <div>
              <label style={etiqueta}>Profesor/a</label>
              <select style={campo} value={profesor} onChange={e => setProfesor(e.target.value)}>
                <option value="">Todo el profesorado</option>
                {profesores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={etiqueta}>Departamento</label>
              <select style={campo} value={dpto} onChange={e => setDpto(e.target.value)}>
                <option value="">Todos</option>
                {departamentos.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={etiqueta}>Estado</label>
              <select style={campo} value={estado} onChange={e => setEstado(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              ['Este curso', inicioCurso(), finCurso()],
              ['Primer trimestre', inicioCurso(), `${inicioCurso().slice(0, 4)}-12-31`],
              ['Este mes', hoyLocal().slice(0, 8) + '01', hoyLocal()],
            ].map(([l, d, h]) => (
              <button key={l} onClick={() => { setDesde(d); setHasta(h); }} style={{
                padding: '6px 12px', borderRadius: 7, border: '1.5px solid #ddd', backgroundColor: 'white',
                fontSize: 12.5, fontWeight: 600, color: '#555', cursor: 'pointer', fontFamily: 'inherit',
              }}>{l}</button>
            ))}
            {(profesor || dpto || estado) && (
              <button onClick={() => { setProfesor(''); setDpto(''); setEstado(''); }} style={{
                padding: '6px 12px', borderRadius: 7, border: 'none', backgroundColor: '#f3f4f6',
                fontSize: 12.5, fontWeight: 600, color: '#555', cursor: 'pointer', fontFamily: 'inherit',
              }}>✕ Quitar filtros</button>
            )}
          </div>
        </div>

        {aviso && <div style={{ padding: 13, borderRadius: 9, backgroundColor: '#dcfce7', border: '1.5px solid #86efac', color: '#166534', fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>{aviso}</div>}
        {error && <div style={{ padding: 13, borderRadius: 9, backgroundColor: '#fef2f2', border: '1.5px solid #fecaca', color: '#991b1b', fontSize: 13.5, marginBottom: 14 }}>{error}</div>}
        {cargando && <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>⏳ Cargando...</div>}

        {!cargando && !error && (
          <>
            {/* Resumen + descargas */}
            <div style={{ backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 14, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13.5, color: '#374151', marginBottom: 12 }}>
                <span><strong>{resumen.total}</strong> solicitudes</span>
                <span style={{ color: '#166534' }}><strong>{resumen.autorizadas}</strong> autorizadas</span>
                <span style={{ color: '#991b1b' }}><strong>{resumen.denegadas}</strong> denegadas</span>
                <span style={{ color: '#1e40af' }}><strong>{resumen.pendientes}</strong> pendientes</span>
                <span><strong>{resumen.diasAut}</strong> días autorizados</span>
              </div>
              {resumen.sinAusencia > 0 && (
                <div style={{ fontSize: 12.5, color: '#b45309', fontWeight: 600, marginBottom: 12 }}>
                  ⚠️ {resumen.sinAusencia} formación{resumen.sinAusencia !== 1 ? 'es' : ''} autorizada{resumen.sinAusencia !== 1 ? 's' : ''} ya empezada{resumen.sinAusencia !== 1 ? 's' : ''} sin ausencia registrada
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button disabled={!filtradas.length} onClick={descargarPDF} style={{
                  padding: '10px 18px', borderRadius: 9, border: 'none', backgroundColor: MORADO, color: 'white',
                  fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: filtradas.length ? 1 : 0.5, fontFamily: 'inherit',
                }}>🖨️ {profElegido ? 'Informe individual (PDF)' : 'Informe general (PDF)'}</button>
                <button disabled={!filtradas.length} onClick={descargarCSV} style={{
                  padding: '10px 18px', borderRadius: 9, border: `1.5px solid ${MORADO}`, backgroundColor: 'white', color: MORADO,
                  fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: filtradas.length ? 1 : 0.5, fontFamily: 'inherit',
                }}>📊 Descargar CSV</button>
              </div>
              {!profElegido && (
                <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 8 }}>
                  Para el informe individual, elige un profesor/a en el filtro.
                </div>
              )}
            </div>

            {/* Registro */}
            {filtradas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#888', backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 38, marginBottom: 8 }}>🎓</div>
                No hay solicitudes de formación con estos filtros.
              </div>
            ) : (
              <div style={{ backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f3ff', color: MORADO, textAlign: 'left' }}>
                      {['Fechas', 'Profesor/a', 'Curso o jornada', 'Días', 'Jefe de dpto.', 'Estado'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map(s => {
                      const est = ESTADOS[s.estado] || {};
                      return (
                        <tr key={s.id} style={{ borderTop: '1px solid #f1f1f1', verticalAlign: 'top' }}>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {fechasTxt(s)}
                            {horarioTxt(s) && <div style={{ fontSize: 11.5, color: '#888' }}>{horarioTxt(s)}</div>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <button onClick={() => setProfesor(s.profesor_id)} title="Ver solo este profesor" style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700,
                              color: '#1f2937', fontSize: 13, textAlign: 'left', fontFamily: 'inherit',
                            }}>{s.profesor_nombre}</button>
                            <div style={{ fontSize: 11.5, color: '#888' }}>{s.departamento}</div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ fontWeight: 600 }}>{s.titulo}</div>
                            <div style={{ fontSize: 11.5, color: '#888' }}>{[s.entidad, MODALIDAD[s.modalidad], s.lugar].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>{dias(s)}</td>
                          <td style={{ padding: '10px 12px', fontSize: 12 }}>
                            {decisionJefe(s)}
                            {s.jefe_motivo && <div style={{ color: '#888', marginTop: 2 }}>{s.jefe_motivo}</div>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, backgroundColor: est.bg, color: est.color, whiteSpace: 'nowrap' }}>
                              {est.corto || s.estado}
                            </span>
                            {s.director_motivo && <div style={{ fontSize: 11.5, color: '#888', marginTop: 3 }}>{s.director_motivo}</div>}
                            {s.estado === 'autorizada' && (
                              <div style={{ fontSize: 11.5, marginTop: 3, color: s.ausencia_id ? '#166534' : '#b45309', fontWeight: 600 }}>
                                {s.ausencia_id ? '✓ Ausencia registrada' : 'Sin ausencia'}
                              </div>
                            )}
                            {Array.isArray(s.historial) && s.historial.length > 0 && (
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                                {s.historial.length} cambio{s.historial.length !== 1 ? 's' : ''} de estado · último: {s.historial[s.historial.length - 1].motivo}
                              </div>
                            )}
                            {soyDirector && <CambiarEstadoFormacion solicitud={s} onHecho={trasCambio} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
