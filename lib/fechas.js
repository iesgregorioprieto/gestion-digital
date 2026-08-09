/**
 * Utilidades de fecha.
 *
 * OJO con toISOString(): convierte a UTC. En España (UTC+1 en invierno,
 * UTC+2 en verano) eso significa que entre las 00:00 y las 02:00 devuelve
 * el día ANTERIOR. Un profesor mirando su horario a la 1 de la mañana
 * vería el día equivocado.
 *
 * Estas funciones trabajan siempre con la fecha local del dispositivo.
 */

/** Fecha de hoy en formato AAAA-MM-DD, en hora local */
export function hoyLocal() {
  return aISO(new Date());
}

/** Convierte un Date a AAAA-MM-DD respetando la hora local */
export function aISO(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const anio = d.getFullYear();
  const mes  = String(d.getMonth() + 1).padStart(2, '0');
  const dia  = String(d.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Convierte AAAA-MM-DD en un Date seguro.
 * Se fija a mediodía para que ningún cambio de huso lo desplace de día.
 */
export function deISO(texto) {
  if (!texto) return null;
  return new Date(texto + 'T12:00:00');
}

/** Suma (o resta, con número negativo) días a una fecha AAAA-MM-DD */
export function sumarDias(texto, dias) {
  const d = deISO(texto);
  if (!d) return null;
  d.setDate(d.getDate() + dias);
  return aISO(d);
}

/** ¿Es sábado o domingo? */
export function esFinDeSemana(texto) {
  const d = deISO(texto);
  if (!d) return false;
  const n = d.getDay();
  return n === 0 || n === 6;
}
