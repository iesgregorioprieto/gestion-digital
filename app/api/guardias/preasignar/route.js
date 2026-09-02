/**
 * PREASIGNACIÓN DE GUARDIAS
 *
 * Calcula quién cubre cada hueco de un día y lo deja registrado como
 * guardia pendiente, para que le llegue directamente al profesorado
 * en su módulo sin tener que pasar por jefatura de estudios.
 *
 * La llama cualquiera que abra el módulo de guardias. Es idempotente:
 * si una guardia ya está registrada para esa hora, ese grupo y esa
 * persona ausente, no se vuelve a crear. Las ya confirmadas no se
 * tocan nunca.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import {
  HORAS_GUARDIA, diaSemanaEs, construirCuadrante,
  prepararAusencias, asignacionesDeHora, normHora, normAbrev,
} from '@/lib/asignacionGuardias';

let _cliente = null;
function supa() {
  if (!_cliente) {
    _cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _cliente;
}

/**
 * Curso académico activo, leído con la clave de servidor.
 * No se usa getCursoActual() porque esa función crea un cliente
 * pensado para el navegador y aquí estamos en el servidor.
 */
async function cursoActivo(cliente) {
  // select('*') a propósito: la tabla no tiene siempre las mismas
  // columnas, y pedir uno que no existe hace fallar toda la consulta.
  const { data, error } = await cliente
    .from('config_centro')
    .select('*')
    .eq('activo', true)
    .limit(1);
  if (error) console.error('leer config_centro:', error.message);

  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
  // Sin configuración: se deduce de la fecha (de septiembre a agosto)
  const hoy = new Date();
  const anio = hoy.getFullYear();
  return hoy.getMonth() >= 8 ? `${anio}-${anio + 1}` : `${anio - 1}-${anio}`;
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

    const { fecha } = await request.json();
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return Response.json({ error: 'fecha_no_valida' }, { status: 400 });
    }

    const dia = diaSemanaEs(fecha);
    if (dia === 'sabado' || dia === 'domingo') {
      return Response.json({ ok: true, creadas: 0, motivo: 'fin_de_semana' });
    }

    const cliente = supa();
    const curso = await cursoActivo(cliente);

    // ─── Horarios del curso (paginados) ───
    let horarios = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await cliente
        .from('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
        .eq('curso_academico', curso)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      horarios = horarios.concat(data);
      if (data.length < 1000) break;
    }
    if (horarios.length === 0) {
      return Response.json({ ok: true, creadas: 0, motivo: 'sin_horarios' });
    }

    // ─── Profesorado ───
    const { data: profesores } = await cliente
      .from('profesores')
      .select('id,nombre,apellidos,departamento,especialidad');

    // ─── Faltas del día: ausencias y DLD aprobados ───
    const [rAus, rDld] = await Promise.all([
      cliente.from('ausencias')
        .select('profesor_id, horas, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', fecha)
        .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
      cliente.from('dld')
        .select('profesor_id, horas, fecha_solicitada')
        .eq('fecha_solicitada', fecha)
        .eq('estado', 'aprobada'),
    ]);

    const faltas = [
      ...(rAus.data || []).map(a => ({ ...a, tipo_falta: 'ausencia' })),
      ...(rDld.data || []).map(d => ({ ...d, tipo_falta: 'dld' })),
    ];
    if (faltas.length === 0) {
      return Response.json({ ok: true, creadas: 0, motivo: 'sin_ausencias' });
    }

    // ─── Guardias ya registradas ───
    const [{ data: yaHoy }, { data: delCurso }] = await Promise.all([
      cliente.from('apoyos_asignados').select('*').eq('fecha', fecha).eq('curso_academico', curso),
      cliente.from('apoyos_asignados').select('sector_apoyo,profesor_id,estado').eq('curso_academico', curso),
    ]);

    const apoyosPorProfesor = {};
    const apoyosPorSector = {};
    (delCurso || []).forEach(a => {
      if (a.estado === 'confirmado' || a.estado === 'realizado') {
        apoyosPorSector[a.sector_apoyo] = (apoyosPorSector[a.sector_apoyo] || 0) + 1;
        if (a.profesor_id) apoyosPorProfesor[a.profesor_id] = (apoyosPorProfesor[a.profesor_id] || 0) + 1;
      }
    });

    // Huecos que ya tienen a alguien puesto: hora + grupo + quién falta
    const yaCubiertos = new Set(
      (yaHoy || []).map(a => `${normHora(a.hora)}|${a.grupo || ''}|${a.sector_destino || ''}`)
    );

    const ausencias = prepararAusencias(faltas, profesores || []);
    const cuadrante = construirCuadrante(horarios);

    // Índice del horario oficial: quién · día · hora → grupo, aula y materia.
    // Sirve para rellenar los huecos cuando el profesor que falta no llegó
    // a detallar su horario, que es lo habitual en las ausencias de última
    // hora. Quien entra al aula necesita saber a qué grupo va.
    const horarioOficial = {};
    horarios
      .filter(h => h.tipo === 'clase' && (h.dia || '').toLowerCase() === dia)
      .forEach(h => {
        const clave = `${normAbrev(h.profesor_nombre_pdf)}|${normHora(h.hora_id)}`;
        if (!horarioOficial[clave]) {
          horarioOficial[clave] = {
            grupo: h.grupo || null,
            aula: h.aula || null,
            materia: h.materia || null,
          };
        }
      });

    // ─── Cálculo hora por hora ───
    const nuevas = [];
    for (const hora of HORAS_GUARDIA) {
      const asignaciones = asignacionesDeHora({
        hora, dia, ausencias, cuadrante, horarios,
        profesores: profesores || [],
        apoyosPorProfesor, apoyosPorSector,
      });

      for (const asig of asignaciones) {
        if (!asig.cubre?.profesorId) continue;

        // Lo que no dejó dicho el profesor ausente se completa con su
        // horario oficial del centro. Se resuelve antes de la clave de
        // duplicados: si no, el mismo hueco entraría dos veces, una con
        // grupo y otra sin él.
        const oficial = horarioOficial[`${normAbrev(asig.ausencia.abrev)}|${hora}`] || {};
        const grupoFinal   = asig.clase.grupo   || oficial.grupo   || null;
        const aulaFinal    = asig.clase.aula    || oficial.aula    || null;
        const materiaFinal = asig.clase.materia || oficial.materia || null;

        const clave = `${hora}|${grupoFinal || ''}|${asig.ausencia.sector.toUpperCase()}`;
        if (yaCubiertos.has(clave)) continue;
        yaCubiertos.add(clave);

        nuevas.push({
          fecha,
          hora,
          sector_apoyo: asig.cubre.sectorOriginal,
          sector_destino: asig.ausencia.sector.toUpperCase(),
          profesor_ausente_id: asig.ausencia.profesorId || null,
          profesor_id: asig.cubre.profesorId,
          grupo: grupoFinal,
          aula: aulaFinal,
          materia: materiaFinal,
          tarea: asig.clase.instrucciones || null,
          asignado_por: null,          // la propuso el sistema, no una persona
          estado: 'pendiente',
          tipo_apoyo: asig.cubre.tipo === 'guardia_sector' ? 'sector' : 'obligatorio',
          curso_academico: curso,
        });
      }
    }

    if (nuevas.length === 0) {
      return Response.json({ ok: true, creadas: 0, motivo: 'todo_cubierto' });
    }

    const { error } = await cliente.from('apoyos_asignados').insert(nuevas);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, creadas: nuevas.length });
  } catch (e) {
    console.error('preasignar guardias:', e?.message);
    return Response.json({ error: 'fallo_al_preasignar' }, { status: 500 });
  }
}
