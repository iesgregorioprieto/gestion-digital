/**
 * GENERAR LA COPIA DE SEGURIDAD — lectura en el servidor
 *
 * Antes la copia se leía desde el navegador. Cuando se cerraron por
 * seguridad profesores, alumnos, ausencias y DLD, esas lecturas empezaron
 * a volver VACÍAS SIN DAR ERROR, y las copias salían con 0 filas en lo más
 * importante sin que nadie lo notara.
 *
 * Ahora se lee aquí, con la clave de servicio, un trozo de una tabla por
 * llamada (así ninguna respuesta es demasiado grande). Cada respuesta dice
 * además cuántas filas tiene la tabla en total, para que la pantalla
 * compruebe que no se ha quedado nada por el camino.
 *
 * Solo director y secretario: la copia lleva todos los datos del centro.
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { NOMBRES_COPIA, COLUMNAS_EXCLUIDAS } from '@/lib/tablasCopia';

export const dynamic = 'force-dynamic';

const TROZO = 1000;

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

// La tabla no existe en la base de datos (tabla antigua o aún no creada)
const noExiste = e => ['42P01', 'PGRST205'].includes(e?.code)
  || /does not exist|could not find the table/i.test(e?.message || '');

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!['director', 'secretario'].includes(sesion.rol)) {
    return Response.json({ error: 'Solo dirección y secretaría pueden hacer la copia' }, { status: 403 });
  }

  const url = new URL(request.url);
  const tabla = url.searchParams.get('tabla');

  // La ESTRUCTURA de la base de datos (tablas, permisos, funciones...).
  // La describe la función exportar_estructura(), que se crea una sola vez
  // con supabase/exportar_estructura.sql.
  if (tabla === '__estructura__') {
    const { data, error } = await supa().rpc('exportar_estructura');
    if (error) {
      const falta = /exportar_estructura/.test(error.message || '') && /(not find|does not exist|no existe)/i.test(error.message || '');
      return Response.json({
        error: falta
          ? 'Falta crear la función en Supabase: ejecuta supabase/exportar_estructura.sql en el SQL Editor'
          : error.message,
      }, { status: 500 });
    }
    return Response.json({ estructura: data || '' });
  }
  const desde = Math.max(0, parseInt(url.searchParams.get('desde') || '0', 10) || 0);
  if (!NOMBRES_COPIA.has(tabla)) {
    return Response.json({ error: `La tabla «${tabla}» no está en la copia` }, { status: 400 });
  }

  const cliente = supa();

  // Ordenar por id para que los trozos no se solapen ni se salten filas.
  // Si la tabla no tiene id, se lee sin orden (solo pasa en tablas pequeñas).
  let r = await cliente.from(tabla).select('*', { count: 'exact' })
    .order('id', { ascending: true }).range(desde, desde + TROZO - 1);
  if (r.error && r.error.code === '42703') {
    r = await cliente.from(tabla).select('*', { count: 'exact' })
      .range(desde, desde + TROZO - 1);
  }

  if (r.error) {
    if (noExiste(r.error)) return Response.json({ tabla, noExiste: true, filas: [], total: 0 });
    return Response.json({ error: r.error.message, tabla }, { status: 500 });
  }

  const fuera = COLUMNAS_EXCLUIDAS[tabla] || [];
  const filas = (r.data || []).map(f => {
    if (!fuera.length) return f;
    const copia = { ...f };
    fuera.forEach(c => delete copia[c]);
    return copia;
  });

  return Response.json({ tabla, filas, total: r.count ?? filas.length, desde });
}
