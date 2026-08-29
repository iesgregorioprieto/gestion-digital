// Motivos de ausencia según nomenclatura de Delphos (JCCM)
// Lista única: sustituye a la antigua separación prevista/imprevista + subtipos.
// El campo `tipo` de la BD (CHECK: prevista|imprevista) se deriva de aquí.

export const MOTIVOS_AUSENCIA = [
  { valor: 'enf_1dia',              emoji: '🤒', label: 'Enfermedad de un día de duración',                    tipo: 'imprevista' },
  { valor: 'indisposicion',         emoji: '🤢', label: 'Indisposición durante la jornada laboral',            tipo: 'imprevista' },
  { valor: 'visita_medica',         emoji: '🩺', label: 'Visita médica',                                       tipo: 'prevista'   },
  { valor: 'lic_enfermedad',        emoji: '🏥', label: 'Licencia por enfermedad',                             tipo: 'imprevista' },
  { valor: 'prep_parto',            emoji: '🤰', label: 'Preparación al parto',                                tipo: 'prevista'   },
  { valor: 'matrimonio',            emoji: '💍', label: 'Permiso por matrimonio',                              tipo: 'prevista'   },
  { valor: 'mat_paternidad',        emoji: '👶', label: 'Maternidad / Paternidad',                             tipo: 'prevista'   },
  { valor: 'adopcion',              emoji: '🤱', label: 'Adopción y acogimiento',                              tipo: 'prevista'   },
  { valor: 'familiar_grave',        emoji: '🕊️', label: 'Nacimiento/Muerte/Enfermedad grave de un familiar',   tipo: 'imprevista' },
  { valor: 'examenes',              emoji: '📝', label: 'Concurrir exámenes finales',                          tipo: 'prevista'   },
  { valor: 'traslado',              emoji: '📦', label: 'Traslado de domicilio',                               tipo: 'prevista'   },
  { valor: 'lic_asuntos_propios',   emoji: '📄', label: 'Licencia por asuntos propios',                        tipo: 'prevista'   },
  { valor: 'red_guarda_legal',      emoji: '👨‍👧', label: 'Reducción por guarda legal',                          tipo: 'prevista'   },
  { valor: 'red_lactancia',         emoji: '🍼', label: 'Reducción por lactancia (hijo menor de doce meses)',  tipo: 'prevista'   },
  { valor: 'red_interes_part',      emoji: '⏱️', label: 'Reducción de jornada por interés particular',         tipo: 'prevista'   },
  { valor: 'reunion_admin',         emoji: '🏛️', label: 'Reuniones convocadas por la Administración Educativa',tipo: 'prevista'   },
  { valor: 'act_complementarias',   emoji: '🏫', label: 'Actividades complementarias y extracurriculares',     tipo: 'prevista'   },
  { valor: 'act_formacion',         emoji: '📚', label: 'Actividades de formación',                            tipo: 'prevista'   },
  { valor: 'huelga_total',          emoji: '✊', label: 'Huelga (jornada completa)',                           tipo: 'prevista'   },
  { valor: 'huelga_parcial',        emoji: '✊', label: 'Huelga (paro parcial)',                               tipo: 'prevista'   },
  { valor: 'sindical',              emoji: '🤝', label: 'Funciones sindicales',                                tipo: 'prevista'   },
  { valor: 'votar',                 emoji: '🗳️', label: 'Ejercicio del derecho a votar',                       tipo: 'prevista'   },
  { valor: 'candidato',             emoji: '📢', label: 'Candidato en elecciones',                             tipo: 'prevista'   },
  { valor: 'deber_inexcusable',     emoji: '⚖️', label: 'Deber inexcusable de carácter público o personal',    tipo: 'prevista'   },
  { valor: 'permiso_formacion',     emoji: '🎓', label: 'Permiso de formación',                                tipo: 'prevista'   },
  { valor: 'act_artisticas',        emoji: '🎭', label: 'Permisos por actividades artísticas',                 tipo: 'prevista'   },
  { valor: 'moscosos',              emoji: '🗓️', label: 'Días de asuntos propios (Moscosos)',                  tipo: 'prevista'   },
  { valor: 'otros',                 emoji: '📌', label: 'Otros (especificar la justificación en observaciones)',tipo: 'prevista'  },
];

// Códigos antiguos: se conservan SOLO para leer ausencias ya registradas.
// No aparecen en el desplegable.
export const MOTIVOS_LEGACY = {
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

// Motivos que exigen detallar el texto en observaciones.
export const MOTIVOS_REQUIEREN_DETALLE = ['otros'];
