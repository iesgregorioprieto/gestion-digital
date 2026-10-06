/**
 * CACHÉ DE LA IDENTIFICACIÓN DE NOMBRES DEL HORARIO
 *
 * Saber de quién es cada nombre del horario («Che. G, J», «Checa
 * García, Javier») obliga a descargar el horario entero del centro, la
 * lista de profesores y las equivalencias, y a comparar nombres uno a
 * uno. Es lo más caro que hace el servidor, y se repetía en cada
 * apertura del panel (banner «Hoy» y aviso «¿Eres tú?») aunque el
 * resultado es el mismo durante todo el día.
 *
 * Aquí se calcula una vez y se guarda 10 minutos en la memoria del
 * servidor. Vercel reutiliza la misma instancia para casi todas las
 * peticiones, así que la mayoría ya no descargan nada.
 *
 * Se borra al momento, en esa instancia, cuando alguien confirma su
 * «¿Eres tú?», cuando jefatura toca las equivalencias o cuando se
 * suben o traspasan horarios. En las demás instancias, como mucho
 * 10 minutos de retraso, y solo en pantallas de consulta.
 *
 * NO se usa para registrar ausencias: eso sigue leyendo siempre de la
 * base de datos.
 */
import { indiceProfesores, buscaProfesor } from '@/lib/asignacionGuardias';

const TTL = 10 * 60 * 1000;
const _cache = new Map(); // curso → { at, promesa }

export function invalidarCacheNombres() {
  _cache.clear();
}

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

async function cargar(cliente, curso) {
  const [profesores, equivalencias, nombres, guardias] = await Promise.all([
    todas(() => cliente.from('profesores').select('id, nombre, apellidos, departamento, especialidad')),
    todas(() => cliente.from('equivalencias_horario').select('nombre_horario, profesor_id')),
    todas(() => cliente.from('horarios_profesores').select('profesor_nombre_pdf').eq('curso_academico', curso)),
    todas(() => cliente.from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, aula')
      .eq('curso_academico', curso).eq('tipo', 'guardia')),
  ]);

  const indice = indiceProfesores(profesores, equivalencias);
  const distintos = [...new Set(nombres.map(f => f.profesor_nombre_pdf).filter(Boolean))];

  // nombre del horario → id del profesor (o null si el motor no sabe quién es)
  const duenio = new Map();
  for (const n of distintos) duenio.set(n, buscaProfesor(indice, n)?.id || null);

  return { profesores, equivalencias, distintos, duenio, guardias };
}

/**
 * Datos de identificación del curso, desde la memoria si son recientes.
 * Si dos peticiones llegan a la vez, comparten la misma descarga.
 */
export function datosNombres(cliente, curso) {
  const e = _cache.get(curso);
  if (e && Date.now() - e.at < TTL) return e.promesa;

  const promesa = cargar(cliente, curso);
  _cache.set(curso, { at: Date.now(), promesa });
  // Un fallo no se guarda: la siguiente petición lo vuelve a intentar.
  promesa.catch(() => {
    if (_cache.get(curso)?.promesa === promesa) _cache.delete(curso);
  });
  return promesa;
}
