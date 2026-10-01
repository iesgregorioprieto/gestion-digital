/**
 * CALENDARIO DE EVENTOS — piezas compartidas
 *
 * Sirve a la pantalla (/eventos), a la API (/api/eventos) y al banner
 * «Hoy» (/api/hoy). No importa nada del servidor: se puede usar en el
 * navegador.
 *
 * Todas las cuentas de tiempo se hacen en «minutos absolutos»: día desde
 * 1970 × 1440 + minutos del día, con la fecha y la hora tal como se
 * escriben en el centro. Así no hay husos horarios de por medio: el
 * servidor de Vercel está en UTC, pero «16:00 del 12 de diciembre» se
 * compara con la hora de Madrid que da ahoraEnCentro().
 */

export const TIPOS_EVENTO = [
  { valor: 'evaluacion', label: 'Sesión de evaluación', emoji: '📝', color: '#b91c1c', bg: '#fef2f2' },
  { valor: 'reunion',    label: 'Reunión',              emoji: '👥', color: '#1e3a5f', bg: '#eff6ff' },
  { valor: 'claustro',   label: 'Claustro / CCP / Consejo', emoji: '🏛️', color: '#7c2d12', bg: '#fff7ed' },
  { valor: 'charla',     label: 'Charla o actividad',   emoji: '🎤', color: '#166534', bg: '#f0fdf4' },
  { valor: 'plazo',      label: 'Plazo o entrega',      emoji: '⏰', color: '#b45309', bg: '#fffbeb' },
  { valor: 'otro',       label: 'Otro',                 emoji: '📌', color: '#475569', bg: '#f8fafc' },
];

export function tipoEvento(valor) {
  return TIPOS_EVENTO.find(t => t.valor === valor) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1];
}

/** Cuándo empieza a salir en el banner. null = no sale; 0 = desde las 00:00 de ese día */
export const OPCIONES_AVISO = [
  { valor: null,  label: 'No avisar en el banner' },
  { valor: 60,    label: '1 hora antes' },
  { valor: 120,   label: '2 horas antes' },
  { valor: 0,     label: 'Desde primera hora de ese día' },
  { valor: 1440,  label: '1 día antes' },
  { valor: 2880,  label: '2 días antes' },
  { valor: 4320,  label: '3 días antes' },
  { valor: 10080, label: '1 semana antes' },
];

export function etiquetaAviso(valor) {
  const v = valor === undefined ? null : valor;
  return (OPCIONES_AVISO.find(o => o.valor === v) || { label: `${v} minutos antes` }).label;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export function horaValida(h) { return !!h && HHMM.test(h); }

function aMin(h) { return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)); }

/** Día desde 1970 de una fecha AAAA-MM-DD, sin husos horarios */
export function diaN(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / 86400000);
}

/** Minuto absoluto de «ahora» a partir de ahoraEnCentro() */
export function minutoAbsoluto(ahora) {
  return diaN(ahora.fecha) * 1440 + ahora.minutos;
}

/**
 * Inicio, fin y momento de aviso de un evento, en minutos absolutos.
 *   · Sin hora: dura el día entero (o los días, si tiene fecha_fin).
 *   · Con hora de inicio y sin hora de fin: se da por terminado una hora
 *     después, para que el enlace de Teams siga a mano durante la reunión.
 */
export function tramoEvento(ev) {
  const ultimo = ev.fecha_fin && ev.fecha_fin >= ev.fecha ? ev.fecha_fin : ev.fecha;
  const conHora = horaValida(ev.hora_inicio);
  const inicio = diaN(ev.fecha) * 1440 + (conHora ? aMin(ev.hora_inicio) : 0);
  let fin;
  if (horaValida(ev.hora_fin)) fin = diaN(ultimo) * 1440 + aMin(ev.hora_fin);
  else if (conHora) fin = diaN(ultimo) * 1440 + aMin(ev.hora_inicio) + 60;
  else fin = diaN(ultimo) * 1440 + 1440;

  let aviso = null;
  if (ev.aviso_minutos === 0) aviso = diaN(ev.fecha) * 1440;
  else if (Number.isFinite(ev.aviso_minutos) && ev.aviso_minutos > 0) aviso = inicio - ev.aviso_minutos;

  return { inicio, fin, aviso };
}

/** «viernes 12 de diciembre» — sin desplazamientos de huso */
export function fechaLarga(fecha) {
  if (!fecha) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-ES',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** «vie 12 dic» */
export function fechaCorta(fecha) {
  if (!fecha) return '';
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-ES',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** «de 16:00 a 17:30», «a las 16:00» o «todo el día» */
export function textoHora(ev) {
  if (!horaValida(ev.hora_inicio)) return 'todo el día';
  if (horaValida(ev.hora_fin)) return `de ${ev.hora_inicio} a ${ev.hora_fin}`;
  return `a las ${ev.hora_inicio}`;
}

/**
 * La línea del banner «Hoy» para un evento, o null si ahora no toca.
 * Sale desde su momento de aviso hasta que termina.
 */
export function lineaBannerEvento(ev, ahora) {
  const { inicio, fin, aviso } = tramoEvento(ev);
  if (aviso === null) return null;
  const now = minutoAbsoluto(ahora);
  if (now < aviso || now >= fin) return null;

  const enCurso = now >= inicio;
  const esHoy = ev.fecha === ahora.fecha || enCurso;
  const cuando = esHoy
    ? (enCurso && horaValida(ev.hora_inicio) ? 'ahora' : `hoy ${textoHora(ev)}`)
    : `${fechaCorta(ev.fecha)}, ${textoHora(ev)}`;

  const detalle = [ev.lugar, ev.enlace ? 'enlace en el evento' : null,
    ev.asistencia_obligatoria ? 'asistencia obligatoria' : null].filter(Boolean).join(' · ');

  return {
    tipo: 'evento',
    // Los de hoy, por su hora; los de otros días, arriba del todo
    orden: esHoy && horaValida(ev.hora_inicio) ? ev.hora_inicio : '00:05',
    icono: tipoEvento(ev.tipo).emoji,
    texto: `${ev.titulo} — ${cuando}`,
    detalle: detalle || null,
    ahora: enCurso && horaValida(ev.hora_inicio),
    enlace: `/eventos?d=${ev.fecha}&e=${ev.id}`,
  };
}
