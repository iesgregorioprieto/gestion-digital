import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const { accion, email, token, nuevaPassword } = await request.json();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    if (accion === 'solicitar') {
      // Buscar profesor por email
      const { data: rows } = await supabase
        .from('profesores')
        .select('id, nombre, apellidos, email, estado')
        .ilike('email', email.trim().toLowerCase());

      const prof = (rows || [])[0];
      if (!prof || prof.estado !== 'activo') {
        // No revelar si el email existe o no por seguridad
        return Response.json({ ok: true, mensaje: 'Si el email existe, recibirás un enlace.' });
      }

      // Generar token único
      const resetToken = crypto.randomUUID().replace(/-/g, '');
      const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

      // Guardar token en la BD
      await supabase.from('profesores').update({
        reset_token: resetToken,
        reset_token_expira: expira,
      }).eq('id', prof.id);

      // Enviar email
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
      await fetch(baseUrl + '/api/enviar-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Acredita que la llamada sale del propio servidor, no de fuera
          'x-clave-interna': process.env.SESSION_SECRET || '',
        },
        body: JSON.stringify({
          tipo: 'recuperar_password',
          datos: {
            nombre: prof.nombre + ' ' + prof.apellidos,
            email: prof.email,
            enlace: baseUrl + '/recuperar?token=' + resetToken,
          }
        }),
      });

      return Response.json({ ok: true, mensaje: 'Si el email existe, recibirás un enlace.' });

    } else if (accion === 'verificar_token') {
      const { data: rows } = await supabase
        .from('profesores')
        .select('id, nombre, reset_token_expira')
        .eq('reset_token', token);

      const prof = (rows || [])[0];
      if (!prof) return Response.json({ ok: false, error: 'Token no válido' });

      if (new Date(prof.reset_token_expira) < new Date()) {
        return Response.json({ ok: false, error: 'El enlace ha caducado. Solicita uno nuevo.' });
      }

      return Response.json({ ok: true, nombre: prof.nombre });

    } else if (accion === 'cambiar') {
      // Verificar token
      const { data: rows } = await supabase
        .from('profesores')
        .select('id, reset_token_expira')
        .eq('reset_token', token);

      const prof = (rows || [])[0];
      if (!prof) return Response.json({ ok: false, error: 'Token no válido' });
      if (new Date(prof.reset_token_expira) < new Date()) {
        return Response.json({ ok: false, error: 'El enlace ha caducado.' });
      }

      // Hashear nueva contraseña
      const hashRes = await fetch((process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com') + '/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'hash', password: nuevaPassword }),
      });
      const { hash } = await hashRes.json();

      // Actualizar contraseña y borrar token
      await supabase.from('profesores').update({
        password_hash: hash,
        reset_token: null,
        reset_token_expira: null,
      }).eq('id', prof.id);

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (err) {
    console.error('Error recuperar:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
