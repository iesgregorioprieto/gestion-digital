/**
 * EL HORARIO DE UN PROFESOR (en el servidor)
 *
 * Antes, «Mi horario», el formulario de ausencias y el de DLD buscaban el
 * nombre en el horario por primer nombre + primer apellido y se quedaban
 * con el primero que salía. Con dos «María Martínez» en el centro, una
 * veía el horario de la otra (y al pedir una ausencia le salían los grupos
 * de la otra).
 *
 * Ahora se usa el MISMO reconocimiento que el reparto de guardias: nombre
 * completo (tolerante con «del», guiones y tildes), equivalencias
 * confirmadas a mano, y nunca se adivina si hay duda.
 *
 * Solo cuentan los nombres completos del horario, no las abreviaturas del
 * cuadrante de guardias («Mar. L, MdR»), que son otro documento.
 */
import { indiceProfesores, buscaProfesor, pareceAbreviatura } from '@/lib/asignacionGuardias';

const esAbreviatura = pareceAbreviatura;

async function todas(consulta) {
  let filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas = filas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return filas;
}

/** Nombres del horario que son de esa persona (normalmente uno). */
export async function nombresEnHorario(cliente, profesorId, curso) {
  const [profesores, equivalencias, filas] = await Promise.all([
    todas(() => cliente.from('profesores').select('id, nombre, apellidos, departamento, especialidad')),
    todas(() => cliente.from('equivalencias_horario').select('nombre_horario, profesor_id')),
    todas(() => cliente.from('horarios_profesores').select('profesor_nombre_pdf').eq('curso_academico', curso)),
  ]);
  const indice = indiceProfesores(profesores, equivalencias);
  const distintos = [...new Set(filas.map(f => f.profesor_nombre_pdf).filter(Boolean))].filter(n => !esAbreviatura(n));
  return distintos.filter(n => buscaProfesor(indice, n)?.id === profesorId);
}

/** Sus horas (opcionalmente de un día), con los campos que usan las pantallas. */
export async function horarioDe(cliente, profesorId, curso, dia = null) {
  const nombres = await nombresEnHorario(cliente, profesorId, curso);
  if (!nombres.length) return { nombres, horas: [] };
  let q = () => {
    let c = cliente.from('horarios_profesores')
      .select('dia, hora_id, hora_label, tipo, grupo, materia, aula, profesor_nombre_pdf')
      .eq('curso_academico', curso).in('profesor_nombre_pdf', nombres);
    if (dia) c = c.eq('dia', dia);
    return c;
  };
  return { nombres, horas: await todas(q) };
}
