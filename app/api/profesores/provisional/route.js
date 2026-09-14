import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { cifrarPassword } from '@/lib/password';

let _c = null;
function supa() {
  if (!_c) _c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return _c;
}
async function sesionDe(req) {
  const secreto = process.env.SESSION_SECRET; if (!secreto) return null;
  const m = (req.headers.get('cookie')||'').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  const { nombre, apellidos, departamento, email } = await request.json().catch(() => ({}));
  if (!nombre?.trim() || !apellidos?.trim() || !departamento?.trim() || !email?.trim())
    return Response.json({ error: 'Faltan datos obligatorios' }, { status: 400 });

  const emailLimpio = email.trim().toLowerCase();
  const { data: ex } = await supa().from('profesores').select('id, estado, password_hash').ilike('email', emailLimpio);
  const ya = (ex || [])[0];
  if (ya && ya.estado === 'activo' && ya.password_hash && !ya.provisional)
    return Response.json({ error: 'Ya existe una cuenta activa con ese email' }, { status: 409 });

  const datos = {
    nombre: nombre.trim(), apellidos: apellidos.trim(), departamento: departamento.trim(),
    email: emailLimpio, password_hash: await cifrarPassword('1234'),
    estado: 'activo', provisional: true, email_verificado: true,
    rol: ['profesor'], solicitud_acceso: true,
    creado_por: sesion.nombre || 'Dirección',
  };

  let id;
  if (ya) {
    const { error } = await supa().from('profesores').update(datos).eq('id', ya.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    id = ya.id;
  } else {
    const { data, error } = await supa().from('profesores').insert(datos).select('id');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    id = (data || [])[0]?.id;
  }
  return Response.json({ ok: true, id });
}
