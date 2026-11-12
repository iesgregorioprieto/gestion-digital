/**
 * Lectura del listado de actividades extraescolares de la PGA.
 *
 * El listado lo rellenan los departamentos en una Excel y se guarda como CSV.
 * Según cómo se guarde, Excel lo escribe en UTF-8, en Windows-1252 o en
 * «CSV (MS-DOS)», que es la página de códigos 850: ahí la «ó» es el byte A2
 * y un lector normal saca «descripci¢n». Se prueban las tres y se queda la
 * que da más letras españolas.
 *
 * Las celdas pueden traer saltos de línea (van entre comillas), así que el
 * CSV se lee carácter a carácter, nunca partiendo por líneas.
 */

// Página de códigos 850 (bytes 0x80–0xFF). No viene en TextDecoder.
const CP850 =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐' +
  '└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ';

function decodificarCP850(bytes) {
  let s = '';
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP850[b - 0x80];
  return s;
}

const LETRAS_ES = /[áéíóúñÁÉÍÓÚÑüº]/g;
const RAROS = /[�¢¤░▒▓│┤╣║╗╝┐└┴┬├─┼╚╔╩╦╠═╬┘┌█▄▀■]/g;

export function decodificarCSV(buffer) {
  const bytes = new Uint8Array(buffer);
  try {
    // UTF-8 estricto: si cuadra, es UTF-8 seguro
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch (e) { /* no es UTF-8 */ }
  const candidatos = [new TextDecoder('windows-1252').decode(bytes), decodificarCP850(bytes)];
  const nota = t => (t.match(LETRAS_ES) || []).length - 3 * (t.match(RAROS) || []).length;
  return nota(candidatos[1]) > nota(candidatos[0]) ? candidatos[1] : candidatos[0];
}

/** Separa un CSV en filas y columnas respetando las comillas (y los saltos de línea dentro de ellas). */
export function parsearCSV(texto) {
  const primera = texto.slice(0, texto.search(/\r?\n/) + 1 || texto.length);
  const sep = (primera.match(/;/g) || []).length >= (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], celda = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; } else comillas = false;
      } else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter(f => f.some(c => c.trim()));
}

const sinTildes = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Cada departamento escribe su nombre a su manera («ADMINISTRACIÓN»,
 * «Industrias Almentarias», «Mantenimiento de vehículos»…). Se llevan a los
 * nombres que usa la app, para que cada profesor vea las suyas primero.
 * Erasmus+ y British van a «Proyectos».
 */
const MAPA_DPTOS = [
  ['AGRAR', 'ACT Agrarias'], ['ADMIN', 'Administración'], ['BRITISH', 'Proyectos'], ['ERASMUS', 'Proyectos'],
  ['CIENCIAS NAT', 'Ciencias Naturales/Biología'], ['BIOLOG', 'Ciencias Naturales/Biología'],
  ['COMERC', 'Comercio'], ['DIBUJO', 'Dibujo/Plástica'], ['PLASTIC', 'Dibujo/Plástica'],
  ['EDUCACION FIS', 'Educación Física'], ['FRANC', 'Francés'], ['FISICA Y Q', 'Física y Química'],
  ['GEOGRAF', 'Geografía e Historia'], ['HOSTEL', 'Hostelería'], ['COCIN', 'Hostelería'],
  ['INDUSTR', 'Industrias Alimentarias'], ['ALIMENT', 'Industrias Alimentarias'], ['INFORM', 'Informática'],
  ['INGL', 'Inglés'], ['LENGUA', 'Lengua y Literatura'], ['VEHIC', 'TMV'], ['CARROC', 'TMV'], ['TMV', 'TMV'],
  ['AUTOMOC', 'TMV'], ['MUSIC', 'Música'], ['ORIENT', 'Orientación'], ['MATEMAT', 'Matemáticas'],
  ['FILOSOF', 'Filosofía'], ['TECNOLOG', 'Tecnología'], ['CLASIC', 'Clásicas'], ['LATIN', 'Clásicas'],
  ['RELIGI', 'Religión'], ['ELECTR', 'E.E.'], ['FOL', 'FOL'], ['FORMACION Y ORIENT', 'FOL'],
];

