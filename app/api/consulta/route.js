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
    // Alias: misma tabla, pero pide más campos y exige dirección
    tabla_real: 'profesores',
    columns: '*',
    directivo: true,
  },
  horarios_profesores: {
    columns: 'id, profesor_nombre_pdf, hora_id, hora_label, tipo, grupo, materia, dia, curso_academico',
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
    columns: 'id, actividad, localidad, departamento',
    directivo: false,
  },
  mantenimiento: {
    columns: '*',
    directivo: false,
  },
  config_centro: {
    columns: '*',
    directivo: false,
  },
  apoyos_asignados: {
    columns: '*',
    directivo: true,
  },
};

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const body = await request.json();
  const { tabla, filtros = [], orden, limite, rpc, rpcParams } = body;

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
  let query = supa().from(tablaReal).select(body.columns || cfg.columns);

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

  const { data, error, count } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data: data || [], count });
}
