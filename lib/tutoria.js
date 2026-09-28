/**
 * ¿DE QUÉ GRUPO ES TUTOR/A? — propuesta para vincular la tutoría
 *
 * Muchos tutores escribieron su tutoría a mano («2°B», «4ESO», «2SMR-A») y
 * no coincide con ningún grupo del alumnado: no ven a sus alumnos para
 * marcar autorizaciones y seguro escolar. Aquí se propone el grupo:
 *
 *   1. Su horario de Peñalara marca las horas de tutoría: «Es de tutoría
 *      ESO-2B(1 A111)». Si está, ese es su grupo.
 *   2. Si no, los grupos a los que da clase, cruzados con lo que escribió:
 *      mismo curso (número) y las letras que puso («SMR», «B», «JAR»...).
 *      Solo se propone si encaja UNO.
 *
 * Nunca se vincula solo: se propone y el tutor confirma con un toque.
 */
import { claveGrupo, mismoGrupo } from '@/lib/grupos';

const COD = /(ESO|BTO|GB|GM|GS|FPPE)-\d+[A-ZÑ0-9.]*?(?=(?:ESO|BTO|GB|GM|GS|FPPE)-|[^A-ZÑ0-9.]|$)/g;
const codigos = t => [...String(t || '').toUpperCase().matchAll(COD)].map(m => m[0]);

// Palabras que la gente escribe y no identifican el grupo
const RUIDO = /\b(BACHILLERATO|BACH|ESO|GRADO|BASICO|BÁSICO|CFGM|CFGS|CICLO|GRUPO|BILINGUE|BILINGÜE|FP|P\.?E\.?F\.?P|PE|DE|DEL|CURSO|CIENCIAS|HUMANIDADES|HUMA|JARDINERA|JARDINERIA|CI)\b/g;

function pistasDe(texto) {
  const t = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const numero = (t.match(/\d/) || [])[0] || null;
  const bach = /BACH/.test(t), eso = /ESO/.test(t), basico = /BASICO|GB\b/.test(t);
  const letras = t.replace(/[º°ª.\-]/g, ' ').replace(RUIDO, ' ').replace(/\d/g, ' ')
    .split(/\s+/).filter(w => /^[A-Z]{1,6}$/.test(w));
  // «CIENCIAS» → CT, «HUMA» → HCS, «JARDINERA» → JAR
  const extra = [];
  if (/CIENCIAS|\bCI\b/.test(t)) extra.push('CT');
  if (/HUMA/.test(t)) extra.push('HCS');
  if (/JARDIN/.test(t)) extra.push('JAR');
  return { numero, bach, eso, basico, letras: [...letras, ...extra] };
}

function encaja(grupo, p) {
  const k = claveGrupo(grupo);                 // p. ej. «GM2SMRA», «BTO1CTA»
  const m = k.match(/^(ESO|BTO|GM|GS|GB|FPPE)(\d+)(.*)$/);
  if (!m) return 0;
  const [, etapa, num, resto] = m;
  if (p.numero && p.numero !== num) return 0;
  if (p.bach && etapa !== 'BTO') return 0;
  if (p.eso && etapa !== 'ESO') return 0;
  if (p.basico && etapa !== 'GB') return 0;
  let puntos = 1;
  for (const l of p.letras) {
    if (resto === l) puntos += 3;               // «B» en ESO-2B
    else if (resto.startsWith(l) || resto.endsWith(l)) puntos += 2;   // «SMR» en 2SMRA; «A» final
    else if (resto.includes(l)) puntos += 1;
  }
  return puntos;
}

/**
 * horas: filas de su horario (grupo, tipo). grupos: [{ grupo, alumnos }].
 * Devuelve { valida, sugerencia: { grupo, alumnos, motivo } | null, opciones }.
 */
export function proponerTutoria({ actual, horas, grupos }) {
  const conAlumnos = grupos.filter(g => g.alumnos > 0);
  const buscar = c => grupos.find(g => mismoGrupo(g.grupo, c));

  if (actual && conAlumnos.some(g => mismoGrupo(g.grupo, actual))) {
    return { valida: true, sugerencia: null, opciones: [] };
  }

  // Grupos a los que da clase, con sus horas
  const cuenta = new Map();
  (horas || []).filter(h => h.tipo === 'clase').forEach(h =>
    codigos(h.grupo).forEach(c => { const g = buscar(c)?.grupo || c; cuenta.set(g, (cuenta.get(g) || 0) + 1); }));
  const opciones = [...cuenta].sort((a, b) => b[1] - a[1])
    .map(([g]) => ({ grupo: g, alumnos: buscar(g)?.alumnos || 0 }));

  // 1. La hora de tutoría del horario
  const tut = (horas || []).filter(h => /tutor/i.test(h.grupo || '')).flatMap(h => codigos(h.grupo));
  if (tut.length) {
    const g = buscar(tut[0]);
    return { valida: false, opciones,
      sugerencia: { grupo: g?.grupo || tut[0], alumnos: g?.alumnos || 0, motivo: 'tu horario marca la tutoría de este grupo' } };
  }

  // 2. Los grupos a los que da clase que encajan con lo que escribió
  const p = pistasDe(actual);
  const puntuados = opciones.map(o => ({ ...o, puntos: encaja(o.grupo, p) })).filter(o => o.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);
  if (actual && puntuados.length && (puntuados.length === 1 || puntuados[0].puntos > puntuados[1].puntos)) {
    const { grupo, alumnos } = puntuados[0];
    return { valida: false, opciones, sugerencia: { grupo, alumnos, motivo: `das clase a este grupo y encaja con lo que escribiste («${actual}»)` } };
  }
  return { valida: false, sugerencia: null, opciones };
}
