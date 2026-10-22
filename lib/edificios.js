/**
 * EDIFICIOS DEL CENTRO
 *
 * El código de aula de Peñalara ya dice dónde está: la letra es el
 * edificio y el primer número la planta (0 baja, 1 primera, 2 segunda).
 *   A110 → Edificio A (principal), primera planta
 *   B102 → Edificio B (Automoción y Carrocería), primera planta
 *   E003 → Edificio E (Cocina y Pastelería), planta baja
 *
 * Nomenclatura tomada de "Planos aulas.pdf" (Planos Centro, Equipo
 * Directivo). x/y/w/h colocan cada edificio en el croquis de /aulas
 * (lienzo de 1000 × 620); es orientativo y se ajusta a mano.
 */

export const EDIFICIOS = {
  A: { nombre: 'Edificio principal',       color: '#7fb0e6', x: 40,  y: 200, w: 270, h: 370 },
  B: { nombre: 'Automoción y Carrocería',  color: '#f0a35e', x: 190, y: 40,  w: 260, h: 140 },
  C: { nombre: 'Secretaría y Pabellón',    color: '#9ccf7a', x: 420, y: 470, w: 170, h: 110 },
  D: { nombre: 'Industrias Alimentarias',  color: '#e6c95a', x: 650, y: 150, w: 170, h: 220 },
  E: { nombre: 'Cocina y Pastelería',      color: '#ef8a8a', x: 840, y: 150, w: 120, h: 420 },
  F: { nombre: 'Comercio y FPB',           color: '#b79be0', x: 610, y: 400, w: 80,  h: 180 },
  G: { nombre: 'Juan Alcaide',             color: '#6fcbc0', x: 705, y: 400, w: 120, h: 170 },
};

const PLANTAS = ['planta baja', '1ª planta', '2ª planta'];

/** Normaliza lo que escriba el profesor: " a 110 " → "A110" */
export function normalizaAula(txt) {
  return String(txt || '').toUpperCase().replace(/\s+/g, '');
}

/**
 * Devuelve { codigo, letra, edificio, color, planta, texto } o null si el
 * código no sigue la regla letra + tres cifras de un edificio conocido.
 */
export function describirAula(txt) {
  const codigo = normalizaAula(txt);
  const m = /^([A-Z])(\d)\d\d$/.exec(codigo);
  if (!m || !EDIFICIOS[m[1]]) return null;
  const letra = m[1];
  const ed = EDIFICIOS[letra];
  const planta = PLANTAS[+m[2]] || `planta ${m[2]}`;
  return {
    codigo, letra, edificio: ed.nombre, color: ed.color, planta,
    texto: `Edificio ${letra} · ${ed.nombre} · ${planta}`,
  };
}

/** Saca el aula del grupo de Peñalara: "...-2CAR(2 B102 CAR)" → "B102" */
export function aulaDeGrupo(grupo) {
  const m = String(grupo || '').match(/\(\s*\d+\s+([A-Z]\d{3})\b/i);
  return m ? m[1].toUpperCase() : '';
}

export { PLANTAS };
