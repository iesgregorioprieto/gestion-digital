/**
 * LAS HORAS DE UNA AUSENCIA, DÍA A DÍA
 *
 * Hasta ahora una ausencia guardaba UNA sola lista de horas, y de ahí
 * venían dos destrozos:
 *
 *   · La lista vacía significaba dos cosas distintas y nadie sabía cuál:
 *     "falto el día entero" en una baja, y "no rellené las horas" en un
 *     análisis de sangre de dos horas. El motor daba por hecho lo primero
 *     y cubría clases que la persona iba a dar.
 *
 *   · En una ausencia de varios días, esa única lista se aplicaba igual
 *     al lunes que al jueves, y el horario de cada día es distinto.
 *
 * Aquí se resuelve de una vez, al registrar: se mira el horario de cada
 * día del periodo y se escribe qué tiene esa persona a cada hora. El
 * resultado se guarda en la columna 'dias' y el motor pasa de deducir a
 * leer.
 *
 * Las tareas se reparten como las dejó el profesor: si vienen por hora,
 * cada hora lleva la suya; si vienen por módulo o área —que es como se
 * dejan en las ausencias de varios días— se busca la del grupo y materia
 * que toque ese día.
 *
 * No se toca nada de lo ya registrado: la columna 'horas' se sigue
 * guardando igual que siempre.
 */

import { normHora, normClave, indiceProfesores, buscaProfesor } from '@/lib/asignacionGuardias';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

export function diaSemanaDe(fecha) {
  return DIAS[new Date(fecha + 'T12:00:00').getDay()];
}

/** Los días lectivos entre dos fechas, ambas incluidas. Tope de seguridad. */
export function diasEntre(desde, hasta, tope = 40) {
  const salida = [];
  const f = new Date(desde + 'T12:00:00');
  const fin = new Date((hasta || desde) + 'T12:00:00');
  while (f <= fin && salida.length < tope) {
    const d = DIAS[f.getDay()];
    if (d !== 'sabado' && d !== 'domingo') {
      salida.push({ fecha: f.toISOString().slice(0, 10), diaSemana: d });
    }
    f.setDate(f.getDate() + 1);
  }
  return salida;
}

const igual = (a, b) => normClave(a || '') === normClave(b || '');

/**
 * Busca la tarea que corresponde a una hora concreta.
 * Primero por grupo y materia, luego solo por grupo, y si solo se dejó
 * una tarea para todo, esa vale para todas.
 */
function tareaPara(h, declaradas) {
  if (!declaradas || declaradas.length === 0) return {};
  const porHora = declaradas.find(d =>
    normHora(d.hora) === normHora(h.hora_id)
    && (!d.grupo || igual(d.grupo, h.grupo)));
  if (porHora) return porHora;

  return declaradas.find(d => igual(d.grupo, h.grupo) && igual(d.materia, h.materia))
    || declaradas.find(d => igual(d.grupo, h.grupo))
    || (declaradas.length === 1 ? declaradas[0] : {});
}

/**
 * Convierte una ausencia en la lista de sus días con sus horas.
 *
 * @param ausencia   fecha_inicio, fecha_fin, horas (lo que marcó el profesor)
 * @param profesor   su ficha
 * @param horarios   filas de horarios_profesores del curso
 * @param equivalencias  nombres del horario ya confirmados a mano
 * @returns [{ fecha, horas: [{hora, tipo, grupo, materia, aula, instrucciones, archivo_url, archivo_nombre}] }]
 */
export function diasDeLaAusencia({ ausencia, profesor, horarios = [], profesores = [], equivalencias = [] }) {
  if (!ausencia?.fecha_inicio || !profesor) return [];

  const indice = indiceProfesores(profesores, equivalencias);
  const suyas = horarios.filter(h =>
    buscaProfesor(indice, h.profesor_nombre_pdf)?.id === profesor.id);

  const declaradas = Array.isArray(ausencia.horas) ? ausencia.horas : [];
  const unDia = !ausencia.fecha_fin || ausencia.fecha_fin === ausencia.fecha_inicio;

  // Si es de un día y marcó horas concretas, manda lo que marcó: puede
  // faltar a 1ª y 2ª y dar el resto.
  const soloEstas = (unDia && declaradas.length > 0)
    ? new Set(declaradas.map(d => normHora(d.hora)))
    : null;

  return diasEntre(ausencia.fecha_inicio, ausencia.fecha_fin).map(({ fecha, diaSemana }) => {
    const delDia = suyas.filter(h => (h.dia || '').toLowerCase() === diaSemana);

    const horas = delDia
      .filter(h => !soloEstas || soloEstas.has(normHora(h.hora_id)))
      .map(h => {
        const esGuardia = (h.tipo || '').toLowerCase().includes('guardia');
        const tarea = esGuardia ? {} : tareaPara(h, declaradas);
        return {
          hora: normHora(h.hora_id),
          // Las horas de guardia no se sustituyen: no generan hueco ni
          // llevan tarea. Se guardan igual, para que conste que esa
          // persona no está y el centro tiene un guardia menos.
          tipo: esGuardia ? 'guardia' : 'clase',
          grupo: h.grupo || '',
          materia: h.materia || '',
          aula: h.aula || '',
          instrucciones: tarea.instrucciones || null,
          archivo_url: tarea.archivo_url || null,
          archivo_nombre: tarea.archivo_nombre || null,
        };
      })
      .sort((a, b) => String(a.hora).localeCompare(String(b.hora)));

    return { fecha, horas };
  });
}
