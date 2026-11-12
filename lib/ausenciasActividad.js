/**
 * AUSENCIAS AUTOMÁTICAS DE LAS ACTIVIDADES COMPLEMENTARIAS
 *
 * Decisión de Luis Javier (13 nov. 2026): como con el DLD concedido,
 * cuando José María autoriza una actividad se crea sola la ausencia del
 * responsable y de cada acompañante, con motivo «Actividad complementaria»
 * (no computa como falta), solo en las horas que dura la actividad. Así se
 * generan las guardias sin que nadie tenga que registrar nada a mano, y a
 * cada profesor le llega un aviso para que deje las tareas de los grupos
 * que se quedan.
 *
 * Si después la actividad cambia (fecha, horas o profesores) o se anula,
 * sus ausencias se ajustan o se borran. Las tareas ya escritas se
 * conservan en las horas que siguen dentro.
 *
 * Cada ausencia queda enlazada con datos_extra.actividad_id. Si un
 * profesor ya tiene otra ausencia esos días, no se le crea una segunda
 * (dos ausencias el mismo día = guardias dobles): se deja como está.
 *
 * Nunca lanza: la actividad ya está guardada.
 */

import { diasDeLaAusencia } from '@/lib/diasAusencia';
import { actividadOcupaHora } from '@/lib/asignacionGuardias';
import { getCursoActual } from '@/lib/curso';
import { hoyLocal, sumarDias } from '@/lib/fechas';
import { enviarPushA } from '@/lib/pushServidor';
import { rehacerReparto } from '@/lib/rehacerReparto';

const SUBTIPO = 'act_complementarias';
const HORAS = ['1', '2', '3', '4', '5', '6'];

const numHora = h => String(h?.hora || h?.hora_id || '').trim().match(/^(\d)/)?.[1] || '';
const fmt = f => (f || '').split('-').reverse().join('/');

/** Horas que ocupa la actividad (solo si es de un día y no ocupa la mañana entera). */
function horasDeActividad(act) {
  const fin = act.fecha_fin || act.fecha_inicio;
  if (fin !== act.fecha_inicio) return [];            // varios días: completos
  const ocupa = HORAS.filter(h => actividadOcupaHora(act, h));
  return ocupa.length === HORAS.length ? [] : ocupa;  // [] = día completo
}

async function cargarContexto(cliente) {
  const curso = await getCursoActual();
  const [{ data: profesores }, { data: equivalencias }] = await Promise.all([
    cliente.from('profesores').select('id, nombre, apellidos, departamento, en_baja, sustituto_id'),
    cliente.from('equivalencias_horario').select('nombre_horario, profesor_id'),
  ]);
  let horarios = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await cliente.from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia, aula')
      .eq('curso_academico', curso).range(desde, desde + 999);
    if (!data || data.length === 0) break;
    horarios = horarios.concat(data);
    if (data.length < 1000) break;
  }
  return { profesores: profesores || [], equivalencias: equivalencias || [], horarios };
}

function calcularDias(fila, ctx) {
  const profesor = ctx.profesores.find(p => p.id === fila.profesor_id);
  if (!profesor || ctx.horarios.length === 0) return null;
  const sustituto = profesor.sustituto_id ? ctx.profesores.find(p => p.id === profesor.sustituto_id) || null : null;
  return diasDeLaAusencia({
    ausencia: fila, profesor, horarios: ctx.horarios,
    profesores: ctx.profesores, equivalencias: ctx.equivalencias, sustituto,
  });
}

/** ¿Tiene esta persona otra ausencia (no de esta actividad) que se pise con esas fechas? */
async function otraAusencia(cliente, profesorId, inicio, fin, excluirId) {
  let q = cliente.from('ausencias').select('id, motivo')
    .eq('profesor_id', profesorId)
    .or(`fecha_fin.gte.${inicio},fecha_fin.is.null`)
    .lte('fecha_inicio', fin);
  if (excluirId) q = q.neq('id', excluirId);
  const { data } = await q.limit(1);
  return (data || [])[0] || null;
}

/** Se lleva las guardias pendientes de esta persona; el reparto vuelve a poner las que sigan. */
async function limpiarGuardias(cliente, profesorId) {
  const ayer = sumarDias(hoyLocal(), -1);
  await cliente.from('apoyos_asignados').delete()
    .eq('profesor_ausente_id', profesorId).eq('estado', 'pendiente').gt('fecha', ayer)
    .then(({ error }) => error && console.error('limpiar guardias actividad:', error.message));
}

/**
 * Deja las ausencias de la actividad como deben estar según su estado.
 * @param anulada  true cuando la actividad se va a borrar.
 * @returns { creadas, ajustadas, borradas, sinCrear: [nombres] }
 */
