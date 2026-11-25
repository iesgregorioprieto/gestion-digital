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

/**
 * LO QUE VE EL PROFESOR AL ABRIR SU AUSENCIA (fallo de Pilar Sánchez, 25/11/2026)
 *
 * Antes se guardaban solo los números de las horas de la actividad
 * ({hora:'3'}), sin grupo ni tipo. Al abrirla para dejar tareas salían
 * las horas de la actividad, no sus clases, todas como «Complementaria»
 * y sin cuadro de tarea; y en las de día completo no salía nada.
 *
 * Ahora se guarda su horario real de esos días, en el mismo formato en
 * que lo guarda el formulario:
 *   - Un día: hora por hora («3ª hora», tipo, grupo, materia).
 *   - Varios días: una tarea por grupo y materia («Ausencia larga»).
 * Las tareas ya escritas se conservan: por hora y grupo, o por grupo y
 * materia si cambió la hora.
 */
const igualTxt = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const copiaTarea = t => ({
  instrucciones: t?.instrucciones || null,
  archivos: Array.isArray(t?.archivos) ? t.archivos : null,
  archivo_url: t?.archivo_url || null,
  archivo_nombre: t?.archivo_nombre || null,
});

function horasVisibles(dias, viejas, unDia) {
  if (!Array.isArray(dias)) return null;
  if (unDia) {
    return (dias[0]?.horas || [])
      .filter(h => /^\d$/.test(String(h.hora)))
      .map(h => {
        const t = h.tipo !== 'clase' ? {}
          : viejas.find(v => numHora(v) === String(h.hora) && (!v.grupo || igualTxt(v.grupo, h.grupo)))
            || viejas.find(v => v.grupo && igualTxt(v.grupo, h.grupo) && igualTxt(v.materia, h.materia))
            || {};
        return {
          hora: `${h.hora}ª hora`, tipo: h.tipo,
          grupo: h.grupo || null, materia: h.materia || null, aula: h.aula || null,
          ...copiaTarea(t),
        };
      });
  }
  const bloques = new Map();
  for (const d of dias) {
    for (const h of d.horas || []) {
      if (h.tipo !== 'clase' || !h.grupo) continue;
      const k = `${h.grupo}|${h.materia || ''}`;
      if (bloques.has(k)) continue;
      const t = viejas.find(v => igualTxt(v.grupo, h.grupo) && igualTxt(v.materia, h.materia)) || {};
      bloques.set(k, { hora: 'Ausencia larga', tipo: 'clase', grupo: h.grupo, materia: h.materia || null, ...copiaTarea(t) });
    }
  }
  return [...bloques.values()];
}
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
      .select('id, profesor_id, fecha_inicio, fecha_fin, horas, datos_extra')
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
        const viejas = Array.isArray(previa?.horas) ? previa.horas : [];
        const unDia = fin === act.fecha_inicio;

        if (previa) {
          // Ya está al día si coinciden fechas y horas de la actividad y ya
          // lleva el horario real (las antiguas no tienen horas_actividad).
          const mismas = previa.fecha_inicio === act.fecha_inicio
            && (previa.fecha_fin || previa.fecha_inicio) === fin
            && Array.isArray(previa.datos_extra?.horas_actividad)
            && JSON.stringify(previa.datos_extra.horas_actividad) === JSON.stringify(horasAct);
          if (mismas) continue;
          if (await otraAusencia(cliente, pid, act.fecha_inicio, fin, previa.id)) {
            res.sinCrear.push(nombreDe(pid)); continue;
          }
        } else if (await otraAusencia(cliente, pid, act.fecha_inicio, fin)) {
          res.sinCrear.push(nombreDe(pid)); continue;
        }

        // 1º qué tiene esa persona en las horas de la actividad; 2º su
        // horario en el formato del formulario, con las tareas ya escritas;
        // 3º los días otra vez, para que las tareas lleguen a las guardias.
        const base = { profesor_id: pid, fecha_inicio: act.fecha_inicio, fecha_fin: fin, horas: horasAct.map(h => ({ hora: h })) };
        const ctxDias = await contexto();
        let dias = calcularDias(base, ctxDias);
        let horas = horasVisibles(dias, viejas, unDia);
        if (horas === null) {
          horas = horasAct.length ? base.horas : [];   // sin horario cargado: como antes
        } else if (horas.length) {
          dias = calcularDias({ ...base, horas }, ctxDias) || dias;
        }
        const datosExtra = { ...(previa?.datos_extra || {}), actividad_id: act.id, horas_actividad: horasAct };

        if (previa) {
          await cliente.from('ausencias').update({
            fecha_inicio: act.fecha_inicio, fecha_fin: fin, horas, datos_extra: datosExtra, ...(dias ? { dias } : {}),
          }).eq('id', previa.id);
          tocados.push(pid);
          res.ajustadas++; cambios = true;
          continue;
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
          datos_extra: datosExtra,
        };
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
