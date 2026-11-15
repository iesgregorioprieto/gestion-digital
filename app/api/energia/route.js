import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { claveServidor } from '@/lib/claveServidor';

/**
 * ENERGÍA DEL CENTRO
 *
 * POST: lo llama Home Assistant cada minuto con la producción solar y el
 *       consumo. Necesita la cabecera  Authorization: Bearer <clave>,
 *       y la clave está SOLO en la variable ENERGIA_TOKEN de Vercel
 *       (nunca escrita en el código, que está en GitHub).
 * GET:  devuelve el último dato. Sin sesión, igual que /api/sala: son
 *       datos del edificio, nada personal. La pantalla de la sala no
 *       llama aquí (lo recibe dentro de /api/sala, sin gastar llamadas
 *       de más); sirve para comprobar desde Home Assistant que llega.
 *
 * Se guarda en Supabase (tabla energia, una sola fila que se
 * sobrescribe), no en Redis: así no hay otro servicio que mantener.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function autorizado(req) {
  const token = process.env.ENERGIA_TOKEN;
  if (!token) return false;
  const esperado = Buffer.from(`Bearer ${token}`);
  const recibido = Buffer.from(req.headers.get('authorization') ?? '');
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

// Solo números; lo que no sea número se descarta.
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null));

// Se guardan solo los campos que pinta el panel, nada más de lo que
// llegue en el JSON.
// Home Assistant manda el formato plano { solar, red, consumo, ts };
// también se acepta el del documento de José María { ahora: {...}, hoy: {...} }.
function limpiar(d) {
  const a = (d.ahora && typeof d.ahora === 'object') ? d.ahora : d;
  const h = (d.hoy && typeof d.hoy === 'object') ? d.hoy : {};
  return {
    ts: typeof d.ts === 'string' ? d.ts.slice(0, 40) : null,
    ahora: { solar: num(a.solar), red: num(a.red), consumo: num(a.consumo) },
    hoy: { solar: num(h.solar), importada: num(h.importada), exportada: num(h.exportada), consumo: num(h.consumo) },
  };
}

// Vale si trae al menos una potencia numérica.
function valido(d) {
  if (!d || typeof d !== 'object') return false;
  const a = limpiar(d).ahora;
  return a.solar != null || a.red != null || a.consumo != null;
}

export async function POST(req) {
  if (!process.env.ENERGIA_TOKEN) {
    console.error('ENERGIA_TOKEN no configurada en Vercel — /api/energia rechaza los envíos');
    return Response.json({ error: 'no configurado' }, { status: 503 });
  }
  if (!autorizado(req)) {
    // Sin enseñar la clave: solo cómo llega, para saber qué falla.
    const cab = req.headers.get('authorization') ?? '';
    console.warn(`energia: clave rechazada (cabecera ${cab ? `«${cab.split(' ')[0]}», ${cab.length} caracteres` : 'ausente'}; se esperan ${7 + process.env.ENERGIA_TOKEN.length})`);
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }
  let datos;
  try { datos = await req.json(); } catch { datos = null; }
  if (!valido(datos)) {
    console.warn('energia: JSON no válido —', JSON.stringify(datos)?.slice(0, 300));
    return Response.json({ error: 'JSON no válido' }, { status: 400 });
  }
  try {
    const { error } = await supa().from('energia')
      .upsert({ id: 1, datos: limpiar(datos), recibido: new Date().toISOString() });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (e) {
    console.error('energia POST:', e.message);
    return Response.json({ error: 'no se pudo guardar' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data } = await supa().from('energia').select('datos, recibido').eq('id', 1).limit(1);
    const fila = (data || [])[0];
    const salida = fila ? { ...fila.datos, recibido: fila.recibido } : {};
    return Response.json(salida, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('energia GET:', e.message);
    return Response.json({}, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
