/**
 * ¿COINCIDE ESTA SOLICITUD CON ALGÚN EVENTO DEL CALENDARIO?
 *
 * Petición de José María (incidencia #237): cuando alguien pide una
 * actividad complementaria o un permiso de formación que cae el mismo día
 * que un evento del calendario (evaluación, claustro, reunión…), que se le
 * avise. Cuentan todos los eventos del calendario, sea cual sea su ámbito
 * (decisión de Luis Javier, 9/11/2026), y las convocatorias oficiales,
 * que también salen en el calendario.
 *
 * Regla:
 *   · Coincide si las fechas se cruzan.
 *   · Si la solicitud y el evento dicen las dos a qué hora empiezan y
 *     terminan, solo coincide si las horas se solapan. Si a alguno le
 *     faltan las horas, basta con que se crucen las fechas: mejor un aviso
 *     de más que una evaluación sin profesor.
 *
 * No importa nada del servidor ni del navegador: la usan el correo
 * (servidor) y las tarjetas de Gestión (navegador) por igual.
 */

// Franjas del centro, para las actividades que marcan horas en vez de
// salida y regreso. Mismo horario que lib/asignacionGuardias.js.
const FRANJAS = {
  '1': ['08:30', '09:25'], '2': ['09:25', '10:20'], '3': ['10:20', '11:15'],
  'recreo': ['11:15', '11:45'],
  '4': ['11:45', '12:40'], '5': ['12:40', '13:35'], '6': ['13:35', '14:30'],
};

const HHMM = /^\d{1,2}:\d{2}/;
const aMin = t => {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};

/** Horario de una actividad: salida/regreso o, si no, de la primera a la última franja marcada */
export function horarioActividad(act) {
  if (act?.hora_salida && act?.hora_regreso) {
    return { hora_inicio: act.hora_salida, hora_fin: act.hora_regreso };
  }
  const horas = (Array.isArray(act?.horas) ? act.horas : [])
    .map(h => {
      const s = String(h ?? '').toLowerCase().trim();
      return s.includes('recreo') ? 'recreo' : (s.match(/^(\d)/)?.[1] || '');
    })
    .map(id => FRANJAS[id]).filter(Boolean);
  if (!horas.length) return { hora_inicio: null, hora_fin: null };
  return {
    hora_inicio: horas.map(f => f[0]).sort()[0],
    hora_fin: horas.map(f => f[1]).sort().slice(-1)[0],
  };
}

/**
 * Eventos de la lista que coinciden con la solicitud.
 * @param {{fecha_inicio, fecha_fin?, hora_inicio?, hora_fin?}} s
 * @param {Array} eventos  filas de la tabla eventos
 */
export function eventosCoincidentes(s, eventos) {
  if (!s?.fecha_inicio) return [];
  const ini = s.fecha_inicio;
  const fin = s.fecha_fin || s.fecha_inicio;
  const conHoras = HHMM.test(s.hora_inicio || '') && HHMM.test(s.hora_fin || '');

  return (eventos || []).filter(ev => {
    if (!ev?.fecha) return false;
    const evFin = ev.fecha_fin || ev.fecha;
    if (ev.fecha > fin || evFin < ini) return false;

    // Las horas solo afinan cuando las dos partes son de un único día:
    // en varios días, las horas de uno no dicen nada de los demás.
    const unDia = ini === fin && ev.fecha === evFin;
    if (unDia && conHoras && HHMM.test(ev.hora_inicio || '') && HHMM.test(ev.hora_fin || '')) {
      return aMin(ev.hora_inicio) < aMin(s.hora_fin) && aMin(s.hora_inicio) < aMin(ev.hora_fin);
    }
    return true;
  });
}

/** «Evaluación 1ª ESO — 12/12 · 16:00» */
export function textoEvento(ev) {
  const f = d => (d || '').split('-').reverse().join('/');
  const fechas = ev.fecha_fin && ev.fecha_fin !== ev.fecha
    ? `${f(ev.fecha)}–${f(ev.fecha_fin)}` : f(ev.fecha);
  const hora = ev.hora_inicio ? ` · ${String(ev.hora_inicio).slice(0, 5)}` : '';
  return `${ev.titulo || 'Evento'} — ${fechas}${hora}`;
}

/**
 * Lo mismo que eventosCoincidentes, pero leyendo los eventos de la base de
 * datos con el cliente del servidor. Devuelve los textos listos para el
 * correo. Si falla la lectura, devuelve [] (el aviso principal sale igual).
 */
export async function coincidenciasEnServidor(cliente, s) {
  try {
    if (!s?.fecha_inicio) return [];
    const fin = s.fecha_fin || s.fecha_inicio;
    const { data } = await cliente.from('eventos')
      .select('titulo, fecha, fecha_fin, hora_inicio, hora_fin')
      .lte('fecha', fin)
      .or(`fecha.gte.${s.fecha_inicio},fecha_fin.gte.${s.fecha_inicio}`);
    // Las convocatorias oficiales (claustros, CCP…) también salen en el
    // calendario, así que también cuentan.
    let convs = [];
    try {
      const { data: cv } = await cliente.from('convocatorias')
        .select('titulo, fecha, hora')
        .gte('fecha', s.fecha_inicio).lte('fecha', fin)
        .in('estado', ['convocada', 'en_curso']);
      convs = (cv || []).map(c => ({ titulo: c.titulo, fecha: c.fecha, hora_inicio: c.hora || null }));
    } catch { /* sin convocatorias: se avisa solo de los eventos */ }
    return eventosCoincidentes(s, [...(data || []), ...convs]).map(textoEvento);
  } catch (e) {
    console.error('coincidencias con eventos:', e?.message);
    return [];
  }
}