export async function sincronizarAusenciasActividad(cliente, request, actividadId, { anulada = false } = {}) {
  const res = { creadas: 0, ajustadas: 0, borradas: 0, sinCrear: [] };
  try {
    const { data: filas } = await cliente.from('actividades')
      .select('id, titulo, estado, profesor_id, profesor_nombre, acompanantes, fecha_inicio, fecha_fin, horas, hora_salida, hora_regreso')
      .eq('id', actividadId);
    const act = (filas || [])[0];
    if (!act?.fecha_inicio) return res;

    const fin = act.fecha_fin || act.fecha_inicio;
    // Lo ya pasado no se toca: esas guardias se hicieron.
    if (fin < hoyLocal()) return res;

    const { data: existentes } = await cliente.from('ausencias')
      .select('id, profesor_id, fecha_inicio, fecha_fin, horas')
      .eq('subtipo', SUBTIPO).eq('datos_extra->>actividad_id', String(act.id));

    const quienes = (!anulada && act.estado === 'aprobada')
      ? [...new Set([act.profesor_id, ...(Array.isArray(act.acompanantes) ? act.acompanantes : [])].filter(Boolean))]
      : [];

    let cambios = false;
    const tocados = [];

    // 1. Quien ya no va (o la actividad ya no está autorizada): fuera su ausencia
    for (const aus of existentes || []) {
      if (quienes.includes(aus.profesor_id)) continue;
      await cliente.from('ausencias').delete().eq('id', aus.id);
      tocados.push(aus.profesor_id);
      res.borradas++; cambios = true;
    }

    if (quienes.length) {
      // El horario entero solo se lee si de verdad hay algo que escribir
      let ctx = null;
      const contexto = async () => (ctx ||= await cargarContexto(cliente));
      const { data: profs } = await cliente.from('profesores').select('id, nombre, apellidos').in('id', quienes);
      const horasAct = horasDeActividad(act);
      const nombreDe = id => {
        const p = (profs || []).find(x => x.id === id);
        return p ? `${p.nombre || ''} ${p.apellidos || ''}`.trim() : '';
      };
      const avisar = [];

      for (const pid of quienes) {
        const previa = (existentes || []).find(a => a.profesor_id === pid);

        // Horas: se conservan las tareas ya escritas de las horas que siguen
        const viejas = Array.isArray(previa?.horas) ? previa.horas : [];
        const horas = horasAct.length
          ? horasAct.map(h => viejas.find(v => numHora(v) === h) || { hora: h })
          : viejas.filter(v => !numHora(v));           // día completo: tareas por módulo

        if (previa) {
          const mismas = previa.fecha_inicio === act.fecha_inicio
            && (previa.fecha_fin || previa.fecha_inicio) === fin
            && JSON.stringify(viejas.map(numHora).filter(Boolean)) === JSON.stringify(horasAct);
          if (mismas) continue;
          if (await otraAusencia(cliente, pid, act.fecha_inicio, fin, previa.id)) {
            res.sinCrear.push(nombreDe(pid)); continue;
          }
          const fila = { profesor_id: pid, fecha_inicio: act.fecha_inicio, fecha_fin: fin, horas };
          const dias = calcularDias(fila, await contexto());
          await cliente.from('ausencias').update({
            fecha_inicio: act.fecha_inicio, fecha_fin: fin, horas, ...(dias ? { dias } : {}),
          }).eq('id', previa.id);
          tocados.push(pid);
          res.ajustadas++; cambios = true;
          continue;
        }

        if (await otraAusencia(cliente, pid, act.fecha_inicio, fin)) {
          res.sinCrear.push(nombreDe(pid)); continue;
        }
        const fila = {
          profesor_id: pid,
          profesor_nombre: nombreDe(pid) || (pid === act.profesor_id ? act.profesor_nombre : null),
          fecha_inicio: act.fecha_inicio,
          fecha_fin: fin,
          subtipo: SUBTIPO,
          tipo: 'prevista',
          estado: 'justificada',
          motivo: `🚌 Actividad complementaria: ${act.titulo || ''}`.trim(),
          horas,
          datos_extra: { actividad_id: act.id },
        };
        const dias = calcularDias(fila, await contexto());
        if (dias) fila.dias = dias;
        const { error } = await cliente.from('ausencias').insert([fila]);
        if (error) { console.error('ausencia de actividad:', error.message); res.sinCrear.push(nombreDe(pid)); continue; }
        avisar.push(pid);
        res.creadas++; cambios = true;
      }

      if (avisar.length) {
        const cuando = fin === act.fecha_inicio ? `del ${fmt(act.fecha_inicio)}` : `del ${fmt(act.fecha_inicio)} al ${fmt(fin)}`;
        await enviarPushA(cliente, avisar, {
          titulo: '🚌 Actividad autorizada',
          cuerpo: `«${act.titulo || 'Actividad'}» ${cuando} ya está en Mis ausencias. Entra y deja las tareas para los grupos que se quedan.`,
          url: '/ausencias',
        }).catch(err => console.error('push actividad autorizada:', err?.message));
      }
    }

    for (const pid of new Set(tocados)) await limpiarGuardias(cliente, pid);
    if (cambios) await rehacerReparto(request);
  } catch (e) {
    console.error('sincronizar ausencias de actividad:', e?.message);
  }
  return res;
}
