/**
 * PRUEBAS DE LA REGLA DE SECTOR
 *
 * Una sola cosa se comprueba aquí, desde varios ángulos: mientras quede
 * una persona libre de guardia en el departamento del ausente, NO puede
 * entrar nadie de fuera. Ni aunque falten varios el mismo día, ni aunque
 * el que está libre haya faltado a primera hora, ni aunque las ausencias
 * se registren en distinto orden.
 *
 * Se ejecuta con:  node lib/asignacionGuardias.test.mjs
 */

import {
  asignacionesDeHora, prepararHuecos, construirCuadrante, nombreDe,
} from './asignacionGuardias.js';

let fallos = 0;
function comprobar(titulo, condicion, detalle = '') {
  if (condicion) {
    console.log(`  ok   ${titulo}`);
  } else {
    fallos++;
    console.log(`  FALLA ${titulo}${detalle ? '\n         ' + detalle : ''}`);
  }
}

// ── Gente de mentira, con los departamentos reales del centro ──
const P = [
  { id: 'g1', apellidos: 'Cornejo',  nombre: 'Antonia', departamento: 'Geografía e Historia' },
  { id: 'g2', apellidos: 'Rivas',    nombre: 'Ángel',   departamento: 'Matemáticas' },
  { id: 'g3', apellidos: 'Sandor',   nombre: 'Edith',   departamento: 'Inglés' },
  { id: 'a1', apellidos: 'Martinez', nombre: 'Isabel',  departamento: 'Lengua y Literatura' },
  { id: 'a2', apellidos: 'Nunez',    nombre: 'Marta',   departamento: 'Inglés' },
  { id: 'a3', apellidos: 'Lopez',    nombre: 'Jesica',  departamento: 'Matemáticas' },
  { id: 'f1', apellidos: 'DelCampo', nombre: 'Priscila', departamento: 'Industrias Alimentarias' },
  { id: 'f2', apellidos: 'Uceda',    nombre: 'Isabel',   departamento: 'Administración' },
  { id: 't1', apellidos: 'Moreno',   nombre: 'Jose',     departamento: 'TMV' },
  { id: 't2', apellidos: 'Vergara',  nombre: 'Christian', departamento: 'TMV' },
  { id: 't3', apellidos: 'Sanchez',  nombre: 'Javier',   departamento: 'TMV' },
];
const busca = id => P.find(p => p.id === id);

// Cuadrante: quién está de guardia, en qué departamento y a qué hora.
function cuadranteCon(lista, hora = '4') {
  const horarios = lista.map(({ id, sector }) => ({
    profesor_nombre_pdf: `${busca(id).apellidos}, ${busca(id).nombre}`,
    tipo: 'guardia', dia: 'lunes', hora_id: hora, grupo: sector, aula: '',
  }));
  return construirCuadrante(horarios, P).porSector;
}

function repartir({ guardias, ausencias, hora = '4' }) {
  const faltas = ausencias.map((a, i) => ({
    id: 'x' + i, profesor_id: a.id, origen: 'ausencia',
    // horas: [] = baja o ausencia del día entero, sin horas declaradas.
    horas: (a.horas || []).map(h =>
      typeof h === 'string' ? { hora: h } : { hora: h.hora, tipo: h.tipo }),
  }));
  const huecos = prepararHuecos(faltas, P);
  return asignacionesDeHora({
    hora, dia: 'lunes', huecos,
    cuadrante: cuadranteCon(guardias, hora),
    horarios: [], profesores: P,
  });
}

const deFuera = salida => salida.filter(s =>
  s.cubre && s.cubre.sector !== s.hueco.sector);

console.log('\nREGLA DE SECTOR\n');

// ── 1. El caso del 16/09 a 4ª ──────────────────────────────────────
// Tres ausencias de GENERAL. Dos generales de guardia, uno de ellos
// (Rivas) faltó a 1ª y 2ª pero está en el centro a 4ª. Dos de FP libres.
// Lo correcto: los dos generales cubren dos, y solo el tercero sale fuera.
{
  const salida = repartir({
    guardias: [
      { id: 'g1', sector: 'GENERAL' },
      { id: 'g2', sector: 'GENERAL' },
      { id: 'f1', sector: 'INDUSTRIAS ALIMENTARIAS' },
      { id: 'f2', sector: 'ADMINISTRACIÓN' },
    ],
    ausencias: [
      { id: 'a1', horas: ['4'] },
      { id: 'a2', horas: ['4'] },
      { id: 'a3', horas: ['4'] },
      { id: 'g2', horas: ['1', '2'] },   // Rivas falta a 1ª y 2ª, no a 4ª
    ],
  });
  const usados = salida.filter(s => s.cubre).map(s => s.cubre.profesorId);
  comprobar('los dos generales de guardia se usan antes que nadie de FP',
    usados.includes('g1') && usados.includes('g2'),
    'usados: ' + usados.join(', '));
  comprobar('solo UNA ausencia se cubre desde fuera',
    deFuera(salida).length === 1,
    deFuera(salida).map(s => `${s.hueco.profesor} ← ${s.cubre.nombre}`).join(' | '));
  comprobar('quien faltó a 1ª sigue siendo candidato a 4ª',
    usados.includes('g2'));
}

