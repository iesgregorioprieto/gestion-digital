/**
 * COMUNICACIONES Y CONVOCATORIAS
 *
 * Un mismo circuito para dos cosas:
 *
 *   · Aviso        — llega, se lee y se da por enterado
 *   · Convocatoria — además tiene día, hora y lugar; se confirma
 *                    asistencia, se ficha en el momento de la reunión
 *                    y se pueden lanzar votaciones restringidas a
 *                    quienes hayan fichado
 *
 * Quién es destinatario lo decide SIEMPRE el servidor a partir de la
 * ficha del profesor. Si lo decidiera el navegador, bastaría con tocar
 * la petición para leer convocatorias ajenas.
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

/** Ficha del profesor, para saber a qué grupos pertenece */
async function fichaDe(cliente, id) {
  const { data } = await cliente
    .from('profesores')
    .select('id, nombre, apellidos, departamento, rol, rol_gestion')
    .eq('id', id);
  return (data || [])[0] || null;
}

const CARGOS = { director: 'director', secretario: 'secretario', jefe_estudios: 'jefe_estudios' };

function cargoDe(ficha) {
  const r = (ficha?.rol_gestion || '').toString().trim().toLowerCase();
  if (r.startsWith('director')) return 'director';
  if (r.startsWith('secretari')) return 'secretario';
  if (r.startsWith('jefe') || r.startsWith('jefa')) return 'jefe_estudios';
  return null;
}

/** ¿Le toca a esta persona? */
export function esDestinatario(c, ficha) {
  if (!ficha) return false;
  const roles = Array.isArray(ficha.rol) ? ficha.rol : [];
  const cargo = cargoDe(ficha);
  const directivo = !!cargo;

  switch (c.ambito) {
    case 'claustro':       return true;
    case 'jefes_dpto':     return roles.includes('jefe_departamento');
    case 'tutores':        return roles.includes('tutor');
    case 'jefes_estudios': return cargo === 'jefe_estudios';
    case 'director':       return cargo === 'director';
    case 'secretario':     return cargo === 'secretario';
    case 'equipo_directivo': return directivo;
    // La CCP la forman los jefes de departamento y el equipo directivo
    case 'ccp':            return roles.includes('jefe_departamento') || directivo;
    case 'departamento':
      return (ficha.departamento || '').trim().toLowerCase()
           === (c.departamento || '').trim().toLowerCase();
    case 'manual':
      return Array.isArray(c.destinatarios) && c.destinatarios.includes(ficha.id);
    default: return false;
  }
}