export function normDepartamentoPGA(d) {
  const n = sinTildes(d).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (n === 'ACTIVIDADES') return 'Proyectos';
  for (const [clave, nombre] of MAPA_DPTOS) if (n.includes(clave)) return nombre;
  return d.trim();
}

/** Arregla las comillas tipográficas que llegan como «?» y los espacios sobrantes. */
export function limpiarTexto(s) {
  return (s || '')
    .replace(/\?([^?\n]{2,80}?)\?/g, '«$1»')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s\-]+|[\s\-]+$/g, '');
}

function capitaliza(s) {
  s = s.trim();
  const letras = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  // TODO EN MAYÚSCULAS → frase normal
  if (letras && letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length > letras.length * 0.7) s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Título corto para el desplegable: la primera frase, como mucho 100 caracteres. */
export function tituloCorto(desc) {
  let p = (desc || '').split('\n')[0];
  // Corta en el primer punto que cierra frase, saltando abreviaturas (Ayto., Dpto., Sta.…)
  const re = /([\p{L}\d)»]+)\.(\s|[A-ZÁÉÍÓÚ]|$)/gu;
  let m;
  while ((m = re.exec(p))) {
    if (m.index + m[1].length < 12) continue;
    if (/^(ayto|avda|dpto|dptos|sta|sto|sr|sra|dña|dr|etc|pág|nº)$/i.test(m[1])) continue;
    p = p.slice(0, m.index + m[1].length);
    break;
  }
  p = p.replace(/[\s.:]+$/, '');
  if (p.length > 100) p = p.slice(0, 98).replace(/\s+\S*$/, '') + '…';
  return capitaliza(p);
}

const LOCALIDADES = { 'sin determinar': 'Por determinar', 'por determinar': 'Por determinar' };

export function limpiarLocalidad(l) {
  l = (l || '').trim().replace(/\.$/, '');
  if (LOCALIDADES[l.toLowerCase()]) return LOCALIDADES[l.toLowerCase()];
  if (l && l === l.toUpperCase()) {
    l = l.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
      .replace(/ (De|Del|La|El|Y) /g, m => m.toLowerCase());
  }
  return l;
}

/**
 * Convierte el CSV en la lista de actividades de la PGA.
 * Cabeceras admitidas: ACTIVIDAD / VISITA / «Breve descripción de la actividad»,
 * LOCALIDAD / LUGAR / «Localidad de realización», DEPARTAMENTO / DPTO.
 * Devuelve { filas } o { error }.
 */
export function leerPGA(buffer, curso) {
  const tabla = parsearCSV(decodificarCSV(buffer));
  if (tabla.length < 2) return { error: 'El archivo no tiene filas de datos.' };

  const cab = tabla[0].map(c => sinTildes(c).toUpperCase().replace(/\s+/g, ' ').trim());
  const busca = (...claves) => cab.findIndex(c => claves.some(k => c.startsWith(k) || c.includes(k)));
  const iAct = busca('ACTIVIDAD', 'VISITA', 'BREVE DESCRIPCION', 'DESCRIPCION');
  const iLoc = busca('LOCALIDAD', 'LUGAR');
  const iDep = busca('DEPARTAMENTO', 'DPTO');
  if (iAct === -1) return { error: 'Falta la columna de la actividad (ACTIVIDAD o «Breve descripción de la actividad») en la primera fila.' };

  const vistas = new Set();
  const filas = [];
  for (const cols of tabla.slice(1)) {
    const desc = limpiarTexto(cols[iAct]);
    if (!desc) continue;
    const actividad = tituloCorto(desc);
    const localidad = iLoc !== -1 ? limpiarLocalidad(cols[iLoc]) : '';
    const departamento = iDep !== -1 ? normDepartamentoPGA(cols[iDep] || '') : null;
    const clave = `${departamento}|${desc}|${localidad}`.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const igual = desc.replace(/[\s.]+$/, '').toLowerCase() === actividad.replace(/[\s.…]+$/, '').toLowerCase();
    filas.push({
      actividad, localidad, departamento,
      descripcion: igual ? null : desc,
      curso_academico: curso,
    });
  }
  if (filas.length === 0) return { error: 'No se ha encontrado ninguna actividad en el archivo.' };
  return { filas };
}
