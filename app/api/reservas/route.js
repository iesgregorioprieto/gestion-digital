import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { enviarPushA } from '@/lib/pushServidor';
import { normHora, diaSemanaEs, ahoraEnCentro, esHoraSinAlumnos } from '@/lib/asignacionGuardias';
import { describirAula, normalizaAula, aulaDeGrupo } from '@/lib/edificios';
import { cursoPorFecha } from '@/lib/curso';

export const dynamic = 'force-dynamic';

/**
 * AULAS DIVERSIFICADAS Y MATERIALES — reserva de aulas y material
 *
 * Petición de Sebas (PDF «Creación nuevo módulo», nov. 2026), decidido
 * con Luis Javier el 23/11/2026. Resuelve también la sugerencia #210.
 *
 *   1. El profesor elige recurso y día(s), ve las 6 horas libre/ocupada
 *      y pide la reserva (puntual o periódica: días marcados a mano, sin
 *      tope)                                       → filas 'pendiente'
 *   2. El responsable del recurso (o el equipo directivo si el recurso
 *      no tiene responsable) acepta, deniega con motivo o ajusta
 *      quitando días                               → 'aceptada' / 'denegada'
 *   3. Responsables y equipo directivo pueden dar de alta, cambiar o
 *      anular reservas en cualquier momento; cada cambio se avisa al
 *      profesor, a los responsables y al equipo directivo.
 *
 * Una fila por hora reservada. Las filas de una misma solicitud
 * comparten serie_id. Las horas con clase del horario (aula entre
 * paréntesis en Peñalara) salen ocupadas y no se pueden reservar.
 * Los carros se piden completos: un recurso, una reserva por hora.
 *
 * «Aulas libres» (recurso LIBRES): cualquier aula del horario que a esa
 * hora no tenga clase ni otra reserva; aula_libre guarda cuál.
 *
 * Las tablas están cerradas al navegador: todo pasa por aquí.
 */

const HORAS = [1, 2, 3, 4, 5, 6];
// Minutos desde medianoche de cada hora (para «Ahora en las aulas»)
const FRANJAS = {
  1: [510, 565], 2: [565, 620], 3: [620, 675],
  4: [705, 760], 5: [760, 815], 6: [815, 870],
};

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

const nombreDe = p => p ? `${p.nombre || ''} ${p.apellidos || ''}`.trim() : '';
const esFecha = f => /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
const finDeSemana = f => { const d = new Date(f + 'T12:00:00').getDay(); return d === 0 || d === 6; };
const texto = (v, max) => String(v || '').trim().slice(0, max);

