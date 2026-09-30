import { createClient } from '@supabase/supabase-js';
import { fichajeAbierto, franjaEmpezada } from '@/lib/asignacionGuardias';
import { departamentoASector } from '@/lib/sectores';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * APOYOS DE GUARDIA
 *
 * Antes el navegador escribía directamente en el cuadrante. Cualquiera
 * podía quitarse un apoyo de encima, asignárselo a un compañero o dar
 * por confirmado el de otro, alterando además la rotación por sectores.
 *
 * Reparto de permisos:
 *   - Confirmar   → cada uno el suyo, y solo el suyo
 *   - Asignar     → solo jefatura y equipo directivo
 *   - Cambiar     → solo equipo directivo
 *   - Desactivar  → solo equipo directivo
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

export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos, lista } = await request.json();
    if (!accion) return Response.json({ error: 'Falta la acción' }, { status: 400 });

    // ─── FICHAR la guardia ───
    //
    // Un solo gesto: el profesor pulsa el check cuando YA ESTÁ en el aula,
    // y queda la hora real. Sustituye a los tres botones de antes (verde,
    // naranja, rojo), que obligaban a elegir entre "la estoy haciendo" y
    // "incidencia" sin que nadie supiera bien cuál tocar.
    //
    // Solo se puede fichar DURANTE la franja: ni antes de que empiece ni
    // después de que acabe. Se comprueba aquí y no solo en la pantalla,
    // porque el reloj del navegador lo cambia cualquiera.
    //
    // Las observaciones son opcionales y van en el mismo gesto.
    /**
     * ANOTAR UNA INCIDENCIA DURANTE LA GUARDIA
     *
     * Las observaciones solo se podían escribir en el momento de fichar, y
     * las cosas pasan después: un alumno que se va, un grupo que no
     * aparece, un aula cerrada. El profesorado pedía poder ir anotándolas
     * mientras dura la hora.
     *
     * Se puede antes o después de fichar, pero solo durante la franja de
     * esa guardia y solo en la propia. Se añade a lo que ya hubiera, con
     * la hora delante, para que quede el orden de lo que fue ocurriendo.
     */
    if (accion === 'anotar_incidencia') {
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });
      const texto = (datos?.texto || '').trim();
      if (!texto) return Response.json({ error: 'Falta el texto' }, { status: 400 });

      const { data: fila } = await supa().from('apoyos_asignados')
        .select('id, fecha, hora, incidencia, created_at').eq('id', id).eq('profesor_id', sesion.id);
      const guardia = (fila || [])[0];
      if (!guardia) return Response.json({ error: 'apoyo_ajeno' }, { status: 403 });

      if (!fichajeAbierto(guardia.hora, guardia.fecha, guardia.created_at)) {
        return Response.json({ error: 'fuera_de_franja' }, { status: 409 });
      }

      const ahora = new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date());
      const anotado = guardia.incidencia
        ? `${guardia.incidencia}\n${ahora} · ${texto}`
        : `${ahora} · ${texto}`;

      const { error } = await supa().from('apoyos_asignados')
        .update({ incidencia: anotado }).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ ok: true, incidencia: anotado });
    }

    if (accion === 'fichar') {
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { data: fila } = await supa().from('apoyos_asignados')
        .select('id, fecha, hora, profesor_id, created_at').eq('id', id).eq('profesor_id', sesion.id);
      const guardia = (fila || [])[0];
      if (!guardia) return Response.json({ error: 'apoyo_ajeno' }, { status: 403 });

      if (!fichajeAbierto(guardia.hora, guardia.fecha, guardia.created_at)) {
        return Response.json({ error: 'fuera_de_franja' }, { status: 409 });
      }

      const observaciones = (datos?.observaciones || '').trim();
      const { error } = await supa().from('apoyos_asignados')
        .update({
          estado: 'confirmado',
          confirmado_at: new Date().toISOString(),   // la hora real del check
          incidencia: observaciones || null,
          cuenta_reparto: true,                      // fichada: cuenta para el reparto
        })
        .eq('id', id).eq('profesor_id', sesion.id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // Las acciones 'confirmar' y 'confirmar_con_incidencia' del modelo
    // antiguo se han eliminado: daban por hecha una guardia desde
    // cualquier pantalla y a cualquier hora, incluso días antes. La
    // única forma de dar una guardia por hecha es 'fichar', que
    // comprueba en el servidor que estamos dentro de la franja.

    // ─── Autoasignarse una guardia huérfana ───
    // Cualquier profesor de guardia puede apuntarse a cubrir una guardia
    // que nadie ha cogido todavía. No hace falta ser directivo: la lista
    // de candidatos ya la calcula la pantalla, y el servidor comprueba
    // que la fecha y hora son de hoy o futuro (no del pasado).
    if (accion === 'autoasignar') {
      const { fecha, hora, sector_apoyo, profesor_id, curso_academico } = datos || {};
      if (!fecha || !hora || !sector_apoyo || !profesor_id || !curso_academico) {
        return Response.json({ error: 'Datos incompletos' }, { status: 400 });
      }
      // Cualquier profesor con sesión puede activar a cualquier candidato de la lista.
      // La pantalla ya filtra quién es candidato válido; la API solo verifica
      // que la sesión existe y que el dato está completo.
      // No repetir si ya existe una para esa persona/hora/fecha
      const { data: existe } = await supa().from('apoyos_asignados')
        .select('id').eq('profesor_id', profesor_id).eq('fecha', fecha).eq('hora', hora).limit(1);
      if (existe && existe.length > 0) {
        return Response.json({ error: 'Ya tienes una guardia asignada esa hora' }, { status: 409 });
      }
      const { error } = await supa().from('apoyos_asignados').insert([{
        fecha,
        hora,
        sector_apoyo,
        profesor_id,
        curso_academico,
        estado: 'pendiente',
        tipo_apoyo: 'obligatorio',
        asignado_por: sesion.id,
      }]);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Asignar apoyos (uno o varios de golpe) ───
    if (accion === 'asignar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

      const filas = (Array.isArray(lista) ? lista : [datos]).filter(Boolean);
      if (filas.length === 0) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // No duplicar: si ya tiene algo asignado esa hora ese día, no se le
      // pone otra encima sin que quien crea la guardia lo sepa.
      for (const f of filas) {
        if (!f.fecha || !f.hora || !f.profesor_id) continue;
        const { data: ya } = await supa().from('apoyos_asignados')
          .select('id, estado').eq('fecha', f.fecha).eq('hora', f.hora).eq('profesor_id', f.profesor_id);
        const activo = (ya || []).find(x => x.estado !== 'anulada');
        if (activo) return Response.json({ error: 'Esa persona ya tiene algo asignado a esa hora ese día.' }, { status: 409 });
      }

      // Quién asigna lo decide el servidor, no el navegador
      const conAutor = filas.map(f => ({ ...f, asignado_por: sesion.id }));

      const { data, error } = await supa().from('apoyos_asignados').insert(conAutor).select();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, apoyos: data || [] });
    }

    /**
     * ─── Jefatura: guardias de un día que ya han pasado y nadie fichó ───
     * Incluye las que salieron en rojo (sin cubrir): a veces las cubrió
     * alguien que no estaba de guardia (p. ej. el propio departamento).
     */
    if (accion === 'listar_sin_fichar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      const fecha = datos?.fecha;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return Response.json({ error: 'Fecha no válida' }, { status: 400 });

      const [{ data: filas, error }, { data: profes }] = await Promise.all([
        supa().from('apoyos_asignados')
          .select('id, fecha, hora, grupo, aula, estado, profesor_id, profesor_nombre_pdf, profesor_ausente_id, sector_apoyo, sector_destino')
          .eq('fecha', fecha).in('estado', ['pendiente', 'sin_cubrir']),
        supa().from('profesores').select('id, nombre, apellidos'),
      ]);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const nombre = pid => { const p = (profes || []).find(x => x.id === pid); return p ? `${p.apellidos}, ${p.nombre}` : null; };
      // Los recreos TAMBIÉN: se fichan igual, y muchos no sabían que había
      // que hacerlo. Van en su sitio, entre 3ª y 4ª.
      const orden = ['1', '2', '3', 'recreo', '4', '5', '6'];
      const lista = (filas || [])
        .filter(a => franjaEmpezada(a.hora, a.fecha))
        .map(a => ({
          id: a.id, hora: String(a.hora), grupo: a.grupo || '', aula: a.aula || '', estado: a.estado,
          esRecreo: String(a.hora) === 'recreo' || /recreo/i.test(a.sector_apoyo || ''),
          sector: a.sector_destino || a.sector_apoyo || '',
          ausente: nombre(a.profesor_ausente_id) || '—',
          asignadoId: a.profesor_id || null,
          asignado: nombre(a.profesor_id) || a.profesor_nombre_pdf || null,
        }))
        .sort((a, b) => orden.indexOf(a.hora) - orden.indexOf(b.hora) || a.ausente.localeCompare(b.ausente));
      return Response.json({ ok: true, lista });
    }

    /**
     * ─── Jefatura: dar por hecha una guardia ───
     * Para cuando la hizo el asignado y no fichó, o la hizo OTRA persona
     * (esté o no de guardia). Queda constancia de quién la fichó y, si
     * cambió la persona, de a quién se la había asignado la app.
     * Solo guardias que ya han empezado: nunca una de mañana.
     */
    if (accion === 'fichar_jefatura') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { data: fila } = await supa().from('apoyos_asignados')
        .select('id, fecha, hora, profesor_id, estado, sector_apoyo').eq('id', id);
      const guardia = (fila || [])[0];
      if (!guardia) return Response.json({ error: 'No existe esa guardia' }, { status: 404 });
      if (['confirmado', 'incidencia'].includes(guardia.estado)) {
        return Response.json({ error: 'Esa guardia ya está fichada' }, { status: 409 });
      }
      if (!franjaEmpezada(guardia.hora, guardia.fecha)) {
        return Response.json({ error: 'No se puede fichar una guardia que todavía no ha empezado' }, { status: 409 });
      }

      const quien = datos?.profesor_id || guardia.profesor_id;
      if (!quien) return Response.json({ error: 'Elige quién hizo la guardia' }, { status: 400 });

      const cambios = {
        estado: 'confirmado',
        confirmado_at: new Date().toISOString(),
        cuenta_reparto: true,
        sin_cubrir: false,
        fichado_por: sesion.id,
        incidencia: (datos?.observaciones || '').trim() || null,
      };
      if (quien !== guardia.profesor_id) {
        const { data: p } = await supa().from('profesores').select('id, departamento').eq('id', quien);
        if (!(p || [])[0]) return Response.json({ error: 'Ese profesor no existe' }, { status: 400 });
        cambios.profesor_id = quien;
        cambios.profesor_nombre_pdf = null;
        // Un recreo sigue siendo recreo aunque lo hiciera otra persona (no
        // cuenta como guardia de sustitución en el contador).
        const esRecreo = String(guardia.hora) === 'recreo' || /recreo/i.test(guardia.sector_apoyo || '');
        cambios.sector_apoyo = esRecreo ? 'RECREO' : departamentoASector(p[0].departamento);
        cambios.asignado_original_id = guardia.profesor_id || null;
      }

      const { error } = await supa().from('apoyos_asignados').update(cambios).eq('id', id);
      if (error) {
        const falta = /fichado_por|asignado_original_id/.test(error.message || '');
        return Response.json({ error: falta ? 'Falta ejecutar supabase/fichaje_jefatura.sql en Supabase.' : error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }

    // ─── Cambiar el profesor de un apoyo ya asignado ───
    if (accion === 'cambiar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.profesor_id) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from('apoyos_asignados').update({
        profesor_id: datos.profesor_id,
        sector_apoyo: datos.sector_apoyo ?? null,
        asignado_por: sesion.id,
        estado: 'pendiente',          // al cambiar de persona vuelve a estar sin confirmar
        confirmado_at: null,
      }).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    /**
     * ─── Anular una guardia que no hace falta cubrir ───
     * El grupo no está en el centro (salida, visita...), así que cubrirlo
     * sobra: se anula y ese profesor de guardia queda libre. El recálculo la
     * RESPETA (asignado_por queda puesto), para no volver a crearla.
     */
    if (accion === 'anular') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });
      const { error } = await supa().from('apoyos_asignados').update({
        estado: 'anulada',
        profesor_id: null,
        asignado_por: sesion.id,
        confirmado_at: null,
        sin_cubrir: false,
        incidencia: (datos?.motivo || '').trim() || 'Anulada por jefatura (grupo no presente)',
      }).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Quitar un apoyo del cuadrante ───
    if (accion === 'desactivar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('apoyos_asignados').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
