/**
 * ASIGNACIÓN DE GUARDIAS
 *
 * La lógica que decide quién cubre a quién, sin nada de React, para
 * poder usarla igual desde el navegador y desde el servidor.
 *
 * Hasta ahora este cálculo vivía duplicado en las dos pantallas de
 * guardias y solo se ejecutaba si alguien las tenía abiertas. Al
 * moverlo aquí, el servidor puede preasignar las guardias por su
 * cuenta y proponérselas directamente al profesorado.
 *
 * Orden de preferencia acordado con dirección (agosto 2026):
 *
 *   Falta alguien de FP (p. ej. Hostelería):
 *     1º su propio departamento
 *     2º otro departamento de FP
 *     3º guardias generales
 *
 *   Falta alguien de guardias generales (p. ej. Matemáticas):
 *     1º su propio departamento
 *     2º guardias generales
 *     3º departamentos de FP
 *
 * Dentro de cada escalón manda la rotación: primero quien menos
 * guardias lleva cubiertas, después el sector con menos acumuladas.
 */

import { departamentoASector, esSectorFP } from '@/lib/sectores';

export const HORAS_GUARDIA = ['1', '2', '3', 'recreo', '4', '5', '6'];

export function normHora(h) {
  return (h || '').toString().replace(/[aª]$/, '').toLowerCase();
}

export function horaCoincide(horaGuardada, horaId) {
  if (!horaGuardada) return false;
  const s = horaGuardada.toString().toLowerCase().trim();
  const m = s.match(/^(\d)/);
  if (m) return m[1] === horaId;
  if (s.includes('recreo') && horaId === 'recreo') return true;
  return false;
}

export function diaSemanaEs(fecha) {
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  return dias[new Date(fecha + 'T12:00:00').getDay()];
}

export function claveAbreviatura(apellidos, nombre) {
  const ap = (apellidos || '').trim().toLowerCase();
  const no = (nombre || '').trim().toLowerCase();
  return `${ap},${no}`.replace(/\s/g, '');
}

export function normAbrev(str) {
  return (str || '').toLowerCase().replace(/\s/g, '');
}

/**
 * Construye el cuadrante de guardias: sector → día → hora → profesores.
 */
export function construirCuadrante(horarios) {
  const porSector = {};
  (horarios || []).filter(h => h.tipo === 'guardia').forEach(g => {
    const sector = g.grupo?.trim() || g.materia?.trim() || 'Sin clasificar';
    const hora = normHora(g.hora_id);
    const dia = (g.dia || '').toLowerCase();
    porSector[sector] = porSector[sector] || {};
    porSector[sector][dia] = porSector[sector][dia] || {};
    porSector[sector][dia][hora] = porSector[sector][dia][hora] || [];
    porSector[sector][dia][hora].push(g.profesor_nombre_pdf);
  });
  return porSector;
}

/**
 * Convierte las faltas del día (ausencias y DLD) en la forma que
 * necesita el cálculo, resolviendo el sector de cada profesor.
 */
export function prepararAusencias(faltas, profesores) {
  const salida = [];
  for (const falta of faltas || []) {
    const prof = (profesores || []).find(p => p.id === falta.profesor_id);
    if (!prof) continue;

    let sector = departamentoASector(prof.departamento);
    if (sector === 'GENERAL' && prof.especialidad
        && prof.especialidad !== 'ESO/BACHILLERATO' && prof.especialidad !== 'GENERAL') {
      sector = prof.especialidad;
    }

    salida.push({
      profesorId: falta.profesor_id,
      profesor: `${prof.apellidos}, ${prof.nombre}`,
      abrev: claveAbreviatura(prof.apellidos, prof.nombre),
      sector,
      tipo: falta.tipo_falta || 'ausencia',
      horas: falta.horas || [],
    });
  }
  return salida;
}

/**
 * Calcula las asignaciones de una hora concreta.
 *
 * Devuelve una lista de { ausencia, clase, cubre }, donde `cubre` puede
 * ser null si no hay nadie disponible.
 */
