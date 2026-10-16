/**
 * TIPOS DE AVERÍA DE MANTENIMIENTO
 *
 * Las incidencias no llevan un campo de tipo: el profesor elige la
 * estancia y escribe qué pasa. Para que secretaría pueda abrir el grupo
 * de "persianas" y arreglarlas todas de una vez, el tipo se deduce de
 * lo escrito, buscando palabras clave en la descripción (y si ahí no
 * hay ninguna, en la ubicación).
 *
 * El orden importa: gana el primer grupo que encaja. "Pizarra digital"
 * tiene que caer en Informática antes de que "pizarra" la lleve a
 * Mobiliario.
 *
 * Cada palabra es el principio de una palabra del texto ("persian"
 * encaja con persiana y persianas). Las que acaban en "$" tienen que
 * ser la palabra entera, para que "red" no encaje dentro de "pared".
 */

export const TIPOS_MANTENIMIENTO = [
  { id: 'persianas', emoji: '🪟', label: 'Persianas y cortinas',
    palabras: ['persian', 'cinta', 'recogedor', 'estor', 'cortina', 'lama', 'lamas$'] },
  { id: 'cristales', emoji: '🔲', label: 'Cristales y ventanas',
    palabras: ['cristal', 'vidrio', 'ventan', 'luna$', 'lunas$'] },
  { id: 'puertas', emoji: '🚪', label: 'Puertas y cerraduras',
    palabras: ['puerta', 'cerradura', 'llave', 'bombin', 'manilla', 'manivela', 'pomo', 'pestillo', 'bisagra', 'cerrojo', 'candado', 'picaporte', 'muelle', 'cierrapuerta'] },
  { id: 'informatica', emoji: '💻', label: 'Informática y audiovisuales',
    palabras: ['proyector', 'pizarra digital', 'panel digital', 'pantalla', 'ordenador', 'pc$', 'monitor', 'wifi', 'internet', 'red$', 'altavo', 'impresora', 'teclado', 'raton', 'canon', 'hdmi', 'portatil', 'tablet'] },
  { id: 'electricidad', emoji: '💡', label: 'Electricidad e iluminación',
    palabras: ['luz$', 'luces', 'fluorescente', 'bombilla', 'lampara', 'enchufe', 'interruptor', 'electric', 'cable', 'foco', 'focos', 'led$', 'leds$', 'plafon', 'tubo', 'regleta', 'diferencial', 'automatico'] },
  { id: 'fontaneria', emoji: '🚰', label: 'Fontanería y baños',
    palabras: ['grifo', 'agua$', 'aguas$', 'cisterna', 'wc$', 'vater', 'water', 'inodoro', 'lavabo', 'fuga', 'gotea', 'atasc', 'desag', 'fregadero', 'urinario', 'tuberia', 'ducha', 'jabon', 'secamanos', 'papel higienico', 'escobilla'] },
  { id: 'clima', emoji: '🌡️', label: 'Calefacción y aire',
    palabras: ['calefac', 'radiador', 'aire acondicionado', 'climatiz', 'caldera', 'split', 'termostato', 'frio$', 'calor$'] },
  { id: 'mobiliario', emoji: '🪑', label: 'Mobiliario',
    palabras: ['silla', 'mesa', 'armario', 'estanteria', 'balda', 'taquilla', 'pupitre', 'banco', 'cajon', 'perchero', 'pizarra', 'corcho', 'tablon', 'papelera', 'cajonera'] },
  { id: 'obra', emoji: '🧱', label: 'Paredes, techos y suelos',
    palabras: ['pared', 'techo', 'suelo', 'pintura', 'pintar', 'humedad', 'gotera', 'azulejo', 'baldosa', 'grieta', 'desconch', 'yeso', 'escayola', 'placa', 'zocalo', 'rodapie'] },
];

export const TIPO_OTROS = { id: 'otros', emoji: '📝', label: 'Otros' };

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function escapar(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REGLAS = TIPOS_MANTENIMIENTO.map(t => ({
  tipo: t,
  regex: new RegExp(
    t.palabras
      .map(p => p.endsWith('$') ? `\\b${escapar(p.slice(0, -1))}\\b` : `\\b${escapar(p)}`)
      .join('|')
  ),
}));

function buscar(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  for (const r of REGLAS) if (r.regex.test(t)) return r.tipo;
  return null;
}

/** Devuelve el tipo de avería de una incidencia ({ id, emoji, label }). */
export function tipoDeIncidencia(inc) {
  return buscar(inc?.descripcion) || buscar(inc?.ubicacion_exacta) || TIPO_OTROS;
}
