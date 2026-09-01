/**
 * INFORME DE GUARDIAS
 *
 * Devuelve, para un periodo, quién faltó y quién lo cubrió. Es un
 * documento de consulta a posteriori para el equipo directivo.
 *
 * No incluye el motivo de las ausencias a propósito: ya queda
 * registrado al solicitarlas, y este informe está pensado para
 * descargarse y circular.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';

let _cliente = null;
function supa() {
  if (!_cliente) {
    _cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _cliente;
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

const ETIQUETA_HORA = {
  '1': '1ª (8:30–9:25)',   '2': '2ª (9:25–10:20)',  '3': '3ª (10:20–11:15)',
  'recreo': 'Recreo (11:15–11:45)',
  '4': '4ª (11:45–12:40)', '5': '5ª (12:40–13:35)', '6': '6ª (13:35–14:30)',
};
const ORDEN_HORA = { '1': 1, '2': 2, '3': 3, 'recreo': 4, '4': 5, '5': 6, '6': 7 };

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  // El informe cruza ausencias de todo el claustro: solo dirección.
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'sin_permisos' }, { status: 403 });
  }

  const url = new URL(request.url);
  const desde = url.searchParams.get('desde');
  const hasta = url.searchParams.get('hasta') || desde;

  if (!desde || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return Response.json({ error: 'fechas_no_validas' }, { status: 400 });
  }

  const cliente = supa();

  const [{ data: apoyos, error }, { data: profesores }] = await Promise.all([
    cliente.from('apoyos_asignados')
      .select('fecha, hora, grupo, aula, materia, sector_apoyo, sector_destino, profesor_id, profesor_ausente_id, estado, tipo_apoyo, confirmado_at')
      .gte('fecha', desde).lte('fecha', hasta),
    cliente.from('profesores').select('id, nombre, apellidos, departamento'),
  ]);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const nombreDe = id => {
    const p = (profesores || []).find(x => x.id === id);
    return p ? `${p.apellidos}, ${p.nombre}` : '';
  };

  const filas = (apoyos || []).map(a => ({
    fecha: a.fecha,
    hora: a.hora,
    horaTexto: ETIQUETA_HORA[a.hora] || a.hora,
    ausente: nombreDe(a.profesor_ausente_id) || `(${a.sector_destino || 'sin identificar'})`,
    departamentoAusente: a.sector_destino || '',
    cubre: nombreDe(a.profesor_id) || '—',
    departamentoCubre: a.sector_apoyo || '',
    grupo: a.grupo || '',
    aula: a.aula || '',
    materia: a.materia || '',
    confirmada: a.estado === 'confirmado',
    propia: a.tipo_apoyo === 'sector',
  }));

  filas.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (ORDEN_HORA[a.hora] || 9) - (ORDEN_HORA[b.hora] || 9)
  );

  // Recuento por profesor que cubre, para ver el reparto del periodo
  const recuento = {};
  filas.forEach(f => {
    if (f.cubre === '—') return;
    recuento[f.cubre] = recuento[f.cubre] || { total: 0, confirmadas: 0, departamento: f.departamentoCubre };
    recuento[f.cubre].total += 1;
    if (f.confirmada) recuento[f.cubre].confirmadas += 1;
  });

  const porProfesor = Object.entries(recuento)
    .map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));

  return Response.json({
    desde, hasta,
    filas,
    porProfesor,
    resumen: {
      guardias: filas.length,
      confirmadas: filas.filter(f => f.confirmada).length,
      sinConfirmar: filas.filter(f => !f.confirmada).length,
      dias: new Set(filas.map(f => f.fecha)).size,
      profesoresQueCubren: porProfesor.length,
    },
  });
}
