// Mapea el departamento del profesor al sector de guardia correspondiente
// Departamentos FP → su sector específico
// Todo lo demás (FOL, Matemáticas, Lengua, Orientación, etc.) → GENERAL

export function departamentoASector(departamento) {
  if (!departamento) return 'GENERAL';
  const d = departamento.toUpperCase().trim();
  
  // Familias profesionales FP
  if (d.includes('TMV') || d.includes('CARROC') || d.includes('VEHICUL')) return 'TMV';
  if (d.includes('COMERC')) return 'COMERCIO';
  if (d.includes('ELECTR')) return 'ELECTRICIDAD';
  if (d.includes('INFORM')) return 'INFORMÁTICA';
  if (d.includes('HOSTEL') || d.includes('COCIN') || d.includes('RESTAUR')) return 'HOSTELERÍA';
  if (d.includes('INDUSTR') || d.includes('ALIMENT') || d.includes('PANAD')) return 'INDUSTRIAS ALIMENTARIAS';
  if (d.includes('ADMIN')) return 'ADMINISTRACIÓN';
  
  // Todo lo demás (FOL, Matemáticas, Lengua, Inglés, Orientación, PT/AL, etc.) → GENERAL
  return 'GENERAL';
}

// Sectores FP reales (los 7 que forman el cuadrante de guardias FP)
export const SECTORES_FP = ['TMV', 'COMERCIO', 'ELECTRICIDAD', 'INFORMÁTICA', 'HOSTELERÍA', 'INDUSTRIAS ALIMENTARIAS', 'ADMINISTRACIÓN'];

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
];

export const DEPARTAMENTOS = [
  'TMV/Carrocería','Hostelería','Informática','Electricidad','Comercio',
  'Administración','Industrias Alimentarias','FOL','Física y Química',
  'Ciencias Naturales/Biología','Matemáticas','Lengua y Literatura','Inglés',
  'Educación Física','Dibujo/Plástica','Geografía e Historia','Filosofía',
  'Música','Tecnología','Orientación','PT/AL',
];
