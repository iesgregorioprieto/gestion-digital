import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

export const dynamic = 'force-dynamic';

/**
 * CONSULTA GENÉRICA CON CLAVE DE SERVICIO
 *
 * Antes, muchas pantallas leían directamente con getSupabase() desde el
 * navegador. Las tablas que tienen RLS cerrado (profesores, horarios,
 * actividades, mantenimiento...) rechazaban la consulta en silencio: la
 * pantalla se pintaba vacía sin dar error.
 *
 * Este endpoint centraliza esas lecturas. Solo permite las tablas y
 * columnas declaradas abajo, y comprueba la sesión antes de responder.
 * No es un SELECT * abierto: cada tabla tiene un recorte de columnas y
 * un nivel de acceso (todo el profesorado o solo dirección).
 */

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
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

// ── Tablas permitidas ──
// 'columns' es lo que se pide a Supabase (string de select).
// 'directivo' restringe a equipo directivo.
const TABLAS = {
  profesores: {
    columns: 'id, nombre, apellidos, email, departamento, especialidad, tipo_contrato, estado, rol, rol_gestion, grupo_tutoria, titular_id, sustituto_id, en_baja, tipo_baja, anio_centro, anio_cuerpo, anio_nacimiento, antiguedad_centro, antiguedad_cuerpo',
    directivo: false,
  },
  profesores_gestion: {
    // Alias: misma tabla, con más campos, y solo para dirección.
    // NUNCA '*': la tabla tiene password_hash y no hay ningún motivo
    // para que un hash de contraseña salga hacia el navegador.
    tabla_real: 'profesores',
    columns: 'id, nombre, apellidos, email, departamento, especialidad, tipo_contrato, estado, rol, rol_gestion, grupo_tutoria, titular_id, sustituto_id, en_baja, tipo_baja, fecha_baja, anio_centro, anio_cuerpo, anio_nacimiento, antiguedad_centro, antiguedad_cuerpo, telefono, created_at',
    directivo: true,
  },
  horarios_profesores: {
    columns: 'id, profesor_nombre_pdf, hora_id, hora_label, tipo, grupo, materia, dia, aula, curso_academico',
    directivo: false,
  },
  grupos: {
    columns: 'id, codigo, curso_academico',
    directivo: false,
  },
  actividades: {
    columns: '*',
    directivo: false,
  },
  actividades_pga: {
    columns: 'id, actividad, localidad, departamento, curso_academico',
    directivo: false,
  },
  // Personal: cada uno ve las suyas. Dirección las ve todas.
  // Antes el filtro por profesor_id lo ponía el navegador, y el rol
  // salía de sessionStorage, que se edita desde la consola. Con la
  // clave de servicio saltándose el RLS, eso dejaba las incidencias de
  // todo el claustro al alcance de cualquiera. Ahora lo impone el
  // servidor con el id de la sesión firmada.
  mantenimiento: {
    columns: '*',
    directivo: false,
    propio: 'profesor_id',
    salvoDirectivo: true,
  },
  config_centro: {
    columns: '*',
    directivo: false,
  },
  // Las guardias las consulta todo el profesorado: quien cubre necesita
  // saber a quien le toca. No lleva motivos de ausencia ni nada personal.
  apoyos_asignados: {
    columns: '*',
    directivo: false,
  },

  // Ausencias: solo dirección. El profesorado ve las suyas por
  // /api/ausencias?mias=1, que ya filtra por su id.
  ausencias: {
    columns: '*',
    directivo: true,
  },

  // Avisos de la sala de profesores: los ve todo el claustro.
  avisos_sala: {
    columns: '*',
    directivo: false,
  },

  // Vacaciones y festivos: los necesita cualquiera que pida un día.
  periodos_no_lectivos: {
    columns: '*',
    directivo: false,
  },

  // Suscripciones a los avisos push: cada uno comprueba la suya.
  // Cada uno comprueba la suya, y solo la suya: ni dirección necesita
  // ver los endpoints de avisos de los demás.
  push_suscripciones: {
    columns: 'id, endpoint, profesor_id',
    directivo: false,
    propio: 'profesor_id',
    salvoDirectivo: false,
  },
};

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const body = await request.json();
  const { tabla, filtros = [], orden, limite, rpc, rpcParams, rango, contar } = body;

  // ── RPC ──
  if (rpc) {
    const { data, error } = await supa().rpc(rpc, rpcParams || {});
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ data });
  }

  // ── SELECT ──
  const cfg = TABLAS[tabla];
  if (!cfg) return Response.json({ error: `Tabla no permitida: ${tabla}` }, { status: 403 });
  if (cfg.directivo && !esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  const tablaReal = cfg.tabla_real || tabla;

  // Las columnas que pide el navegador se comprueban contra las
  // permitidas. Antes se pasaban tal cual a Supabase, así que la lista
  // de arriba no servía de nada: cualquiera podía pedir '*' sobre
  // profesores y llevarse el hash de las contraseñas.
  let columnas = cfg.columns;
  if (body.columns && body.columns !== '*') {
    if (cfg.columns === '*') {
      columnas = body.columns;                       // tabla sin recorte
    } else {
      const permitidas = cfg.columns.split(',').map(c => c.trim());
      const pedidas = body.columns.split(',').map(c => c.trim()).filter(Boolean);
      const fuera = pedidas.filter(c => !permitidas.includes(c));
      if (fuera.length > 0) {
        return Response.json(
          { error: `Columnas no permitidas en ${tabla}: ${fuera.join(', ')}` },
          { status: 403 }
        );
      }
      columnas = pedidas.join(', ');
    }
  }

  const opcionesSelect = contar ? { count: 'exact' } : undefined;
  let query = supa().from(tablaReal).select(columnas, opcionesSelect);

  // Filtro por persona impuesto por el servidor, con el id de la sesión
  // firmada. No se puede evitar desde el navegador.
  if (cfg.propio) {
    const puedeVerTodo = cfg.salvoDirectivo && esDirectivo(sesion);
    if (!puedeVerTodo) query = query.eq(cfg.propio, sesion.id);
  }

  // Filtros: [{ col, op, val }]
  for (const f of filtros) {
    if (f.op === 'eq') query = query.eq(f.col, f.val);
    else if (f.op === 'neq') query = query.neq(f.col, f.val);
    else if (f.op === 'in') query = query.in(f.col, f.val);
    else if (f.op === 'ilike') query = query.ilike(f.col, f.val);
    else if (f.op === 'is') query = query.is(f.col, f.val);
    else if (f.op === 'not.is') query = query.not(f.col, 'is', f.val);
    else if (f.op === 'lte') query = query.lte(f.col, f.val);
    else if (f.op === 'gte') query = query.gte(f.col, f.val);
    else if (f.op === 'or') query = query.or(f.val);
    else if (f.op === 'limit') query = query.limit(f.val);
  }

  if (orden) {
    for (const o of Array.isArray(orden) ? orden : [orden]) {
      query = query.order(o.col, { ascending: o.asc !== false });
    }
  }

  if (limite) query = query.limit(limite);
  if (rango && Array.isArray(rango)) query = query.range(rango[0], rango[1]);

  const { data, error, count } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data: data || [], count });
}
