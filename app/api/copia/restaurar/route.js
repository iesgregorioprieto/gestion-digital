/**
 * RESTAURAR UNA COPIA DE SEGURIDAD
 *
 * Lee el archivo que genera «Copia de seguridad» y repone sus filas.
 *
 * Una regla que no se salta: NUNCA SE BORRA NADA. Cada fila de la copia
 * se vuelve a escribir por su identificador —si existe, se sobrescribe
 * con lo de la copia; si no existe, se crea—. Lo que haya en la
 * aplicación y no esté en la copia se queda tal cual.
 *
 * Eso tiene una consecuencia que hay que saber: restaurar devuelve lo que
 * tenía la copia, pero no deshace lo que se haya creado después. Si
 * después de la copia se registraron ausencias nuevas, siguen ahí.
 *
 * Solo director y secretario. Tabla a tabla, para que un fallo en una no
 * deje las demás a medias.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';

export const dynamic = 'force-dynamic';

// Solo las tablas que genera la copia. Cualquier otra se rechaza: esto no
// puede servir para escribir donde no toca.
const PERMITIDAS = new Set([
  'profesores', 'grupos', 'alumnos', 'horarios_profesores', 'ausencias', 'dld',
  'apoyos_asignados', 'apoyos_guardia', 'apoyos_realizados', 'guardias_manuales',
  'mantenimiento', 'compras', 'actividades', 'config_centro',
  'periodos_no_lectivos', 'avisos_sala',
]);

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
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!['director', 'secretario'].includes(sesion.rol)) {
    return Response.json({ error: 'Solo dirección y secretaría pueden restaurar' }, { status: 403 });
  }

  try {
    const { tabla, filas } = await request.json();
    if (!PERMITIDAS.has(tabla)) {
      return Response.json({ error: `La tabla «${tabla}» no se puede restaurar` }, { status: 400 });
    }
    if (!Array.isArray(filas)) {
      return Response.json({ error: 'Datos incorrectos' }, { status: 400 });
    }

    const conId = filas.filter(f => f && f.id != null);
    const LOTE = 500;
    let repuestas = 0;
    for (let i = 0; i < conId.length; i += LOTE) {
      const { error } = await supa().from(tabla)
        .upsert(conId.slice(i, i + LOTE), { onConflict: 'id' });
      if (error) {
        return Response.json({ error: error.message, tabla, repuestas }, { status: 500 });
      }
      repuestas += Math.min(LOTE, conId.length - i);
    }

    return Response.json({ ok: true, tabla, repuestas, sin_id: filas.length - conId.length });
  } catch (e) {
    return Response.json({ error: e?.message || 'fallo' }, { status: 500 });
  }
}
