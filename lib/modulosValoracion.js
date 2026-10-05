/**
 * MÓDULOS QUE SE PUEDEN VALORAR EN UNA RONDA
 *
 * Un solo sitio para la encuesta, la API y el panel de resultados.
 * El orden es el del panel del profesorado. "general" va siempre al
 * final: primero se piensa en cada módulo y luego en el conjunto.
 *
 * Las claves no se cambian nunca: con ellas se compara una ronda con
 * la anterior. Para añadir un módulo, se añade una línea nueva.
 */
export const MODULOS_VALORACION = [
  { id: 'guardias',       emoji: '🛡️', texto: 'Guardias' },
  { id: 'ausencias',      emoji: '🏥', texto: 'Notificar una ausencia' },
  { id: 'dld',            emoji: '📄', texto: 'Días de libre disposición' },
  { id: 'autorizaciones', emoji: '📋', texto: 'Autorizaciones del alumnado' },
  { id: 'actividades',    emoji: '🎒', texto: 'Actividades complementarias' },
  { id: 'formacion',      emoji: '🎓', texto: 'Formación' },
  { id: 'calendario',     emoji: '📆', texto: 'Calendario' },
  { id: 'mantenimiento',  emoji: '🔧', texto: 'Incidencias de mantenimiento' },
  { id: 'limpieza',       emoji: '🧹', texto: 'Incidencias de limpieza' },
  { id: 'compras',        emoji: '🛒', texto: 'Solicitudes de compra' },
  { id: 'tutorias',       emoji: '👥', texto: 'Tutorías' },
  { id: 'convocatorias',  emoji: '🗳️', texto: 'Convocatorias y votaciones' },
  { id: 'horario',        emoji: '🕐', texto: 'Horarios del centro' },
  { id: 'avisos',         emoji: '🔔', texto: 'Avisos y tareas pendientes' },
  { id: 'general',        emoji: '📱', texto: 'APrieto en conjunto' },
];

export const IDS_MODULOS = MODULOS_VALORACION.map(m => m.id);

export function nombreModulo(id) {
  const m = MODULOS_VALORACION.find(x => x.id === id);
  return m ? `${m.emoji} ${m.texto}` : id;
}
