/**
 * Comprueba las fechas de una ausencia antes de guardarla.
 *
 * Por qué existe: en el móvil, al teclear la fecha, el año se queda a
 * medias y se guarda "0002-09-16" o "0001-12-28". Con la fecha de fin
 * anterior a la de inicio el motor no encuentra ningún día, no calcula
 * las horas y NO SE GENERA NINGUNA GUARDIA. Pasó en 11 ausencias entre
 * septiembre y octubre de 2026 sin que nadie se diera cuenta, porque la
 * tarjeta enseña "28 oct – 28 dic" sin el año.
 *
 * La usan el formulario (para avisar antes de enviar) y la API (que es la
 * que manda: lo que llega del navegador no es de fiar).
 *
 * Devuelve el texto del error, o null si las fechas son válidas.
 * fin === null es una baja abierta y se acepta; fin vacío = un solo día.
 */

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

function fechaReal(texto) {
  if (!FORMATO.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  // setUTCFullYear y no Date.UTC: Date.UTC convierte los años 0-99 en 1900-1999
  const f = new Date(0);
  f.setUTCFullYear(a, m - 1, d);
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

function aDiaMes(texto) {
  const [a, m, d] = texto.split('-');
  return `${d}/${m}/${a}`;
}

export function problemaFechas(inicio, fin, hoy = new Date()) {
  const año = hoy.getFullYear();
  const minimo = año - 1;
  const maximo = año + 1;

  if (!inicio) return 'Indica la fecha de inicio.';
  if (!fechaReal(inicio)) return `La fecha de inicio (${inicio}) no es una fecha válida.`;

  const añoIni = Number(inicio.slice(0, 4));
  if (añoIni < minimo || añoIni > maximo) {
    return `Revisa el año de la fecha de inicio: has puesto ${aDiaMes(inicio)}.`;
  }

  // Baja abierta o un solo día: no hay más que comprobar
  if (fin === null || fin === undefined || fin === '') return null;

  if (!fechaReal(fin)) return `La fecha de fin (${fin}) no es una fecha válida.`;

  const añoFin = Number(fin.slice(0, 4));
  if (añoFin < minimo || añoFin > maximo) {
    return `Revisa el año de la fecha de fin: has puesto ${aDiaMes(fin)}.`;
  }

  // Las fechas ISO se comparan bien como texto
  if (fin < inicio) {
    return `La fecha de fin (${aDiaMes(fin)}) es anterior a la de inicio (${aDiaMes(inicio)}).`;
  }

  return null;
}
