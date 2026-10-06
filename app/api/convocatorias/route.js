/**
 * CONVOCATORIAS OFICIALES — reuniones con fichaje y votaciones en la sala
 *
 * Módulo nuevo, aparte de /api/comunicaciones y /api/votaciones (que no
 * se tocan). Ciclo de una convocatoria:
 *
 *   borrador  → se prepara: datos, orden del día, convocados y las
 *               votaciones de cada punto. Solo la ve el equipo directivo.
 *   convocada → les llega a los convocados, que dicen si asistirán.
 *   en_curso  → la reunión: se abre el fichaje y se lanzan las
 *               votaciones preparadas, una a una.
 *   cerrada   → queda el borrador del acta.
 *
 * Los convocados se guardan nombre a nombre. Nada de «ámbitos» que se
 * resuelven después: lo que se convocó es lo que consta en el acta.
 *
 * Las reglas del voto (solo quien ha fichado, una vez, dentro de plazo,
 * secreto) las hace cumplir la base de datos con conv_votar,
 * conv_lanzar_votacion y conv_cerrar_votacion. Aquí solo se llama.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal } from '@/lib/fechas';
import { enviarPushA } from '@/lib/pushServidor';
import { randomBytes, timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

let _cliente = null;
function supa() {
  if (!_cliente) {
    _cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      claveServidor(),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _cliente;
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

const json = (d, status = 200) => Response.json(d, { status });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORGANOS = ['claustro', 'ccp', 'departamento', 'equipo_directivo', 'equipo', 'otro'];
const MODALIDADES = ['presencial', 'online'];
const MODOS_FICHAJE = ['fisico', 'notificacion'];   // 'pantalla' (QR dinámico) llegará después

// Fichaje físico: se abre solo MEDIA HORA ANTES de la hora de la
// reunión y se cierra 15 MINUTOS DESPUÉS. Quien ficha pasada la hora de
// inicio consta en el acta como «incorporado tarde».
const ANTES_MIN = 30;
const DESPUES_MIN = 15;

const MENSAJES = {
  no_existe: 'Esa votación no existe',
  cerrada: 'La votación está cerrada',
  no_presente: 'Solo pueden votar quienes han pasado lista en la reunión',
  opcion_no_valida: 'Esa opción no es válida',
  ya_votado: 'Ya has votado en esta votación',
  ya_lanzada: 'Esa votación ya se lanzó',
  reunion_no_iniciada: 'Primero hay que iniciar la reunión',
  otra_abierta: 'Hay otra votación abierta. Ciérrala antes de lanzar esta',
  faltan_opciones: 'La votación necesita al menos dos opciones',
  no_lanzada: 'Esa votación todavía no se ha lanzado',
};

// ─── Utilidades ──────────────────────────────────────────────────────

const txt = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const idNum = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };

function fichajeAbierto(c) {
  if (!c.fichaje_inicio || !c.fichaje_fin) return false;
  const t = Date.now();
  return t >= new Date(c.fichaje_inicio).getTime() && t < new Date(c.fichaje_fin).getTime();
}

/**
 * «2026-10-15» + «17:00» (hora de Madrid) → instante real (Date).
 * Se calcula el desfase de Madrid ese día concreto, así que vale igual
 * en horario de verano que de invierno.
 */
function instanteMadrid(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '') || !/^\d{1,2}:\d{2}/.test(hora || '')) return null;
  const [y, mo, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  const supuesto = Date.UTC(y, mo - 1, d, h, mi);
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(supuesto)).map(p => [p.type, p.value]));
  const comoMadrid = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
  return new Date(supuesto - (comoMadrid - supuesto));
}

/** Ventana del fichaje físico, o null si falta fecha u hora */
function ventanaFisica(fecha, hora) {
  const inicio = instanteMadrid(fecha, hora);
  if (!inicio) return null;
  return {
    fichaje_inicio: new Date(inicio.getTime() - ANTES_MIN * 60000).toISOString(),
    fichaje_fin: new Date(inicio.getTime() + DESPUES_MIN * 60000).toISOString(),
  };
}

/** ¿Fichó después de la hora de inicio? */
function esTarde(c, fichadoAt) {
  const inicio = instanteMadrid(c.fecha, c.hora);
  return !!(inicio && fichadoAt && new Date(fichadoAt).getTime() > inicio.getTime() + 59999);
}

const nuevoToken = () => randomBytes(18).toString('base64url');