/** ¿Sigue abierto el fichaje? Lo decide el reloj del servidor */
function fichajeAbierto(c) {
  if (!c.fichaje_abierto_at) return false;
  if (!c.fichaje_minutos) return true;   // sin límite, hasta que se cierre
  const fin = new Date(c.fichaje_abierto_at).getTime() + c.fichaje_minutos * 60000;
  return Date.now() < fin;
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion', comunicaciones: [] }, { status: 401 });

  const cliente = supa();
  const url = new URL(request.url);
  const todas = url.searchParams.get('todas') === '1' && esDirectivo(sesion);

  const { data: lista, error } = await cliente
    .from('comunicaciones')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return Response.json({ error: error.message, comunicaciones: [] }, { status: 500 });

  const ficha = await fichaDe(cliente, sesion.id);
  const salida = [];

  for (const c of lista || []) {
    const mia = esDestinatario(c, ficha);

    // Dirección puede pedir todas para gestionarlas; el resto, solo las suyas
    if (!todas && !mia) continue;

    // Caducadas: no se enseñan al profesorado, sí a dirección
    if (!todas && c.caduca_at && new Date(c.caduca_at) < new Date()) continue;

    const { data: mias } = await cliente
      .from('comunicaciones_respuestas')
      .select('*')
      .eq('comunicacion_id', c.id)
      .eq('profesor_id', sesion.id);
    const miRespuesta = (mias || [])[0] || null;

    const fila = {
      ...c,
      esMia: mia,
      fichajeAbierto: fichajeAbierto(c),
      fichajeCierre: c.fichaje_abierto_at && c.fichaje_minutos
        ? new Date(new Date(c.fichaje_abierto_at).getTime() + c.fichaje_minutos * 60000)
        : null,
      miRespuesta,
    };

    // Dirección ve el detalle de quién ha respondido
    if (todas) {
      const { data: todasResp } = await cliente
        .from('comunicaciones_respuestas')
        .select('*')
        .eq('comunicacion_id', c.id);
      fila.respuestas = todasResp || [];

      // Y cuántas personas deberían recibirla
      const { data: profes } = await cliente
        .from('profesores')
        .select('id, departamento, rol, rol_gestion')
        .eq('estado', 'activo');
      fila.totalDestinatarios = (profes || []).filter(p => esDestinatario(c, p)).length;
    }

    salida.push(fila);
  }

  return Response.json({ comunicaciones: salida });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const { accion, id, datos } = await request.json();
    const cliente = supa();

    // ─── Responder: enterado, asistencia y fichaje ───
    if (['leida', 'asistencia', 'fichar'].includes(accion)) {
      const { data: cs } = await cliente.from('comunicaciones').select('*').eq('id', id);
      const c = (cs || [])[0];
      if (!c) return Response.json({ error: 'No existe' }, { status: 404 });

      const ficha = await fichaDe(cliente, sesion.id);
      if (!esDestinatario(c, ficha)) {
        return Response.json({ error: 'No va dirigida a ti' }, { status: 403 });
      }

      if (accion === 'fichar' && !fichajeAbierto(c)) {
        return Response.json({ error: 'El fichaje está cerrado' }, { status: 400 });
      }

      const fila = {
        comunicacion_id: c.id,
        profesor_id: sesion.id,
        profesor_nombre: `${ficha.apellidos}, ${ficha.nombre}`,
        leida_at: new Date().toISOString(),
      };
      if (accion === 'asistencia') fila.asistira = datos?.asistira === true;
      if (accion === 'fichar')     fila.fichado_at = new Date().toISOString();

      const { error } = await cliente
        .from('comunicaciones_respuestas')
        .upsert([fila], { onConflict: 'comunicacion_id,profesor_id' });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── A partir de aquí, solo dirección ───
    if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

    if (accion === 'crear') {
      if (!datos?.titulo?.trim())  return Response.json({ error: 'Falta el título' }, { status: 400 });
      if (!datos?.mensaje?.trim()) return Response.json({ error: 'Falta el mensaje' }, { status: 400 });

      const fila = {
        tipo: datos.tipo === 'convocatoria' ? 'convocatoria' : 'aviso',
        titulo: datos.titulo.trim(),
        mensaje: datos.mensaje.trim(),
        ambito: datos.ambito || 'claustro',
        departamento: datos.ambito === 'departamento' ? (datos.departamento || null) : null,
        destinatarios: datos.ambito === 'manual' ? (datos.destinatarios || []) : null,
        fecha_reunion: datos.fecha_reunion || null,
        hora_reunion: datos.hora_reunion || null,
        lugar: datos.lugar || null,
        caduca_at: datos.caduca_at || null,
        creada_por: sesion.nombre || 'Dirección',
      };

      const { data, error } = await cliente.from('comunicaciones').insert([fila]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    if (accion === 'abrir_fichaje') {
      const { error } = await cliente.from('comunicaciones').update({
        fichaje_abierto_at: new Date().toISOString(),
        fichaje_minutos: datos?.minutos ? parseInt(datos.minutos, 10) : null,
      }).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'cerrar_fichaje') {
      // Se cierra dejando el minutaje a cero desde ahora
      const { error } = await cliente.from('comunicaciones')
        .update({ fichaje_minutos: 0, fichaje_abierto_at: new Date(Date.now() - 1000).toISOString() })
        .eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // Fichar a mano a quien no tenga la aplicación
    if (accion === 'fichar_a_mano') {
      const { data: profes } = await cliente
        .from('profesores').select('nombre, apellidos').eq('id', datos?.profesor_id);
      const p = (profes || [])[0];
      if (!p) return Response.json({ error: 'Ese profesor no existe' }, { status: 400 });

      const { error } = await cliente.from('comunicaciones_respuestas').upsert([{
        comunicacion_id: id,
        profesor_id: datos.profesor_id,
        profesor_nombre: `${p.apellidos}, ${p.nombre}`,
        fichado_at: new Date().toISOString(),
        a_mano_por: sesion.nombre || 'Dirección',
      }], { onConflict: 'comunicacion_id,profesor_id' });
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'cerrar') {
      const { error } = await cliente.from('comunicaciones')
        .update({ estado: 'cerrada' }).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'eliminar') {
      const { error } = await cliente.from('comunicaciones').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: 'Error al procesar la petición' }, { status: 500 });
  }
}
