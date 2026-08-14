import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { cifrarPassword } from '@/lib/password';

/**
 * ALTA DE PROFESORADO
 *
 * Antes el alta la hacía el navegador: pedía el hash al servidor, se lo
 * quedaba, y él mismo escribía la fila en la tabla `profesores`. Eso
 * obligaba a dejarle permiso de INSERT y UPDATE sobre esa tabla, y con
 * la clave pública a la vista en el código de la página, cualquiera
 * podía cambiar la contraseña de cualquier persona del claustro.
 *
 * Ahora la fila la escribe el servidor. El navegador solo manda el
 * formulario; ni ve el hash ni toca la base de datos.
 */

const DOMINIO = '@educastillalamancha.es';

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function texto(v, max = 120) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function POST(request) {
  try {
    const cuerpo = await request.json();
    const email = texto(cuerpo.email, 150).toLowerCase();
    const nombre = texto(cuerpo.nombre);
    const apellidos = texto(cuerpo.apellidos);
    const departamento = texto(cuerpo.departamento);
    const esTutor = !!cuerpo.esTutor;
    const grupoTutoria = texto(cuerpo.grupoTutoria, 20).toUpperCase();
    const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';

    // ── Validaciones (las mismas que muestra el formulario) ──
    if (!nombre || !apellidos || !departamento) {
      return Response.json({ error: 'datos_incompletos' }, { status: 400 });
    }
    if (!email.endsWith(DOMINIO)) {
      return Response.json({ error: 'dominio_no_permitido' }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: 'password_corta' }, { status: 400 });
    }
    if (esTutor && !grupoTutoria) {
      return Response.json({ error: 'falta_grupo' }, { status: 400 });
    }

    // ── ¿Existe ya esa persona? ──
    const { data: filas, error: errBusca } = await supa()
      .from('profesores')
      .select('id, password_hash, solicitud_acceso, estado')
      .ilike('email', email);

    if (errBusca) return Response.json({ error: errBusca.message }, { status: 500 });

    const prof = (filas || [])[0];

    // Ya tiene contraseña: que entre por el login, no por aquí
    if (prof?.password_hash?.length > 0) {
      return Response.json({ estado: 'ya_registrado' });
    }
    // Ya pidió el acceso y está esperando aprobación
    if (prof?.solicitud_acceso && prof?.estado === 'pendiente') {
      return Response.json({ estado: 'pendiente_aprobacion' });
    }

    const datos = {
      nombre,
      apellidos,
      departamento,
      rol: esTutor ? ['profesor', 'tutor'] : ['profesor'],
      grupo_tutoria: esTutor ? grupoTutoria : null,
      password_hash: await cifrarPassword(password),
      solicitud_acceso: true,
      estado: 'pendiente',
    };

    // El estado y el cargo los decide siempre el servidor: aunque el
    // formulario mandase rol_gestion o estado 'activo', se ignoran.
    const escritura = prof
      ? await supa().from('profesores').update(datos).eq('id', prof.id)
      : await supa().from('profesores').insert({ ...datos, email });

    if (escritura.error) {
      return Response.json({ error: escritura.error.message }, { status: 500 });
    }

    return Response.json({ estado: 'registrado', nombre });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
