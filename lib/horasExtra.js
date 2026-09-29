/**
 * HORAS FUERA DE LA MAÑANA: 7ª y tarde/noche
 *
 * Los grupos de tarde (GS-1TLO, GS-2TLO) y la 7ª hora (14:30, reuniones y
 * alguna clase) estaban en los horarios, pero las pantallas por horas solo
 * conocían de 1ª a 6ª: esos profesores no veían sus clases de tarde ni
 * podían marcarlas al pedir una ausencia o un DLD.
 *
 * Se muestran SOLO a quien tiene horas en esas franjas. No generan guardia:
 * por la tarde no hay profesorado de guardia.
 *
 *   id    → como lo usan las pantallas
 *   label → como se guarda en las ausencias. OJO: NO puede empezar por un
 *           número de 1 a 6: el motor de guardias lee el primer carácter
 *           («16:00» se leería como 1ª hora y generaría una guardia de
 *           mañana que no existe). Por eso «Tarde 16:00».
 *   db    → como viene en horarios_profesores.hora_id
 */
export const HORAS_EXTRA = [
  { id: '7',      db: '7a',     label: '7ª hora', rango: '14:30–15:25' },
  { id: 'tarde1', db: 'tarde1', label: 'Tarde 16:00', rango: '16:00–16:55' },
  { id: 'tarde2', db: 'tarde2', label: 'Tarde 16:55', rango: '16:55–17:50' },
  { id: 'tarde3', db: 'tarde3', label: 'Tarde 17:50', rango: '17:50–18:45' },
  { id: 'noche1', db: 'noche1', label: 'Tarde 19:00', rango: '19:00–19:55' },
  { id: 'noche2', db: 'noche2', label: 'Tarde 19:55', rango: '19:55–20:50' },
  { id: 'noche3', db: 'noche3', label: 'Tarde 20:50', rango: '20:50–21:45' },
];

/** hora_id de la base → id de pantalla: '3a' → '3', '7a' → '7', 'tarde1' igual. */
export function idHora(horaId) {
  const t = String(horaId || '').trim().toLowerCase();
  const m = t.match(/^(\d+)\s*[aª]?(\s*hora)?$/);
  return m ? m[1] : t;
}

/** Las horas extra en las que esa persona tiene algo (clase, reunión...). */
export function extrasDe(horas) {
  const tiene = new Set((horas || []).filter(h => h && h.tipo !== 'libre').map(h => idHora(h.hora_id ?? h.hora)));
  return HORAS_EXTRA.filter(x => tiene.has(x.id));
}

/** ¿Es una hora de 7ª o de tarde? Vale el id ('tarde1'), el de la base ('7a') o el nombre guardado ('Tarde 16:00'). */
export const esHoraExtra = h => {
  const t = String(h || '').trim().toLowerCase();
  return HORAS_EXTRA.some(x => x.id === idHora(t) || x.db === t || x.label.toLowerCase() === t);
};
