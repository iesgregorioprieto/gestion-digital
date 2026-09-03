/**
 * INCIDENCIAS DE LA APLICACIÓN
 *
 * Para que el profesorado avise de fallos y proponga mejoras sin tener
 * que buscar a nadie por los pasillos.
 *
 * Cualquiera con sesión puede abrir una y ver las suyas. Solo dirección
 * las atiende y cambia su estado.
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
  if (!sesion) return Response.json({ error: 'sin_sesion', incidencias: [] }, { status: 401 });

  const url = new URL(request.url);
  const soloMias = url.searchParams.get('mias') === '1';

  let consulta = supa()
    .from('incidencias_app')
    .select('*')
    .order('created_at', { ascending: false });

  // Un profesor solo ve las suyas; dirección las ve todas.
  if (soloMias || !esDirectivo(sesion)) {
    consulta = consulta.eq('profesor_id', sesion.id);
  }

  const { data, error } = await consulta;
  if (error) return Response.json({ error: error.message, incidencias: [] }, { status: 500 });
  return Response.json({ incidencias: data || [] });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const { accion, id, datos } = await request.json();

    // ─── Abrir una incidencia ───
    if (accion === 'crear') {
      const descripcion = (datos?.descripcion || '').trim();
      if (descripcion.length < 10) {
        return Response.json({ error: 'Cuenta un poco más qué ha pasado' }, { status: 400 });
      }

      const { error } = await supa().from('incidencias_app').insert([{
        profesor_id: sesion.id,
        profesor_nombre: sesion.nombre || '',
        modulo: datos.modulo || null,
        tipo: datos.tipo === 'sugerencia' ? 'sugerencia' : 'fallo',
        descripcion,
        foto_url: datos.foto_url || null,
        estado: 'nueva',
      }]);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Atenderla ───
    if (accion === 'atender') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const estado = datos?.estado;
      if (!['nueva', 'en_curso', 'resuelta', 'descartada'].includes(estado)) {
        return Response.json({ error: 'Estado no válido' }, { status: 400 });
      }

      const cambios = {
        estado,
        atendida_por: sesion.nombre || 'Dirección',
        resuelta_at: (estado === 'resuelta' || estado === 'descartada') ? new Date().toISOString() : null,
      };
      if (typeof datos.respuesta === 'string') cambios.respuesta = datos.respuesta.trim() || null;

      const { error } = await supa().from('incidencias_app').update(cambios).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: 'Error al procesar la petición' }, { status: 500 });
  }
}
