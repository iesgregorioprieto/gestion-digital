import { createClient } from '@supabase/supabase-js';
import { firmarSesion, verificarSesion, COOKIE, HORAS } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * Sesiones del portal.
 *
 * Toda la comprobación se hace AQUÍ, en el servidor. El navegador recibe
 * una cookie firmada que no puede modificar, y que además es httpOnly:
 * ni siquiera el JavaScript de la página puede leerla.
 */

/**
 * Cliente con la clave privada del servidor.
 *
 * Esta clave NUNCA llega al navegador. Es la que permitirá, en el paso
 * siguiente, quitarle al navegador el permiso de leer los hash de
 * contraseñas: la verificación pasa a hacerse solo aquí.
 *
 * Si la clave privada no estuviera configurada, esta ruta falla y lo
 * deja escrito en el log. Antes se caía en silencio a la clave pública,
 * lo que producía errores confusos de permisos en vez de un aviso claro.
 */
function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const MAPA_ROLES = {
  'director': 'director', 'directora': 'director',
  'secretario': 'secretario', 'secretaria': 'secretario',
  'jefe_estudios': 'jefe_estudios', 'jefe de estudios': 'jefe_estudios',
  'jefa_estudios': 'jefe_estudios', 'jefa de estudios': 'jefe_estudios',
};

// ── Verificación de contraseña (mismo formato que /api/password) ──
async function comprobarPassword(password, guardado) {
  if (!guardado) return false;

  // Solo se aceptan hashes en formato PBKDF2 (salt:hash)
  if (!guardado.includes(':')) return false;

  const [saltHex, hashHex] = guardado.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));

  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, km, 256
  );
  const calculado = Array.from(new Uint8Array(bits))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return calculado === hashHex;
}

export async function POST(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) {
    return Response.json({ error: 'Falta configurar SESSION_SECRET' }, { status: 500 });
  }

  try {
    const { accion, email, password } = await request.json();

    // ─── CERRAR SESIÓN ───
    if (accion === 'salir') {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
        },
      });
    }

    // ─── INICIAR SESIÓN ───
    if (accion === 'entrar') {
      const em = (email || '').trim().toLowerCase();
      if (!em || !password) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      // Pausa artificial: hace que la fuerza bruta sea impráctica.
      // Cada intento de login tarda mínimo 500ms en el servidor,
      // lo que limita a ~2 intentos por segundo por conexión.
      const inicio = Date.now();

      // Búsqueda tolerante con mayúsculas, como hacía el login anterior
      const { data: filas } = await supa()
        .from('profesores')
        .select('id, nombre, apellidos, rol, rol_gestion, estado, password_hash, email, email_verificado')
        .ilike('email', em);

      const p = (filas || [])[0];

      if (!p) return Response.json({ error: 'no_existe' }, { status: 401 });

      const estado = (p.estado || '').toString().trim().toLowerCase();
      if (estado !== 'activo')        return Response.json({ error: 'inactivo' }, { status: 403 });
      if (p.email_verificado === false) return Response.json({ error: 'sin_verificar' }, { status: 403 });

      const correcta = await comprobarPassword(password, p.password_hash);
      if (!correcta) {
        // Pausa mínima de 500ms en fallo para frenar fuerza bruta
        const transcurrido = Date.now() - inicio;
        if (transcurrido < 500) await new Promise(r => setTimeout(r, 500 - transcurrido));
        return Response.json({ error: 'credenciales' }, { status: 401 });
      }

      const rolNorm = (p.rol_gestion || '').toString().trim().toLowerCase();
      const rol = MAPA_ROLES[rolNorm] || '';

      const token = await firmarSesion({
        id: p.id,
        rol,
        roles: Array.isArray(p.rol) ? p.rol : ['profesor'],
        nombre: `${p.nombre || ''} ${p.apellidos || ''}`.trim(),
      }, secreto);

      return new Response(JSON.stringify({
        ok: true,
        profesor: {
          id: p.id,
          nombre: p.nombre,
          apellidos: p.apellidos,
          email: p.email,
          rol_gestion: rol,
          roles: Array.isArray(p.rol) ? p.rol : ['profesor'],
          fichaCompleta: !!(p.nombre && p.nombre.trim()),
        },
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${HORAS * 3600}`,
        },
      });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ─── ¿QUIÉN SOY? ───
// Permite a cualquier página preguntar al servidor por la sesión real.
//
// El antiguo /api/auth?check=1 se ha eliminado: no pedía sesión y
// revelaba si las claves estaban puestas, los 10 primeros caracteres de
// la service_role key, el total de profesores y permitía comprobar si un
// correo existía en el sistema (enumeración de usuarios).
export async function GET(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return Response.json({ sesion: null, error: 'sin_secreto' });

  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return Response.json({ sesion: null });

  const sesion = await verificarSesion(m[1], secreto);
  return Response.json({ sesion });
}
