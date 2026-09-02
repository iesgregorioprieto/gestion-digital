import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * DATOS DEL PROFESORADO
 *
 * La tabla contiene teléfonos y datos laborales. El navegador solo puede
 * leer las columnas públicas del claustro; todo lo demás pasa por aquí:
 *
 *   - Cada profesor puede ver su ficha completa (la suya)
 *   - El equipo directivo puede ver la de cualquiera
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

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const url = new URL(request.url);
  const mia = url.searchParams.get('mi_ficha') === '1';
  const estado = url.searchParams.get('estado');

  // ─── Mi propia ficha ───
  if (mia) {
    const { data, error } = await supa()
      .from('profesores')
      .select('id, nombre, apellidos, email, departamento, especialidad, tipo_contrato, antiguedad_centro, antiguedad_cuerpo, anio_centro, anio_cuerpo, telefono, rol, rol_gestion, grupo_tutoria')
      .eq('id', sesion.id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ profesor: (data || [])[0] || null });
  }

  // ─── Listado completo: solo equipo directivo ───
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'sin_permisos' }, { status: 403 });
  }

  // Columnas concretas. Con select('*') aquí se devolvían al navegador
  // los hash de contraseña, los tokens de activación y los de reseteo:
  // esta ruta usa la clave privilegiada, que se salta los permisos por
  // columna de la base de datos.
  const COLUMNAS = 'id, nombre, apellidos, email, email_corporativo, telefono, ' +
    'departamento, especialidad, estado, rol, rol_gestion, grupo_tutoria, ' +
    'tipo_contrato, antiguedad_centro, antiguedad_cuerpo, anio_centro, anio_cuerpo, ' +
    'autorizado, solicitud_acceso, email_verificado, en_baja, tipo_baja, fecha_baja, ' +
    'sustituto_id, titular_id, created_at';

  let consulta = supa().from('profesores').select(COLUMNAS).order('apellidos', { ascending: true });
  if (estado) consulta = consulta.eq('estado', estado);

  const { data, error } = await consulta;
  if (error) return Response.json({ error: error.message, profesores: [] }, { status: 500 });

  return Response.json({ profesores: data || [] });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const { accion, datos, id } = await request.json();

    // ─── Guardar mi propia ficha ───
    if (accion === 'guardar_mi_ficha') {
      // Campos que el profesor puede cambiar de sí mismo.
      // Ni el rol de gestión ni el estado: eso lo decide el secretario.
      const permitidos = [
        'nombre', 'apellidos', 'telefono', 'departamento', 'especialidad',
        'tipo_contrato', 'antiguedad_centro', 'antiguedad_cuerpo',
        'anio_centro', 'anio_cuerpo', 'rol', 'grupo_tutoria',
      ];
      const limpio = {};
      for (const k of permitidos) {
        if (datos && k in datos) limpio[k] = datos[k];
      }

      const { error } = await supa().from('profesores').update(limpio).eq('id', sesion.id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Ficha de otro profesor: solo equipo directivo ───
    if (accion === 'guardar_ficha') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('profesores').update(datos || {}).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Aprobar / reactivar: genera el token en el servidor ───
    //
    // El token de activación es lo que permite dar por verificado un
    // correo, así que el navegador no debe poder escribirlo. Antes lo
    // generaba la página y lo guardaba ella misma.
    // Vincula a su ficha los DLD que secretaría registró en papel antes
    // de que esta persona estuviera en el portal. Se cruzan por el correo.
    // Sin esto, esos días no le contarían en su cupo.
    async function vincularDldPendientes(profesorId) {
      try {
        const { data: profes } = await supa()
          .from('profesores')
          .select('email, nombre, apellidos, departamento, tipo_contrato, antiguedad_centro, antiguedad_cuerpo')
          .eq('id', profesorId);
        const p = (profes || [])[0];
        if (!p?.email) return 0;

        const { data: sueltas } = await supa()
          .from('dld')
          .select('id')
          .is('profesor_id', null)
          .ilike('email_solicitante', p.email.trim());

        if (!sueltas || sueltas.length === 0) return 0;

        const { error } = await supa()
          .from('dld')
          .update({
            profesor_id: profesorId,
            profesor_nombre: `${p.apellidos}, ${p.nombre}`,
            departamento: p.departamento || null,
            tipo_contrato: p.tipo_contrato || null,
            antiguedad_centro: p.antiguedad_centro ?? null,
            antiguedad_cuerpo: p.antiguedad_cuerpo ?? null,
          })
          .in('id', sueltas.map(x => x.id));

        if (error) { console.error('vincular DLD:', error.message); return 0; }
        return sueltas.length;
      } catch (e) {
        console.error('vincular DLD:', e?.message);
        return 0;
      }
    }

    if (accion === 'aprobar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const token = crypto.randomUUID();
      const cambios = { estado: 'activo', token_activacion: token };
      if (datos && datos.auth_ === true) cambios.auth_ = true;

      const { error } = await supa().from('profesores').update(cambios).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const vinculados = await vincularDldPendientes(id);
      return Response.json({ ok: true, token, dldVinculados: vinculados });
    }

    // ─── Cambiar el estado (activo / inactivo) ───
    if (accion === 'cambiar_estado') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.estado) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const cambios = { estado: datos.estado };
      if ('titular_id' in datos) cambios.titular_id = datos.titular_id;
      if ('baja_curso' in datos) cambios.baja_curso = datos.baja_curso;

      const { error } = await supa().from('profesores').update(cambios).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Bajas y sustituciones ───
    // Se acepta una lista de campos concreta: nunca lo que llegue del
    // navegador, para que por aquí no se cuele un cambio de cargo.
    if (accion === 'baja') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const permitidos = ['en_baja', 'tipo_baja', 'fecha_baja', 'sustituto_id', 'titular_id'];
      const cambios = {};
      for (const k of permitidos) if (k in datos) cambios[k] = datos[k];
      if (Object.keys(cambios).length === 0) {
        return Response.json({ error: 'Nada que cambiar' }, { status: 400 });
      }

      const { error } = await supa().from('profesores').update(cambios).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Alta manual de un profesor desde Datos del centro ───
    if (accion === 'alta_manual') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!datos?.email) return Response.json({ error: 'Falta el correo' }, { status: 400 });

      const { data: creado, error } = await supa().from('profesores').insert([datos]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const nuevoId = (creado || [])[0]?.id;
      const vinculados = nuevoId ? await vincularDldPendientes(nuevoId) : 0;
      return Response.json({ ok: true, dldVinculados: vinculados });
    }

    // ─── Marcar inactivos al cambiar de curso ───
    if (accion === 'cerrar_curso') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!Array.isArray(datos?.ids) || datos.ids.length === 0) {
        return Response.json({ error: 'Faltan los profesores' }, { status: 400 });
      }

      const { error } = await supa().from('profesores')
        .update({ estado: 'inactivo', baja_curso: datos.curso || null })
        .in('id', datos.ids);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrados: siempre en el servidor y solo equipo directivo ───
    //
    // Antes estos borrados los hacía el navegador directamente contra
    // Supabase, lo que obligaba a dejarle permiso de DELETE sobre la
    // tabla. Con la clave pública a la vista, cualquiera podía vaciar el
    // claustro entero desde la consola del navegador.
    if (accion === 'eliminar' || accion === 'eliminar_interinos'
        || accion === 'eliminar_inactivos' || accion === 'eliminar_demo') {

      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

      let consulta = supa().from('profesores').delete();

      if (accion === 'eliminar') {
        if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });
        // Nadie puede borrarse a sí mismo: evita quedarse sin secretario
        if (String(id) === String(sesion.id)) {
          return Response.json({ error: 'no_puedes_borrarte' }, { status: 400 });
        }
        consulta = consulta.eq('id', id);
      } else if (accion === 'eliminar_interinos') {
        consulta = consulta.like('tipo_contrato', 'Interino%');
      } else if (accion === 'eliminar_inactivos') {
        consulta = consulta.eq('estado', 'inactivo');
      } else {
        consulta = consulta.like('email', '%test%');
      }

      const { error } = await consulta;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
