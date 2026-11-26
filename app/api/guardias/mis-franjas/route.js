/**
 * MIS FRANJAS DE GUARDIA — «¿cuántas lleva cada compañero de mi hora?»
 *
 * Incidencia #186 (María Rocío Martínez Lara), aprobada por Luis Javier el
 * 19/11/2026: que cada profesor vea, en cada franja (día + hora) en que
 * tiene guardia, cuántas guardias ha fichado en esa franja cada compañero
 * que está de guardia con él. Es la misma cuenta que usa el motor para
 * decidir quién sale (rotación por franja), para que se vea que es justa.
 *
 * Qué se enseña y qué no:
 *   - Solo las franjas del propio profesor, no el cuadrante de todo el
 *     centro.
 *   - De cada compañero, su nombre y las guardias fichadas EN ESA FRANJA.
 *     Nada de ausencias, motivos ni nada personal.
 *
 * Mismo criterio que app/api/guardias/preasignar:
 *   - Cuentan las fichadas (confirmado, realizado, incidencia), sin recreos
 *     y sin las marcadas cuenta_reparto = false.
 *   - cuenta_para: la hizo un sustituto en lugar de su titular → cuenta
 *     para el titular.
 *   - El sustituto ocupa las guardias de su titular de baja y hereda lo
 *     que llevaba en cada franja.
 *   - Las hechas a horas que no son de guardia suya se reparten a partes
 *     iguales entre sus franjas (26/11/2026): pueden salir decimales.
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal } from '@/lib/fechas';
import {
  construirCuadrante, normHora, diaSemanaEs, nombreDe, pesoFranja, TRANSICION_FRANJA,
  repartirFueraDeFranja,
} from '@/lib/asignacionGuardias';
import { esSectorRecreo, esSectorFP, normSector } from '@/lib/sectores';

export const dynamic = 'force-dynamic';

const CUENTAN_ROTACION = new Set(['confirmado', 'realizado', 'incidencia']);
const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

// Mismo criterio que el reparto (app/api/guardias/preasignar)
async function cursoActivo(cliente) {
  const { data } = await cliente.from('config_centro').select('*').eq('activo', true).limit(1);
  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
  const hoy = new Date();
  const anio = hoy.getMonth() >= 8 ? hoy.getFullYear() : hoy.getFullYear() - 1;
  return `${anio}-${anio + 1}`;
}

async function todas(consulta) {
  let filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas = filas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return filas;
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const cliente = supa();
    const curso = await cursoActivo(cliente);
    const [horarios, profesores, equivalencias, apoyos] = await Promise.all([
      todas(() => cliente.from('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
        .eq('curso_academico', curso).eq('tipo', 'guardia')),
      todas(() => cliente.from('profesores')
        .select('id,nombre,apellidos,departamento,especialidad,en_baja,tipo_contrato,titular_id,sustituto_id')),
      todas(() => cliente.from('equivalencias_horario').select('nombre_horario, profesor_id')),
      todas(() => cliente.from('apoyos_asignados')
        .select('profesor_id,cuenta_para,profesor_nombre_pdf,estado,fecha,hora,sector_apoyo,cuenta_reparto')
        .eq('curso_academico', curso)),
    ]);

    // El sustituto asume el horario del titular, y con él sus guardias
    const relevo = new Map(); // id del titular → id del sustituto
    profesores.forEach(p => { if (p.titular_id) relevo.set(p.titular_id, p.id); });
    profesores.forEach(p => { if (p.en_baja && p.sustituto_id && !relevo.has(p.id)) relevo.set(p.id, p.sustituto_id); });
    const porFicha = new Map(profesores.map(p => [p.id, p]));

    // Fichadas por persona y franja: "id|martes|3" → n
    const enFranja = {};
    const enFranjaSinFicha = {}; // "nombrePdf|martes|3" → n (cuadrante sin identificar)
    for (const a of apoyos) {
      if (!CUENTAN_ROTACION.has(a.estado) || a.cuenta_reparto === false) continue;
      if (esSectorRecreo(a.sector_apoyo) || !a.fecha || !a.hora) continue;
      const sufijo = `|${diaSemanaEs(a.fecha)}|${normHora(a.hora)}`;
      const quien = a.cuenta_para || a.profesor_id;
      if (quien) enFranja[quien + sufijo] = (enFranja[quien + sufijo] || 0) + 1;
      else if (a.profesor_nombre_pdf) {
        const k = a.profesor_nombre_pdf + sufijo;
        enFranjaSinFicha[k] = (enFranjaSinFicha[k] || 0) + 1;
      }
    }
    // El sustituto hereda lo que llevaba el titular, franja a franja
    for (const [titular, sustituto] of relevo) {
      if (!titular || !sustituto || titular === sustituto) continue;
      for (const [k, n] of Object.entries(enFranja)) {
        if (!k.startsWith(`${titular}|`)) continue;
        const kSust = sustituto + k.slice(titular.length);
        enFranja[kSust] = (enFranja[kSust] || 0) + n;
      }
    }

    // Cuadrante con los sustitutos puestos y sin quien está de baja
    const { porSector } = construirCuadrante(horarios, profesores, equivalencias);
    const porFranja = {}; // "martes|3" → [{ sector, id, nombre, sinIdentificar, nombrePdf }]
    for (const [sectorBruto, dias] of Object.entries(porSector || {})) {
      if (esSectorRecreo(sectorBruto)) continue;
      const sector = normSector(sectorBruto);
      for (const [dia, horas] of Object.entries(dias || {})) {
        for (const [hora, gente] of Object.entries(horas || {})) {
          const lista = (porFranja[`${dia}|${hora}`] ||= []);
          for (const g of gente || []) {
            let id = g.id, nombre = g.nombre;
            const sust = id ? relevo.get(id) : null;
            if (sust && porFicha.get(sust)) { id = sust; nombre = nombreDe(porFicha.get(sust)); }
            if (id && porFicha.get(id)?.en_baja) continue;
            if (id && lista.some(x => x.id === id)) continue;
            lista.push({ sector, id, nombre, sinIdentificar: !!g.sinIdentificar, nombrePdf: g.nombrePdf });
          }
        }
      }
    }

    // Las guardias hechas a horas que no son de guardia suya se reparten
    // entre sus franjas, igual que en el motor (26/11/2026). Así lo que
    // suma la planilla cuadra con el total del contador.
    const franjasDe = new Map();
    for (const [clave, gente] of Object.entries(porFranja)) {
      for (const x of gente) {
        if (!x.id) continue;
        const id = String(x.id);
        if (!franjasDe.has(id)) franjasDe.set(id, new Set());
        franjasDe.get(id).add(clave);
      }
    }
    const fuera = repartirFueraDeFranja(enFranja, franjasDe);

    const yo = sesion.id;
    const franjas = [];
    for (const [clave, gente] of Object.entries(porFranja)) {
      const mio = gente.find(x => x.id && String(x.id) === String(yo));
      if (!mio) continue;
      const [dia, hora] = clave.split('|');
      const cuenta = x => x.id
        ? (enFranja[`${x.id}|${dia}|${hora}`] || 0)
        : (enFranjaSinFicha[`${x.nombrePdf}|${dia}|${hora}`] || 0);

      const porSectorFranja = {};
      for (const x of gente) {
        (porSectorFranja[x.sector] ||= []).push({
          nombre: x.nombre, fichadas: cuenta(x), yo: !!x.id && String(x.id) === String(yo),
          sinIdentificar: x.sinIdentificar,
        });
      }
      const sectores = Object.entries(porSectorFranja).map(([sector, personas]) => ({
        sector, fp: esSectorFP(sector), mio: sector === mio.sector,
        personas: personas.sort((a, b) => (a.fichadas - b.fichadas) || a.nombre.localeCompare(b.nombre)),
      })).sort((a, b) => (b.mio - a.mio) || (a.fp - b.fp) || a.sector.localeCompare(b.sector));

      franjas.push({ dia, hora, sector: mio.sector, sectores });
    }
    franjas.sort((a, b) => (ORDEN_DIAS.indexOf(a.dia) - ORDEN_DIAS.indexOf(b.dia))
      || (Number(a.hora) - Number(b.hora)));

    return Response.json({
      franjas,
      // Guardias que hizo fuera de sus franjas, ya repartidas entre ellas
      fueraRepartidas: fuera[String(sesion.id)] || 0,
      transicion: { peso: pesoFranja(hoyLocal()), pura: TRANSICION_FRANJA.pura },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