export function asignacionesDeHora({
  hora,
  dia,
  ausencias,        // salida de prepararAusencias
  cuadrante,        // salida de construirCuadrante
  horarios,         // todos los horarios del curso
  profesores,
  apoyosPorProfesor = {},   // id → guardias ya cubiertas
  apoyosPorSector = {},     // sector → guardias ya cubiertas
}) {
  const sectores = Object.keys(cuadrante).sort();

  const mapaNombres = {};
  (profesores || []).forEach(p => {
    mapaNombres[claveAbreviatura(p.apellidos, p.nombre)] = `${p.apellidos}, ${p.nombre}`;
  });

  const ausentesEstaHora = ausencias.filter(a =>
    a.horas.some(h => horaCoincide(h.hora, hora))
  );

  const porSector = {};
  ausentesEstaHora.forEach(a => {
    const s = a.sector.toUpperCase();
    (porSector[s] = porSector[s] || []).push(a);
  });

  const guardiasDeSector = sector => cuadrante[sector]?.[dia]?.[hora] || [];
  const sectorReal = nombre =>
    sectores.find(s => s.toUpperCase() === nombre.toUpperCase()) || nombre;

  const ocupadosEnClase = new Set(
    (horarios || [])
      .filter(h => h.tipo === 'clase' && (h.dia || '').toLowerCase() === dia && normHora(h.hora_id) === hora)
      .map(h => normAbrev(h.profesor_nombre_pdf))
  );
  const ausentesAbrev = new Set(ausencias.map(a => normAbrev(a.abrev || '')));

  function libresParaApoyo(asignadosAbrev, sectorSolicitante) {
    const sectoresLibres = sectores.filter(s => !porSector[s.toUpperCase()]);
    const libres = [];

    for (const sector of sectoresLibres) {
      guardiasDeSector(sector).forEach(p => {
        const key = normAbrev(p);
        if (ocupadosEnClase.has(key) || ausentesAbrev.has(key) || asignadosAbrev.has(key)) return;
        const completo = (profesores || []).find(pf =>
          claveAbreviatura(pf.apellidos, pf.nombre) === key
        );
        libres.push({
          abrev: p,
          sectorOriginal: sector.toUpperCase(),
          nombre: mapaNombres[key] || p,
          profesorId: completo?.id || null,
          apoyosPrevios: completo?.id ? (apoyosPorProfesor[completo.id] || 0) : 0,
          apoyosSector: apoyosPorSector[sector.toUpperCase()] || 0,
        });
      });
    }

    const sectorAusente = (sectorSolicitante || '').toUpperCase();
    const ausenteEsFP = esSectorFP(sectorAusente);
    const prioridadDe = p => {
      if (sectorAusente && p.sectorOriginal === sectorAusente) return 0;
      const candidatoEsFP = esSectorFP(p.sectorOriginal);
      if (ausenteEsFP) return candidatoEsFP ? 1 : 2;
      return candidatoEsFP ? 2 : 1;
    };

    libres.sort((a, b) => {
      const pa = prioridadDe(a), pb = prioridadDe(b);
      if (pa !== pb) return pa - pb;
      if (a.apoyosPrevios !== b.apoyosPrevios) return a.apoyosPrevios - b.apoyosPrevios;
      if (a.apoyosSector !== b.apoyosSector) return a.apoyosSector - b.apoyosSector;
      return a.nombre.localeCompare(b.nombre);
    });
    return libres;
  }

  const asignaciones = [];
  const asignadosAbrev = new Set();

  for (const sectorSup of Object.keys(porSector)) {
    const sReal = sectorReal(sectorSup);
    const guardiasDisp = guardiasDeSector(sReal);

    for (const aus of porSector[sectorSup]) {
      const clasesHora = aus.horas.filter(h => horaCoincide(h.hora, hora) && h.tipo === 'clase');

      for (const clase of clasesHora) {
        let cubre = null;

        // Primero, el profesorado de guardia del propio sector
        for (const p of guardiasDisp) {
          const key = normAbrev(p);
          if (asignadosAbrev.has(key) || ausentesAbrev.has(key)) continue;
          const completo = (profesores || []).find(pf =>
            claveAbreviatura(pf.apellidos, pf.nombre) === key
          );
          cubre = {
            nombre: mapaNombres[key] || p,
            abrev: p,
            sectorOriginal: sectorSup,
            profesorId: completo?.id || null,
            tipo: 'guardia_sector',
          };
          asignadosAbrev.add(key);
          break;
        }

        // Si no hay nadie de su sector, se busca fuera por orden de preferencia
        if (!cubre) {
          const libres = libresParaApoyo(asignadosAbrev, sectorSup);
          if (libres.length > 0) {
            const primero = libres[0];
            asignadosAbrev.add(normAbrev(primero.abrev));
            cubre = { ...primero, tipo: 'apoyo_obligatorio', alternativas: libres.slice(1, 6) };
          }
        }

        asignaciones.push({ ausencia: aus, clase, cubre });
      }
    }
  }

  return asignaciones;
}
