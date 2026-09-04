// Motivos de ausencia según nomenclatura de Delphos (JCCM)
// Lista única: sustituye a la antigua separación prevista/imprevista + subtipos.
// El campo `tipo` de la BD (CHECK: prevista|imprevista) se deriva de aquí.

export const MOTIVOS_AUSENCIA = [
  { valor: 'enf_1dia',              emoji: '🤒', label: 'Enfermedad de un día de duración',                    tipo: 'imprevista' },
  { valor: 'indisposicion',         emoji: '🤢', label: 'Indisposición durante la jornada laboral',            tipo: 'imprevista' },
  { valor: 'visita_medica',         emoji: '🩺', label: 'Visita médica',                                       tipo: 'prevista'   },
  { valor: 'lic_enfermedad',        emoji: '🏥', label: 'Licencia por enfermedad',                             tipo: 'imprevista', aviso: 'BAJA' },
  { valor: 'prep_parto',            emoji: '🤰', label: 'Preparación al parto',                                tipo: 'prevista'   },
  { valor: 'matrimonio',            emoji: '💍', label: 'Permiso por matrimonio',                              tipo: 'prevista'   },
  { valor: 'mat_paternidad',        emoji: '👶', label: 'Maternidad / Paternidad',                             tipo: 'prevista'   },
  { valor: 'adopcion',              emoji: '🤱', label: 'Adopción y acogimiento',                              tipo: 'prevista'   },
  { valor: 'familiar_grave',        emoji: '🕊️', label: 'Nacimiento/Muerte/Enfermedad grave de un familiar',   tipo: 'imprevista' },
  { valor: 'examenes',              emoji: '📝', label: 'Concurrir exámenes finales',                          tipo: 'prevista'   },
  { valor: 'traslado',              emoji: '📦', label: 'Traslado de domicilio',                               tipo: 'prevista'   },
  { valor: 'red_guarda_legal',      emoji: '👨‍👧', label: 'Reducción por guarda legal',                          tipo: 'prevista'   },
  { valor: 'red_lactancia',         emoji: '🍼', label: 'Reducción por lactancia (hijo menor de doce meses)',  tipo: 'prevista'   },
  { valor: 'red_interes_part',      emoji: '⏱️', label: 'Reducción de jornada por interés particular',         tipo: 'prevista'   },
  { valor: 'reunion_admin',         emoji: '🏛️', label: 'Reuniones convocadas por la Administración Educativa',tipo: 'prevista'   },
  { valor: 'act_formacion',         emoji: '📚', label: 'Actividades de formación',                            tipo: 'prevista'   },
  { valor: 'act_complementarias',   emoji: '🚌', label: 'Actividad complementaria o extraescolar',              tipo: 'prevista', noComputa: true, aviso: 'EXTRAESCOLAR' },
  { valor: 'dld',                   emoji: '🗓️', label: 'Día de libre disposición concedido',                   tipo: 'prevista', noComputa: true, aviso: 'DLD' },
  { valor: 'huelga_total',          emoji: '✊', label: 'Huelga (jornada completa)',                           tipo: 'prevista'   },
  { valor: 'huelga_parcial',        emoji: '✊', label: 'Huelga (paro parcial)',                               tipo: 'prevista'   },
  { valor: 'sindical',              emoji: '🤝', label: 'Funciones sindicales',                                tipo: 'prevista'   },
  { valor: 'votar',                 emoji: '🗳️', label: 'Ejercicio del derecho a votar',                       tipo: 'prevista'   },
  { valor: 'candidato',             emoji: '📢', label: 'Candidato en elecciones',                             tipo: 'prevista'   },
  { valor: 'deber_inexcusable',     emoji: '⚖️', label: 'Deber inexcusable de carácter público o personal',    tipo: 'prevista'   },
  { valor: 'permiso_formacion',     emoji: '🎓', label: 'Permiso de formación',                                tipo: 'prevista', aviso: 'FORMACION' },
  { valor: 'act_artisticas',        emoji: '🎭', label: 'Permisos por actividades artísticas',                 tipo: 'prevista'   },
  { valor: 'otros',                 emoji: '📌', label: 'Otros (especificar la justificación en observaciones)',tipo: 'prevista'  },
];

// Códigos antiguos: se conservan SOLO para leer ausencias ya registradas.
// No aparecen en el desplegable.
export const MOTIVOS_LEGACY = {
  // Retirados del desplegable: tienen modulo propio o estan pendientes de decision.
  moscosos:            { emoji: '🗓️', label: 'Días de asuntos propios (Moscosos)' },
  lic_asuntos_propios: { emoji: '📄', label: 'Licencia por asuntos propios' },
  erasmus:      { emoji: '✈️', label: 'Erasmus / Movilidad' },
  extraescolar: { emoji: '🏫', label: 'Act. Extraescolar'   },
  formacion:    { emoji: '📚', label: 'Curso de Formación'  },
  otro:         { emoji: '📝', label: 'Otro motivo'         },
};

