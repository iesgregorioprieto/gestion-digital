/**
 * LECTOR DE LA HOJA DE SERVICIOS (Junta de Castilla-La Mancha)
 *
 * Saca del PDF oficial el tiempo total de servicio docente, que es lo que
 * cuenta como «antigüedad en el cuerpo» para el DLD: todo el servicio,
 * de carrera y como interino o en prácticas, de todos los cuerpos. Es el
 * mismo tiempo que cuenta para trienios y sexenios.
 *
 * Cómo es la hoja: bloques con cabecera «Hoja de servicios como …» y, al
 * final de cada bloque, una línea «Totales...» con seis cifras:
 *     días  meses  años  (carrera)   días  meses  años  (interino/prácticas)
 * Al final: «quedan acreditados los servicios prestados contados hasta la
 * fecha 27 de septiembre de 2026».
 *
 * DOS TRAMPAS:
 *  1. Las cifras NO se pueden leer como texto de corrido: el PDF las guarda
 *     sueltas y en otro orden («10 8 5 16 0 2» sale como «10 8 16 0 25»).
 *     Se leen por su POSICIÓN en la página, de izquierda a derecha.
 *  2. El bloque «como cargo directivo» NO se suma: es tiempo que ya consta
 *     en el bloque de funcionario (ser secretario no es un servicio aparte).
 *
 * Si aparece un bloque que no conocemos, NO se adivina: se devuelve un error
 * para que secretaría lo revise a mano.
 *
 * El PDF no se guarda en ningún sitio: se lee en memoria y se descarta.
 */
import { getDocumentProxy } from 'unpdf';

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

// Cómputo administrativo: meses de 30 días y años de 360
export const aDias = ({ d, m, a }) => a * 360 + m * 30 + d;
export function deDias(total) {
  const a = Math.floor(total / 360);
  const m = Math.floor((total % 360) / 30);
  return { a, m, d: total % 30 };
}

// Qué hacer con cada tipo de bloque
function clasificar(cabecera) {
  const c = cabecera.toLowerCase();
  if (c.includes('cargo directivo')) return 'excluido';
  if (c.includes('como funcionario') || c.includes('como interino')
      || c.includes('en prácticas') || c.includes('en practicas')) return 'suma';
  return 'desconocido';
}

/** Recibe los bytes del PDF y devuelve el resultado, o lanza un Error explicado. */
export async function leerHojaServicios(bytes) {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new Error('El archivo no es un PDF válido.');
  }

  // Todos los trozos de texto de todas las páginas, con su posición
  const trozos = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    // Las páginas vienen GIRADAS (guardadas en vertical, se ven en
    // apaisado). Se pasa cada posición a como se ve en pantalla, donde la
    // x crece hacia la derecha y la y hacia abajo.
    const [va, vb, vc, vd, ve, vf] = pagina.getViewport({ scale: 1 }).transform;
    const { items } = await pagina.getTextContent();
    for (const it of items) {
      const t = (it.str || '').trim();
      if (!t) continue;
      const [ix, iy] = [it.transform[4], it.transform[5]];
      trozos.push({ p, x: va * ix + vc * iy + ve, y: -(vb * ix + vd * iy + vf), t });
    }
  }
  // Orden de lectura: página, de arriba abajo, de izquierda a derecha
  trozos.sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);

  const todo = trozos.map(t => t.t).join(' ');
  if (!/Hoja de servicios como/i.test(todo)) {
    throw new Error('No parece una hoja de servicios de la Junta de Castilla-La Mancha.');
  }

  // Fecha hasta la que están contados los servicios
  const mf = todo.match(/contados hasta la fecha\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
  if (!mf || !MESES[mf[2].toLowerCase()]) {
    throw new Error('No encuentro la fecha hasta la que se cuentan los servicios (final de la hoja).');
  }
  const fecha = `${mf[3]}-${String(MESES[mf[2].toLowerCase()]).padStart(2, '0')}-${String(mf[1]).padStart(2, '0')}`;

  // Recorrer en orden: cada «Totales» pertenece a la última cabecera vista
  const bloques = [];
  let cabecera = null;
  for (let i = 0; i < trozos.length; i++) {
    const tr = trozos[i];
    const mc = tr.t.match(/^Hoja de servicios como\s+(.+)$/i);
    if (mc) {
      // La cabecera puede venir partida: se añade lo que haya en la misma línea
      const linea = trozos.filter(o => o.p === tr.p && Math.abs(o.y - tr.y) < 2 && o.x > tr.x)
        .sort((a, b) => a.x - b.x).map(o => o.t).join(' ');
      cabecera = `${tr.t} ${linea}`.replace(/\s*Esp\. Hab:.*$/i, '').trim();
      continue;
    }
    if (/^Totales/i.test(tr.t)) {
      const numeros = trozos
        .filter(o => o.p === tr.p && Math.abs(o.y - tr.y) < 2 && o.x > tr.x && /^\d+$/.test(o.t))
        .sort((a, b) => a.x - b.x)
        .map(o => parseInt(o.t, 10));
      if (numeros.length !== 6) {
        throw new Error(`Una línea de totales no tiene las 6 cifras esperadas (${numeros.join(' ')}).`);
      }
      if (!cabecera) throw new Error('Hay una línea de totales sin bloque al que pertenezca.');
      const [cd, cm, ca, id, im, ia] = numeros;
      bloques.push({
        cabecera,
        tipo: clasificar(cabecera),
        carrera: { d: cd, m: cm, a: ca },
        interino: { d: id, m: im, a: ia },
      });
    }
  }

  if (!bloques.length) throw new Error('No encuentro ninguna línea de totales en la hoja.');
  const raros = bloques.filter(b => b.tipo === 'desconocido');
  if (raros.length) {
    throw new Error(`La hoja tiene un bloque que el portal no sabe interpretar: «${raros[0].cabecera}». Pásala a secretaría.`);
  }

  const cuentan = bloques.filter(b => b.tipo === 'suma');
  const dias = cuentan.reduce((s, b) => s + aDias(b.carrera) + aDias(b.interino), 0);

  return { fecha, dias, total: deDias(dias), bloques };
}
