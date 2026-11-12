/**
 * ELIMINAR DEL SERVIDOR LOS JUSTIFICANTES DE UN MES.
 *
 * Petición #247 de José María: desde el informe de ausencias, un botón
 * por mes que borre del almacén todos los justificantes de ese mes, con
 * doble confirmación. Una vez tramitados ante la Delegación no hace
 * falta guardarlos aquí (son datos de salud) y ocupan espacio.
 *
 *   GET  ?mes=AAAA-MM   → cuántos archivos y ausencias hay (para avisar)
 *   POST { mes, confirmacion: 'AAAA-MM' } → los borra
 *
 * Reglas:
 * - Solo equipo directivo (los mismos que pueden descargar el zip).
 * - Solo meses ya terminados: en el mes en curso aún llegan justificantes.
 * - La ausencia NO se toca salvo para quitar los enlaces: sigue
 *   justificada y tramitada, y queda la fecha en que se borraron sus
 *   documentos (columna justificantes_eliminados_en) para que el informe
 *   diga «eliminado» y no «no consta».
 * - Mismo criterio de mes que el zip: el de la fecha de inicio.
 * - Las copias de seguridad no llevan archivos: lo borrado no se recupera.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { hoyLocal } from '@/lib/fechas';

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

const ROLES = ['director', 'secretario', 'jefe_estudios'];

function ultimoDia(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
}

/** Valida el mes y que ya haya terminado. Devuelve un texto de error o null. */
function errorDeMes(mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) return 'Mes no válido';
  if (mes >= hoyLocal().slice(0, 7)) {
    return 'Solo se pueden eliminar justificantes de meses ya terminados';
  }
  return null;
}

function urlsDe(a) {
  const varios = Array.isArray(a.justificacion_urls) ? a.justificacion_urls.filter(Boolean) : [];
  if (varios.length > 0) return varios;
  return a.justificacion_url ? [a.justificacion_url] : [];
}

/** De la dirección guardada saca el almacén y la ruta del archivo. */
function rutaDe(url) {
  const m = String(url).match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  return m ? { bucket: m[1], ruta: decodeURIComponent(m[2]) } : null;
}

async function ausenciasDelMes(mes) {
  const { data, error } = await supa()
    .from('ausencias')
    .select('id, justificacion_urls, justificacion_url, tramitado')
    .gte('fecha_inicio', `${mes}-01`).lte('fecha_inicio', ultimoDia(mes));
  if (error) throw new Error(error.message);
  return (data || []).filter(a => urlsDe(a).length > 0);
}

function resumen(lista) {
  return {
    ausencias: lista.length,
    archivos: lista.reduce((n, a) => n + urlsDe(a).length, 0),
    sinTramitar: lista.filter(a => !a.tramitado).length,
  };
}

export async function GET(req) {
  const sesion = await sesionDe(req);
  if (!sesion || !ROLES.includes(sesion.rol)) return Response.json({ error: 'sin permisos' }, { status: 403 });
  const mes = new URL(req.url).searchParams.get('mes');
  const e = errorDeMes(mes);
  if (e) return Response.json({ error: e }, { status: 400 });
  try {
    return Response.json(resumen(await ausenciasDelMes(mes)));
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const sesion = await sesionDe(req);
  if (!sesion || !ROLES.includes(sesion.rol)) return Response.json({ error: 'sin permisos' }, { status: 403 });

  let cuerpo = {};
  try { cuerpo = await req.json(); } catch { /* vacío */ }
  const { mes, confirmacion } = cuerpo;
  const e = errorDeMes(mes);
  if (e) return Response.json({ error: e }, { status: 400 });
  // Segunda confirmación comprobada también en el servidor.
  if (confirmacion !== mes) return Response.json({ error: 'Falta la confirmación' }, { status: 400 });

  let lista;
  try { lista = await ausenciasDelMes(mes); }
  catch (err) { return Response.json({ error: err.message }, { status: 500 }); }

  // Agrupar los archivos por almacén y borrar en tandas de 100.
  const porBucket = {};
  for (const a of lista) {
    for (const u of urlsDe(a)) {
      const r = rutaDe(u);
      if (r) (porBucket[r.bucket] = porBucket[r.bucket] || []).push(r.ruta);
    }
  }
  let borrados = 0;
  const fallos = [];
  for (const [bucket, rutas] of Object.entries(porBucket)) {
    for (let i = 0; i < rutas.length; i += 100) {
      const tanda = rutas.slice(i, i + 100);
      const { data, error } = await supa().storage.from(bucket).remove(tanda);
      if (error) fallos.push(error.message);
      else borrados += (data || []).length;
    }
  }
  // Si el almacén ha fallado, no se tocan las ausencias: que se pueda
  // repetir sin perder los enlaces de lo que no se haya borrado.
  if (fallos.length > 0) {
    return Response.json({ error: 'No se han podido borrar todos los archivos: ' + fallos[0], borrados }, { status: 500 });
  }

  // Quitar los enlaces de las ausencias y dejar constancia de la fecha.
  const ids = lista.map(a => a.id);
  const hoy = hoyLocal();
  let marcado = true;
  if (ids.length > 0) {
    let { error } = await supa().from('ausencias')
      .update({ justificacion_urls: [], justificacion_url: null, justificantes_eliminados_en: hoy })
      .in('id', ids);
    // Si aún no se ha creado la columna, se quitan los enlaces igualmente.
    if (error && /justificantes_eliminados_en/.test(error.message)) {
      marcado = false;
      ({ error } = await supa().from('ausencias')
        .update({ justificacion_urls: [], justificacion_url: null })
        .in('id', ids));
    }
    if (error) return Response.json({ error: 'Archivos borrados, pero no se han actualizado las ausencias: ' + error.message, borrados }, { status: 500 });
  }

  console.log(`[justificantes-eliminar] ${sesion.rol} ${sesion.id} borró ${borrados} archivos de ${ids.length} ausencias del mes ${mes}`);
  return Response.json({ ok: true, mes, ausencias: ids.length, borrados, marcado });
}
