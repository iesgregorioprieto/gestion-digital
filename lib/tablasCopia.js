/**
 * TABLAS DE LA COPIA DE SEGURIDAD
 *
 * Una sola lista para las tres piezas: la pantalla que la genera, la ruta
 * que lee los datos y la que los restaura. Si se añade una tabla nueva a la
 * aplicación, se añade AQUÍ y entra en la copia y en la restauración.
 *
 * No entran a propósito:
 *   · rate_limit y push_suscripciones: son de funcionamiento, no datos.
 *   · Los archivos (justificantes, fotos): están en el almacenamiento de
 *     Supabase, no en tablas, y se descargan por separado.
 */
export const TABLAS_COPIA = [
  // Personas y organización
  { nombre: 'profesores',            label: 'Profesorado',                 emoji: '👥' },
  { nombre: 'grupos',                label: 'Grupos',                      emoji: '🏫' },
  { nombre: 'alumnos',               label: 'Alumnado (seguros, autorizaciones)', emoji: '🎓' },
  { nombre: 'equipos',               label: 'Equipos',                     emoji: '🧩' },
  // Horarios y guardias
  { nombre: 'horarios_profesores',   label: 'Horarios',                    emoji: '🕐' },
  { nombre: 'equivalencias_horario', label: 'Nombres del cuadrante',       emoji: '🔗' },
  { nombre: 'descartes_horario',     label: 'Descartes del cuadrante',     emoji: '🚫' },
  { nombre: 'apoyos_asignados',      label: 'Guardias asignadas',          emoji: '🛡️' },
  { nombre: 'recalculos_guardias',   label: 'Recálculos de guardias',      emoji: '🔄' },
  { nombre: 'apoyos_guardia',        label: 'Apoyos (histórico)',          emoji: '📜' },
  { nombre: 'apoyos_realizados',     label: 'Apoyos realizados',           emoji: '✅' },
  { nombre: 'guardias_manuales',     label: 'Guardias manuales',           emoji: '✏️' },
  // Ausencias y permisos
  { nombre: 'ausencias',             label: 'Ausencias',                   emoji: '🏥' },
  { nombre: 'dld',                   label: 'Días de libre disposición',   emoji: '📄' },
  // Vida del centro
  { nombre: 'actividades',           label: 'Actividades complementarias', emoji: '🎒' },
  { nombre: 'comunicaciones',        label: 'Comunicaciones del claustro', emoji: '📨' },
  { nombre: 'comunicaciones_respuestas', label: 'Respuestas a comunicaciones', emoji: '💬' },
  { nombre: 'votaciones',            label: 'Votaciones',                  emoji: '🗳️' },
  { nombre: 'votantes',              label: 'Votantes',                    emoji: '🙋' },
  { nombre: 'votos',                 label: 'Votos (secretos)',            emoji: '📥' },
  { nombre: 'valoraciones',          label: 'Valoraciones',                emoji: '⭐' },
  { nombre: 'incidencias_app',       label: 'Incidencias de la app',       emoji: '🐞' },
  { nombre: 'mantenimiento',         label: 'Mantenimiento',               emoji: '🔧' },
  { nombre: 'limpieza_dependencias', label: 'Limpieza: dependencias',      emoji: '🧹' },
  { nombre: 'limpieza_incidencias',  label: 'Limpieza: incidencias',       emoji: '🧽' },
  { nombre: 'compras',               label: 'Compras',                     emoji: '🛒' },
  { nombre: 'avisos_sala',           label: 'Avisos de sala',              emoji: '📢' },
  // Calendario y configuración
  { nombre: 'config_centro',         label: 'Datos del curso',             emoji: '📅' },
  { nombre: 'calendario_escolar',    label: 'Calendario escolar',          emoji: '🗓️' },
  { nombre: 'periodos_no_lectivos',  label: 'Vacaciones y festivos',       emoji: '🏖️' },
];

export const NOMBRES_COPIA = new Set(TABLAS_COPIA.map(t => t.nombre));

// Columnas que NUNCA salen en la copia: el archivo acaba en Drive.
export const COLUMNAS_EXCLUIDAS = {
  profesores: ['password_hash'],
};
