'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

/**
 * IMPRESO DE COMISIÓN DE SERVICIO
 *
 * Reproduce el modelo del centro («Solicitud de comisión de servicio ·
 * Actividades extraescolares») con los datos de la solicitud y, debajo,
 * la conformidad del jefe de departamento y la resolución del director.
 * Se imprime o se guarda como PDF desde el navegador.
 *
 * Solo lo ven el propio profesor y el equipo directivo (lo comprueba
 * /api/comisiones?id=…), porque lleva el NIF.
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const fCorta = f => f ? new Date(String(f).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const hhmm = h => h ? String(h).slice(0, 5) : '';
const euros = n => n == null || n === '' ? '' : `${Number(n).toFixed(2).replace('.', ',')} €`;
function fechaLarga(ts) {
  const d = ts ? new Date(ts) : new Date();
  return { dia: d.getDate(), mes: MESES[d.getMonth()], anio: d.getFullYear() };
}

export default function ImpresoComision() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) { setError('Falta la solicitud.'); return; }
    fetch(`/api/comisiones?id=${encodeURIComponent(id)}`)
      .then(async r => {
        if (r.status === 401) { window.location.href = '/login'; return; }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'No se ha podido cargar');
        setS(d.solicitud);
        document.title = `Comisión de servicio — ${d.solicitud.profesor_nombre} — ${fCorta(d.solicitud.fecha_inicio)}`;
      })
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#991b1b' }}>{error}</div>;
  if (!s) return <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', color: '#888' }}>⏳ Cargando impreso...</div>;

  const firma = fechaLarga(s.created_at);
  const autorizada = s.estado === 'autorizada';
  const denegada = s.estado === 'denegada_director' || s.estado === 'denegada_jefe';
  const pasaPorJefe = ['aprobada', 'denegada', 'escalada'].includes(s.jefe_decision);
  const motivoTxt = s.destino ? `${s.motivo} — ${s.destino}` : s.motivo;
  const estadoTxt = {
    pendiente_jefe: 'PENDIENTE DEL JEFE DE DEPARTAMENTO',
    pendiente_director: 'PENDIENTE DE AUTORIZACIÓN',
    denegada_jefe: 'DENEGADA POR EL JEFE DE DEPARTAMENTO',
    denegada_director: 'DENEGADA',
    retirada: 'ANULADA',
  }[s.estado];

  return (
    <div className="fondo">
      <style>{`
        .fondo { background: #e5e7eb; min-height: 100vh; padding: 20px 10px; font-family: Calibri, Carlito, Arial, sans-serif; color: #111; }
        .barra { max-width: 794px; margin: 0 auto 12px; display: flex; gap: 8px; justify-content: space-between; align-items: center; flex-wrap: wrap; }
        .barra button, .barra a { padding: 10px 18px; border-radius: 8px; border: none; font-weight: 700; font-size: 14px; cursor: pointer; text-decoration: none; font-family: system-ui, sans-serif; }
        .hoja { max-width: 794px; margin: 0 auto; background: white; padding: 40px 48px; box-shadow: 0 2px 10px rgba(0,0,0,.15); box-sizing: border-box; position: relative; }
        .cab { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
        .titulo { text-align: center; font-weight: 700; font-size: 18px; line-height: 1.35; flex: 1; }
        .escudo { width: 64px; height: auto; }
        table.f { width: 100%; border-collapse: collapse; margin-bottom: 18px; border: 1px solid #444; }
        table.f th { background: #555; color: white; text-align: left; font-family: Cambria, Georgia, serif; font-size: 16px; padding: 4px 8px; }
        table.f td { border: 1px solid #444; padding: 0; vertical-align: top; }
        .et { background: #d9d9d9; font-size: 11px; padding: 2px 6px; border-bottom: 1px solid #444; }
        .et i { font-style: italic; }
        .va { font-size: 15px; padding: 5px 8px; min-height: 22px; white-space: pre-wrap; }
        .legal { font-family: 'Times New Roman', serif; font-size: 15px; text-align: justify; line-height: 1.4; margin: 18px 0; }
        .fecha { font-family: 'Times New Roman', serif; font-size: 15px; margin: 16px 0 50px; }
        .firmas { display: flex; justify-content: space-between; gap: 30px; margin-top: 8px; }
        .firmas div { flex: 1; text-align: center; border-top: 1px solid #555; padding-top: 5px; font-size: 13px; color: #333; }
        .resol { border: 2px solid #444; padding: 12px 14px; margin-top: 26px; font-size: 14px; line-height: 1.5; }
        .resol h3 { margin: 0 0 8px; font-family: Cambria, Georgia, serif; font-size: 15px; }
        .sello { display: inline-block; padding: 4px 14px; border: 3px solid; font-weight: 800; font-size: 18px; letter-spacing: 1px; transform: rotate(-2deg); }
        .marca { position: absolute; top: 46%; left: 50%; transform: translate(-50%, -50%) rotate(-22deg); font-size: 46px; font-weight: 800; color: rgba(185, 28, 28, .16); white-space: nowrap; pointer-events: none; text-align: center; }
        .pie { margin-top: 22px; font-size: 10px; color: #777; }
        @media print {
          @page { size: A4; margin: 14mm; }
          .fondo { background: white; padding: 0; }
          .barra { display: none; }
          .hoja { box-shadow: none; padding: 0; max-width: none; }
        }
      `}</style>

      <div className="barra">
        <a href="/comisiones" style={{ background: 'white', color: '#0e7490', border: '1.5px solid #0e7490' }}>← Comisiones</a>
        <button onClick={() => window.print()} style={{ background: '#0e7490', color: 'white' }}>🖨️ Imprimir o guardar en PDF</button>
      </div>

      <div className="hoja">
        {!autorizada && estadoTxt && <div className="marca">{estadoTxt}</div>}

        <div className="cab">
          <div style={{ width: 64 }} />
          <div className="titulo">SOLICITUD DE COMISIÓN DE SERVICIO<br />ACTIVIDADES EXTRAESCOLARES</div>
          <img className="escudo" src="/escudo.jpg" alt="" />
        </div>

        <table className="f">
          <thead><tr><th colSpan={2}>Datos del centro docente</th></tr></thead>
          <tbody>
            <tr><td colSpan={2}><div className="et">Denominación del centro docente</div><div className="va">I.E.S GREGORIO PRIETO</div></td></tr>
            <tr>
              <td style={{ width: '55%' }}><div className="et">Localidad</div><div className="va">VALDEPEÑAS</div></td>
              <td><div className="et">Provincia</div><div className="va">CIUDAD REAL</div></td>
            </tr>
          </tbody>
        </table>

        <table className="f">
          <thead><tr><th colSpan={2}>Datos del Solicitante</th></tr></thead>
          <tbody>
            <tr>
              <td style={{ width: '75%' }}><div className="et">Nombre y apellidos</div><div className="va">{s.profesor_nombre}</div></td>
              <td><div className="et">NIF</div><div className="va">{s.nif || ''}</div></td>
            </tr>
            <tr><td colSpan={2}><div className="et">Denominación del puesto de trabajo</div><div className="va">{s.puesto || ''}</div></td></tr>
            <tr><td colSpan={2}><div className="et">Departamento</div><div className="va">{s.departamento || ''}</div></td></tr>
          </tbody>
        </table>

        <table className="f">
          <thead><tr><th colSpan={4}>Datos del desplazamiento</th></tr></thead>
          <tbody>
            <tr><td colSpan={4}>
              <div className="et"><i>Motivo (dentro del ámbito de las actividades extracurriculares o formación en centros de trabajo:</i></div>
              <div className="va">{motivoTxt}</div>
            </td></tr>
            <tr>
              <td><div className="et">Fecha de inicio</div><div className="va">{fCorta(s.fecha_inicio)}</div></td>
              <td><div className="et">Hora de inicio</div><div className="va">{hhmm(s.hora_inicio)}</div></td>
              <td><div className="et">Fecha de finalización</div><div className="va">{fCorta(s.fecha_fin)}</div></td>
              <td><div className="et">Hora de finalización</div><div className="va">{hhmm(s.hora_fin)}</div></td>
            </tr>
            <tr>
              <td colSpan={2}><div className="et">Medio de transporte</div><div className="va">{s.transporte || ''}</div></td>
              <td colSpan={2}><div className="et">Importe estimado en dietas y gastos de viaje</div><div className="va">{euros(s.importe_estimado)}</div></td>
            </tr>
          </tbody>
        </table>

        <div className="legal">
          En virtud de lo establecido en el art. 13 del Decreto 77/2002, de 21 de mayo, por el que se regula el régimen jurídico
          de la autonomía de gestión económica de los centros docentes públicos no universitarios, <strong>SOLICITO</strong> la
          concesión de la oportuna Comisión de Servicio, y, en su caso, la percepción de las indemnizaciones a que hubiere lugar.
        </div>

        <div className="fecha">En Valdepeñas, a {firma.dia} de {firma.mes} de {firma.anio}</div>

        <div className="firmas">
          <div>Fdo.: {s.profesor_nombre}</div>
        </div>

        <div className="resol">
          <h3>Tramitación en el centro</h3>
          {pasaPorJefe && (
            <div style={{ marginBottom: 8 }}>
              <strong>Jefatura de departamento:</strong>{' '}
              {s.jefe_decision === 'aprobada' && `Conforme — ${s.jefe_nombre || 'jefe de departamento'}, ${fCorta(s.jefe_fecha)}.`}
              {s.jefe_decision === 'denegada' && `No conforme — ${s.jefe_nombre || 'jefe de departamento'}, ${fCorta(s.jefe_fecha)}.`}
              {s.jefe_decision === 'escalada' && `Sin respuesta en plazo; pasó a dirección el ${fCorta(s.jefe_fecha)}.`}
              {s.jefe_motivo && s.jefe_decision !== 'escalada' && <span> {s.jefe_motivo}</span>}
            </div>
          )}

          {autorizada ? (
            <>
              <div style={{ margin: '10px 0' }}>
                <span className="sello" style={{ color: '#166534', borderColor: '#166534' }}>AUTORIZADA</span>
              </div>
              <div>
                La dirección del centro <strong>autoriza</strong> la comisión de servicio solicitada
                el {fCorta(s.director_fecha)}{s.director_nombre ? ` (${s.director_nombre})` : ''}.
                {s.director_motivo && <> Observaciones: {s.director_motivo}</>}
              </div>
              <div className="firmas" style={{ marginTop: 50 }}>
                <div style={{ maxWidth: 280, marginLeft: 'auto' }}>El Director<br />Fdo.: {s.director_nombre || ''}</div>
              </div>
            </>
          ) : denegada ? (
            <div>
              <span className="sello" style={{ color: '#991b1b', borderColor: '#991b1b' }}>DENEGADA</span>
              <div style={{ marginTop: 8 }}>{s.director_motivo || s.jefe_motivo || ''}</div>
            </div>
          ) : (
            <div style={{ color: '#6b7280' }}>Pendiente de resolución.</div>
          )}
        </div>

        <div className="pie">Generado desde APrieto · {new Date().toLocaleString('es-ES')}</div>
      </div>
    </div>
  );
}
