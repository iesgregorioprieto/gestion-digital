/**
 * HOJA DE SERVICIOS → ANTIGÜEDAD EN EL CUERPO
 *
 * Dos pasos, para que el profesor vea lo que se ha leído antes de guardarlo:
 *
 *  1. POST con el PDF (multipart, campo «hoja»; opcional «profesor_id» si
 *     lo hace secretaría por otro). Se lee EN MEMORIA y se descarta: el PDF
 *     no se guarda en ningún sitio. Devuelve lo leído y un «comprobante»
 *     firmado con esos números.
 *  2. POST JSON { comprobante }. Solo se guarda lo que dice el comprobante,
 *     así nadie puede cambiar los números entre leer y confirmar.
 *
 * El comprobante se firma con una clave DERIVADA, distinta de la de las
 * sesiones: con la misma, un comprobante hecho por dirección para otro
 * profesor podría pasar por una sesión de ese profesor.
 */
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { leerHojaServicios, deDias } from '@/lib/hojaServicios';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TAMANO_MAX = 3 * 1024 * 1024;   // una hoja de servicios pesa unos 100 KB
const VALIDEZ_MIN = 30;               // minutos para confirmar tras leer

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

const claveComprobante = () => `${process.env.SESSION_SECRET}|hoja-servicios`;
const firmar = cuerpo => createHmac('sha256', claveComprobante()).update(cuerpo).digest('base64url');

function crearComprobante(datos) {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + VALIDEZ_MIN * 60000 })).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

function leerComprobante(token) {
  const [cuerpo, firma] = String(token || '').split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  return datos.exp && Date.now() <= datos.exp ? datos : null;
}

// ¿Puede esta sesión actuar sobre la ficha de ese profesor?
function puede(sesion, profesorId) {
  return profesorId === sesion.id || esDirectivo(sesion);
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const tipo = request.headers.get('content-type') || '';

  // ── Paso 1: leer el PDF ──
  if (tipo.includes('multipart/form-data')) {
    const form = await request.formData();
    const archivo = form.get('hoja');
    const profesorId = (form.get('profesor_id') || sesion.id).toString();
    if (!puede(sesion, profesorId)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
    if (!archivo || typeof archivo === 'string') return Response.json({ error: 'Falta el PDF de la hoja de servicios.' }, { status: 400 });
    if (archivo.size > TAMANO_MAX) return Response.json({ error: 'El archivo es demasiado grande para ser una hoja de servicios.' }, { status: 400 });

    try {
      const r = await leerHojaServicios(Buffer.from(await archivo.arrayBuffer()));
      return Response.json({
        fecha: r.fecha,
        dias: r.dias,
        total: r.total,
        bloques: r.bloques.map(b => ({ cabecera: b.cabecera, cuenta: b.tipo === 'suma', carrera: b.carrera, interino: b.interino })),
        comprobante: crearComprobante({ profesorId, dias: r.dias, fecha: r.fecha, por: sesion.id }),
      });
    } catch (e) {
      return Response.json({ error: e.message || 'No se ha podido leer la hoja.' }, { status: 422 });
    }
  }

  // ── Paso 2: confirmar y guardar ──
  const { comprobante } = await request.json().catch(() => ({}));
  const c = leerComprobante(comprobante);
  if (!c) return Response.json({ error: 'La lectura ha caducado o no es válida. Vuelve a subir la hoja.' }, { status: 400 });
  if (c.por !== sesion.id || !puede(sesion, c.profesorId)) {
    return Response.json({ error: 'sin_permisos' }, { status: 403 });
  }

  // El año de ingreso equivalente, para lo que ya funciona con años
  // (canoso, listados): años cumplidos a la fecha de la hoja.
  const anios = deDias(c.dias).a;
  const anioCuerpo = parseInt(c.fecha.slice(0, 4), 10) - anios;

  const { error } = await supa().from('profesores').update({
    servicios_dias: c.dias,
    servicios_fecha: c.fecha,
    servicios_origen: 'hoja',
    servicios_leido: new Date().toISOString(),
    anio_cuerpo: anioCuerpo,
    antiguedad_cuerpo: anios,
  }).eq('id', c.profesorId);

  if (error) {
    const falta = /servicios_/.test(error.message || '');
    return Response.json({ error: falta ? 'Falta ejecutar supabase/hoja_servicios.sql en Supabase.' : error.message }, { status: 500 });
  }
  return Response.json({ ok: true, anio_cuerpo: anioCuerpo, anios });
}