function sumarDias(f, n) {
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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

async function cursoActivo(sb) {
  try {
    const { data } = await sb.from('config_centro').select('*').eq('activo', true).limit(1);
    const f = (data || [])[0];
    return f?.config?.curso || f?.curso || f?.curso_academico || cursoPorFecha();
  } catch {
    return cursoPorFecha();
  }
}

async function fichaDe(sb, id) {
  const { data } = await sb.from('profesores').select('id, nombre, apellidos, email').eq('id', id);
  return (data || [])[0] || null;
}

async function recursos(sb) {
  const { data } = await sb.from('reserva_recursos').select('*').eq('activo', true).order('orden');
  return data || [];
}

/** ¿Puede esta persona gestionar este recurso? */
function gestiona(sesion, yo, recurso) {
  if (esDirectivo(sesion)) return true;
  const resp = (recurso?.responsable_email || '').toLowerCase();
  return !!resp && resp === (yo?.email || '').toLowerCase();
}

/** Ids del equipo directivo */
async function idsDirectivos(sb) {
  const { data } = await sb.from('profesores').select('id, rol_gestion').not('rol_gestion', 'is', null);
  return (data || []).filter(p => {
    const r = (p.rol_gestion || '').toLowerCase();
    return r.startsWith('direct') || r.startsWith('secretari') || (r.startsWith('jef') && r.includes('estudio'));
  }).map(p => p.id);
}

/** Ids de quien resuelve un recurso: su responsable o, si no tiene, el equipo directivo */
async function idsResponsables(sb, recurso) {
  const email = (recurso?.responsable_email || '').toLowerCase();
  if (!email) return idsDirectivos(sb);
  const { data } = await sb.from('profesores').select('id').ilike('email', email);
  const ids = (data || []).map(p => p.id);
  return ids.length ? ids : idsDirectivos(sb);
}

async function avisar(sb, ids, titulo, cuerpo, url) {
  try {
    await enviarPushA(sb, ids, { titulo, cuerpo, url });
  } catch (e) {
    console.error('[reservas] push:', e?.message);
  }
}

// ─── Horario y calendario ─────────────────────────────────────────

/** Aula de una fila del horario, o '' si no se reconoce */
function aulaDeFila(r) {
  if (describirAula(r.aula)) return normalizaAula(r.aula);
  return aulaDeGrupo(r.grupo);
}

/**
 * Clases fijas del horario por aula: Map aula → Map 'dia|hora' → { grupo, materia }
 * Solo horas de clase con alumnos.
 */
async function clasesPorAula(sb) {
  const curso = await cursoActivo(sb);
  const filas = await todas(() => sb.from('horarios_profesores')
    .select('dia, hora_id, tipo, grupo, materia, aula')
    .eq('curso_academico', curso).eq('tipo', 'clase'));
  const mapa = new Map();
  for (const r of filas) {
    if (esHoraSinAlumnos(r)) continue;
    const aula = aulaDeFila(r);
    const hora = Number(normHora(r.hora_id));
    if (!aula || !HORAS.includes(hora)) continue;
    const dia = String(r.dia || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (!mapa.has(aula)) mapa.set(aula, new Map());
    const clave = `${dia}|${hora}`;
    if (!mapa.get(aula).has(clave)) mapa.get(aula).set(clave, { grupo: r.grupo || '', materia: r.materia || '' });
  }
  return mapa;
}

async function periodosNoLectivos(sb) {
  try {
    const { data } = await sb.from('periodos_no_lectivos').select('*');
    return data || [];
  } catch {
    return [];
  }
}

function noLectivo(fecha, periodos) {
  return finDeSemana(fecha) || periodos.some(p => fecha >= p.fecha_inicio && fecha <= (p.fecha_fin || p.fecha_inicio));
}

/** Reservas vivas (pendientes y aceptadas) de un recurso en un rango */
async function reservasVivas(sb, recursoId, desde, hasta, aulaLibre = null) {
  let q = sb.from('reservas').select('*')
    .eq('recurso_id', recursoId).gte('fecha', desde).lte('fecha', hasta)
    .in('estado', ['pendiente', 'aceptada']);
  if (aulaLibre) q = q.eq('aula_libre', aulaLibre);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Ocupación de un recurso día a día y hora a hora.
 * Devuelve { 'AAAA-MM-DD': { noLectivo, horas: { 1: {estado, ...}, ... } } }
 *   estado: 'libre' | 'clase' | 'reservada' | 'pendiente'
 * En 'pendiente' la hora sigue pudiéndose pedir: decide el responsable.
 */
async function ocupacion(sb, recurso, desde, hasta, aulaLibre = null) {
  const [periodos, clases, vivas] = await Promise.all([
    periodosNoLectivos(sb),
    recurso.aula_horario || aulaLibre ? clasesPorAula(sb) : Promise.resolve(new Map()),
    reservasVivas(sb, recurso.id, desde, hasta, aulaLibre),
  ]);
  const aula = aulaLibre || recurso.aula_horario;
  const delAula = aula ? clases.get(normalizaAula(aula)) || new Map() : new Map();

  const salida = {};
  for (let f = desde, n = 0; f <= hasta && n < 400; f = sumarDias(f, 1), n++) {
    const dia = { noLectivo: noLectivo(f, periodos), horas: {} };
    for (const h of HORAS) {
      if (dia.noLectivo) { dia.horas[h] = { estado: 'no_lectivo' }; continue; }
      const clase = delAula.get(`${diaSemanaEs(f)}|${h}`);
      if (clase) { dia.horas[h] = { estado: 'clase', grupo: clase.grupo, materia: clase.materia }; continue; }
      const acep = vivas.find(r => r.fecha === f && r.hora === h && r.estado === 'aceptada');
      if (acep) {
        dia.horas[h] = { estado: 'reservada', quien: acep.solicitante_nombre, actividad: acep.actividad, grupos: acep.grupos };
        continue;
      }
      const pend = vivas.filter(r => r.fecha === f && r.hora === h && r.estado === 'pendiente');
      dia.horas[h] = pend.length ? { estado: 'pendiente', solicitudes: pend.length } : { estado: 'libre' };
    }
    salida[f] = dia;
  }
  return salida;
}

/** Todas las aulas que salen en el horario (para «Aulas libres») */
function aulasDelHorario(clases) {
  return [...clases.keys()].filter(a => describirAula(a)).sort();
}

/** Agrupa filas por solicitud (serie_id) para las pantallas */
function porSolicitud(filas, recursosPorId) {
  const series = new Map();
  for (const r of filas) {
    const clave = r.serie_id || r.id;
    if (!series.has(clave)) {
      series.set(clave, {
        serie_id: clave,
        recurso_id: r.recurso_id,
        recurso: recursosPorId[r.recurso_id]?.nombre || r.recurso_id,
        aula_libre: r.aula_libre,
        profesor_id: r.profesor_id,
        solicitante_nombre: r.solicitante_nombre,
        solicitante_email: r.solicitante_email,
        actividad: r.actividad,
        grupos: r.grupos,
        recursos_uso: r.recursos_uso,
        creada_en: r.creada_en,
        filas: [],
      });
    }
    series.get(clave).filas.push({
      id: r.id, fecha: r.fecha, hora: r.hora, estado: r.estado, motivo: r.motivo,
    });
  }
  return [...series.values()].map(s => {
    s.filas.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const estados = new Set(s.filas.map(f => f.estado));
    s.estado = estados.has('pendiente') ? 'pendiente'
      : estados.has('aceptada') ? 'aceptada'
      : estados.has('denegada') ? 'denegada' : 'anulada';
    s.primera = s.filas[0]?.fecha || '';
    return s;
  }).sort((a, b) => b.creada_en.localeCompare(a.creada_en));
}

function resumenDias(filas) {
  const fechas = [...new Set(filas.map(f => f.fecha))].sort();
  const horas = [...new Set(filas.map(f => f.hora))].sort((a, b) => a - b);
  const fmt = f => new Date(f + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  const dias = fechas.length === 1 ? fmt(fechas[0]) : `${fechas.length} días desde el ${fmt(fechas[0])}`;
  return `${dias} · ${horas.map(h => h + 'ª').join(', ')}`;
}

// ─────────────────────────────────────────────────────────────────────
// LECTURA
//   ?vista=recursos                                   → lista y permisos
//   ?vista=ocupacion&recurso=&desde=&hasta=[&aula=]   → calendario
//   ?vista=libres&fecha=&hora=                        → aulas libres a esa hora
//   ?vista=mias                                       → mis solicitudes
//   ?vista=gestion[&recurso=]                         → las que gestiono
//   ?vista=ahora                                      → quién está ahora (directivos y responsables)
//   ?vista=registro&desde=&hasta=                     → registro por fechas (directivos)
// ─────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const sb = supa();
    const p = new URL(request.url).searchParams;
    const vista = p.get('vista') || 'recursos';
    const yo = await fichaDe(sb, sesion.id);
    const lista = await recursos(sb);
    const porId = Object.fromEntries(lista.map(r => [r.id, r]));
    const misRecursos = lista.filter(r => gestiona(sesion, yo, r)).map(r => r.id);
    const perfil = {
      soyDirectivo: esDirectivo(sesion),
      misRecursos,
      nombre: nombreDe(yo),
      email: yo?.email || '',
    };

    if (vista === 'recursos') {
      // Nombre del responsable a partir de su correo (si aún no está registrado, el correo)
      const correos = [...new Set(lista.map(r => (r.responsable_email || '').toLowerCase()).filter(Boolean))];
      const { data: fichas } = correos.length
        ? await sb.from('profesores').select('nombre, apellidos, email').in('email', correos)
        : { data: [] };
      const nombrePorCorreo = Object.fromEntries((fichas || []).map(f => [(f.email || '').toLowerCase(), nombreDe(f)]));
      return Response.json({
        ...perfil,
        recursos: lista.map(r => {
          const c = (r.responsable_email || '').toLowerCase();
          return {
            id: r.id, nombre: r.nombre, tipo: r.tipo, aula_horario: r.aula_horario,
            responsable: c ? (nombrePorCorreo[c] || r.responsable_email) : 'Equipo directivo',
          };
        }),
      });
    }

    if (vista === 'ocupacion') {
      const recurso = porId[p.get('recurso')];
      const desde = p.get('desde'), hasta = p.get('hasta') || desde;
      const aula = p.get('aula') ? normalizaAula(p.get('aula')) : null;
      if (!recurso) return Response.json({ error: 'Recurso desconocido' }, { status: 400 });
      if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) return Response.json({ error: 'Fechas no válidas' }, { status: 400 });
      if (recurso.tipo === 'libres' && !aula) return Response.json({ error: 'Elige el aula' }, { status: 400 });
      return Response.json({ ...perfil, dias: await ocupacion(sb, recurso, desde, hasta, aula) });
    }

    if (vista === 'libres') {
      const fecha = p.get('fecha');
      const horas = (p.get('horas') || p.get('hora') || '').split(',').map(Number).filter(h => HORAS.includes(h));
      if (!esFecha(fecha) || !horas.length) return Response.json({ error: 'Elige día y hora' }, { status: 400 });
      const [clases, periodos] = await Promise.all([clasesPorAula(sb), periodosNoLectivos(sb)]);
      if (noLectivo(fecha, periodos)) return Response.json({ ...perfil, aulas: [], noLectivo: true });
      const { data: ocupadas } = await sb.from('reservas').select('recurso_id, aula_libre, hora')
        .eq('fecha', fecha).eq('estado', 'aceptada').in('hora', horas);
      // Las aulas diversificadas no salen aquí: se piden en su propia opción
      const propias = new Set(lista.filter(r => r.aula_horario).map(r => normalizaAula(r.aula_horario)));
      const dia = diaSemanaEs(fecha);
      const aulas = aulasDelHorario(clases).filter(a => !propias.has(a) && horas.every(h =>
        !clases.get(a).has(`${dia}|${h}`)
        && !(ocupadas || []).some(o => o.hora === h && o.recurso_id === 'LIBRES' && o.aula_libre === a)
      )).map(a => ({ aula: a, ...describirAula(a) }));
      return Response.json({ ...perfil, aulas });
    }

    if (vista === 'mias') {
      const { data, error } = await sb.from('reservas').select('*')
        .eq('profesor_id', sesion.id).order('fecha', { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      return Response.json({ ...perfil, solicitudes: porSolicitud(data || [], porId) });
    }

    if (vista === 'gestion') {
      if (!misRecursos.length) return Response.json({ error: 'No eres responsable de ningún recurso' }, { status: 403 });
      const pedido = p.get('recurso');
      const ids = pedido ? misRecursos.filter(id => id === pedido) : misRecursos;
      const desde = esFecha(p.get('desde')) ? p.get('desde') : sumarDias(ahoraEnCentro().fecha, -30);
      const { data, error } = await sb.from('reservas').select('*')
        .in('recurso_id', ids).gte('fecha', desde).order('fecha', { ascending: true }).limit(3000);
      if (error) throw new Error(error.message);
      return Response.json({ ...perfil, solicitudes: porSolicitud(data || [], porId) });
    }

    if (vista === 'ahora') {
      if (!misRecursos.length) return Response.json({ error: 'Sin acceso' }, { status: 403 });
      const { fecha, minutos } = ahoraEnCentro();
      const hora = Number(Object.keys(FRANJAS).find(h => minutos >= FRANJAS[h][0] && minutos < FRANJAS[h][1])) || null;
      const { data } = await sb.from('reservas').select('*')
        .eq('fecha', fecha).eq('estado', 'aceptada').in('recurso_id', misRecursos)
        .order('hora', { ascending: true });
      return Response.json({ ...perfil, fecha, hora, reservas: (data || []).map(r => ({ ...r, recurso: porId[r.recurso_id]?.nombre || r.recurso_id })) });
    }

    if (vista === 'registro') {
      if (!esDirectivo(sesion) && !misRecursos.length) return Response.json({ error: 'Sin acceso' }, { status: 403 });
      const desde = p.get('desde'), hasta = p.get('hasta');
      if (!esFecha(desde) || !esFecha(hasta) || hasta < desde) return Response.json({ error: 'Fechas no válidas' }, { status: 400 });
      const { data, error } = await sb.from('reservas').select('*')
        .in('recurso_id', misRecursos).gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: true }).order('hora', { ascending: true }).limit(10000);
      if (error) throw new Error(error.message);
      return Response.json({ ...perfil, filas: (data || []).map(r => ({ ...r, recurso: porId[r.recurso_id]?.nombre || r.recurso_id })) });
    }

    // Para dar de alta una reserva a nombre de otro profesor
    if (vista === 'profesores') {
      if (!misRecursos.length) return Response.json({ error: 'Sin acceso' }, { status: 403 });
      const filas = await todas(() => sb.from('profesores').select('id, nombre, apellidos, email').order('apellidos'));
      return Response.json({
        profesores: filas.map(f => ({ id: f.id, nombre: `${f.apellidos || ''}, ${f.nombre || ''}`.replace(/^, |, $/g, '').trim(), email: f.email || '' })),
      });
    }

    return Response.json({ error: 'Vista desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────
// ESCRITURA
//   solicitar · retirar · resolver · alta · modificar · anular
// ─────────────────────────────────────────────────────────────────────

/** Comprueba que cada (fecha, hora) se puede reservar. Devuelve el primer problema o null. */
async function comprobarHuecos(sb, recurso, fechas, horas, aulaLibre, ignorarIds = []) {
  const hoy = ahoraEnCentro().fecha;
  const desde = fechas[0], hasta = fechas[fechas.length - 1];
  const ocu = await ocupacion(sb, recurso, desde, hasta, aulaLibre);
  for (const f of fechas) {
    if (f < hoy) return `El ${f} ya ha pasado`;
    for (const h of horas) {
      const c = ocu[f]?.horas?.[h];
      if (!c) return `No se pudo comprobar el ${f}`;
      if (c.estado === 'no_lectivo') return `El ${f} no es lectivo`;
      if (c.estado === 'clase') return `El ${f} a ${h}ª hay clase en esa aula (${c.grupo})`;
      if (c.estado === 'reservada') {
        // ¿Es una de las que se están modificando?
        let q = sb.from('reservas').select('id').eq('recurso_id', recurso.id)
          .eq('fecha', f).eq('hora', h).eq('estado', 'aceptada');
        if (aulaLibre) q = q.eq('aula_libre', aulaLibre);
        const { data } = await q;
        const otras = (data || []).filter(r => !ignorarIds.includes(r.id));
        if (otras.length) return `El ${f} a ${h}ª ya está reservada (${c.quien})`;
      }
    }
  }
  return null;
}

function datosSolicitud(d) {
  const fechas = [...new Set((d.fechas || []).filter(esFecha))].sort();
  const horas = [...new Set((d.horas || []).map(Number).filter(h => HORAS.includes(h)))].sort((a, b) => a - b);
  const grupos = (Array.isArray(d.grupos) ? d.grupos : []).map(g => texto(g, 80)).filter(Boolean).slice(0, 20);
  return {
    fechas, horas, grupos,
    actividad: texto(d.actividad, 1000),
    recursos_uso: texto(d.recursos_uso, 1000) || null,
    aula_libre: d.aula_libre ? normalizaAula(d.aula_libre) : null,
  };
}

export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, datos } = await request.json();
    const d = datos || {};
    const sb = supa();
    const yo = await fichaDe(sb, sesion.id);
    if (!yo) return Response.json({ error: 'No se encuentra tu ficha' }, { status: 400 });
    const lista = await recursos(sb);
    const porId = Object.fromEntries(lista.map(r => [r.id, r]));
    const ahora = new Date().toISOString();

    // ─── El profesor pide la reserva ───
    // También la usa el responsable para dar de alta («alta»): queda aceptada
    if (accion === 'solicitar' || accion === 'alta') {
      const recurso = porId[d.recurso_id];
      if (!recurso) return Response.json({ error: 'Elige el aula o el material' }, { status: 400 });
      const s = datosSolicitud(d);
      if (!s.fechas.length) return Response.json({ error: 'Marca al menos un día' }, { status: 400 });
      if (!s.horas.length) return Response.json({ error: 'Marca al menos una hora' }, { status: 400 });
      if (!s.actividad) return Response.json({ error: 'Indica la actividad o proyecto' }, { status: 400 });
      if (!s.grupos.length) return Response.json({ error: 'Indica con qué grupo o grupos' }, { status: 400 });
      if (recurso.tipo === 'libres') {
        if (!s.aula_libre || !describirAula(s.aula_libre)) return Response.json({ error: 'Elige el aula' }, { status: 400 });
        if (lista.some(r => r.aula_horario && normalizaAula(r.aula_horario) === s.aula_libre)) {
          return Response.json({ error: 'Esa aula tiene su propia opción en la lista: pídela desde ahí' }, { status: 400 });
        }
      } else {
        s.aula_libre = null;
      }
      if (s.fechas.length * s.horas.length > 400) return Response.json({ error: 'Demasiadas horas en una sola solicitud' }, { status: 400 });

      // Alta directa: solo quien gestiona el recurso, y puede ponerla a nombre de otro
      let titular = yo;
      if (accion === 'alta') {
        if (!gestiona(sesion, yo, recurso)) return Response.json({ error: 'No gestionas este recurso' }, { status: 403 });
        if (d.profesor_id) {
          titular = await fichaDe(sb, d.profesor_id);
          if (!titular) return Response.json({ error: 'No existe ese profesor' }, { status: 400 });
        }
      }

      const problema = await comprobarHuecos(sb, recurso, s.fechas, s.horas, s.aula_libre);
      if (problema) return Response.json({ error: problema }, { status: 409 });

      const serie = randomUUID();
      const estado = accion === 'alta' ? 'aceptada' : 'pendiente';
      const filas = s.fechas.flatMap(fecha => s.horas.map(hora => ({
        recurso_id: recurso.id, aula_libre: s.aula_libre, fecha, hora,
        profesor_id: titular.id, solicitante_nombre: nombreDe(titular), solicitante_email: titular.email || '',
        actividad: s.actividad, grupos: s.grupos, recursos_uso: s.recursos_uso,
        serie_id: serie, estado,
        ...(estado === 'aceptada' ? { resuelta_por: sesion.id, resuelta_en: ahora } : {}),
      })));
      const { error } = await sb.from('reservas').insert(filas);
      if (error) {
        if (error.code === '23505') return Response.json({ error: 'Alguien acaba de reservar alguna de esas horas. Recarga.' }, { status: 409 });
        throw new Error(error.message);
      }

      const nombreRecurso = recurso.nombre + (s.aula_libre ? ` (${s.aula_libre})` : '');
      const resumen = resumenDias(filas);
      if (accion === 'solicitar') {
        const ids = (await idsResponsables(sb, recurso)).filter(id => id !== sesion.id);
        await avisar(sb, ids, '📅 Nueva solicitud de reserva',
          `${nombreDe(yo)} pide ${nombreRecurso}: ${resumen}`, '/reservas?vista=gestion');
      } else {
        const ids = [titular.id, ...(await idsResponsables(sb, recurso)), ...(await idsDirectivos(sb))]
          .filter(id => id !== sesion.id);
        await avisar(sb, ids, '📅 Reserva dada de alta',
          `${nombreRecurso} para ${nombreDe(titular)}: ${resumen}`, '/reservas?vista=mias');
      }
      return Response.json({ ok: true, serie_id: serie, horas: filas.length });
    }

    // A partir de aquí se trabaja sobre una solicitud existente
    const serieId = d.serie_id;
    if (!serieId) return Response.json({ error: 'Falta la solicitud' }, { status: 400 });
    const { data: filasSerie, error: eS } = await sb.from('reservas').select('*').eq('serie_id', serieId);
    if (eS) throw new Error(eS.message);
    if (!filasSerie?.length) return Response.json({ error: 'No existe esa solicitud' }, { status: 404 });
    const base = filasSerie[0];
    const recurso = porId[base.recurso_id];
    const nombreRecurso = (recurso?.nombre || base.recurso_id) + (base.aula_libre ? ` (${base.aula_libre})` : '');

    // ─── El profesor retira su solicitud (o la anula ya aceptada) ───
    if (accion === 'retirar') {
      if (base.profesor_id !== sesion.id) return Response.json({ error: 'No es tuya' }, { status: 403 });
      const vivas = filasSerie.filter(f => ['pendiente', 'aceptada'].includes(f.estado)
        && (!d.ids?.length || d.ids.includes(f.id)));
      if (!vivas.length) return Response.json({ error: 'No queda nada que anular' }, { status: 400 });
      const { error } = await sb.from('reservas').update({
        estado: 'anulada', motivo: 'Anulada por el profesor', resuelta_por: sesion.id, resuelta_en: ahora,
      }).in('id', vivas.map(f => f.id));
      if (error) throw new Error(error.message);
      if (vivas.some(f => f.estado === 'aceptada')) {
        const ids = (await idsResponsables(sb, recurso)).filter(id => id !== sesion.id);
        await avisar(sb, ids, '📅 Reserva anulada', `${nombreDe(yo)} anula ${nombreRecurso}: ${resumenDias(vivas)}`, '/reservas?vista=gestion');
      }
      return Response.json({ ok: true });
    }

    // Lo que queda es de quien gestiona el recurso
    if (!gestiona(sesion, yo, recurso)) return Response.json({ error: 'No gestionas este recurso' }, { status: 403 });

    // ─── El responsable resuelve: acepta (quitando días si quiere) o deniega ───
    if (accion === 'resolver') {
      const decision = d.decision;
      const motivo = texto(d.motivo, 1000);
      if (!['aceptar', 'denegar'].includes(decision)) return Response.json({ error: 'Decisión no válida' }, { status: 400 });
      if (decision === 'denegar' && !motivo) return Response.json({ error: 'Para denegar hay que dar el motivo' }, { status: 400 });
      const pendientes = filasSerie.filter(f => f.estado === 'pendiente');
      if (!pendientes.length) return Response.json({ error: 'Esta solicitud ya está resuelta' }, { status: 400 });

      const quitar = new Set(decision === 'denegar' ? pendientes.map(f => f.id) : (d.quitar || []));
      const aceptar = pendientes.filter(f => !quitar.has(f.id));
      const denegar = pendientes.filter(f => quitar.has(f.id));
      const conflictos = [];

      for (const f of aceptar) {
        const { data: act, error } = await sb.from('reservas')
          .update({ estado: 'aceptada', motivo: null, resuelta_por: sesion.id, resuelta_en: ahora })
          .eq('id', f.id).eq('estado', 'pendiente').select('id');
        if (error) {
          if (error.code === '23505') { conflictos.push(f); continue; }
          throw new Error(error.message);
        }
        if (!act?.length) conflictos.push(f);
      }
      const motivoDenegar = decision === 'denegar' ? motivo : (motivo || 'Ajustada por el responsable para dejar sitio a otros grupos');
      const idsDenegar = [...denegar, ...conflictos].map(f => f.id);
      if (idsDenegar.length) {
        await sb.from('reservas').update({
          estado: 'denegada', motivo: conflictos.length && !denegar.length ? 'Esa hora ya estaba reservada' : motivoDenegar,
          resuelta_por: sesion.id, resuelta_en: ahora,
        }).in('id', idsDenegar).eq('estado', 'pendiente');
      }

      const aceptadas = aceptar.length - conflictos.length;
      const cuerpo = aceptadas === 0
        ? `Denegada: ${nombreRecurso}. ${motivoDenegar}`
        : idsDenegar.length
          ? `Aceptada en parte: ${nombreRecurso}, ${aceptadas} de ${pendientes.length} horas. ${motivoDenegar}`
          : `Aceptada: ${nombreRecurso}, ${resumenDias(aceptar)}`;
      if (base.profesor_id && base.profesor_id !== sesion.id) {
        await avisar(sb, [base.profesor_id], '📅 Tu solicitud de reserva', cuerpo, '/reservas?vista=mias');
      }
      return Response.json({ ok: true, aceptadas, denegadas: idsDenegar.length, conflictos: conflictos.length });
    }

    // ─── Cambiar una reserva: día, hora y datos ───
    if (accion === 'modificar') {
      const fila = filasSerie.find(f => f.id === d.id);
      if (!fila) return Response.json({ error: 'No existe esa hora en la solicitud' }, { status: 404 });
      if (!['pendiente', 'aceptada'].includes(fila.estado)) return Response.json({ error: 'Esa hora ya no está activa' }, { status: 400 });
      const cambios = {};
      const fecha = esFecha(d.fecha) ? d.fecha : fila.fecha;
      const hora = HORAS.includes(Number(d.hora)) ? Number(d.hora) : fila.hora;
      if (fecha !== fila.fecha || hora !== fila.hora) {
        const problema = await comprobarHuecos(sb, recurso, [fecha], [hora], fila.aula_libre, [fila.id]);
        if (problema) return Response.json({ error: problema }, { status: 409 });
        Object.assign(cambios, { fecha, hora });
      }
      // Los datos de la actividad se cambian en toda la solicitud
      const comunes = {};
      if (d.actividad != null && texto(d.actividad, 1000)) comunes.actividad = texto(d.actividad, 1000);
      if (Array.isArray(d.grupos) && d.grupos.length) comunes.grupos = d.grupos.map(g => texto(g, 80)).filter(Boolean).slice(0, 20);
      if (d.recursos_uso != null) comunes.recursos_uso = texto(d.recursos_uso, 1000) || null;

      if (Object.keys(cambios).length) {
        const { error } = await sb.from('reservas').update({ ...cambios, resuelta_por: sesion.id, resuelta_en: ahora }).eq('id', fila.id);
        if (error) {
          if (error.code === '23505') return Response.json({ error: 'Esa hora ya está reservada' }, { status: 409 });
          throw new Error(error.message);
        }
      }
      if (Object.keys(comunes).length) {
        const { error } = await sb.from('reservas').update(comunes).eq('serie_id', serieId);
        if (error) throw new Error(error.message);
      }
      const detalle = cambios.fecha ? `pasa al ${resumenDias([{ fecha, hora }])}` : 'cambian los datos de la actividad';
      const ids = [base.profesor_id, ...(await idsResponsables(sb, recurso)), ...(await idsDirectivos(sb))]
        .filter(id => id && id !== sesion.id);
      await avisar(sb, ids, '📅 Reserva modificada', `${nombreRecurso} de ${base.solicitante_nombre}: ${detalle}`, '/reservas?vista=mias');
      return Response.json({ ok: true });
    }

    // ─── Anular horas (o la solicitud entera) ───
    if (accion === 'anular') {
      const motivo = texto(d.motivo, 1000);
      if (!motivo) return Response.json({ error: 'Escribe el motivo' }, { status: 400 });
      const vivas = filasSerie.filter(f => ['pendiente', 'aceptada'].includes(f.estado)
        && (!d.ids?.length || d.ids.includes(f.id)));
      if (!vivas.length) return Response.json({ error: 'No queda nada que anular' }, { status: 400 });
      const { error } = await sb.from('reservas').update({
        estado: 'anulada', motivo, resuelta_por: sesion.id, resuelta_en: ahora,
      }).in('id', vivas.map(f => f.id));
      if (error) throw new Error(error.message);
      const ids = [base.profesor_id, ...(await idsResponsables(sb, recurso)), ...(await idsDirectivos(sb))]
        .filter(id => id && id !== sesion.id);
      await avisar(sb, ids, '📅 Reserva anulada',
        `${nombreRecurso} de ${base.solicitante_nombre}: ${resumenDias(vivas)}. ${motivo}`, '/reservas?vista=mias');
      return Response.json({ ok: true, anuladas: vivas.length });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
