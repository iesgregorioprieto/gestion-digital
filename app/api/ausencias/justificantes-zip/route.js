/**
 * DESCARGAR TODOS LOS JUSTIFICANTES EN UN ZIP.
 *
 * Pedido de José María: un botón que baje de golpe todos los
 * justificantes del periodo, renombrados por «Apellidos, Nombre - Día y
 * mes» para no tener que abrir uno a uno cada ausencia.
 *
 * Director, secretario y jefatura de estudios (Elena tramita con esto).
 * El zip se arma en el servidor y se sirve al navegador, con una
 * carpeta por mes para que el periodo completo se vea organizado.
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

const MESES = ['01-enero', '02-febrero', '03-marzo', '04-abril', '05-mayo', '06-junio',
  '07-julio', '08-agosto', '09-septiembre', '10-octubre', '11-noviembre', '12-diciembre'];

export async function GET(req) {
  const sesion = await sesionDe(req);
  if (!sesion || !['director', 'secretario', 'jefe_estudios'].includes(sesion.rol)) {
    return new Response('sin permisos', { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const desde = searchParams.get('desde');
  const hasta = searchParams.get('hasta');
  if (!desde || !hasta) return new Response('faltan fechas', { status: 400 });

  const { data: ausencias, error } = await supa()
    .from('ausencias')
    .select('id, fecha_inicio, justificacion_urls, justificacion_url, profesor_id, profesor_nombre')
    .gte('fecha_inicio', desde).lte('fecha_inicio', hasta);
  if (error) return new Response(error.message, { status: 500 });

  // No hay clave foránea ausencias → profesores, así que el «join» de
  // Supabase (profesor:profesores(...)) fallaba con «Could not find a
  // relationship». Se piden los nombres aparte y se cruzan aquí.
  const ids = [...new Set((ausencias || []).map(a => a.profesor_id).filter(Boolean))];
  const nombres = {};
  if (ids.length > 0) {
    const { data: profes } = await supa()
      .from('profesores').select('id, apellidos, nombre').in('id', ids);
    for (const p of profes || []) nombres[p.id] = p;
  }

  const zip = new JSZip();
  let contador = 0;

  for (const a of ausencias || []) {
    // Las ausencias del formulario antiguo guardan un solo justificante
    // en 'justificacion_url'; las nuevas, varios en 'justificacion_urls'.
    // Hay que mirar las dos o el zip se deja los de principio de curso.
    const varios = Array.isArray(a.justificacion_urls) ? a.justificacion_urls.filter(Boolean) : [];
    const urls = varios.length > 0 ? varios : (a.justificacion_url ? [a.justificacion_url] : []);
    if (urls.length === 0) continue;
    const p = nombres[a.profesor_id];
    const nombreBase = p
      ? limpiar(`${p.apellidos || ''}, ${p.nombre || ''}`)
      : limpiar(a.profesor_nombre || 'Sin nombre');
    const dia = a.fecha_inicio ? a.fecha_inicio.slice(8, 10) : '00';
    const mesNum = a.fecha_inicio ? parseInt(a.fecha_inicio.slice(5, 7), 10) : 0;
    const mes = a.fecha_inicio ? a.fecha_inicio.slice(5, 7) : '00';
    const carpetaMes = MESES[mesNum - 1] || 'sin-fecha';
    for (let i = 0; i < urls.length; i++) {
      try {
        // El almacén es PRIVADO: pedir el archivo por su dirección pública
        // devolvía un error y se saltaban todos. Se descarga con la clave
        // del servidor a partir del almacén y la ruta.
        const m = String(urls[i]).match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
        if (!m) continue;
        const { data: blob, error: eDesc } = await supa().storage.from(m[1]).download(decodeURIComponent(m[2]));
        if (eDesc || !blob) continue;
        const bytes = await blob.arrayBuffer();
        // se conserva la extensión del original
        const ext = (urls[i].split('.').pop() || 'bin').split(/[?#]/)[0].slice(0, 5);
        const sufijo = urls.length > 1 ? ` (${i + 1})` : '';
        const nombre = `${carpetaMes}/${nombreBase} - ${dia}-${mes}${sufijo}.${ext}`;
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