// Mapa completo para mostrar cualquier subtipo, nuevo o antiguo.
export const MOTIVOS_MAP = {
  ...MOTIVOS_LEGACY,
  ...Object.fromEntries(MOTIVOS_AUSENCIA.map(m => [m.valor, { emoji: m.emoji, label: m.label }])),
};

// Etiqueta legible de un subtipo. Devuelve '' si no se reconoce.
export function etiquetaMotivo(valor) {
  const m = MOTIVOS_MAP[valor];
  return m ? `${m.emoji} ${m.label}` : (valor || '');
}

// Deriva el valor de `tipo` (prevista|imprevista) que exige el CHECK de la BD.
export function tipoDeMotivo(valor) {
  const m = MOTIVOS_AUSENCIA.find(x => x.valor === valor);
  return m ? m.tipo : 'imprevista';
}

// Textos de los avisos especiales que salen al elegir ciertos motivos.
export const AVISOS = {
  BAJA: {
    titulo: '🏥 Esto es una baja médica',
    texto: 'Este motivo es para ausencias de más de un día. Supone una baja, y el funcionario de carrera está obligado a aportar el documento oficial de baja. Avisa a Secretaría para que registre la baja y valore la sustitución.',
  },
  EXTRAESCOLAR: {
    titulo: '🚌 Esto no cuenta como falta',
    texto: 'La actividad ya está autorizada, así que esta ausencia no computa como falta tuya ni sale en el informe de la Delegación. Se registra para que el cuadrante de guardias sepa que faltas y para que dejes las tareas de tus grupos.',
  },
  DLD: {
    titulo: '🗓️ Esto no cuenta como falta',
    texto: 'El día ya está concedido, así que esta ausencia no computa como falta tuya. Se registra para que el cuadrante de guardias sepa que faltas y para que dejes las tareas de tus grupos.',
  },
  FORMACION: {
    titulo: '🎓 Recuerda solicitarlo también en Delphos',
    texto: 'Comunicarlo aquí no sustituye la solicitud oficial. Debes pedirlo además por la vía de Delphos. Se avisará a la dirección de que lo has solicitado.',
  },
};

// Devuelve el aviso especial de un motivo, o null si no tiene.
export function avisoDeMotivo(valor) {
  const m = MOTIVOS_AUSENCIA.find(x => x.valor === valor);
  return m && m.aviso ? AVISOS[m.aviso] : null;
}

// Campos adicionales que pide cada motivo. Se guardan juntos en la
// columna `datos_extra` (jsonb) de la tabla ausencias.
export const CAMPOS_EXTRA = {
  permiso_formacion: {
    titulo: '🎓 Datos del curso de formación',
    campos: [
      { id: 'curso',        label: 'Nombre del curso',            requerido: true  },
      { id: 'lugar',        label: 'Lugar de celebración',        requerido: true  },
      { id: 'entidad',      label: 'Entidad que lo organiza',     requerido: true  },
      { id: 'horario',      label: 'Horario de celebración',      requerido: true,  ayuda: 'Por ejemplo: de 16:00 a 20:00' },
      { id: 'horas',        label: 'Horas totales del curso',     requerido: true,  tipo: 'number', ayuda: 'Duración certificada del curso. Se suma al cómputo del curso académico.' },
      { id: 'dias_totales', label: 'Días de ausencia que supone', requerido: false, ayuda: 'Días totales del curso. Recuerda registrar cada día por separado.' },
    ],
  },
};

// Devuelve los campos adicionales de un motivo, o null si no tiene.
export function camposExtraDe(valor) {
  return CAMPOS_EXTRA[valor] || null;
}

/**
 * ¿Este motivo cuenta como falta del profesorado?
 *
 * Los días de libre disposición y las actividades complementarias ya
 * están autorizados por otra vía. La ausencia se registra para el
 * cuadrante de guardias y para las tareas del alumnado, pero no es una
 * falta: no pide justificante ni sale en el informe mensual.
 */
export function computaComoFalta(valor) {
  const m = MOTIVOS_AUSENCIA.find(x => x.valor === valor);
  return !(m && m.noComputa);
}

// Motivos que exigen detallar el texto en observaciones.
export const MOTIVOS_REQUIEREN_DETALLE = ['otros'];
