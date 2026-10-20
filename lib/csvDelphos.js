/**
 * LEER LOS CSV QUE EXPORTA DELPHOS (datAlumnos y datMatriculas)
 *
 * Tres trampas que tienen estos ficheros y que aquí se resuelven:
 *
 *  1. La codificación. Delphos exporta en la antigua de Windows. Leído
 *     como moderno, "María" sale roto y el alumno deja de reconocerse.
 *
 *  2. Las comillas. Hay campos como "Arroyo Vega, Andrés" con una coma
 *     dentro. Partir la línea por comas a lo bruto descoloca todas las
 *     columnas que van detrás.
 *
 *  3. Las líneas partidas. Algún domicilio lleva un salto de línea dentro
 *     y la ficha queda en dos líneas: la segunda no tiene identificador y
 *     la primera se queda a medias. Si a una fila le faltan columnas y la
 *     línea siguiente no empieza por un identificador, se juntan.
 */

export async function leerTextoDelphos(archivo) {
  const bytes = await archivo.arrayBuffer();
  const moderno = new TextDecoder('utf-8').decode(bytes);
  if (!moderno.includes('�')) return moderno;
  return new TextDecoder('windows-1252').decode(bytes);
}

function partirLinea(linea, sep) {
  const campos = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') { actual += '"'; i++; }
      else entreComillas = !entreComillas;
    } else if (c === sep && !entreComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

// Una ficha nueva empieza siempre por su identificador numérico
const EMPIEZA_FICHA = /^"?\d+"?[;,]/;

/**
 * Devuelve { cabecera, filas }. Cada fila es un objeto con las columnas en
 * MAYÚSCULAS y los valores ya limpios de espacios y tabuladores.
 */
export function parsearCsvDelphos(texto) {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/);
  const primera = lineas[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const cabecera = partirLinea(primera, sep).map(c => c.trim().toUpperCase());

  const filas = [];
  for (let i = 1; i < lineas.length; i++) {
    let linea = lineas[i];
    if (!linea.trim()) continue;
    let campos = partirLinea(linea, sep);
    while (campos.length < cabecera.length && i + 1 < lineas.length
      && lineas[i + 1].trim() && !EMPIEZA_FICHA.test(lineas[i + 1])) {
      i++;
      linea += ' ' + lineas[i];
      campos = partirLinea(linea, sep);
    }
    const fila = {};
    cabecera.forEach((col, k) => { fila[col] = (campos[k] ?? '').trim(); });
    filas.push(fila);
  }
  return { cabecera, filas };
}

/** ¿Qué fichero es? Por sus columnas, no por el nombre del archivo. */
export function tipoFicheroDelphos(cabecera) {
  const tiene = c => cabecera.includes(c);
  if (tiene('ALUMNO') && tiene('GRUPO') && tiene('ESTADOMATRICULA')) return 'matriculas';
  if (tiene('ALUMNO') && tiene('DNI') && tiene('APELLIDOS')) return 'alumnos';
  return null;
}

/**
 * Matrículas que NO cuentan: anuladas, trasladadas a otro centro y las de
 * quien ya ha obtenido el título (suelen ser alumnos que han acabado un
 * ciclo y empiezan otro: su matrícula buena es la nueva).
 */
const ESTADOS_FUERA = ['ANULADA', 'TRASLADADA', 'OBTIENE TITULO'];

export function matriculaVigente(fila) {
  const estado = (fila.ESTADOMATRICULA || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  return !ESTADOS_FUERA.includes(estado);
}

/** "17/09/2026" → 20260917, para ordenar matrículas por fecha */
export function fechaOrdenable(texto) {
  const m = (texto || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? Number(m[3] + m[2].padStart(2, '0') + m[1].padStart(2, '0')) : 0;
}

/**
 * CRUZAR LOS DOS FICHEROS
 *
 * datMatriculas manda: dice quién está este curso y en qué grupo.
 * datAlumnos añade lo que la matrícula no trae (el DNI). Se cruzan por el
 * identificador de Delphos (columna ALUMNO), que es el mismo en los dos.
 *
 * Quien aparece en datAlumnos pero no tiene matrícula vigente no se carga:
 * son bajas, traslados o alumnos que ya han titulado.
 *
 * `esGrupoValido` es la misma regla que usa la pantalla para decidir qué
 * grupos se cargan (los modulares, por ejemplo, no).
 */
export function cruzarFicheros({ matriculas, alumnos, curso, esGrupoValido }) {
  const fichas = new Map();
  (alumnos || []).forEach(f => { if (f.ALUMNO) fichas.set(f.ALUMNO, f); });

  const descartes = { anuladas: 0, trasladadas: 0, tituladas: 0, sinGrupo: [], otrosGrupos: [] };
  const porAlumno = new Map();

  for (const m of matriculas) {
    if (!m.ALUMNO) continue;
    if (!matriculaVigente(m)) {
      const e = (m.ESTADOMATRICULA || '').toUpperCase();
      if (e.startsWith('ANUL')) descartes.anuladas++;
      else if (e.startsWith('TRASL')) descartes.trasladadas++;
      else descartes.tituladas++;
      continue;
    }
    const grupo = (m.GRUPO || '').trim();
    const quien = `${m.APELLIDOS}, ${m.NOMBRE}`;
    if (!grupo) { descartes.sinGrupo.push(`${quien} (${m.ESTUDIOS || 'sin estudios'})`); continue; }
    if (!esGrupoValido(grupo)) { descartes.otrosGrupos.push(`${quien} · ${grupo}`); continue; }

    // Si alguien tuviera dos matrículas vigentes, se queda la más reciente
    const previa = porAlumno.get(m.ALUMNO);
    if (previa && fechaOrdenable(previa.FECHAMATRICULA) > fechaOrdenable(m.FECHAMATRICULA)) continue;
    porAlumno.set(m.ALUMNO, m);
  }

  const lista = [...porAlumno.values()].map(m => {
    const ficha = fichas.get(m.ALUMNO);
    return {
      alumno_id: m.ALUMNO,
      apellidos: m.APELLIDOS || ficha?.APELLIDOS || '',
      nombre: m.NOMBRE || ficha?.NOMBRE || '',
      grupo: m.GRUPO.trim(),
      num_expediente: m.NUM_EXP_CENTRO || null,
      // Solo el DNI. La columna NIE de Delphos es el número escolar, no
      // el documento de extranjería: no sirve como DNI.
      dni: ficha?.DNI || '',
      curso_academico: curso,
    };
  });

  const sinFicha = alumnos ? lista.filter(a => !fichas.has(a.alumno_id)).length : null;
  return { lista, descartes, sinFicha };
}
