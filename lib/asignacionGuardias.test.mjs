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
  pesoFranja, claveFranja,
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
  { id: 'e1', apellidos: 'Ohm',      nombre: 'Jorge',    departamento: 'EE' },
  { id: 'e2', apellidos: 'Volta',    nombre: 'Ana',      departamento: 'E.E.' },
];
const busca = id => P.find(p => p.id === id);

// Cuadrante: quién está de guardia, en qué departamento y a qué hora.
// `otras`: guardias de la misma gente en otras franjas de la semana,
// para que cada uno tenga sus guardias semanales reales.
function cuadranteCon(lista, hora = '4', otras = []) {
  const fila = ({ id, sector, dia = 'lunes', hora: hh = hora }) => ({
    profesor_nombre_pdf: `${busca(id).apellidos}, ${busca(id).nombre}`,
    tipo: 'guardia', dia, hora_id: hh, grupo: sector, aula: '',
  });
  const horarios = [...lista.map(g => fila({ ...g, hora })), ...otras.map(fila)];
  return construirCuadrante(horarios, P).porSector;
}

function repartir({ guardias, ausencias, hora = '4', otras = [], fichadas = {}, porFranja = null, peso = 0 }) {
  const faltas = ausencias.map((a, i) => ({
    id: 'x' + i, profesor_id: a.id, origen: 'ausencia',
    // horas: [] = baja o ausencia del día entero, sin horas declaradas.
    horas: (a.horas || []).map(h =>
      typeof h === 'string' ? { hora: h } : { hora: h.hora, tipo: h.tipo }),
  }));
  const huecos = prepararHuecos(faltas, P);
  return asignacionesDeHora({
    hora, dia: 'lunes', huecos,
    cuadrante: cuadranteCon(guardias, hora, otras),
    horarios: [], profesores: P,
    apoyosPorProfesor: fichadas,
    apoyosPorFranja: porFranja, peso,
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

// ── 8. Falta alguien de FP a 6ª: los alumnos se van, no se cubre ───
{
  const salida = repartir({
    hora: '6',
    guardias: [{ id: 'g2', sector: 'GENERAL' }, { id: 'a3', sector: 'GENERAL' }],
    ausencias: [{ id: 't3', horas: ['6ª hora'] }, { id: 'a1', horas: ['6ª hora'] }],
  });
  comprobar('a 6ª la falta de FP no genera guardia',
    salida.filter(s => s.hueco.profesorId === 't3').length === 0);
  comprobar('a 6ª la falta de GENERAL se cubre con GENERAL',
    salida.filter(s => s.hueco.profesorId === 'a1' && s.cubre).length === 1);
}

// ── 9. La misma falta de FP a 5ª sí se cubre ──────────────────────
{
  const salida = repartir({
    hora: '5',
    guardias: [{ id: 't1', sector: 'TMV' }],
    ausencias: [{ id: 't3', horas: ['5'] }],
  });
  comprobar('a 5ª la falta de FP sí se cubre',
    salida.filter(s => s.hueco.profesorId === 't3' && s.cubre).length === 1);
}

// ── 10. Se agota un sector de FP: apoya OTRA FAMILIA, no GENERAL ───
// Corrección de José María (27/09/2026). Falta un TMV, no hay TMV de
// guardia; libres: un general y una de Administración. Entra Administración.
{
  const salida = repartir({
    guardias: [{ id: 'g1', sector: 'GENERAL' }, { id: 'f2', sector: 'ADMINISTRACION' }],
    ausencias: [{ id: 't3', horas: ['4'] }],
  });
  const s = salida.find(x => x.hueco.profesorId === 't3');
  comprobar('falta un TMV sin TMV libres: le apoya otra familia de FP, no GENERAL',
    s?.cubre?.profesorId === 'f2', `cubre: ${s?.cubre?.profesorId}`);
}

// ── 11. Ninguna familia de FP libre: GENERAL como último recurso ──
{
  const salida = repartir({
    guardias: [{ id: 'g1', sector: 'GENERAL' }],
    ausencias: [{ id: 't3', horas: ['4'] }],
  });
  const s = salida.find(x => x.hueco.profesorId === 't3');
  comprobar('sin nadie de FP libre, GENERAL entra solo como último recurso',
    s?.cubre?.profesorId === 'g1' && s?.escalon === 2, `cubre: ${s?.cubre?.profesorId}, escalón ${s?.escalon}`);
}

// ── 12. Se agota GENERAL: le sigue apoyando FP (no cambia) ─────────
{
  const salida = repartir({
    guardias: [{ id: 'f2', sector: 'ADMINISTRACION' }],
    ausencias: [{ id: 'a1', horas: ['4'] }],
  });
  const s = salida.find(x => x.hueco.profesorId === 'a1');
  comprobar('falta un GENERAL sin generales libres: le apoya FP',
    s?.cubre?.profesorId === 'f2', `cubre: ${s?.cubre?.profesorId}`);
}

// ── 13. Una plaza vacante del cuadrante («Int1 Hos») no cubre guardias ─
{
  const { construirCuadrante } = await import('./asignacionGuardias.js');
  const { porSector, vacantes } = construirCuadrante(
    [{ profesor_nombre_pdf: 'Int1 Hos', dia: 'lunes', hora_id: '4a', tipo: 'guardia', grupo: 'HOSTELERIA' }], [], []);
  comprobar('la plaza vacante no entra como candidato a guardias',
    !(porSector.HOSTELERIA?.lunes?.['4'] || []).length && vacantes.includes('Int1 Hos'));
}

// ── 14. Las horas de tarde no se confunden con horas de la mañana ─
{
  const { horaCoincide } = await import('./asignacionGuardias.js');
  const { HORAS_EXTRA } = await import('./horasExtra.js');
  const mal = HORAS_EXTRA.filter(x => ['1','2','3','4','5','6','recreo'].some(h => horaCoincide(x.label, h) || horaCoincide(x.id, h)));
  comprobar('ninguna hora de 7ª o de tarde se lee como una hora de mañana', mal.length === 0, mal.map(x => x.label).join(', '));
}

// ── 15. Falta solo por la tarde: no es día completo, nada que cubrir ──
{
  const { prepararHuecos } = await import('./asignacionGuardias.js');
  const [h] = prepararHuecos(
    [{ id: 'x', profesor_id: 'p1', origen: 'ausencia', horas: [{ hora: 'Tarde 16:00', tipo: 'clase', grupo: 'GS-1TLO' }] }],
    [{ id: 'p1', nombre: 'Ana', apellidos: 'Tarde Prueba', departamento: 'Comercio' }],
    { horarios: [{ profesor_nombre_pdf: 'Tarde Prueba, Ana', dia: 'lunes', hora_id: '1a', tipo: 'clase', grupo: 'ESO-1A' }], dia: 'lunes' });
  comprobar('quien falta solo por la tarde no genera guardias de mañana', !h.diaCompleto && h.horas.length === 0,
    `díaCompleto=${h.diaCompleto} huecos=${h.horas.map(x => x.hora)}`);
}

// ── 14. Una FICHA de plaza vacante tampoco cubre guardias ─────────
{
  const { construirCuadrante } = await import('./asignacionGuardias.js');
  const prof = [{ id: 'v1', nombre: 'Int1 Hos', apellidos: 'Plaza vacante', departamento: 'Hostelería' }];
  const { porSector } = construirCuadrante(
    [{ profesor_nombre_pdf: 'Int1 Hos', dia: 'lunes', hora_id: '4a', tipo: 'guardia', grupo: 'HOSTELERIA' }], prof,
    [{ nombre_horario: 'Int1 Hos', profesor_id: 'v1' }]);
  comprobar('la ficha de plaza vacante no entra como candidata a guardias', !(porSector.HOSTELERIA?.lunes?.['4'] || []).length);
}

// ── 16. 6ª hora: manda el GRUPO, no el departamento de quien falta ─
{
  const { prepararHuecos } = await import('./asignacionGuardias.js');
  const profes = [
    { id: 'g1', nombre: 'Eva', apellidos: 'Ingles Prueba', departamento: 'Inglés' },
    { id: 'f1', nombre: 'Luis', apellidos: 'Carro Prueba', departamento: 'TMV' },
  ];
  const falta = (id, grupo) => ({ id: 'x' + id, profesor_id: id, origen: 'ausencia',
    horas: [{ hora: '5', tipo: 'clase', grupo }, { hora: '6', tipo: 'clase', grupo }] });
  const horasDe = (id, grupo) => prepararHuecos([falta(id, grupo)], profes)[0].horas.map(x => x.hora);

  comprobar('GENERAL con un ciclo a 6ª: no se cubre la 6ª, sí la 5ª',
    JSON.stringify(horasDe('g1', 'GS-1TLO')) === '["5"]', horasDe('g1', 'GS-1TLO'));
  comprobar('FP con un ciclo a 6ª: no se cubre la 6ª',
    JSON.stringify(horasDe('f1', 'GM-2CAR')) === '["5"]', horasDe('f1', 'GM-2CAR'));
  comprobar('Grado Básico a 6ª: SÍ se cubre',
    JSON.stringify(horasDe('g1', 'GB-1MV')) === '["5","6"]', horasDe('g1', 'GB-1MV'));
  comprobar('GBE de Agraria a 6ª: SÍ se cubre, aunque falte uno de FP',
    JSON.stringify(horasDe('f1', 'GBE-1AGR')) === '["5","6"]', horasDe('f1', 'GBE-1AGR'));
  comprobar('FP con un grupo de ESO a 6ª: SÍ se cubre',
    JSON.stringify(horasDe('f1', 'ESO-4A')) === '["5","6"]', horasDe('f1', 'ESO-4A'));
  comprobar('GENERAL con Bachillerato a 6ª: SÍ se cubre',
    JSON.stringify(horasDe('g1', 'BTO-1B')) === '["5","6"]', horasDe('g1', 'BTO-1B'));

  // Baja sin horas: el grupo de 6ª sale del horario
  const horarios = [
    { profesor_nombre_pdf: 'Ingles Prueba, Eva', dia: 'lunes', hora_id: '5a', tipo: 'clase', grupo: 'ESO-2A' },
    { profesor_nombre_pdf: 'Ingles Prueba, Eva', dia: 'lunes', hora_id: '6a', tipo: 'clase', grupo: 'GS-2TLO' },
  ];
  const [b] = prepararHuecos([{ id: 'b', profesor_id: 'g1', origen: 'baja', horas: [] }], profes,
    { horarios, dia: 'lunes' });
  comprobar('baja de GENERAL con un ciclo a 6ª: solo se cubre la 5ª',
    JSON.stringify(b.horas.map(x => x.hora)) === '["5"]', b.horas.map(x => x.hora));
}

// ── 17. Grupos tal como vienen del horario real ───────────────────
{
  const { esGrupoCiclo } = await import('./grupos.js');
  const casos = [
    ['LMSG-3092638GS-1ASIR(1 A009 INF)', true],
    ['CAMP-3095597GS-1DDC(7 G101)', true],
    ['CAII-3101817GB-2CR(5 E008 AUL)CAII-3101177GB-2EE', false],
    ['GM-2CAR', true], ['2GM', true], ['GB-1MV', false], ['GBE-1AGR', false],
    ['XXX-3100000GBE-1AGR(3 C001)', false], ['GM-1CAR / GB-1MV', false],
    ['ESO-4A', false], ['4ESO-C', false], ['BTO-1B', false],
    ['MAT-3090001ESO-2A(2 B104)', false],
    ['CAII-3101817GB-2CR(5 E008)MAT-3090001ESO-2A', false],
    ['', null],
  ];
  const mal = casos.filter(([g, esperado]) => esGrupoCiclo(g) !== esperado);
  comprobar('se reconocen GM/GS (y no Básico) con el formato real del horario', mal.length === 0,
    mal.map(([g]) => g).join(' | '));
}

// ── 18. Complementarias: sin aula entre paréntesis no hay alumnos ──
{
  const { esHoraSinAlumnos } = await import('./asignacionGuardias.js');
  const casos = [
    [{ grupo: 'SISI-3094386GS-1DAM(1 A007 INF)' }, false],
    [{ grupo: 'OBPM-2934725FPPE-2JAR(7 G002 JAR)' }, false],
    [{ grupo: 'ING-3058100ESO-2A(1 A111)ESO-2BESO-2C' }, false],
    [{ grupo: '1º ESO A' }, false],          // DLD escrito a mano
    [{ grupo: '' }, false],                  // no se sabe: se cubre
    [{ grupo: 'EAPP' }, true], [{ grupo: 'OTRA' }, true],
    [{ grupo: 'LCEPE' }, true], [{ grupo: 'T' }, true],
    [{ materia: 'REUNIÓN Tutores BTO' }, true],
    [{ grupo: 'CSIG' }, true],               // código nuevo, no está en la lista
  ];
  const mal = casos.filter(([h, esperado]) => esHoraSinAlumnos(h) !== esperado);
  comprobar('solo generan guardia las horas con aula o grupo de alumnos', mal.length === 0,
    mal.map(([h]) => JSON.stringify(h)).join(' | '));
}

// ── 19. El de Inglés, a Inglés (queja de GENERAL, 15/10/2026) ──────
// Faltan uno de Matemáticas y uno de Inglés. De guardia, uno de Inglés y
// uno de Historia. Aunque la de Matemáticas se atienda primero, el de
// Inglés tiene que ir a Inglés; a Matemáticas le toca el de Historia.
{
  for (const orden of [['a3', 'a2'], ['a2', 'a3']]) {
    const salida = repartir({
      guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g1', sector: 'GENERAL' }],
      ausencias: orden.map(id => ({ id, horas: ['4'] })),
    });
    const quien = id => salida.find(s => s.hueco.profesorId === id)?.cubre?.profesorId;
    comprobar(`Inglés cubre a Inglés aunque falte también Matemáticas (orden ${orden.join(',')})`,
      quien('a2') === 'g3' && quien('a3') === 'g1',
      `Inglés←${quien('a2')} · Matemáticas←${quien('a3')}`);
  }
}

// ── 20. Cada uno a lo suyo cuando hay de los dos ─────────────────────
{
  const salida = repartir({
    guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g2', sector: 'GENERAL' }],
    ausencias: [{ id: 'a3', horas: ['4'] }, { id: 'a2', horas: ['4'] }],
  });
  const quien = id => salida.find(s => s.hueco.profesorId === id)?.cubre?.profesorId;
  comprobar('Matemáticas cubre a Matemáticas e Inglés a Inglés',
    quien('a3') === 'g2' && quien('a2') === 'g3', `Mat←${quien('a3')} · Ing←${quien('a2')}`);
}

// ── 21. Sin nadie de su departamento, rotación del sector ────────────
{
  const salida = repartir({
    guardias: [{ id: 'g1', sector: 'GENERAL' }, { id: 't1', sector: 'TMV' }],
    ausencias: [{ id: 'a1', horas: ['4'] }],
  });
  comprobar('sin nadie de su departamento, cubre otro de su sector antes que FP',
    salida[0]?.cubre?.profesorId === 'g1', JSON.stringify(salida[0]?.cubre));
}

// ── 22. #219: quien tiene 1 guardia semanal no cubre todas las semanas ──
// Martes a 4ª: g3 (Inglés) tiene 1 guardia a la semana y 6 fichadas; g1 y
// g2 tienen 3 a la semana y 6 fichadas. Falta uno de Inglés. Antes iba
// siempre g3 por ser de Inglés; ahora va quien menos carga lleva.
const tresMas = ids => ids.flatMap(id => [
  { id, sector: 'GENERAL', dia: 'martes', hora: '1' },
  { id, sector: 'GENERAL', dia: 'jueves', hora: '2' },
]);
{
  const salida = repartir({
    guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g1', sector: 'GENERAL' }, { id: 'g2', sector: 'GENERAL' }],
    otras: tresMas(['g1', 'g2']),
    fichadas: { g3: 6, g1: 6, g2: 6 },
    ausencias: [{ id: 'a2', horas: ['4'] }],
  });
  const c = salida[0]?.cubre?.profesorId;
  comprobar('con UNA ausencia manda la rotación, no el departamento (#219)',
    c === 'g1' || c === 'g2', 'lo cubre: ' + c);
}

// ── 23. Se cuenta en proporción, no el total ──────────────────────────
// g1: 6 fichadas con 3 guardias semanales (2 por guardia).
// g3: 4 fichadas con 1 guardia semanal (4 por guardia). Va g1.
{
  const salida = repartir({
    guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g1', sector: 'GENERAL' }],
    otras: tresMas(['g1']),
    fichadas: { g3: 4, g1: 6 },
    ausencias: [{ id: 'a1', horas: ['4'] }],
  });
  comprobar('la carga se mide por guardia semanal, no en total',
    salida[0]?.cubre?.profesorId === 'g1', 'lo cubre: ' + salida[0]?.cubre?.profesorId);
}

// ── 24. Varias ausencias: la rotación elige, la afinidad coloca ───────
// Faltan Inglés y Matemáticas. Por carga salen g2 (Matemáticas) y g1
// (Historia); g3 (Inglés) es quien más carga lleva y se queda.
{
  const salida = repartir({
    guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g2', sector: 'GENERAL' }, { id: 'g1', sector: 'GENERAL' }],
    otras: tresMas(['g1', 'g2']),
    fichadas: { g3: 6, g2: 6, g1: 9 },
    ausencias: [{ id: 'a2', horas: ['4'] }, { id: 'a3', horas: ['4'] }],
  });
  const quien = id => salida.find(s => s.hueco.profesorId === id)?.cubre?.profesorId;
  comprobar('salen los dos con menos carga y Matemáticas va a Matemáticas',
    quien('a3') === 'g2' && quien('a2') === 'g1',
    `Mat←${quien('a3')} · Ing←${quien('a2')}`);
}

// ── 25. Si el afín está entre los que salen, va a su grupo ────────────
{
  const salida = repartir({
    guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g1', sector: 'GENERAL' }, { id: 'g2', sector: 'GENERAL' }],
    otras: tresMas(['g1', 'g2', 'g3']),
    fichadas: { g3: 1, g1: 1, g2: 9 },
    ausencias: [{ id: 'a3', horas: ['4'] }, { id: 'a2', horas: ['4'] }],
  });
  const quien = id => salida.find(s => s.hueco.profesorId === id)?.cubre?.profesorId;
  comprobar('entre los que salen, el de Inglés va a Inglés',
    quien('a2') === 'g3' && quien('a3') === 'g1',
    `Ing←${quien('a2')} · Mat←${quien('a3')}`);
}

// ── 26-29. Rotación por franja (22/10/2026) ───────────────────────────
// Lunes a 4ª: g1 (3 guardias a la semana) ha salido 1 vez en esta franja
// pero 12 en total (media 4). g3 (1 a la semana) ha salido 3 veces aquí
// (media 3). Por la media iría g3; por la franja, g1.
console.log('\nROTACIÓN POR FRANJA\n');
{
  const base = {
    guardias: [{ id: 'g3', sector: 'GENERAL' }, { id: 'g1', sector: 'GENERAL' }],
    otras: tresMas(['g1']),
    fichadas: { g1: 12, g3: 3 },
    ausencias: [{ id: 'a1', horas: ['4'] }],
  };
  const franja = (g1, g3) => ({
    [claveFranja('g1', 'lunes', '4')]: g1,
    [claveFranja('g3', 'lunes', '4')]: g3,
  });
  const quien = s => s[0]?.cubre?.profesorId;

  comprobar('franja pura: sale quien menos ha salido en ESTA franja (caso Ana y Pedro)',
    quien(repartir({ ...base, porFranja: franja(1, 3), peso: 1 })) === 'g1');

  comprobar('sin contadores por franja, todo sigue como antes (media)',
    quien(repartir({ ...base })) === 'g3');

  comprobar('al principio de la transición (10 %) aún pesa la media',
    quien(repartir({ ...base, porFranja: franja(1, 3), peso: 0.1 })) === 'g3');

  comprobar('una franja ya igualada (diferencia ≤ 1) pasa a franja pura sin esperar',
    quien(repartir({ ...base, porFranja: franja(2, 3), peso: 0.1 })) === 'g1');
}
{
  const p = f => pesoFranja(f);
  comprobar('calendario: 0 antes del 26/10, 10 % → 90 % hasta Navidad, 100 % el 11/01',
    p('2026-10-23') === 0 && p('2026-10-26') === 0.1 && p('2026-10-30') === 0.1
    && p('2026-11-02') === 0.2 && p('2026-12-22') === 0.9 && p('2027-01-11') === 1,
    [p('2026-10-23'), p('2026-10-26'), p('2026-11-02'), p('2026-12-22'), p('2027-01-11')].join(' · '));
}

console.log('\nNOMBRE DE ELECTRICIDAD Y ELECTRÓNICA\n');

// ── El cuadrante dice «E. E.», la ficha «EE» o «E.E.» ──────────────
// Es el mismo departamento: su ausencia la cubre el de E.E. de guardia,
// no uno de TMV ni de GENERAL.
{
  const salida = repartir({
    guardias: [
      { id: 't1', sector: 'TMV' },
      { id: 'g1', sector: 'GENERAL' },
      { id: 'e2', sector: 'E. E.' },
    ],
    ausencias: [{ id: 'e1', horas: ['4'] }],
  });
  const c = salida.find(s => s.cubre)?.cubre;
  comprobar('la guardia de «E. E.» cubre al ausente de EE',
    c?.profesorId === 'e2', c ? `cubre ${c.nombre} (${c.sector})` : 'nadie');
  comprobar('el sector sale como «E.E.»', salida[0]?.hueco?.sector === 'E.E.',
    String(salida[0]?.hueco?.sector));
}

console.log(fallos === 0
  ? '\nTodo correcto.\n'
  : `\n${fallos} comprobación(es) fallan.\n`);
process.exit(fallos === 0 ? 0 : 1);
