/**
 * PREASIGNACIÓN DE GUARDIAS
 *
 * Calcula quién cubre cada hueco de un día y lo deja registrado como
 * guardia pendiente, para que le llegue directamente al profesorado
 * sin tener que pasar por jefatura de estudios.
 *
 * Cubre un día o un rango: una baja de tres días se preasigna entera de
 * una sola vez, sin esperar a que alguien abra la aplicación cada
 * mañana. Los datos pesados (horarios y profesorado) se leen una vez y
 * valen para todos los días.
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

// Tope de días por llamada. Una baja sin fecha de fin es infinita: se
// preasignan los próximos días y el resto lo va añadiendo el día a día.
const MAX_DIAS = 15;

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Días lectivos del rango (sin fines de semana; los festivos se caen
// solos porque en el horario no hay nada ese día).
function diasDelRango(desde, hasta) {
  const dias = [];
  let f = desde;
  for (let i = 0; i < MAX_DIAS; i++) {
    const ds = diaSemanaEs(f);
    if (ds !== 'sabado' && ds !== 'domingo') dias.push({ fecha: f, diaSemana: ds });
    if (f >= hasta) break;
    f = sumarDias(f, 1);
  }
  return dias;
}

// ¿Esta falta afecta a este día?
function afectaA(falta, fecha) {
  const ini = falta.fecha_inicio || falta.fecha_solicitada;
  const fin = falta.fecha_fin || falta.fecha_solicitada || falta.fecha_inicio;
  if (!ini) return false;
  if (ini > fecha) return false;
  return !fin || fin >= fecha;
}

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

    const { fecha, hasta } = await request.json();
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return Response.json({ error: 'fecha_no_valida' }, { status: 400 });
    }
    const fechaFin = (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && hasta > fecha)
      ? (hasta > sumarDias(fecha, MAX_DIAS) ? sumarDias(fecha, MAX_DIAS) : hasta)
      : fecha;

    const dias = diasDelRango(fecha, fechaFin);
    if (dias.length === 0) {
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

    // ─── Faltas que tocan el rango: ausencias y DLD aprobados ───
    const ultimo = dias[dias.length - 1].fecha;
    const [rAus, rDld] = await Promise.all([
      cliente.from('ausencias')
        .select('id, profesor_id, horas, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', ultimo)
        .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
      cliente.from('dld')
        .select('id, profesor_id, horas, fecha_solicitada')
        .gte('fecha_solicitada', fecha)
        .lte('fecha_solicitada', ultimo)
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
    const [{ data: yaEnRango }, { data: delCurso }] = await Promise.all([
      cliente.from('apoyos_asignados').select('*')
        .gte('fecha', fecha).lte('fecha', ultimo).eq('curso_academico', curso),
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

    // ─── Cálculo, día por día ───
    const nuevas = [];
    const sinCubrir = [];

    for (const { fecha: diaFecha, diaSemana } of dias) {
      const delDia = faltas.filter(f => afectaA(f, diaFecha));
      if (delDia.length === 0) continue;

      // Las horas salen de lo que marcó el profesor; si dejó las tareas
      // por módulo (ausencia larga) o no dejó nada (baja), del horario.
      const huecos = prepararHuecos(delDia, profesores || [], {
        horarios, dia: diaSemana,
      });

      const yaCubiertos = (yaEnRango || [])
        .filter(a => a.fecha === diaFecha && !esSectorRecreo(a.sector_apoyo))
        .map(a => ({
          hora: normHora(a.hora),
          profesorAusenteId: a.profesor_ausente_id,
          profesorId: a.profesor_id,
        }));

      for (const hora of HORAS_GUARDIA) {
        if (hora === 'recreo') continue;   // el recreo no sustituye a nadie

        const enClase = ocupadosEnClase(horarios, profesores || [], diaSemana, hora);

        const asignaciones = asignacionesDeHora({
          hora, dia: diaSemana, huecos, cuadrante, horarios,
          profesores: profesores || [],
          apoyosPorProfesor, apoyosFueraPorSector,
          yaCubiertos, ocupadosIds: enClase,
        });

        for (const asig of asignaciones) {
          if (!asig.cubre?.profesorId) {
            sinCubrir.push({
              fecha: diaFecha, hora,
              ausente: asig.hueco.profesor,
              grupo: asig.grupo || null,
              aula: asig.aula || null,
            });
            continue;
          }

          // Se apunta en la lista viva para que el resto de horas y
          // huecos de este mismo día no le asignen otra cosa a la vez.
          yaCubiertos.push({
            hora,
            profesorAusenteId: asig.hueco.profesorId,
            profesorId: asig.cubre.profesorId,
          });

          nuevas.push({
            fecha: diaFecha,
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
    }

    if (nuevas.length === 0) {
      return Response.json({
        ok: true, creadas: 0, motivo: 'todo_cubierto',
        dias: dias.length, sin_cubrir: sinCubrir,
        sin_resolver: sinResolver, ambiguas,
      });
    }

    const { error } = await cliente.from('apoyos_asignados').insert(nuevas);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      ok: true,
      creadas: nuevas.length,
      dias: dias.length,
      sin_cubrir: sinCubrir,
      sin_resolver: sinResolver,
      ambiguas,
    });
  } catch (e) {
    console.error('preasignar guardias:', e?.message);
    return Response.json({ error: 'fallo_al_preasignar' }, { status: 500 });
  }
}
