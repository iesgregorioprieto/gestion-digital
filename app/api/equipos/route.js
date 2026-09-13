/**
 * EQUIPOS DE TRABAJO
 *
 * Los ámbitos de siempre (claustro, CCP, tutores, un departamento…) salen
 * de la ficha de cada profesor. Pero hay grupos que no están en ninguna
 * ficha: una comisión de empleo, un grupo de trabajo, la comisión de
 * convivencia. Esos los forma quien convoca, a dedo, y se guardan aquí
 * para poder reutilizarlos cada vez.
 *
 * Los gestiona y los ve SOLO el equipo directivo. Al profesorado no le
 * aparece este módulo: a ellos les llega la convocatoria y ya está.
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

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion', equipos: [] }, { status: 401 });

  // Quién pertenece a qué equipo es información de gestión: solo dirección.
  // El profesorado no necesita esta lista para nada — a él le llega la
  // convocatoria ya filtrada por el servidor.
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'sin_permisos', equipos: [] }, { status: 403 });
  }

  const { data, error } = await supa()
    .from('equipos')
    .select('*')
    .order('nombre');

  if (error) return Response.json({ error: error.message, equipos: [] }, { status: 500 });
  return Response.json({ equipos: data || [] });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  try {
    const { accion, id, datos } = await request.json();
    const cliente = supa();

    if (accion === 'crear') {
      const nombre = (datos?.nombre || '').trim();
      if (!nombre) return Response.json({ error: 'Ponle un nombre al equipo' }, { status: 400 });

      const miembros = Array.isArray(datos?.miembros) ? datos.miembros : [];
      if (miembros.length === 0) {
        return Response.json({ error: 'Elige al menos una persona' }, { status: 400 });
      }

      const { data, error } = await cliente.from('equipos').insert([{
        nombre,
        miembros,
        creado_por: sesion.nombre || 'Dirección',
      }]).select('id');

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    if (accion === 'editar') {
      if (!id) return Response.json({ error: 'Falta el equipo' }, { status: 400 });

      const cambios = {};
      if (datos?.nombre !== undefined) {
        const nombre = (datos.nombre || '').trim();
        if (!nombre) return Response.json({ error: 'Ponle un nombre al equipo' }, { status: 400 });
        cambios.nombre = nombre;
      }
      if (datos?.miembros !== undefined) {
        if (!Array.isArray(datos.miembros) || datos.miembros.length === 0) {
          return Response.json({ error: 'Elige al menos una persona' }, { status: 400 });
        }
        cambios.miembros = datos.miembros;
      }

      // Ojo: editar un equipo NO cambia las convocatorias ya publicadas.
      // Cada convocatoria guarda la lista de destinatarios con la que se
      // envió, así que quitar a alguien de un equipo hoy no le borra de un
      // acta de la semana pasada.
      const { error } = await cliente.from('equipos').update(cambios).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'eliminar') {
      if (!id) return Response.json({ error: 'Falta el equipo' }, { status: 400 });
      const { error } = await cliente.from('equipos').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: 'Error al procesar la petición' }, { status: 500 });
  }
}
