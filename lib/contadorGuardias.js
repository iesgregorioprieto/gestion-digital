/**
 * CONTADOR DE GUARDIAS — lo que antes se llevaba en papel
 *
 * Para cada profesor que tiene guardias en el cuadrante:
 *   semanales    horas de guardia a la semana en su horario (sin recreos)
 *   hechas       guardias FICHADAS en el curso (las que cuentan para rotar)
 *   noRealizadas asignadas en días ya pasados que no se ficharon
 *   fuera        de las hechas, cuántas fueron cubriendo a otro sector
 *   esperadas    las que le tocarían si todos los de su sector hubieran
 *                entrado en proporción a sus horas de guardia
 *
 * La comparación justa no es «cuántas lleva», sino «cuántas lleva para las
 * horas de guardia que tiene»: quien tiene tres horas a la semana entra
 * más que quien tiene una, y es lo normal. Por eso se compara con lo
 * esperado en su sector, no con la media a secas.
 *
 * Los recreos no cuentan: son vigilancia de zona, no sustituyen a nadie.
 */
import { construirCuadrante } from '@/lib/asignacionGuardias';
import { esSectorRecreo, normSector } from '@/lib/sectores';

const HECHA = new Set(['confirmado', 'incidencia']);

export function calcularContador({ horarios, profesores, equivalencias = [], apoyos, hoy }) {
  const { porSector } = construirCuadrante(horarios, profesores, equivalencias);

  // Quién tiene guardias y cuántas a la semana
  const filas = new Map();
  for (const [sector, dias] of Object.entries(porSector)) {
    if (esSectorRecreo(sector)) continue;
    for (const horas of Object.values(dias)) {
      for (const lista of Object.values(horas)) {
        for (const p of lista) {
          const clave = p.id || p.clave;
          if (!filas.has(clave)) {
            filas.set(clave, {
              clave, profesorId: p.id, nombre: p.nombre, departamento: p.departamento || '',
              sinIdentificar: !!p.sinIdentificar, sector: normSector(sector),
              semanales: 0, hechas: 0, noRealizadas: 0, fuera: 0,
            });
          }
          filas.get(clave).semanales++;
        }
      }
    }
  }

  // Lo que ha hecho cada uno en el curso
  for (const a of apoyos || []) {
    if (esSectorRecreo(a.sector_apoyo) || a.cuenta_reparto === false) continue;
    const f = filas.get(a.profesor_id) || [...filas.values()].find(x => !x.profesorId && x.nombre === a.profesor_nombre_pdf);
    if (!f) continue;
    if (HECHA.has(a.estado)) {
      f.hechas++;
      if (a.sector_destino && normSector(a.sector_destino) !== normSector(a.sector_apoyo)) f.fuera++;
    } else if (a.estado === 'pendiente' && a.fecha < hoy) {
      f.noRealizadas++;
    }
  }

  // Lo esperado en cada sector, en proporción a las horas de guardia
  const sectores = {};
  for (const f of filas.values()) {
    const s = (sectores[f.sector] ||= { sector: f.sector, profesores: 0, semanales: 0, hechas: 0 });
    s.profesores++; s.semanales += f.semanales; s.hechas += f.hechas;
  }
  for (const s of Object.values(sectores)) {
    s.porHora = s.semanales ? s.hechas / s.semanales : 0;
    s.media = s.profesores ? s.hechas / s.profesores : 0;
  }

  const lista = [...filas.values()].map(f => {
    const esperadas = f.semanales * sectores[f.sector].porHora;
    const exceso = f.hechas - esperadas;
    // «Alto» solo si va claramente por encima: al menos 2 más de lo que le
    // toca y un 50 % por encima. Con pocas guardias, 1 de diferencia es azar.
    const nivel = exceso >= 2 && f.hechas >= esperadas * 1.5 ? 'alto'
      : exceso <= -2 && f.hechas <= esperadas * 0.5 ? 'bajo' : 'normal';
    return { ...f, esperadas: Math.round(esperadas * 10) / 10, nivel };
  }).sort((a, b) => a.sector.localeCompare(b.sector) || (b.hechas - a.hechas) || a.nombre.localeCompare(b.nombre));

  return { filas: lista, sectores: Object.values(sectores).sort((a, b) => a.sector.localeCompare(b.sector)) };
}
