/**
 * DESCARGAR TODOS LOS JUSTIFICANTES EN UN ZIP.
 *
 * Pedido de José María: un botón que baje de golpe todos los
 * justificantes del mes, renombrados por «Apellidos, Nombre - Día y mes»
 * para no tener que abrir uno a uno cada ausencia.
 *
 * Solo dirección y secretaría, y solo del rango de fechas indicado.
 * El zip se arma en el servidor y se sirve al navegador; el nombre del
 * archivo va con las fechas para que se vea de un vistazo qué contiene.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import JSZip from 'jszip';

export const dynamic = 'force-dynamic';

let _c = null;
function supa() {
  if (!_c) {
    _c = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _c;
}

async function sesionDe(req) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (req.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

function limpiar(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function GET(req) {
  const sesion = await sesionDe(req);
  if (!sesion || !['director', 'secretario'].includes(sesion.rol)) {
    return new Response('sin permisos', { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!desde || !hasta) return new Response('faltan fechas', { status: 400 });

  const { data: ausencias, error } = await supa()
    .from('ausencias')
    .select('id, fecha_inicio, justificacion_urls, profesor:profesores(apellidos, nombre)')
    .gte('fecha_inicio', desde).lte('fecha_inicio', hasta);
  if (error) return new Response(error.message, { status: 500 });

  const zip = new JSZip();
  let contador = 0;

  for (const a of ausencias || []) {
    const urls = Array.isArray(a.justificacion_urls) ? a.justificacion_urls : [];
    if (urls.length === 0) continue;
    const p = a.profesor || {};
    const nombreBase = limpiar(`${p.apellidos || 'Sin apellidos'}, ${p.nombre || ''}`);
    const dia = a.fecha_inicio ? a.fecha_inicio.slice(8, 10) : '00';
    const mes = a.fecha_inicio ? a.fecha_inicio.slice(5, 7) : '00';
    for (let i = 0; i < urls.length; i++) {
      try {
        const r = await fetch(urls[i]);
        if (!r.ok) continue;
        const bytes = await r.arrayBuffer();
        // se conserva la extensión del original
        const ext = (urls[i].split('.').pop() || 'bin').split(/[?#]/)[0].slice(0, 5);
        const sufijo = urls.length > 1 ? ` (${i + 1})` : '';
        const nombre = `${nombreBase} - ${dia}-${mes}${sufijo}.${ext}`;
        zip.file(nombre, bytes);
        contador++;
      } catch { /* se salta ese archivo y sigue */ }
    }
  }

  if (contador === 0) {
    return new Response('No hay justificantes en el rango', { status: 404 });
  }

  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="justificantes_${desde}_${hasta}.zip"`,
    },
  });
}
