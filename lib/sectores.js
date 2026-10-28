// Mapea el departamento del profesor al sector de guardia correspondiente.
// Departamentos FP → su sector específico. Todo lo demás → GENERAL.
//
// IMPORTANTE: el cuadrante de guardias escribe los sectores de forma
// irregular ("HOSTELERIA" sin tilde, "INFORMÁTICA" con ella), así que
// todas las comparaciones se hacen sin tildes.

export function sinTildes(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Nombre único de Electricidad y Electrónica (van juntos). El cuadrante
// de Peñalara lo escribe «E. E.», las fichas «EE» y el motor decía
// «ELECTRICIDAD»: eran tres sectores distintos y sus guardias no se
// asociaban a sus ausencias. Todas las variantes se leen como «E.E.».
export const SECTOR_EE = 'E.E.';

// Forma canónica de un sector para comparar: sin tildes, mayúsculas, sin espacios de más.
export function normSector(s) {
  const n = sinTildes(s || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (n.replace(/[\s.]/g, '') === 'EE' || n.startsWith('ELECTR')) return SECTOR_EE;
  return n;
}

export function departamentoASector(departamento) {
  if (!departamento) return 'GENERAL';
  const d = normSector(departamento);

  if (d.includes('TMV') || d.includes('CARROC') || d.includes('VEHICUL')) return 'TMV';
  if (d.includes('COMERC')) return 'COMERCIO';
  if (d === SECTOR_EE || d.includes('ELECTR')) return SECTOR_EE;
  if (d.includes('INFORM')) return 'INFORMÁTICA';
  if (d.includes('HOSTEL') || d.includes('COCIN') || d.includes('RESTAUR')) return 'HOSTELERÍA';
  if (d.includes('INDUSTR') || d.includes('ALIMENT') || d.includes('PANAD')) return 'INDUSTRIAS ALIMENTARIAS';
  if (d.includes('ADMIN')) return 'ADMINISTRACIÓN';
  if (d.includes('FOL') || d.includes('FORMACION Y ORIENT')) return 'FOL';

  return 'GENERAL';
}

// Sectores FP reales (los que forman el cuadrante de guardias FP).
export const SECTORES_FP = [
  'TMV', 'COMERCIO', SECTOR_EE, 'INFORMÁTICA',
  'HOSTELERÍA', 'INDUSTRIAS ALIMENTARIAS', 'ADMINISTRACIÓN', 'FOL',
];

const SECTORES_FP_NORM = SECTORES_FP.map(normSector);

export function esSectorFP(sector) {
  return SECTORES_FP_NORM.includes(normSector(sector));
}

// El recreo es vigilancia de zona: ni sustituye a nadie ni entra en el reparto.
export function esSectorRecreo(sector) {
  return normSector(sector).includes('RECREO');
}

export const DEPARTAMENTOS_FP = [
  'TMV', 'Hostelería', 'Informática', SECTOR_EE, 'Comercio',
  'Administración', 'Industrias Alimentarias', 'FOL',
];

export const DEPARTAMENTOS = [
  'TMV', 'Hostelería', 'Informática', SECTOR_EE, 'Comercio',
  'Administración', 'Industrias Alimentarias', 'FOL',
  'Física y Química', 'Ciencias Naturales/Biología', 'Matemáticas',
  'Lengua y Literatura', 'Clásicas', 'Inglés', 'Francés', 'Religión', 'Educación Física', 'Dibujo/Plástica',
  'Geografía e Historia', 'Filosofía', 'Música', 'Tecnología',
  'Orientación', 'PT/AL', 'ACT Agrarias',
];
