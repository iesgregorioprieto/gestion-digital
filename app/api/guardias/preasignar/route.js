/**
 * PREASIGNACIÓN DE GUARDIAS
 *
 * Calcula quién cubre cada hueco de un día y lo deja registrado como
 * guardia pendiente, para que le llegue directamente al profesorado
 * sin tener que pasar por jefatura de estudios.
 *
 * Es idempotente: si un hueco ya tiene a alguien puesto, no se vuelve a
 * crear. Las guardias ya fichadas y las que ha puesto dirección a mano
 * NO se tocan nunca.
 *
 * Solo cuentan para la rotación las guardias fichadas.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import {
  HORAS_GUARDIA, diaSemanaEs, construirCuadrante, prepararHuecos,
  asignacionesDeHora, normHora, claveAbreviada, ocupadosEnClase,
  indiceProfesores, clavesAmbiguas,
} from '@/lib/asignacionGuardias';
import { normSector, esSectorRecreo } from '@/lib/sectores';

const FICHADAS = ['confirmado', 'realizado'];

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
  // columnas, y pedir una que no existe hace fallar toda la consulta.
  const { data, error } = await cliente
    .from('config_centro')
    .select('*')
    .eq('activo', true)
    .limit(1);
  if (error) console.error('leer config_centro:', error.message);

  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
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
        .select('id, profesor_id, horas, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', fecha)
        .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
      cliente.from('dld')
        .select('id, profesor_id, horas, fecha_solicitada')
        .eq('fecha_solicitada', fecha)
        .eq('estado', 'aprobada'),
    ]);

    const faltas = [
      ...(rAus.data || []).map(a => ({ ...a, origen: 'ausencia' })),
      ...(rDld.data || []).map(d => ({ ...d, origen: 'dld' })),
    ];
    if (faltas.length === 0) {
      return Response.json({ ok: true, creadas: 0, motivo: 'sin_ausencias' });
    }

    // ─── Guardias ya registradas ───
    const [{ data: yaHoy }, { data: delCurso }] = await Promise.all([
      cliente.from('apoyos_asignados').select('*').eq('fecha', fecha).eq('curso_academico', curso),
      cliente.from('apoyos_asignados')
        .select('sector_apoyo,sector_destino,profesor_id,estado')
        .eq('curso_academico', curso),
    ]);

    // Rotación: SOLO las fichadas. Una guardia sin fichar no cuenta.
    const apoyosPorProfesor = {};
    const apoyosFueraPorSector = {};
    (delCurso || []).forEach(a => {
      if (!FICHADAS.includes(a.estado)) return;
      if (a.profesor_id) {
        apoyosPorProfesor[a.profesor_id] = (apoyosPorProfesor[a.profesor_id] || 0) + 1;
      }
      // Para la rotación entre departamentos solo cuentan las salidas
      // fuera del propio sector: lo que se reparte es bajar a cubrir a otros.
      const suyo = normSector(a.sector_apoyo);
      const destino = normSector(a.sector_destino);
      if (suyo && destino && suyo !== destino) {
        apoyosFueraPorSector[suyo] = (apoyosFueraPorSector[suyo] || 0) + 1;
      }
    });

    // Huecos que ya tienen a alguien puesto. La clave es hora + quién
    // falta: si dos compañeros del mismo sector faltan a la misma hora,
    // son dos huecos distintos y los dos hay que cubrirlos.
    const yaCubiertos = (yaHoy || [])
      .filter(a => !esSectorRecreo(a.sector_apoyo))
      .map(a => ({
        hora: normHora(a.hora),
        profesorAusenteId: a.profesor_ausente_id,
        profesorId: a.profesor_id,
      }));

    const huecos = prepararHuecos(faltas, profesores || []);
    const { porSector: cuadrante, sinResolver } = construirCuadrante(horarios, profesores || []);

    if (sinResolver.length) {
      console.warn('preasignar: nombres del cuadrante sin ficha →', sinResolver.join(' | '));
    }

    // Dos compañeros con la misma abreviatura ("Gar. M, JL" puede ser
    // García Moreno o García Muñoz): a esos no se les asigna nada, y hay
    // que poder verlo en vez de que desaparezcan en silencio.
    const ambiguas = clavesAmbiguas(indiceProfesores(profesores || []));
    if (ambiguas.length) {
      console.warn('preasignar: abreviaturas ambiguas →',
        ambiguas.map(a => `${a.clave}: ${a.personas.join(' / ')}`).join(' | '));
    }

    // ─── Cálculo hora por hora ───
    const nuevas = [];
    const sinCubrir = [];

    for (const hora of HORAS_GUARDIA) {
      if (hora === 'recreo') continue;   // el recreo no sustituye a nadie

      const enClase = ocupadosEnClase(horarios, profesores || [], dia, hora);

      const asignaciones = asignacionesDeHora({
        hora, dia, huecos, cuadrante, horarios,
        profesores: profesores || [],
        apoyosPorProfesor, apoyosFueraPorSector,
        yaCubiertos, ocupadosIds: enClase,
      });

      for (const asig of asignaciones) {
        if (!asig.cubre?.profesorId) {
          sinCubrir.push({
            hora,
            ausente: asig.hueco.profesor,
            grupo: asig.grupo || null,
            aula: asig.aula || null,
          });
          continue;
        }

        // Se apunta en la lista viva para que el resto de horas y huecos
        // de esta misma pasada no le asignen otra cosa a la vez.
        yaCubiertos.push({
          hora,
          profesorAusenteId: asig.hueco.profesorId,
          profesorId: asig.cubre.profesorId,
        });

        nuevas.push({
          fecha,
          hora,
          sector_apoyo: asig.cubre.sector,
          sector_destino: normSector(asig.hueco.sector),
          profesor_ausente_id: asig.hueco.profesorId || null,
          profesor_id: asig.cubre.profesorId,
          profesor_nombre_pdf: claveAbreviada(
            asig.cubre.nombre.split(',')[0],
            asig.cubre.nombre.split(',')[1] || ''
          ) || null,
          grupo: asig.grupo || null,
          aula: asig.aula || null,
          materia: asig.materia || null,
          tarea: asig.instrucciones || null,
          asignado_por: null,          // la propuso el sistema, no una persona
          estado: 'pendiente',
          tipo_apoyo: asig.escalon === 0 ? 'sector' : 'obligatorio',
          curso_academico: curso,
        });
      }
    }

    if (nuevas.length === 0) {
      return Response.json({
        ok: true, creadas: 0, motivo: 'todo_cubierto',
        sin_cubrir: sinCubrir, sin_resolver: sinResolver, ambiguas,
      });
    }

    const { error } = await cliente.from('apoyos_asignados').insert(nuevas);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      ok: true,
      creadas: nuevas.length,
      sin_cubrir: sinCubrir,
      sin_resolver: sinResolver,
      ambiguas,
    });
  } catch (e) {
    console.error('preasignar guardias:', e?.message);
    return Response.json({ error: 'fallo_al_preasignar' }, { status: 500 });
  }
}