function mismoTexto(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Identificador del móvil que manda el navegador: solo letras y números */
const limpiaDispositivo = v => String(v || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || null;

function fechaCorta(f) {
  if (!f) return '';
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** «Luis Javier Cárdenas Calcerrada» → «Luis J. Cárdenas» (para el tablero) */
function nombreCorto(nombre, apellidos) {
  const n = (nombre || '').trim().split(/\s+/).filter(Boolean);
  const a = (apellidos || '').trim().split(/\s+/).filter(Boolean);
  if (!n.length) return a[0] || '';
  return `${n[0]}${n[1] ? ` ${n[1][0]}.` : ''} ${a[0] || ''}`.trim();
}

function limpiarOrdenDia(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 40)
    .map(p => ({ texto: txt(p?.texto, 500), desarrollo: txt(p?.desarrollo, 20000) }))
    .filter(p => p.texto);
}

function limpiarOpciones(lista) {
  const vistas = new Set();
  const out = [];
  for (const o of Array.isArray(lista) ? lista : []) {
    const t = txt(o, 80);
    if (t && !vistas.has(t.toLowerCase())) { vistas.add(t.toLowerCase()); out.push(t); }
  }
  return out.slice(0, 8);
}

async function convocatoria(cliente, id) {
  const { data } = await cliente.from('convocatorias').select('*').eq('id', id);
  return (data || [])[0] || null;
}

/** Cierra y sella las votaciones a las que se les acabó el tiempo */
async function cerrarVencidas(cliente, convIds) {
  if (!convIds.length) return;
  const { data } = await cliente.from('convocatoria_votaciones')
    .select('id').in('convocatoria_id', convIds)
    .eq('estado', 'abierta').lte('cierre_at', new Date().toISOString());
  for (const v of data || []) {
    await cliente.rpc('conv_cerrar_votacion', { p_votacion: v.id });
  }
}

/** Votaciones de unas convocatorias, con participación y (si están cerradas) recuento */
async function votacionesDe(cliente, convIds) {
  if (!convIds.length) return [];
  const { data: vs } = await cliente.from('convocatoria_votaciones')
    .select('*').in('convocatoria_id', convIds)
    .order('punto', { ascending: true, nullsFirst: false })
    .order('orden', { ascending: true });
  const lista = vs || [];
  const ids = lista.filter(v => v.estado !== 'preparada').map(v => v.id);
  if (!ids.length) return lista.map(v => ({ ...v, participantes: 0 }));

  const { data: vot } = await cliente.from('convocatoria_votantes')
    .select('votacion_id').in('votacion_id', ids);
  const part = {};
  for (const x of vot || []) part[x.votacion_id] = (part[x.votacion_id] || 0) + 1;

  // El recuento solo sale de la base de datos para las cerradas. De una
  // abierta no viaja ni al servidor siquiera.
  const cerradas = lista.filter(v => v.estado === 'cerrada').map(v => v.id);
  const rec = {};
  if (cerradas.length) {
    const { data: r } = await cliente.from('convocatoria_recuento')
      .select('votacion_id, opcion, n').in('votacion_id', cerradas);
    for (const x of r || []) (rec[x.votacion_id] ||= {})[x.opcion] = x.n;
  }

  return lista.map(v => {
    const fila = { ...v, participantes: part[v.id] || 0 };
    if (v.estado === 'cerrada') {
      fila.recuento = {};
      for (const o of v.opciones || []) fila.recuento[o] = rec[v.id]?.[o] || 0;
      fila.totalVotos = Object.values(fila.recuento).reduce((a, b) => a + b, 0);
    }
    return fila;
  });
}

async function censoActivo(cliente) {
  const { data } = await cliente.from('profesores')
    .select('id, nombre, apellidos, departamento, rol, rol_gestion, tipo_contrato')
    .eq('estado', 'activo').order('apellidos');
  return (data || []).filter(p => p.tipo_contrato !== 'Plaza vacante');
}

// ═════════════════════════════════════════════════════════════════════
//  GET
// ═════════════════════════════════════════════════════════════════════

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return json({ error: 'sin_sesion' }, 401);

  const cliente = supa();
  const url = new URL(request.url);
  const modo = url.searchParams.get('modo') || 'mias';

  try {
    // ── Las mías (profesorado) ──
    // Lo que se consulta en bucle el día de la reunión: tiene que ser ligero.
    if (modo === 'mias') {
      const { data } = await cliente.from('convocatorias')
        .select('id, titulo, organo, fecha, hora, lugar, orden_dia, estado, fichaje_inicio, fichaje_fin, modalidad, modo_fichaje')
        .contains('convocados', [sesion.id])
        .in('estado', ['convocada', 'en_curso'])
        .order('fecha', { ascending: true });
      const hoy = hoyLocal();
      const lista = (data || []).filter(c => c.estado === 'en_curso' || !c.fecha || c.fecha >= hoy);
      const ids = lista.map(c => c.id);

      let mias = [];
      if (ids.length) {
        const { data: a } = await cliente.from('convocatoria_asistencia')
          .select('convocatoria_id, asistira, fichado_at')
          .in('convocatoria_id', ids).eq('profesor_id', sesion.id);
        mias = a || [];
      }

      const enCurso = lista.filter(c => c.estado === 'en_curso').map(c => c.id);
      await cerrarVencidas(cliente, enCurso);
      const vots = await votacionesDe(cliente, enCurso);

      let yaVotadas = new Set();
      const lanzadas = vots.filter(v => v.estado !== 'preparada').map(v => v.id);
      if (lanzadas.length) {
        const { data: yo } = await cliente.from('convocatoria_votantes')
          .select('votacion_id').in('votacion_id', lanzadas).eq('profesor_id', sesion.id);
        yaVotadas = new Set((yo || []).map(x => x.votacion_id));
      }

      const salida = lista.map(c => {
        const yo = mias.find(m => m.convocatoria_id === c.id) || null;
        const fichado = !!yo?.fichado_at;
        const suyas = vots.filter(v => v.convocatoria_id === c.id);
        const abierta = suyas.find(v => v.estado === 'abierta');
        return {
          ...c,
          fichajeAbierto: fichajeAbierto(c),
          asistira: yo?.asistira ?? null,
          fichado,
          // La votación abierta, solo a quien ha fichado
          votacion: abierta && fichado ? {
            id: abierta.id, pregunta: abierta.pregunta, opciones: abierta.opciones,
            punto: abierta.punto, cierre_at: abierta.cierre_at, yaVote: yaVotadas.has(abierta.id),
          } : null,
          // Resultados de lo ya votado, para los presentes
          resultados: fichado
            ? suyas.filter(v => v.estado === 'cerrada').map(v => ({
                id: v.id, pregunta: v.pregunta, punto: v.punto,
                recuento: v.recuento, totalVotos: v.totalVotos,
              }))
            : [],
        };
      });
      return json({ ahora: new Date().toISOString(), convocatorias: salida });
    }

    // ── A partir de aquí, equipo directivo ──
    if (!esDirectivo(sesion)) return json({ error: 'sin_permisos' }, 403);

    if (modo === 'lista') {
      const { data } = await cliente.from('convocatorias')
        .select('id, titulo, organo, convocados_texto, convocados, fecha, hora, lugar, estado, fichaje_inicio, fichaje_fin, modalidad, modo_fichaje, creada_por_nombre, created_at')
        .order('fecha', { ascending: false, nullsFirst: true })
        .order('created_at', { ascending: false });
      const lista = data || [];
      const ids = lista.map(c => c.id);
      let asis = [], vots = [];
      if (ids.length) {
        const r1 = await cliente.from('convocatoria_asistencia')
          .select('convocatoria_id, asistira, fichado_at').in('convocatoria_id', ids);
        asis = r1.data || [];
        const r2 = await cliente.from('convocatoria_votaciones')
          .select('convocatoria_id, estado').in('convocatoria_id', ids);
        vots = r2.data || [];
      }
      return json({
        convocatorias: lista.map(c => {
          const a = asis.filter(x => x.convocatoria_id === c.id);
          const v = vots.filter(x => x.convocatoria_id === c.id);
          const { convocados, ...resto } = c;
          return {
            ...resto,
            totalConvocados: (convocados || []).length,
            siAsistiran: a.filter(x => x.asistira === true).length,
            noAsistiran: a.filter(x => x.asistira === false).length,
            presentes: a.filter(x => x.fichado_at).length,
            votaciones: v.length,
            votacionesHechas: v.filter(x => x.estado === 'cerrada').length,
            fichajeAbierto: fichajeAbierto(c),
          };
        }),
      });
    }

    if (modo === 'detalle') {
      const id = idNum(url.searchParams.get('id'));
      if (!id) return json({ error: 'falta_id' }, 400);
      const c = await convocatoria(cliente, id);
      if (!c) return json({ error: 'no_encontrada' }, 404);

      await cerrarVencidas(cliente, [id]);
      const votaciones = await votacionesDe(cliente, [id]);

      const { data: a } = await cliente.from('convocatoria_asistencia')
        .select('*').eq('convocatoria_id', id);
      const asis = a || [];

      // Móviles que han fichado por más de una persona
      const porMovil = {};
      for (const x of asis) if (x.dispositivo && x.fichado_at) (porMovil[x.dispositivo] ||= new Set()).add(x.profesor_id);

      let personas = [];
      if ((c.convocados || []).length) {
        const { data: ps } = await cliente.from('profesores')
          .select('id, nombre, apellidos, departamento').in('id', c.convocados);
        personas = (ps || []).map(p => {
          const r = asis.find(x => x.profesor_id === p.id) || {};
          return {
            id: p.id,
            nombre: `${p.apellidos}, ${p.nombre}`,
            departamento: p.departamento || '',
            asistira: r.asistira ?? null,
            respondida_at: r.respondida_at || null,
            fichado_at: r.fichado_at || null,
            fichado_a_mano_por: r.fichado_a_mano_por || null,
            metodo: r.fichado_at ? (r.metodo || (r.fichado_a_mano_por ? 'mano' : 'notificacion')) : null,
            tarde: esTarde(c, r.fichado_at),
            movilCompartido: !!(r.dispositivo && r.fichado_at && porMovil[r.dispositivo]?.size > 1),
          };
        }).sort((x, y) => x.nombre.localeCompare(y.nombre, 'es'));
      }

      return json({
        ahora: new Date().toISOString(),
        convocatoria: { ...c, fichajeAbierto: fichajeAbierto(c) },
        personas,
        votaciones,
      });
    }

    // Etiquetas NFC del centro
    if (modo === 'nfc') {
      const conv = idNum(url.searchParams.get('convocatoria'));
      let q = cliente.from('nfc_etiquetas')
        .select('codigo, nombre, tipo, activa, convocatoria_id, created_at').order('created_at');
      q = conv ? q.eq('convocatoria_id', conv) : q.is('convocatoria_id', null);
      const { data } = await q;
      return json({ etiquetas: data || [] });
    }

    // Pantalla de fichaje para proyectar: quién ha fichado, nunca nada más
    if (modo === 'fichaje') {
      const id = idNum(url.searchParams.get('id'));
      const c = id ? await convocatoria(cliente, id) : null;
      if (!c) return json({ error: 'no_encontrada' }, 404);
      const { data: a } = await cliente.from('convocatoria_asistencia')
        .select('profesor_id, fichado_at').eq('convocatoria_id', id).not('fichado_at', 'is', null);
      const fich = new Map((a || []).map(x => [x.profesor_id, x.fichado_at]));
      let gente = [];
      if ((c.convocados || []).length) {
        const { data: ps } = await cliente.from('profesores')
          .select('id, nombre, apellidos').in('id', c.convocados).order('apellidos');
        gente = ps || [];
      }
      const personas = gente.map(p => ({
        nombre: nombreCorto(p.nombre, p.apellidos),
        fichado: fich.has(p.id),
        tarde: esTarde(c, fich.get(p.id)),
        at: fich.get(p.id) || null,
      }));
      return json({
        ahora: new Date().toISOString(),
        titulo: c.titulo, fecha: c.fecha, hora: c.hora, lugar: c.lugar || '',
        estado: c.estado, fichaje_inicio: c.fichaje_inicio, fichaje_fin: c.fichaje_fin,
        abierto: fichajeAbierto(c),
        total: personas.length,
        presentes: personas.filter(p => p.fichado).length,
        tarde: personas.filter(p => p.tarde).length,
        personas,
      });
    }

    // Para el formulario: quién hay en el centro y en qué grupos encaja
    if (modo === 'censo') {
      const profes = await censoActivo(cliente);
      const { data: eqs } = await cliente.from('equipos').select('id, nombre, miembros').order('nombre');
      return json({
        profesores: profes.map(p => {
          const roles = Array.isArray(p.rol) ? p.rol : [];
          const cargo = (p.rol_gestion || '').toString().trim().toLowerCase();
          return {
            id: p.id,
            nombre: `${p.apellidos}, ${p.nombre}`,
            departamento: p.departamento || '',
            jefeDpto: roles.includes('jefe_departamento'),
            tutor: roles.includes('tutor'),
            directivo: /^(director|secretari|jef[ea])/.test(cargo),
          };
        }),
        equipos: (eqs || []).map(e => ({ id: e.id, nombre: e.nombre, miembros: e.miembros || [] })),
      });
    }

    // Tablero para proyectar: quién ha votado, NUNCA qué. Recuento solo al cerrar.
    if (modo === 'tablero') {
      const vid = idNum(url.searchParams.get('votacion'));
      if (!vid) return json({ error: 'falta_votacion' }, 400);
      const { data: vs } = await cliente.from('convocatoria_votaciones').select('*').eq('id', vid);
      let v = (vs || [])[0];
      if (!v) return json({ error: 'no_encontrada' }, 404);
      if (v.estado === 'abierta' && new Date(v.cierre_at) <= new Date()) {
        await cliente.rpc('conv_cerrar_votacion', { p_votacion: vid });
        v = { ...v, estado: 'cerrada' };
      }
      const c = await convocatoria(cliente, v.convocatoria_id);

      const { data: f } = await cliente.from('convocatoria_asistencia')
        .select('profesor_id').eq('convocatoria_id', v.convocatoria_id).not('fichado_at', 'is', null);
      const presentes = (f || []).map(x => x.profesor_id);
      let gente = [];
      if (presentes.length) {
        const { data: ps } = await cliente.from('profesores')
          .select('id, nombre, apellidos').in('id', presentes).order('apellidos');
        gente = ps || [];
      }
      const { data: vot } = await cliente.from('convocatoria_votantes')
        .select('profesor_id').eq('votacion_id', vid);
      const ya = new Set((vot || []).map(x => x.profesor_id));

      let recuento = null;
      if (v.estado === 'cerrada') {
        const { data: r } = await cliente.from('convocatoria_recuento')
          .select('opcion, n').eq('votacion_id', vid);
        recuento = {};
        for (const o of v.opciones || []) recuento[o] = (r || []).find(x => x.opcion === o)?.n || 0;
      }

      const personas = gente.map(p => ({ nombre: nombreCorto(p.nombre, p.apellidos), votado: ya.has(p.id) }));
      return json({
        ahora: new Date().toISOString(),
        reunion: c?.titulo || '',
        pregunta: v.pregunta,
        punto: v.punto,
        estado: v.estado,
        cierre_at: v.cierre_at,
        opciones: v.opciones || [],
        recuento,
        personas,
        votados: personas.filter(p => p.votado).length,
        total: personas.length,
      });
    }

    return json({ error: 'modo_desconocido' }, 400);
  } catch (e) {
    console.error('GET /api/convocatorias:', e?.message);
    return json({ error: 'Error al leer las convocatorias' }, 500);
  }
}

// ═════════════════════════════════════════════════════════════════════
//  POST
// ═════════════════════════════════════════════════════════════════════

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return json({ error: 'sin_sesion' }, 401);

  let cuerpo;
  try { cuerpo = await request.json(); } catch { return json({ error: 'Petición no válida' }, 400); }
  const { accion, datos = {} } = cuerpo || {};
  const cliente = supa();
  const ahora = () => new Date().toISOString();

  try {
    // ─────────── PROFESORADO ───────────

    if (accion === 'responder' || accion === 'fichar') {
      const c = await convocatoria(cliente, idNum(datos.id));
      if (!c || !(c.convocados || []).includes(sesion.id)) {
        return json({ error: 'Esta convocatoria no va dirigida a ti' }, 403);
      }

      if (accion === 'responder') {
        if (!['convocada', 'en_curso'].includes(c.estado)) return json({ error: 'La convocatoria ya está cerrada' }, 400);
        if (typeof datos.asistira !== 'boolean') return json({ error: 'Indica si asistirás' }, 400);
        const { error } = await cliente.from('convocatoria_asistencia').upsert([{
          convocatoria_id: c.id, profesor_id: sesion.id,
          asistira: datos.asistira, respondida_at: ahora(),
        }], { onConflict: 'convocatoria_id,profesor_id' });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // fichar con el botón del aviso. En las reuniones con fichaje
      // físico no vale: hay que estar en la puerta (QR o NFC).
      if (c.modo_fichaje === 'fisico') {
        return json({ error: 'Esta reunión se ficha en la entrada: escanea el QR o acerca el móvil a la etiqueta NFC' }, 400);
      }
      if (c.estado !== 'en_curso' || !fichajeAbierto(c)) return json({ error: 'El control de asistencia está cerrado' }, 400);
      const { data: ya } = await cliente.from('convocatoria_asistencia')
        .select('fichado_at').eq('convocatoria_id', c.id).eq('profesor_id', sesion.id);
      if ((ya || [])[0]?.fichado_at) return json({ ok: true });   // ya estaba
      const { error } = await cliente.from('convocatoria_asistencia').upsert([{
        convocatoria_id: c.id, profesor_id: sesion.id, fichado_at: ahora(),
        metodo: 'notificacion', dispositivo: limpiaDispositivo(datos.dispositivo),
      }], { onConflict: 'convocatoria_id,profesor_id' });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // Fichaje físico: con el QR del cartel (c + t) o con la etiqueta NFC
    // de la entrada (n). La etiqueta es la misma para todas las
    // reuniones: se ficha en la que tenga el fichaje abierto ahora.
    if (accion === 'fichar_presencia') {
      let c = null, metodo = null;

      if (datos.n) {
        const { data: et } = await cliente.from('nfc_etiquetas')
          .select('codigo, activa, convocatoria_id').eq('codigo', txt(datos.n, 64));
        const etiqueta = (et || [])[0];
        if (!etiqueta?.activa) return json({ error: 'Esta etiqueta no es válida. Avisa al equipo directivo.' }, 400);
        if (etiqueta.convocatoria_id) {
          // Etiqueta grabada para una reunión concreta
          c = await convocatoria(cliente, etiqueta.convocatoria_id);
          if (!c) return json({ error: 'Esta etiqueta es de una reunión que ya no existe' }, 400);
        } else {
          // Etiqueta general: la reunión que tenga el fichaje abierto ahora
          const { data: cs } = await cliente.from('convocatorias')
            .select('*').in('estado', ['convocada', 'en_curso'])
            .contains('convocados', [sesion.id]);
          const abiertas = (cs || []).filter(fichajeAbierto)
            .sort((x, y) => new Date(x.fichaje_inicio) - new Date(y.fichaje_inicio));
          c = abiertas[0] || null;
          if (!c) return json({ error: 'No tienes ninguna reunión con el fichaje abierto en este momento' }, 400);
        }
        metodo = 'nfc';
      } else {
        c = await convocatoria(cliente, idNum(datos.c));
        if (!c || !mismoTexto(c.token_qr, datos.t)) return json({ error: 'Este código QR no es válido' }, 400);
        metodo = 'qr';
      }

      if (!(c.convocados || []).includes(sesion.id)) return json({ error: 'Esta reunión no va dirigida a ti' }, 403);
      // QR y NFC valen en cualquier convocatoria mientras el fichaje esté abierto
      if (!['convocada', 'en_curso'].includes(c.estado) || !fichajeAbierto(c)) {
        const ini = c.fichaje_inicio ? new Date(c.fichaje_inicio) : null;
        if (ini && Date.now() < ini.getTime()) {
          const h = ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
          return json({ error: `Todavía no se puede fichar: se abre a las ${h}` }, 400);
        }
        return json({ error: 'El control de asistencia de esta reunión está cerrado. Avisa al equipo directivo.' }, 400);
      }

      const salida = { ok: true, titulo: c.titulo, lugar: c.lugar || '', metodo };
      const { data: ya } = await cliente.from('convocatoria_asistencia')
        .select('fichado_at').eq('convocatoria_id', c.id).eq('profesor_id', sesion.id);
      if ((ya || [])[0]?.fichado_at) {
        return json({ ...salida, yaEstaba: true, fichado_at: ya[0].fichado_at, tarde: esTarde(c, ya[0].fichado_at) });
      }
      const momento = ahora();
      const { error } = await cliente.from('convocatoria_asistencia').upsert([{
        convocatoria_id: c.id, profesor_id: sesion.id, fichado_at: momento,
        metodo, dispositivo: limpiaDispositivo(datos.dispositivo),
      }], { onConflict: 'convocatoria_id,profesor_id' });
      if (error) return json({ error: 'No se ha podido registrar. Inténtalo otra vez.' }, 500);
      return json({ ...salida, fichado_at: momento, tarde: esTarde(c, momento) });
    }

    if (accion === 'votar') {
      const vid = idNum(datos.votacion_id);
      if (!vid) return json({ error: 'Falta la votación' }, 400);
      const { data: r, error } = await cliente.rpc('conv_votar', {
        p_votacion: vid, p_profesor: sesion.id, p_opcion: txt(datos.opcion, 80),
      });
      if (error) return json({ error: 'No se ha podido registrar el voto' }, 500);
      if (r !== 'ok') return json({ error: MENSAJES[r] || r }, 400);
      return json({ ok: true });
    }

    // ─────────── EQUIPO DIRECTIVO ───────────
    if (!esDirectivo(sesion)) return json({ error: 'sin_permisos' }, 403);

    // Crear o modificar. Qué se puede cambiar depende del momento:
    // antes de la reunión, todo; durante y después, solo lo del acta.
    if (accion === 'guardar') {
      const id = idNum(datos.id);
      const previa = id ? await convocatoria(cliente, id) : null;
      if (id && !previa) return json({ error: 'Esa convocatoria no existe' }, 404);
      const antes = !previa || ['borrador', 'convocada'].includes(previa.estado);

      const fila = {
        orden_dia: limpiarOrdenDia(datos.orden_dia),
        preside: txt(datos.preside, 200) || null,
        secretaria: txt(datos.secretaria, 200) || null,
      };
      if (antes) {
        const titulo = txt(datos.titulo, 200);
        if (!titulo) return json({ error: 'Ponle un título' }, 400);
        Object.assign(fila, {
          titulo,
          organo: ORGANOS.includes(datos.organo) ? datos.organo : 'otro',
          convocados_texto: txt(datos.convocados_texto, 200) || null,
          convocados: [...new Set((Array.isArray(datos.convocados) ? datos.convocados : []).filter(x => UUID.test(String(x))))],
          fecha: /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha || '') ? datos.fecha : null,
          hora: txt(datos.hora, 20) || null,
          lugar: txt(datos.lugar, 200) || null,
          modalidad: MODALIDADES.includes(datos.modalidad) ? datos.modalidad : 'presencial',
          modo_fichaje: MODOS_FICHAJE.includes(datos.modo_fichaje) ? datos.modo_fichaje : 'notificacion',
        });
        // En las online no hay puerta: de momento, fichaje por notificación
        if (fila.modalidad === 'online') fila.modo_fichaje = 'notificacion';
        // Ya enviada: si es física, la ventana sigue a la fecha y la hora
        if (previa?.estado === 'convocada') {
          if (fila.modo_fichaje === 'fisico') {
            const v = ventanaFisica(fila.fecha, fila.hora);
            if (!v) return json({ error: 'El fichaje en la entrada necesita fecha y hora' }, 400);
            Object.assign(fila, v);
            if (!previa.token_qr) fila.token_qr = nuevoToken();
          } else if (previa.modo_fichaje === 'fisico') {
            Object.assign(fila, { fichaje_inicio: null, fichaje_fin: null });
          }
        }
        if (previa?.estado === 'convocada') {
          if (!fila.fecha) return json({ error: 'Una convocatoria ya enviada necesita fecha' }, 400);
          if (!fila.convocados.length) return json({ error: 'Una convocatoria ya enviada necesita convocados' }, 400);
        }
      }

      if (!previa) {
        const { data, error } = await cliente.from('convocatorias').insert([{
          ...fila, estado: 'borrador',
          creada_por: sesion.id, creada_por_nombre: sesion.nombre || 'Dirección',
        }]).select('id');
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id: (data || [])[0]?.id });
      }

      const { error } = await cliente.from('convocatorias').update(fila).eq('id', previa.id);
      if (error) return json({ error: error.message }, 500);

      // Si ya estaba enviada y se añade a alguien, se le avisa a él
      if (previa.estado === 'convocada') {
        const nuevos = fila.convocados.filter(x => !(previa.convocados || []).includes(x));
        if (nuevos.length) {
          await enviarPushA(cliente, nuevos, {
            titulo: `📅 Convocatoria: ${fila.titulo}`,
            cuerpo: [fechaCorta(fila.fecha), fila.hora, fila.lugar].filter(Boolean).join(' · '),
            url: '/convocatorias',
          });
        }
      }
      return json({ ok: true, id: previa.id });
    }

    // ── Etiquetas NFC ──
    if (accion === 'nfc_crear') {
      const convId = idNum(datos.convocatoria_id);
      let nombre = txt(datos.nombre, 100);
      if (convId) {
        const cv = await convocatoria(cliente, convId);
        if (!cv) return json({ error: 'Esa convocatoria no existe' }, 404);
        if (cv.estado === 'cerrada') return json({ error: 'La reunión ya está cerrada' }, 400);
        const { count } = await cliente.from('nfc_etiquetas')
          .select('codigo', { count: 'exact', head: true }).eq('convocatoria_id', convId);
        nombre = nombre || `${cv.titulo} · etiqueta ${(count || 0) + 1}`;
      }
      if (!nombre) return json({ error: 'Ponle un nombre a la etiqueta (dónde va pegada)' }, 400);
      const codigo = randomBytes(9).toString('base64url');
      const { error } = await cliente.from('nfc_etiquetas')
        .insert([{ codigo, nombre, tipo: 'fija', convocatoria_id: convId || null }]);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, codigo });
    }

    // Código del QR del cartel: se crea la primera vez que se pide
    if (accion === 'preparar_qr') {
      const cv = await convocatoria(cliente, idNum(datos.id));
      if (!cv) return json({ error: 'Esa convocatoria no existe' }, 404);
      if (cv.estado === 'borrador') return json({ error: 'Primero hay que convocarla' }, 400);
      if (cv.token_qr) return json({ ok: true, token: cv.token_qr });
      const token = nuevoToken();
      const { error } = await cliente.from('convocatorias').update({ token_qr: token }).eq('id', cv.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, token });
    }
    if (accion === 'nfc_activar') {
      const { error } = await cliente.from('nfc_etiquetas')
        .update({ activa: datos.activa === true }).eq('codigo', txt(datos.codigo, 64));
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // El resto de acciones trabajan sobre una convocatoria existente
    const acciones = ['convocar', 'iniciar', 'abrir_fichaje', 'cerrar_fichaje', 'reenviar_fichaje', 'ampliar_fichaje', 'fichar_a_mano',
                      'finalizar', 'reanudar', 'eliminar', 'guardar_votacion'];
    if (acciones.includes(accion)) {
      const c = await convocatoria(cliente, idNum(datos.id ?? datos.convocatoria_id));
      if (!c) return json({ error: 'Esa convocatoria no existe' }, 404);

      if (accion === 'convocar') {
        if (c.estado !== 'borrador') return json({ error: 'Ya estaba convocada' }, 400);
        if (!c.fecha) return json({ error: 'Falta la fecha de la reunión' }, 400);
        if (!(c.convocados || []).length) return json({ error: 'No hay nadie convocado' }, 400);
        const cambios = { estado: 'convocada', convocada_at: ahora() };
        if (c.modo_fichaje === 'fisico') {
          const v = ventanaFisica(c.fecha, c.hora);
          if (!v) return json({ error: 'El fichaje en la entrada necesita la hora de la reunión' }, 400);
          Object.assign(cambios, v, { token_qr: c.token_qr || nuevoToken() });
        }
        const { error } = await cliente.from('convocatorias')
          .update(cambios).eq('id', c.id).eq('estado', 'borrador');
        if (error) return json({ error: error.message }, 500);
        const r = await enviarPushA(cliente, c.convocados, {
          titulo: `📅 Convocatoria: ${c.titulo}`,
          cuerpo: [fechaCorta(c.fecha), c.hora, c.lugar].filter(Boolean).join(' · '),
          url: '/convocatorias',
        });
        return json({ ok: true, avisados: r.enviados });
      }

      if (accion === 'iniciar') {
        if (c.estado !== 'convocada') return json({ error: 'Solo se puede iniciar una convocatoria enviada' }, 400);
        const { error } = await cliente.from('convocatorias')
          .update({ estado: 'en_curso', inicio_real: ahora() }).eq('id', c.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      if (accion === 'abrir_fichaje') {
        if (!['convocada', 'en_curso'].includes(c.estado)) return json({ error: 'La reunión no está en marcha' }, 400);
        const min = Math.min(Math.max(parseInt(datos.minutos, 10) || 10, 1), 180);
        const cambios = {
          fichaje_inicio: ahora(),
          fichaje_fin: new Date(Date.now() + min * 60000).toISOString(),
        };
        // Abrir el fichaje inicia la reunión si no se había iniciado
        if (c.estado === 'convocada') Object.assign(cambios, { estado: 'en_curso', inicio_real: ahora() });
        const { error } = await cliente.from('convocatorias').update(cambios).eq('id', c.id);
        if (error) return json({ error: error.message }, 500);

        const { data: f } = await cliente.from('convocatoria_asistencia')
          .select('profesor_id').eq('convocatoria_id', c.id).not('fichado_at', 'is', null);
        const yaFichados = new Set((f || []).map(x => x.profesor_id));
        const r = await enviarPushA(cliente, (c.convocados || []).filter(x => !yaFichados.has(x)), {
          titulo: '✋ Ficha tu asistencia',
          cuerpo: `${c.titulo} — tienes ${min} minutos`,
          url: '/convocatorias',
        });
        return json({ ok: true, avisados: r.enviados });
      }

      if (accion === 'cerrar_fichaje') {
        const { error } = await cliente.from('convocatorias').update({ fichaje_fin: ahora() }).eq('id', c.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // Volver a avisar, por si a alguien no le llegó el push la primera
      // vez (sin cuenta de Chrome, notificaciones apagadas, el móvil en
      // el bolsillo...). No cambia nada del fichaje, solo insiste.
      if (accion === 'reenviar_fichaje') {
        if (!fichajeAbierto(c)) return json({ error: 'El fichaje no está abierto' }, 400);
        const { data: f } = await cliente.from('convocatoria_asistencia')
          .select('profesor_id').eq('convocatoria_id', c.id).not('fichado_at', 'is', null);
        const yaFichados = new Set((f || []).map(x => x.profesor_id));
        const faltan = (c.convocados || []).filter(x => !yaFichados.has(x));
        if (!faltan.length) return json({ error: 'Ya ha fichado todo el mundo' }, 400);
        const r = await enviarPushA(cliente, faltan, {
          titulo: '✋ Todavía puedes fichar',
          cuerpo: c.titulo, url: '/convocatorias',
        });
        return json({ ok: true, avisados: r.enviados, faltaban: faltan.length });
      }

      // Alargar el fichaje ya abierto, sin tener que cerrarlo y volver a
      // abrirlo (eso reiniciaría la cuenta, no la ampliaría).
      if (accion === 'ampliar_fichaje') {
        if (!fichajeAbierto(c)) return json({ error: 'El fichaje no está abierto' }, 400);
        const min = Math.min(Math.max(parseInt(datos.minutos, 10) || 5, 1), 180);
        const nuevoFin = new Date(new Date(c.fichaje_fin).getTime() + min * 60000).toISOString();
        const { error } = await cliente.from('convocatorias').update({ fichaje_fin: nuevoFin }).eq('id', c.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, fichaje_fin: nuevoFin });
      }

      // Fichar (o quitar el fichaje) a mano, para quien no tenga la app
      if (accion === 'fichar_a_mano') {
        const pid = String(datos.profesor_id || '');
        if (!(c.convocados || []).includes(pid)) return json({ error: 'Esa persona no está convocada' }, 400);
        if (c.estado === 'borrador') return json({ error: 'La convocatoria todavía no se ha enviado' }, 400);
        const quitar = datos.quitar === true;
        const { error } = await cliente.from('convocatoria_asistencia').upsert([{
          convocatoria_id: c.id, profesor_id: pid,
          fichado_at: quitar ? null : ahora(),
          fichado_a_mano_por: quitar ? null : (sesion.nombre || 'Dirección'),
          metodo: quitar ? null : 'mano',
          dispositivo: null,
        }], { onConflict: 'convocatoria_id,profesor_id' });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      if (accion === 'finalizar') {
        if (c.estado !== 'en_curso') return json({ error: 'La reunión no está en curso' }, 400);
        const { data: abiertas } = await cliente.from('convocatoria_votaciones')
          .select('id').eq('convocatoria_id', c.id).eq('estado', 'abierta');
        for (const v of abiertas || []) await cliente.rpc('conv_cerrar_votacion', { p_votacion: v.id });
        const cambios = { estado: 'cerrada', fin_real: ahora() };
        if (fichajeAbierto(c)) cambios.fichaje_fin = ahora();
        const { error } = await cliente.from('convocatorias').update(cambios).eq('id', c.id);
        if (error) return json({ error: error.message }, 500);
        // Sus etiquetas NFC dejan de valer: un enlace copiado hoy no sirve mañana
        await cliente.from('nfc_etiquetas').update({ activa: false }).eq('convocatoria_id', c.id);
        return json({ ok: true });
      }

      // Por si se finalizó sin querer
      if (accion === 'reanudar') {
        if (c.estado !== 'cerrada') return json({ error: 'No está cerrada' }, 400);
        const { error } = await cliente.from('convocatorias')
          .update({ estado: 'en_curso', fin_real: null }).eq('id', c.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      if (accion === 'eliminar') {
        const { error } = await cliente.from('convocatorias').delete().eq('id', c.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // Crear o modificar una votación preparada
      if (accion === 'guardar_votacion') {
        if (c.estado === 'cerrada') return json({ error: 'La reunión ya está cerrada' }, 400);
        const pregunta = txt(datos.pregunta, 500);
        const opciones = limpiarOpciones(datos.opciones);
        if (!pregunta) return json({ error: 'Escribe la cuestión que se vota' }, 400);
        if (opciones.length < 2) return json({ error: 'Pon al menos dos opciones' }, 400);
        const fila = {
          pregunta, opciones,
          punto: idNum(datos.punto),
          duracion_seg: Math.min(Math.max(parseInt(datos.duracion_seg, 10) || 180, 30), 3600),
        };

        const vid = idNum(datos.votacion_id);
        if (vid) {
          const { data, error } = await cliente.from('convocatoria_votaciones')
            .update(fila).eq('id', vid).eq('convocatoria_id', c.id).eq('estado', 'preparada').select('id');
          if (error) return json({ error: error.message }, 500);
          if (!(data || []).length) return json({ error: 'Solo se pueden cambiar las votaciones que no se han lanzado' }, 400);
          return json({ ok: true, id: vid });
        }

        const { data: ult } = await cliente.from('convocatoria_votaciones')
          .select('orden').eq('convocatoria_id', c.id).order('orden', { ascending: false }).limit(1);
        const { data, error } = await cliente.from('convocatoria_votaciones')
          .insert([{ ...fila, convocatoria_id: c.id, orden: ((ult || [])[0]?.orden || 0) + 1 }]).select('id');
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, id: (data || [])[0]?.id });
      }
    }

    // ── Acciones sobre una votación ──
    if (['lanzar_votacion', 'cerrar_votacion', 'borrar_votacion'].includes(accion)) {
      const vid = idNum(datos.votacion_id);
      const { data: vs } = await cliente.from('convocatoria_votaciones').select('*').eq('id', vid);
      const v = (vs || [])[0];
      if (!v) return json({ error: 'Esa votación no existe' }, 404);

      if (accion === 'borrar_votacion') {
        if (v.estado !== 'preparada') return json({ error: 'Una votación ya lanzada no se puede borrar' }, 400);
        const { error } = await cliente.from('convocatoria_votaciones').delete().eq('id', v.id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      const fn = accion === 'lanzar_votacion' ? 'conv_lanzar_votacion' : 'conv_cerrar_votacion';
      const { data: r, error } = await cliente.rpc(fn, { p_votacion: v.id });
      if (error) return json({ error: 'No se ha podido completar' }, 500);
      if (r !== 'ok') return json({ error: MENSAJES[r] || r }, 400);

      if (accion === 'lanzar_votacion') {
        const { data: f } = await cliente.from('convocatoria_asistencia')
          .select('profesor_id').eq('convocatoria_id', v.convocatoria_id).not('fichado_at', 'is', null);
        const r2 = await enviarPushA(cliente, (f || []).map(x => x.profesor_id), {
          titulo: '🗳️ Votación abierta',
          cuerpo: v.pregunta,
          url: '/convocatorias',
        });
        return json({ ok: true, avisados: r2.enviados });
      }
      return json({ ok: true });
    }

    // Volver a avisar de una votación abierta, solo a quien ya ha
    // fichado pero todavía no ha votado.
    if (accion === 'reenviar_votacion') {
      const vid = idNum(datos.votacion_id);
      const { data: vs } = await cliente.from('convocatoria_votaciones').select('*').eq('id', vid);
      const v = (vs || [])[0];
      if (!v) return json({ error: 'Esa votación no existe' }, 404);
      if (v.estado !== 'abierta' || new Date(v.cierre_at) <= new Date()) return json({ error: 'Esta votación no está abierta' }, 400);

      const { data: f } = await cliente.from('convocatoria_asistencia')
        .select('profesor_id').eq('convocatoria_id', v.convocatoria_id).not('fichado_at', 'is', null);
      const { data: vot } = await cliente.from('convocatoria_votantes').select('profesor_id').eq('votacion_id', v.id);
      const yaVotaron = new Set((vot || []).map(x => x.profesor_id));
      const faltan = (f || []).map(x => x.profesor_id).filter(x => !yaVotaron.has(x));
      if (!faltan.length) return json({ error: 'Ya han votado todos los presentes' }, 400);
      const r = await enviarPushA(cliente, faltan, {
        titulo: '🗳️ Todavía puedes votar',
        cuerpo: v.pregunta, url: '/convocatorias',
      });
      return json({ ok: true, avisados: r.enviados, faltaban: faltan.length });
    }

    // Alargar una votación abierta, sin tener que cerrarla y preparar
    // otra: la cuenta atrás ya en marcha se amplía desde donde esté.
    if (accion === 'ampliar_votacion') {
      const vid = idNum(datos.votacion_id);
      const { data: vs } = await cliente.from('convocatoria_votaciones').select('*').eq('id', vid);
      const v = (vs || [])[0];
      if (!v) return json({ error: 'Esa votación no existe' }, 404);
      if (v.estado !== 'abierta' || new Date(v.cierre_at) <= new Date()) return json({ error: 'Esta votación no está abierta' }, 400);
      const min = Math.min(Math.max(parseInt(datos.minutos, 10) || 2, 1), 60);
      const nuevoCierre = new Date(new Date(v.cierre_at).getTime() + min * 60000).toISOString();
      const { error } = await cliente.from('convocatoria_votaciones').update({ cierre_at: nuevoCierre }).eq('id', v.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, cierre_at: nuevoCierre });
    }

    return json({ error: 'Acción no reconocida' }, 400);
  } catch (e) {
    console.error('POST /api/convocatorias:', e?.message);
    return json({ error: 'Error al procesar la petición' }, 500);
  }
}
