import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { enviarAviso, correosDe } from '@/lib/notificaciones';
import { cursoPorFecha } from '@/lib/curso';

export const dynamic = 'force-dynamic';

/**
 * MÓDULO DE FORMACIÓN — solicitudes de cursos y jornadas
 *
 * Sugerencia #93 de José María. El orden es:
 *
 *   1. El profesor pide la formación            → estado 'pendiente_jefe'
 *   2. Su jefe de departamento la aprueba       → estado 'pendiente_director'
 *      (o la deniega con motivo                 → estado 'denegada_jefe')
 *   3. El director la autoriza                  → estado 'autorizada'
 *      (o la deniega con motivo                 → estado 'denegada_director')
 *   4. Con 'autorizada' se desbloquea el motivo «formación» en Ausencias.
 *
 * Vale para TODOS los departamentos. Si quien la pide es jefe de
 * departamento, o su departamento no tiene jefe con correo, se salta el
 * paso 2 y va directa al director (jefe_decision = 'no_aplica').
 * Si el jefe no contesta en 3 días laborables, el cron formacion-jefe
 * la pasa al director (jefe_decision = 'escalada').
 *
 * El director tiene siempre la última palabra: también puede autorizar
 * una que el jefe haya denegado.
 *
 * La tabla está cerrada al navegador: todo pasa por aquí.
 */

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
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

