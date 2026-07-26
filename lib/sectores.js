// Mapea el departamento del profesor al sector de guardia correspondiente
// Departamentos FP → su sector específico
// Todo lo demás (Matemáticas, Lengua, Orientación, Agraria, etc.) → GENERAL

export function departamentoASector(departamento) {
  if (!departamento) return 'GENERAL';
  const d = departamento.toUpperCase().trim();
  
  // Familias profesionales FP (cada una con su propio cuadrante de guardias)
  if (d.includes('TMV') || d.includes('CARROC') || d.includes('VEHICUL')) return 'TMV';
  if (d.includes('COMERC')) return 'COMERCIO';
  if (d.includes('ELECTR')) return 'ELECTRICIDAD';
  if (d.includes('INFORM')) return 'INFORMÁTICA';
  if (d.includes('HOSTEL') || d.includes('COCIN') || d.includes('RESTAUR')) return 'HOSTELERÍA';
  if (d.includes('INDUSTR') || d.includes('ALIMENT') || d.includes('PANAD')) return 'INDUSTRIAS ALIMENTARIAS';
  if (d.includes('ADMIN')) return 'ADMINISTRACIÓN';
  // FOL tiene su propio cuadrante de guardias (NO va a GENERAL)
  if (d.includes('FOL') || d.includes('FORMACION Y ORIENT') || d.includes('FORMACIÓN Y ORIENT')) return 'FOL';
  
  // Todo lo demás → GENERAL (ESO, Bachillerato, Agraria, Orientación, etc.)
  return 'GENERAL';
}

// Sectores FP reales (los que forman el cuadrante de guardias FP)
// FOL incluido porque tiene su propio cuadrante
export const SECTORES_FP = [
  'TMV', 'COMERCIO', 'ELECTRICIDAD', 'INFORMÁTICA',
  'HOSTELERÍA', 'INDUSTRIAS ALIMENTARIAS', 'ADMINISTRACIÓN', 'FOL'
];

export function esSectorFP(sector) {
  const sup = (sector || '').toUpperCase();
  return SECTORES_FP.includes(sup);
}

export const DEPARTAMENTOS_FP = [
  'TMV/Carrocería',
  'Hostelería',
  'Informática',
  'Electricidad',
  'Comercio',
  'Administración',
  'Industrias Alimentarias',
  'FOL',
];

export const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL',
  'Física y Química','Ciencias Naturales/Biología','Matemáticas',
  'Lengua y Literatura','Inglés','Educación Física','Dibujo/Plástica',
  'Geografía e Historia','Filosofía','Música','Tecnología',
  'Orientación','PT/AL','Agraria',
];
