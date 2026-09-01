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

import { avisarDireccion } from '@/lib/notificaciones';

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

    // Quien no es directivo solo puede crear en las tablas abiertas
    const puede = esDirectivo(sesion)
      || (accion === 'crear' && ABIERTAS_A_PROFESORADO.includes(tabla));
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

      // Actividad que no viene de la PGA: dirección tiene que autorizarla
      if (tabla === 'actividades') {
        const sinPga = conAutor.filter(f => f.en_pga === false);
        for (const act of sinPga) {
          avisarDireccion(supa(), 'actividad_sin_pga', {
            profesor: act.profesor_nombre || sesion.nombre || 'Un profesor/a',
            titulo: act.titulo || '',
            fechas: act.fecha_inicio === act.fecha_fin || !act.fecha_fin
              ? (act.fecha_inicio || '')
              : `${act.fecha_inicio} a ${act.fecha_fin}`,
            grupos: Array.isArray(act.grupos) ? act.grupos.join(', ') : '',
            lugar: act.lugar || '',
            curriculo: act.relacion_curricular || 'No indicada',
          }).catch(err => console.error('aviso actividad sin PGA:', err?.message));
        }
      }

      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Actualizar por identificador ───
    if (accion === 'actualizar') {
      if (!id || !datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from(tabla).update(datos).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Guardar creando o actualizando (configuración del curso) ───
    if (accion === 'guardar') {
      if (!datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from(tabla)
        .upsert(datos, onConflict ? { onConflict } : undefined);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
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

    // ─── Borrar ───
    if (accion === 'borrar') {
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