function hoyMadrid() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** X días laborables desde hoy (salta sábados y domingos) */
function limitePlazo(diasLaborables) {
  const d = new Date(hoyMadrid() + 'T12:00:00');
  let restantes = diasLaborables;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) restantes--;
  }
  const a = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${a}-${m}-${dd}`;
}

async function cursoActivo(sb) {
  try {
    const { data } = await sb.from('config_centro').select('curso').eq('activo', true);
    return (data || [])[0]?.curso || cursoPorFecha();
  } catch {
    return cursoPorFecha();
  }
}

const nombreDe = p => p ? `${p.nombre || ''} ${p.apellidos || ''}`.trim() : '';
const esDirector = s => (s?.rol || '') === 'director';
const rolesDe = p => Array.isArray(p?.rol) ? p.rol : [];

async function fichaDe(sb, id) {
  const { data } = await sb.from('profesores')
    .select('id, nombre, apellidos, email, departamento, rol, rol_gestion')
    .eq('id', id);
  return (data || [])[0] || null;
}

/** Jefe (o jefes) del departamento, sin contar a quien lo pregunta */
async function jefesDe(sb, departamento, excepto = null) {
  if (!departamento) return [];
  const { data } = await sb.from('profesores')
    .select('id, nombre, apellidos, email, departamento, rol')
    .eq('departamento', departamento)
    .contains('rol', ['jefe_departamento']);
  return (data || []).filter(j => j.id !== excepto);
}

/** Datos comunes para los correos */
function datosCorreo(s, prof) {
  return {
    nombre: nombreDe(prof),
    departamento: s.departamento || prof?.departamento || '',
    titulo: s.titulo || '',
    entidad: s.entidad || '',
    modalidad: s.modalidad || '',
    lugar: s.lugar || '',
    fecha: s.fecha_inicio || '',
    fecha_fin: s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? s.fecha_fin : '',
    horario: s.hora_inicio ? `${String(s.hora_inicio).slice(0, 5)}${s.hora_fin ? '–' + String(s.hora_fin).slice(0, 5) : ''}` : '',
  };
}

async function avisarDirector(sb, s, prof, extra = {}) {
  const destinos = await correosDe(sb, 'director');
  if (!destinos.length) {
    console.error('[formacion] sin director con correo: el aviso no sale');
    return;
  }
  await enviarAviso('fc_director', destinos, { ...datosCorreo(s, prof), ...extra });
}

// ─────────────────────────────────────────────────────────────────────
// LECTURA
//   ?vista=mias       → las del propio profesor (cualquiera)
//   ?vista=jefe       → las de su departamento (solo jefes de dpto.)
//   ?vista=direccion  → todas (equipo directivo)
// Además devuelve quién es: { soyJefe, soyDirector, soyDirectivo }
// ─────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const sb = supa();
  const vista = new URL(request.url).searchParams.get('vista') || 'mias';
  const yo = await fichaDe(sb, sesion.id);
  const soyJefe = rolesDe(yo).includes('jefe_departamento');
  const perfil = { soyJefe, soyDirector: esDirector(sesion), soyDirectivo: esDirectivo(sesion), departamento: yo?.departamento || '' };

  let q = sb.from('solicitudes_formacion').select('*')
    .order('fecha_inicio', { ascending: false });

  if (vista === 'jefe') {
    if (!soyJefe) return Response.json({ error: 'Solo jefes de departamento' }, { status: 403 });
    q = q.eq('departamento', yo.departamento).neq('profesor_id', sesion.id);
  } else if (vista === 'direccion') {
    if (!esDirectivo(sesion)) return Response.json({ error: 'Solo el equipo directivo' }, { status: 403 });
  } else {
    q = q.eq('profesor_id', sesion.id);
  }

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Nombres de solicitante y jefe, en una sola consulta
  const ids = [...new Set((data || []).flatMap(s => [s.profesor_id, s.jefe_id, s.director_id]).filter(Boolean))];
  let nombres = {};
  if (ids.length) {
    const { data: profs } = await sb.from('profesores').select('id, nombre, apellidos').in('id', ids);
    nombres = Object.fromEntries((profs || []).map(p => [p.id, nombreDe(p)]));
  }
  const filas = (data || []).map(s => ({
    ...s,
    profesor_nombre: nombres[s.profesor_id] || '',
    jefe_nombre: nombres[s.jefe_id] || '',
    director_nombre: nombres[s.director_id] || '',
  }));

  return Response.json({ ...perfil, solicitudes: filas });
}

// ─────────────────────────────────────────────────────────────────────
// ESCRITURA
//   crear · retirar · resolver_jefe · resolver_director · vincular_ausencia
// ─────────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos } = await request.json();
    const sb = supa();
    const ahora = new Date().toISOString();

    // ─── Pedir una formación ───
    if (accion === 'crear') {
      const d = datos || {};
      const titulo = (d.titulo || '').trim();
      if (!titulo) return Response.json({ error: 'Falta el nombre del curso o jornada' }, { status: 400 });
      if (!d.fecha_inicio) return Response.json({ error: 'Falta la fecha de inicio' }, { status: 400 });
      const fechaFin = d.fecha_fin || d.fecha_inicio;
      if (fechaFin < d.fecha_inicio) return Response.json({ error: 'La fecha de fin es anterior a la de inicio' }, { status: 400 });
      if (d.fecha_inicio < hoyMadrid()) return Response.json({ error: 'La formación tiene que pedirse antes de que empiece' }, { status: 400 });
      if (d.modalidad && !['presencial', 'online', 'mixta'].includes(d.modalidad)) {
        return Response.json({ error: 'Modalidad no válida' }, { status: 400 });
      }

      const yo = await fichaDe(sb, sesion.id);
      if (!yo) return Response.json({ error: 'No se encuentra tu ficha' }, { status: 400 });

      // ¿Pasa por el jefe? No si es jefe él mismo o si su departamento no tiene jefe con correo
      const soyJefe = rolesDe(yo).includes('jefe_departamento');
      const jefes = soyJefe ? [] : (await jefesDe(sb, yo.departamento, yo.id)).filter(j => j.email);
      const pasaPorJefe = jefes.length > 0;

      const fila = {
        curso_academico: await cursoActivo(sb),
        profesor_id: yo.id,
        departamento: yo.departamento || null,
        titulo: titulo.slice(0, 300),
        entidad: (d.entidad || '').trim().slice(0, 200) || null,
        modalidad: d.modalidad || null,
        lugar: (d.lugar || '').trim().slice(0, 200) || null,
        fecha_inicio: d.fecha_inicio,
        fecha_fin: fechaFin,
        hora_inicio: d.hora_inicio || null,
        hora_fin: d.hora_fin || null,
        observaciones: (d.observaciones || '').trim().slice(0, 2000) || null,
        estado: pasaPorJefe ? 'pendiente_jefe' : 'pendiente_director',
        jefe_decision: pasaPorJefe ? null : 'no_aplica',
        jefe_limite: pasaPorJefe ? limitePlazo(3) : null,
      };

      const { data, error } = await sb.from('solicitudes_formacion').insert([fila]).select('*');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const nueva = (data || [])[0];

      // Avisos: al jefe, o directamente al director
      try {
        if (pasaPorJefe) {
          await enviarAviso('fc_jefe', jefes.map(j => j.email), {
            ...datosCorreo(nueva, yo),
            limite: nueva.jefe_limite,
          });
        } else {
          await avisarDirector(sb, nueva, yo, {
            nota: soyJefe ? 'La pide un jefe de departamento: no pasa por jefatura de departamento.'
                          : 'Su departamento no tiene jefe asignado en el portal.',
          });
        }
      } catch (e) {
        console.error('[formacion] aviso al crear:', e?.message);
      }

      return Response.json({ ok: true, solicitud: nueva });
    }

    // A partir de aquí todas trabajan sobre una solicitud existente
    if (!id) return Response.json({ error: 'Falta la solicitud' }, { status: 400 });
    const { data: filas } = await sb.from('solicitudes_formacion').select('*').eq('id', id);
    const s = (filas || [])[0];
    if (!s) return Response.json({ error: 'No existe esa solicitud' }, { status: 404 });

    // ─── El profesor retira su solicitud ───
    if (accion === 'retirar') {
      if (s.profesor_id !== sesion.id) return Response.json({ error: 'No es tuya' }, { status: 403 });
      if (!['pendiente_jefe', 'pendiente_director'].includes(s.estado)) {
        return Response.json({ error: 'Ya está resuelta: no se puede retirar' }, { status: 400 });
      }
      await sb.from('solicitudes_formacion').update({ estado: 'retirada' }).eq('id', id);
      return Response.json({ ok: true });
    }

    // ─── El jefe de departamento aprueba o deniega ───
    if (accion === 'resolver_jefe') {
      const decision = datos?.decision;
      const motivo = (datos?.motivo || '').trim();
      if (!['aprobada', 'denegada'].includes(decision)) return Response.json({ error: 'Decisión no válida' }, { status: 400 });
      if (decision === 'denegada' && !motivo) return Response.json({ error: 'Para denegar hay que dar el motivo' }, { status: 400 });
      if (s.estado !== 'pendiente_jefe') return Response.json({ error: 'Esta solicitud ya no está pendiente del jefe' }, { status: 400 });

      const yo = await fichaDe(sb, sesion.id);
      const esSuJefe = rolesDe(yo).includes('jefe_departamento') && yo?.departamento === s.departamento;
      if (!esSuJefe) return Response.json({ error: 'No eres el jefe de este departamento' }, { status: 403 });
      if (s.profesor_id === sesion.id) return Response.json({ error: 'No puedes resolver tu propia solicitud' }, { status: 403 });

      const { data: act, error } = await sb.from('solicitudes_formacion').update({
        estado: decision === 'aprobada' ? 'pendiente_director' : 'denegada_jefe',
        jefe_id: sesion.id,
        jefe_decision: decision,
        jefe_fecha: ahora,
        jefe_motivo: motivo || null,
      }).eq('id', id).eq('estado', 'pendiente_jefe').select('*');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!act?.length) return Response.json({ error: 'Otra persona la ha resuelto a la vez' }, { status: 409 });

      const prof = await fichaDe(sb, s.profesor_id);
      try {
        // El director se entera siempre, con la decisión razonada
        await avisarDirector(sb, act[0], prof, {
          decision_jefe: decision, motivo_jefe: motivo, nombre_jefe: nombreDe(yo),
        });
        // Si se deniega, el profesor también
        if (decision === 'denegada' && prof?.email) {
          await enviarAviso('fc_resuelta', [prof.email], {
            ...datosCorreo(act[0], prof), resultado: 'denegada', quien: `tu jefe de departamento, ${nombreDe(yo)}`, motivo,
          });
        }
      } catch (e) {
        console.error('[formacion] aviso tras jefe:', e?.message);
      }
      return Response.json({ ok: true, solicitud: act[0] });
    }

    // ─── El director autoriza o deniega (última palabra) ───
    if (accion === 'resolver_director') {
      if (!esDirector(sesion)) return Response.json({ error: 'Solo el director' }, { status: 403 });
      const decision = datos?.decision;
      const motivo = (datos?.motivo || '').trim();
      if (!['autorizada', 'denegada'].includes(decision)) return Response.json({ error: 'Decisión no válida' }, { status: 400 });
      if (decision === 'denegada' && !motivo) return Response.json({ error: 'Para denegar hay que dar el motivo' }, { status: 400 });
      // Puede resolver las que le han llegado, las que siguen en el jefe
      // (se adelanta) y las que el jefe denegó (las reabre).
      if (!['pendiente_director', 'pendiente_jefe', 'denegada_jefe'].includes(s.estado)) {
        return Response.json({ error: 'Esta solicitud ya está resuelta' }, { status: 400 });
      }

      const cambios = {
        estado: decision === 'autorizada' ? 'autorizada' : 'denegada_director',
        director_id: sesion.id,
        director_fecha: ahora,
        director_motivo: motivo || null,
      };
      // Si se adelanta al jefe, que conste
      if (s.estado === 'pendiente_jefe') cambios.jefe_decision = 'no_aplica';

      const { data: act, error } = await sb.from('solicitudes_formacion')
        .update(cambios).eq('id', id).eq('estado', s.estado).select('*');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!act?.length) return Response.json({ error: 'La solicitud ha cambiado mientras la mirabas. Recarga.' }, { status: 409 });

      const prof = await fichaDe(sb, s.profesor_id);
      if (prof?.email) {
        try {
          await enviarAviso('fc_resuelta', [prof.email], {
            ...datosCorreo(act[0], prof),
            resultado: decision,
            quien: 'la dirección del centro',
            motivo,
            id_solicitud: act[0].id,
          });
        } catch (e) {
          console.error('[formacion] aviso tras director:', e?.message);
        }
      }
      return Response.json({ ok: true, solicitud: act[0] });
    }

    // ─── Enlazar la ausencia registrada con su solicitud ───
    // Lo llamará Ausencias al guardar una ausencia de formación.
    if (accion === 'vincular_ausencia') {
      if (s.profesor_id !== sesion.id && !esDirectivo(sesion)) return Response.json({ error: 'No es tuya' }, { status: 403 });
      if (s.estado !== 'autorizada') return Response.json({ error: 'La formación no está autorizada' }, { status: 400 });
      if (!datos?.ausencia_id) return Response.json({ error: 'Falta la ausencia' }, { status: 400 });
      await sb.from('solicitudes_formacion').update({ ausencia_id: datos.ausencia_id }).eq('id', id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
