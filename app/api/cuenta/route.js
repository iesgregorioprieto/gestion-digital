import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * Operaciones con contraseñas. Todas se hacen aquí, en el servidor,
 * para que el navegador nunca tenga que leer ni un solo hash.
 */

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const hex = a => Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');

async function calcularHash(password, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256
  );
  return { salt, hash: hex(new Uint8Array(bits)), completo: hex(salt) + ':' + hex(new Uint8Array(bits)) };
}

async function coincide(password, guardado) {
  if (!guardado) return false;
  // Solo se aceptan hashes PBKDF2 (salt:hash). La comparación en texto
  // plano se eliminó: era la tercera copia de la misma rama antigua.
  if (!guardado.includes(':')) return false;
  const [saltHex, hashHex] = guardado.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const { hash } = await calcularHash(password, salt);
  return hash === hashHex;
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

export async function POST(request) {
  try {
    const { accion, email, password, passwordActual, passwordNueva } = await request.json();

    // ─── ¿Este email ya tiene contraseña? (para el registro) ───
    // Solo devuelve sí/no, nunca el hash.
    if (accion === 'estado_registro') {
      const em = (email || '').trim().toLowerCase();
      if (!em) return Response.json({ error: 'Falta el email' }, { status: 400 });

      const { data } = await supa()
        .from('profesores')
        .select('id, password_hash, solicitud_acceso, estado')
        .ilike('email', em);

      const p = (data || [])[0];
      if (!p) return Response.json({ existe: false });

      return Response.json({
        existe: true,
        id: p.id,
        tienePassword: !!(p.password_hash && p.password_hash.length > 0),
        solicitudEnviada: !!p.solicitud_acceso,
        estado: p.estado,
      });
    }

    // ─── Establecer contraseña al registrarse ───
    if (accion === 'registrar_password') {
      const em = (email || '').trim().toLowerCase();
      if (!em || !password || password.length < 6) {
        return Response.json({ error: 'Datos incompletos' }, { status: 400 });
      }

      const { data } = await supa()
        .from('profesores').select('id, password_hash').ilike('email', em);
      const p = (data || [])[0];

      // No se permite sobrescribir la contraseña de una cuenta que ya la tiene
      if (p?.password_hash?.length > 0) {
        return Response.json({ error: 'ya_tiene_password' }, { status: 409 });
      }

      const { completo } = await calcularHash(password);
      return Response.json({ ok: true, hash: completo, id: p?.id || null });
    }

    // ─── Cambiar la contraseña estando dentro ───
    if (accion === 'cambiar_password') {
      const sesion = await sesionDe(request);
      if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
      if (!passwordActual || !passwordNueva || passwordNueva.length < 6) {
        return Response.json({ error: 'Datos incompletos' }, { status: 400 });
      }

      const { data } = await supa()
        .from('profesores').select('password_hash').eq('id', sesion.id);
      const guardado = (data || [])[0]?.password_hash || '';

      if (!(await coincide(passwordActual, guardado))) {
        return Response.json({ error: 'password_incorrecta' }, { status: 403 });
      }

      const { completo } = await calcularHash(passwordNueva);
      const { error } = await supa()
        .from('profesores').update({ password_hash: completo }).eq('id', sesion.id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