// ── 2. Nadie sale fuera si el departamento se basta ────────────────
{
  const salida = repartir({
    guardias: [
      { id: 't1', sector: 'TMV' },
      { id: 't2', sector: 'TMV' },
      { id: 'g1', sector: 'GENERAL' },
    ],
    ausencias: [{ id: 't3', horas: ['4'] }],
  });
  comprobar('falta un TMV y lo cubre TMV, no el general libre',
    salida[0]?.cubre?.profesorId === 't1' || salida[0]?.cubre?.profesorId === 't2',
    'lo cubre: ' + (salida[0]?.cubre?.nombre || 'nadie'));
  comprobar('ninguna cubierta desde fuera', deFuera(salida).length === 0);
}

// ── 3. El TMV no sale fuera mientras TMV lo necesite ───────────────
// Dos guardias de TMV, una ausencia de TMV y una de Informática.
// TMV cubre primero lo suyo; el que sobra sale fuera.
{
  const salida = repartir({
    guardias: [
      { id: 't1', sector: 'TMV' },
      { id: 't2', sector: 'TMV' },
    ],
    ausencias: [
      { id: 't3', horas: ['4'] },        // TMV
      { id: 'f1', horas: ['4'] },        // Industrias Alimentarias
    ],
  });
  const tmv = salida.find(s => s.hueco.sector === 'TMV');
  comprobar('la ausencia de TMV la cubre un TMV',
    tmv?.cubre && tmv.cubre.sector === 'TMV',
    'lo cubre: ' + (tmv?.cubre?.nombre || 'nadie'));
}

// ── 4. El orden de registro no cambia el resultado ─────────────────
{
  const base = [
    { id: 't1', sector: 'TMV' },
    { id: 't2', sector: 'TMV' },
    { id: 'g1', sector: 'GENERAL' },
  ];
  const conOrden = orden => repartir({ guardias: base, ausencias: orden })
    .map(s => `${s.hueco.profesorId}:${s.cubre?.profesorId || '-'}`)
    .sort().join(' ');
  const a = conOrden([{ id: 't3', horas: ['4'] }, { id: 'a1', horas: ['4'] }]);
  const b = conOrden([{ id: 'a1', horas: ['4'] }, { id: 't3', horas: ['4'] }]);
  comprobar('mismo resultado se registre antes una ausencia o la otra',
    a === b, `${a}\n         ${b}`);
}

// ── 5. Quien está de baja no cubre a nadie, a ninguna hora ─────────
// Es el caso de Maribel: de baja todo el día y con guardia en el
// cuadrante a 4ª. Esa hora no genera hueco (las guardias no se
// sustituyen), pero ella tampoco puede cubrir nada.
{
  const salida = repartir({
    guardias: [
      { id: 'a1', sector: 'GENERAL' },   // de baja, pero en el cuadrante
      { id: 'g1', sector: 'GENERAL' },
      { id: 'f1', sector: 'INDUSTRIAS ALIMENTARIAS' },
    ],
    ausencias: [
      { id: 'a1', horas: [] },           // baja: día entero, sin horas
      { id: 'a2', horas: ['4'] },
    ],
  });
  const usados = salida.filter(s => s.cubre).map(s => s.cubre.profesorId);
  comprobar('quien está de baja no se usa para cubrir',
    !usados.includes('a1'), 'usados: ' + usados.join(', '));
  comprobar('la ausencia la cubre el general que sí está',
    usados.includes('g1'), 'usados: ' + usados.join(', '));
}

// ── 6. Si falta a una hora de guardia, tampoco cubre esa hora ──────
{
  const salida = repartir({
    guardias: [
      { id: 'g1', sector: 'GENERAL' },
      { id: 'g2', sector: 'GENERAL' },
      { id: 'f1', sector: 'INDUSTRIAS ALIMENTARIAS' },
    ],
    ausencias: [
      { id: 'g1', horas: [{ hora: '4', tipo: 'guardia' }] },  // falta justo en su guardia
      { id: 'a1', horas: ['4'] },
    ],
  });
  const usados = salida.filter(s => s.cubre).map(s => s.cubre.profesorId);
  comprobar('el que falta en su hora de guardia no cubre esa hora',
    !usados.includes('g1'), 'usados: ' + usados.join(', '));
  comprobar('su hora de guardia no genera hueco que cubrir',
    salida.filter(s => s.hueco.profesorId === 'g1').length === 0);
}

// ── 7. Sin nadie libre, hueco en rojo. Nunca inventado ─────────────
{
  const salida = repartir({
    guardias: [{ id: 't1', sector: 'TMV' }],
    ausencias: [{ id: 't3', horas: ['4'] }, { id: 'a1', horas: ['4'] }],
  });
  const sinCubrir = salida.filter(s => !s.cubre);
  comprobar('lo que no se puede cubrir queda visible, no oculto',
    sinCubrir.length === 1);
}

console.log(fallos === 0
  ? '\nTodo correcto.\n'
  : `\n${fallos} comprobación(es) fallan.\n`);
process.exit(fallos === 0 ? 0 : 1);
