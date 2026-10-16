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
  { id: 'persianas', emoji: '🪟', label: 'Persianas', color: '#7c3aed', fondo: '#f3e8ff', ayuda: 'Cintas, lamas, recogedores, estores',
    palabras: ['persian', 'cinta', 'recogedor', 'estor', 'cortina', 'lama', 'lamas$'] },
  { id: 'cristales', emoji: '🔲', label: 'Cristales y ventanas', color: '#0284c7', fondo: '#e0f2fe', ayuda: 'Cristal roto, ventana que no cierra',
    palabras: ['cristal', 'vidrio', 'ventan', 'luna$', 'lunas$'] },
  { id: 'puertas', emoji: '🚪', label: 'Puertas y cerraduras', color: '#b45309', fondo: '#fef3c7', ayuda: 'Cerraduras, llaves, manillas, bisagras',
    palabras: ['puerta', 'cerradura', 'llave', 'bombin', 'manilla', 'manivela', 'pomo', 'pestillo', 'bisagra', 'cerrojo', 'candado', 'picaporte', 'muelle', 'cierrapuerta'] },
  { id: 'informatica', emoji: '💻', label: 'Informática y audiovisuales', color: '#4f46e5', fondo: '#e0e7ff', ayuda: 'Proyector, ordenador, pizarra digital, red',
    palabras: ['proyector', 'pizarra digital', 'panel digital', 'pantalla', 'ordenador', 'pc$', 'monitor', 'wifi', 'internet', 'red$', 'altavo', 'impresora', 'teclado', 'raton', 'canon', 'hdmi', 'portatil', 'tablet'] },
  { id: 'electricidad', emoji: '💡', label: 'Electricidad', color: '#ca8a04', fondo: '#fef9c3', ayuda: 'Luces, enchufes, interruptores',
    palabras: ['luz$', 'luces', 'fluorescente', 'bombilla', 'lampara', 'enchufe', 'interruptor', 'electric', 'cable', 'foco', 'focos', 'led$', 'leds$', 'plafon', 'tubo', 'regleta', 'diferencial', 'automatico'] },
  { id: 'fontaneria', emoji: '🚰', label: 'Fontanería y baños', color: '#0891b2', fondo: '#cffafe', ayuda: 'Grifos, cisternas, atascos, fugas',
    palabras: ['grifo', 'agua$', 'aguas$', 'cisterna', 'wc$', 'vater', 'water', 'inodoro', 'lavabo', 'fuga', 'gotea', 'atasc', 'desag', 'fregadero', 'urinario', 'tuberia', 'ducha', 'jabon', 'secamanos', 'papel higienico', 'escobilla'] },
  { id: 'clima', emoji: '🌡️', label: 'Calefacción y aire', color: '#dc2626', fondo: '#fee2e2', ayuda: 'Radiadores, aire acondicionado',
    palabras: ['calefac', 'radiador', 'aire acondicionado', 'climatiz', 'caldera', 'split', 'termostato', 'frio$', 'calor$'] },
  { id: 'carpinteria', emoji: '🪚', label: 'Carpintería y mobiliario', color: '#92400e', fondo: '#ffedd5', ayuda: 'Mesas, sillas, armarios, pizarras',
    palabras: ['silla', 'mesa', 'armario', 'estanteria', 'balda', 'taquilla', 'pupitre', 'banco', 'cajon', 'perchero', 'pizarra', 'corcho', 'tablon', 'papelera', 'cajonera'] },
  { id: 'albanileria', emoji: '🧱', label: 'Albañilería y pintura', color: '#57534e', fondo: '#f5f5f4', ayuda: 'Paredes, techos, suelos, humedades',
    palabras: ['pared', 'techo', 'suelo', 'pintura', 'pintar', 'humedad', 'gotera', 'azulejo', 'baldosa', 'grieta', 'desconch', 'yeso', 'escayola', 'placa', 'zocalo', 'rodapie'] },
];

export const TIPO_OTROS = { id: 'otros', emoji: '📝', label: 'Otros', color: '#475569', fondo: '#f1f5f9', ayuda: 'Cualquier otra cosa' };

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

/**
 * Secciones en el orden en que las ve el profesor al dar el aviso
 * (el orden de TIPOS_MANTENIMIENTO es el de clasificar por palabras).
 */
const ORDEN = ['cristales', 'persianas', 'puertas', 'electricidad', 'fontaneria', 'albanileria', 'carpinteria', 'clima', 'informatica'];
export const SECCIONES = [
  ...ORDEN.map(id => TIPOS_MANTENIMIENTO.find(t => t.id === id)),
  TIPO_OTROS,
];

export function seccionPorId(id) {
  return SECCIONES.find(s => s.id === id) || null;
}

/** Deduce la sección solo por el texto (para las incidencias antiguas). */
export function deducirSeccion(inc) {
  return buscar(inc?.descripcion) || buscar(inc?.ubicacion_exacta) || TIPO_OTROS;
}

/**
 * Sección de una incidencia ({ id, emoji, label, color... }).
 * Manda la que eligió el profesor (o corrigió secretaría); si no la
 * tiene, se deduce de lo escrito.
 */
export function tipoDeIncidencia(inc) {
  return seccionPorId(inc?.seccion) || deducirSeccion(inc);
}
