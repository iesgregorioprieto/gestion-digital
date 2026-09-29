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

async function reconocer(cliente, profesorId, curso) {
  const [profesores, equivalencias, filas] = await Promise.all([
    todas(() => cliente.from('profesores').select('id, nombre, apellidos, departamento, especialidad')),
    todas(() => cliente.from('equivalencias_horario').select('nombre_horario, profesor_id')),
    todas(() => cliente.from('horarios_profesores').select('profesor_nombre_pdf').eq('curso_academico', curso)),
  ]);
  const indice = indiceProfesores(profesores, equivalencias);
  const distintos = [...new Set(filas.map(f => f.profesor_nombre_pdf).filter(Boolean))];
  const suyos = distintos.filter(n => buscaProfesor(indice, n)?.id === profesorId);
  return {
    completos: suyos.filter(n => !esAbreviatura(n)),     // su horario de clases
    abreviados: suyos.filter(n => esAbreviatura(n)),     // su nombre en el cuadrante de guardias
  };
}

/** Nombres del horario que son de esa persona (normalmente uno). */
export async function nombresEnHorario(cliente, profesorId, curso) {
  return (await reconocer(cliente, profesorId, curso)).completos;
}

/** Sus horas (opcionalmente de un día), con los campos que usan las pantallas. */
export async function horarioDe(cliente, profesorId, curso, dia = null) {
  const { completos: nombres, abreviados } = await reconocer(cliente, profesorId, curso);
  const pedir = (lista, soloGuardias) => () => {
    let c = cliente.from('horarios_profesores')
      .select('dia, hora_id, hora_label, tipo, grupo, materia, aula, profesor_nombre_pdf')
      .eq('curso_academico', curso).in('profesor_nombre_pdf', lista);
    if (soloGuardias) c = c.eq('tipo', 'guardia');
    if (dia) c = c.eq('dia', dia);
    return c;
  };
  const [propias, delCuadrante] = await Promise.all([
    nombres.length ? todas(pedir(nombres, false)) : [],
    abreviados.length ? todas(pedir(abreviados, true)) : [],
  ]);
  // Sus guardias salen del CUADRANTE, que es el que usa el reparto (las
  // «GUARDIA X» del horario personal se sustituyen al subir el cuadrante).
  // Si a esa hora ya hay una guardia en su horario, no se repite.
  const clave = h => `${h.dia}|${h.hora_id}`;
  const deGuardiaEnCuadrante = new Set(delCuadrante.map(clave));
  // «GUARDIA X» de su horario personal a una hora en la que el cuadrante ya
  // le pone guardia: se muestra la del cuadrante (es la que usa el reparto).
  const esTextoGuardia = h => h.tipo === 'guardia' || /^guardia/i.test(h.materia || '');
  const suyas = propias.filter(h => !(esTextoGuardia(h) && deGuardiaEnCuadrante.has(clave(h))));
  return { nombres, horas: [...suyas, ...delCuadrante] };
}
