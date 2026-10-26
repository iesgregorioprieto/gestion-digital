import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * TABLAS DE ORGANIZACIÓN DEL CENTRO
 *
 * Grupos, actividades complementarias, avisos de la sala de profesores,
 * configuración del curso y periodos no lectivos.
 *
 * Ninguna guarda datos personales delicados, pero sí cosas que pueden
 * dejar el portal inservible: borrar la configuración del curso deja sin
 * calcular los cupos de DLD y los días lectivos, y borrar los grupos
 * desmonta las autorizaciones del alumnado.
 *
 * Casi todo requiere equipo directivo. La excepción son las actividades
 * complementarias, que las propone cualquier profesor.
 */

import { enviarAviso, AVISOS_ACTIVIDADES } from '@/lib/notificaciones';
import { enviarPushA } from '@/lib/pushServidor';

const TABLAS = ['grupos', 'actividades', 'avisos_sala', 'config_centro', 'periodos_no_lectivos', 'actividades_pga'];

// Solo las actividades las puede crear cualquiera; el resto es de gestión
const ABIERTAS_A_PROFESORADO = ['actividades'];

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

    const { tabla, accion, id, datos, lista, filtro, onConflict } = await request.json();

    if (!TABLAS.includes(tabla)) {
      return Response.json({ error: 'tabla_no_valida' }, { status: 400 });
    }

    // Quien no es directivo solo puede crear en las tablas abiertas.
    // Además, quien propuso una actividad puede corregirla mientras siga
    // pendiente de autorizar (se comprueba abajo, en «actualizar»).
    const puede = esDirectivo(sesion)
      || ((accion === 'crear' || accion === 'insertar_lista') && ABIERTAS_A_PROFESORADO.includes(tabla))
      || (accion === 'actualizar' && tabla === 'actividades');
    if (!puede) return Response.json({ error: 'sin_permisos' }, { status: 403 });

    // ─── Crear (uno o varios) ───
    if (accion === 'crear') {
      const filas = (Array.isArray(lista) ? lista : [datos]).filter(Boolean);
      if (filas.length === 0) return Response.json({ error: 'Faltan datos' }, { status: 400 });
      if (filas.length > 600) return Response.json({ error: 'Lote demasiado grande' }, { status: 400 });

      // En actividades, quien la propone sale de la sesión
      const conAutor = ABIERTAS_A_PROFESORADO.includes(tabla) && !esDirectivo(sesion)
        ? filas.map(f => ({ ...f, profesor_id: sesion.id }))
        : filas;

      const { data, error } = await supa().from(tabla).insert(conAutor).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Toda propuesta de actividad se comunica a dirección y a jefatura,
      // esté o no en la PGA. Las que no figuran en ella se marcan aparte
      // en el correo, porque además necesitan autorización expresa.
      if (tabla === 'actividades') {
        // Nombres del profesorado acompañante, para que dirección vea en el
        // correo quién participa (petición de José María, oct. 2026).
        const nombrePorId = {};
        try {
          const ids = [...new Set(conAutor.flatMap(f => Array.isArray(f.acompanantes) ? f.acompanantes : []))];
          if (ids.length) {
            const { data: ps } = await supa().from('profesores')
              .select('id, nombre, apellidos').in('id', ids);
            for (const p of ps || []) nombrePorId[p.id] = `${p.nombre || ''} ${p.apellidos || ''}`.trim();
          }
        } catch (err) {
          console.error('nombres de acompañantes:', err?.message);
        }

        for (const act of conAutor) {
          const responsable = act.profesor_nombre || sesion.nombre || 'Un profesor/a';
          const acomp = (Array.isArray(act.acompanantes) ? act.acompanantes : [])
            .map(id => nombrePorId[id]).filter(Boolean);
          enviarAviso('actividad_sin_pga', AVISOS_ACTIVIDADES, {
            profesor: responsable,
            participantes: [`${responsable} (responsable)`, ...acomp],
            titulo: act.titulo || '',
            fechas: act.fecha_inicio === act.fecha_fin || !act.fecha_fin
              ? (act.fecha_inicio || '')
              : `${act.fecha_inicio} a ${act.fecha_fin}`,
            grupos: Array.isArray(act.grupos) ? act.grupos.join(', ') : '',
            lugar: act.lugar || '',
            curriculo: act.relacion_curricular || 'No indicada',
            enPga: act.en_pga === true,
          }).catch(err => console.error('aviso de actividad:', err?.message));
        }

        // Todas las actividades las autoriza el director (decisión de
        // José María): además del correo, le salta en el móvil.
        try {
          const cliente = supa();
          const { data: dirs } = await cliente.from('profesores')
            .select('id').eq('rol_gestion', 'director');
          const ids = (dirs || []).map(d => d.id).filter(id => id !== sesion.id);
          if (ids.length) {
            const primera = conAutor[0] || {};
            await enviarPushA(cliente, ids, {
              titulo: '🎒 Actividad por autorizar',
              cuerpo: `${primera.profesor_nombre || sesion.nombre || 'Un profesor/a'}: ${primera.titulo || 'actividad complementaria'}`
                + (primera.fecha_inicio ? ` (${primera.fecha_inicio})` : '')
                + (Array.isArray(primera.acompanantes) && primera.acompanantes.length
                  ? ` · ${primera.acompanantes.length + 1} profesores`
                  : ''),
              url: '/gestion/actividades',
            });
          }
        } catch (err) {
          console.error('push de actividad:', err?.message);
        }
      }

      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Actualizar por identificador ───
    if (accion === 'actualizar') {
      if (!id || !datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // Aprobar, rechazar o devolver a pendiente una actividad es cosa
      // solo del director. Jefatura puede editarla, pero no resolverla.
      if (tabla === 'actividades' && 'estado' in datos && sesion.rol !== 'director') {
        return Response.json({ error: 'Solo el director puede autorizar o rechazar una actividad' }, { status: 403 });
      }

      // El profesorado solo edita su propia propuesta y solo mientras
      // no esté autorizada ni rechazada. Una vez resuelta, se pide a
      // jefatura. Nunca puede tocar el estado ni el autor.
      if (tabla === 'actividades' && !esDirectivo(sesion)) {
        const { data: filas } = await supa().from('actividades')
          .select('profesor_id, estado').eq('id', id);
        const act = (filas || [])[0];
        if (!act || act.profesor_id !== sesion.id) {
          return Response.json({ error: 'Solo puedes editar las actividades que has propuesto tú' }, { status: 403 });
        }
        if ((act.estado || 'pendiente') !== 'pendiente') {
          return Response.json({ error: 'La actividad ya está resuelta: pide el cambio a jefatura' }, { status: 409 });
        }
        const PERMITIDOS = ['titulo', 'en_pga', 'fecha_inicio', 'fecha_fin', 'hora_salida', 'hora_regreso',
          'lugar', 'transporte', 'financiacion', 'coste_alumno', 'relacion_curricular', 'descripcion',
          'grupos', 'acompanantes', 'alumnos_asistentes', 'necesita_guardia', 'profesor_guardia'];
        const limpios = Object.fromEntries(Object.entries(datos).filter(([k]) => PERMITIDOS.includes(k)));
        // Se vuelve a exigir «pendiente» en la propia escritura, por si el
        // director la resuelve justo mientras el profesor la está editando.
        const { data: hechas, error } = await supa().from('actividades').update(limpios)
          .eq('id', id).eq('profesor_id', sesion.id).or('estado.is.null,estado.eq.pendiente').select('id');
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (!hechas?.length) {
          return Response.json({ error: 'La actividad acaba de resolverse: pide el cambio a jefatura' }, { status: 409 });
        }
        return Response.json({ ok: true });
      }

      const { error } = await supa().from(tabla).update(datos).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Guardar creando o actualizando (configuración del curso) ───
    //
    // Antes se hacía con `upsert` y `onConflict`, que exige que la
    // columna tenga una restricción de unicidad en la base de datos. Si
    // no la tiene, PostgreSQL rechaza la operación entera y el portal
    // decía que ya existía, sin dejar actualizar nada. Ahora se mira si
    // la fila está y se actualiza o se inserta, que funciona haya o no
    // esa restricción.
    if (accion === 'guardar') {
      if (!datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const clave = onConflict || null;

      if (clave && datos[clave] !== undefined && datos[clave] !== null) {
        const { data: existentes, error: eBuscar } = await supa()
          .from(tabla).select('id').eq(clave, datos[clave]);
        if (eBuscar) return Response.json({ error: eBuscar.message }, { status: 500 });

        if ((existentes || []).length > 0) {
          // Ya estaba: se actualiza. Si por lo que sea hubiera más de
          // una fila con el mismo curso, se actualizan todas y quedan
          // coherentes en vez de dejar una vieja por ahí.
          const { error } = await supa().from(tabla).update(datos).eq(clave, datos[clave]);
          if (error) return Response.json({ error: error.message }, { status: 500 });
          return Response.json({ ok: true, accion_real: 'actualizado' });
        }

        const { error } = await supa().from(tabla).insert([datos]);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, accion_real: 'creado' });
      }

      const { error } = await supa().from(tabla).insert([datos]);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, accion_real: 'creado' });
    }

    // ─── Desactivar el resto de cursos al activar uno ───
    if (accion === 'desactivar_otros') {
      if (tabla !== 'config_centro' || !filtro?.curso) {
        return Response.json({ error: 'Petición no válida' }, { status: 400 });
      }
      const { error } = await supa().from('config_centro')
        .update({ activo: false }).neq('curso', filtro.curso);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Insertar lista de registros (grupos, etc.) ───
    if (accion === 'insertar_lista') {
      // lista ya viene del destructuring de request.json() de arriba
      if (!Array.isArray(lista) || lista.length === 0) {
        return Response.json({ error: 'Lista vacía' }, { status: 400 });
      }
      const LOTE = 200;
      for (let i = 0; i < lista.length; i += LOTE) {
        const { error } = await supa().from(tabla).insert(lista.slice(i, i + LOTE));
        if (error) return Response.json({ error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true, insertados: lista.length });
    }

    // ─── Borrar todos (sin filtro, para limpiar al importar) ───
    if (accion === 'borrar_todos') {
      if (!['grupos', 'actividades_pga'].includes(tabla)) {
        return Response.json({ error: 'No permitido sin filtro para esta tabla' }, { status: 400 });
      }
      const { error } = await supa().from(tabla).delete().gt('id', 0);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrar ───
    if (accion === 'borrar') {
      // Al borrar un aviso con cartel, el archivo se va con él: no tiene
      // sentido ocupar espacio con carteles que ya no salen en ningún sitio.
      if (tabla === 'avisos_sala' && id) {
        const { data: filas } = await supa().from('avisos_sala').select('imagen_url').eq('id', id);
        const m = (filas?.[0]?.imagen_url || '').match(/\/object\/public\/carteles\/(.+)$/);
        if (m) await supa().storage.from('carteles').remove([decodeURIComponent(m[1])]);
      }

      let consulta = supa().from(tabla).delete();

      if (id) {
        consulta = consulta.eq('id', id);
      } else if (filtro?.curso_academico) {
        consulta = consulta.eq('curso_academico', filtro.curso_academico);
      } else {
        // Nunca un borrado sin filtro: vaciaría la tabla entera
        return Response.json({ error: 'Falta el filtro' }, { status: 400 });
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
