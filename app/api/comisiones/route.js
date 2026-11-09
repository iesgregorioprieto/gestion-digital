import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { enviarAviso, correosDe } from '@/lib/notificaciones';
import { coincidenciasEnServidor } from '@/lib/coincidenciasEventos';
import { cursoPorFecha } from '@/lib/curso';
import { departamentoASector, esSectorFP } from '@/lib/sectores';

export const dynamic = 'force-dynamic';

/**
 * COMISIONES DE SERVICIO — actividades extraescolares y FCT
 *
 * Sugerencia #239 de José María. Mismo recorrido que Formación:
 *
 *   1. El profesor la pide                      → estado 'pendiente_jefe'
 *   2. Su jefe de departamento la aprueba       → estado 'pendiente_director'
 *      (o la deniega con motivo                 → estado 'denegada_jefe')
 *   3. El director la autoriza                  → estado 'autorizada'
 *      (o la deniega con motivo                 → estado 'denegada_director')
 *   4. Autorizada: el profesor registra la ausencia (para que se cubran
 *      sus grupos), descarga el impreso con la autorización y Secretaría
 *      recibe el aviso con el importe estimado de dietas y gastos.
 *
 * El paso 2 es SOLO para los departamentos de FP. ESO y Bachillerato van
 * directas al director; también los jefes de departamento y los de un
 * departamento de FP sin jefe con correo (jefe_decision = 'no_aplica').
 * Si el jefe no contesta en 3 días laborables, el cron formacion-jefe
 * la pasa al director (jefe_decision = 'escalada').
 *
 * El NIF solo se guarda en la solicitud (va en el impreso). No se envía
 * por correo ni se le enseña al jefe de departamento.
 *
 * La tabla está cerrada al navegador: todo pasa por aquí.
 */

const TABLA = 'comisiones_servicio';

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
const AMBITOS = { actividad: 'Actividad extraescolar o complementaria', fct: 'Formación en centros de trabajo (FCT / empresa)' };

/** DNI (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra), sin espacios ni guiones */
function limpiarNif(v) {
  return String(v || '').toUpperCase().replace(/[\s.-]/g, '');
}
const nifValido = v => /^([0-9]{8}|[XYZ][0-9]{7})[A-Z]$/.test(v);

async function fichaDe(sb, id) {
  const { data } = await sb.from('profesores')
    .select('id, nombre, apellidos, email, departamento, especialidad, rol, rol_gestion')
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

const hhmm = h => h ? String(h).slice(0, 5) : '';

/** Datos comunes para los correos (sin NIF) */
function datosCorreo(s, prof) {
  return {
    nombre: nombreDe(prof),
    departamento: s.departamento || prof?.departamento || '',
    ambito: AMBITOS[s.ambito] || '',
    motivo_desplazamiento: s.motivo || '',
    destino: s.destino || '',
    fecha: s.fecha_inicio || '',
    fecha_fin: s.fecha_fin && s.fecha_fin !== s.fecha_inicio ? s.fecha_fin : '',
    horario: s.hora_inicio || s.hora_fin ? `${hhmm(s.hora_inicio) || '—'} a ${hhmm(s.hora_fin) || '—'}` : '',
    transporte: s.transporte || '',
    importe: s.importe_estimado != null ? `${Number(s.importe_estimado).toFixed(2).replace('.', ',')} €` : '',
  };
}

async function avisarDirector(sb, s, prof, extra = {}) {
  const destinos = await correosDe(sb, 'director');
  if (!destinos.length) {
    console.error('[comisiones] sin director con correo: el aviso no sale');
    return;
  }
  const coincidencias = await coincidenciasEnServidor(sb, s);
  await enviarAviso('cs_director', destinos, { ...datosCorreo(s, prof), ...extra, coincidencias });
}

/** Al autorizarse: aviso a Secretaría con el importe estimado */
async function avisarSecretaria(sb, s, prof) {
  const destinos = await correosDe(sb, 'secretari');
  if (!destinos.length) {
    console.error('[comisiones] sin secretario con correo: el aviso no sale');
    return;
  }
  await enviarAviso('cs_secretaria', destinos, { ...datosCorreo(s, prof), id_solicitud: s.id });
}

async function conNombres(sb, filas) {
  const ids = [...new Set((filas || []).flatMap(s => [s.profesor_id, s.jefe_id, s.director_id]).filter(Boolean))];
  let nombres = {};
  if (ids.length) {
    const { data: profs } = await sb.from('profesores').select('id, nombre, apellidos').in('id', ids);
    nombres = Object.fromEntries((profs || []).map(p => [p.id, nombreDe(p)]));
  }
  return (filas || []).map(s => ({
    ...s,
    profesor_nombre: nombres[s.profesor_id] || '',
    jefe_nombre: nombres[s.jefe_id] || '',
    director_nombre: nombres[s.director_id] || '',
  }));
}

// ─────────────────────────────────────────────────────────────────────
// LECTURA
//   ?vista=mias       → las del propio profesor
//   ?vista=jefe       → las de su departamento (solo jefes de dpto. de FP), sin NIF
//   ?vista=direccion  → todas (equipo directivo)
//   ?id=<uuid>        → una sola, para el impreso (su dueño o el equipo directivo)
// Además devuelve quién es: { soyJefe, soyDirector, soyDirectivo, ... }
// ─────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const sb = supa();
  const params = new URL(request.url).searchParams;
  const vista = params.get('vista') || 'mias';
  const id = params.get('id');
  const yo = await fichaDe(sb, sesion.id);
  const soyJefe = rolesDe(yo).includes('jefe_departamento') && esSectorFP(departamentoASector(yo?.departamento));
  const perfil = {
    soyJefe, soyDirector: esDirector(sesion), soyDirectivo: esDirectivo(sesion),
    departamento: yo?.departamento || '', especialidad: yo?.especialidad || '',
    nombre: nombreDe(yo),
  };

  // Una sola solicitud (impreso)
  if (id) {
    const { data } = await sb.from(TABLA).select('*').eq('id', id);
    const s = (data || [])[0];
    if (!s) return Response.json({ error: 'No existe esa solicitud' }, { status: 404 });
    if (s.profesor_id !== sesion.id && !esDirectivo(sesion)) {
      return Response.json({ error: 'No puedes ver esta solicitud' }, { status: 403 });
    }
    const [fila] = await conNombres(sb, [s]);
    return Response.json({ ...perfil, solicitud: fila });
  }

  let q = sb.from(TABLA).select('*').order('fecha_inicio', { ascending: false });

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

  let filas = await conNombres(sb, data);
  // El jefe de departamento no necesita el NIF de nadie
  if (vista === 'jefe') filas = filas.map(({ nif, ...resto }) => resto);

  return Response.json({ ...perfil, solicitudes: filas });
}

// ─────────────────────────────────────────────────────────────────────
// ESCRITURA
//   crear · retirar · eliminar · resolver_jefe · resolver_director ·
//   cambiar_estado · vincular_ausencia
// ─────────────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos } = await request.json();
    const sb = supa();
    const ahora = new Date().toISOString();

    // ─── Pedir una comisión de servicio ───
    if (accion === 'crear') {
      const d = datos || {};
      const motivo = (d.motivo || '').trim();
      const nif = limpiarNif(d.nif);
      if (!motivo) return Response.json({ error: 'Falta el motivo del desplazamiento' }, { status: 400 });
      if (!nif) return Response.json({ error: 'Falta el NIF' }, { status: 400 });
      if (!nifValido(nif)) return Response.json({ error: 'El NIF no parece correcto (8 cifras y letra, o NIE)' }, { status: 400 });
      if (!AMBITOS[d.ambito]) return Response.json({ error: 'Elige si es actividad extraescolar o FCT' }, { status: 400 });
      if (!d.fecha_inicio) return Response.json({ error: 'Falta la fecha de inicio' }, { status: 400 });
      const fechaFin = d.fecha_fin || d.fecha_inicio;
      if (fechaFin < d.fecha_inicio) return Response.json({ error: 'La fecha de fin es anterior a la de inicio' }, { status: 400 });
      if (d.fecha_inicio < hoyMadrid()) return Response.json({ error: 'La comisión tiene que pedirse antes del desplazamiento' }, { status: 400 });
      if (fechaFin === d.fecha_inicio && d.hora_inicio && d.hora_fin && d.hora_fin <= d.hora_inicio) {
        return Response.json({ error: 'La hora de finalización tiene que ser posterior a la de inicio' }, { status: 400 });
      }
      let importe = null;
      if (d.importe_estimado !== '' && d.importe_estimado != null) {
        importe = Number(String(d.importe_estimado).replace(',', '.'));
        if (!Number.isFinite(importe) || importe < 0 || importe > 100000) {
          return Response.json({ error: 'El importe estimado no es válido' }, { status: 400 });
        }
        importe = Math.round(importe * 100) / 100;
      }

      const yo = await fichaDe(sb, sesion.id);
      if (!yo) return Response.json({ error: 'No se encuentra tu ficha' }, { status: 400 });

      const soyJefe = rolesDe(yo).includes('jefe_departamento');
      const esFP = esSectorFP(departamentoASector(yo.departamento));
      const jefes = (soyJefe || !esFP) ? [] : (await jefesDe(sb, yo.departamento, yo.id)).filter(j => j.email);
      const pasaPorJefe = jefes.length > 0;

      const fila = {
        curso_academico: await cursoActivo(sb),
        profesor_id: yo.id,
        departamento: yo.departamento || null,
        nif,
        puesto: (d.puesto || '').trim().slice(0, 200) || null,
        ambito: d.ambito,
        motivo: motivo.slice(0, 1000),
        destino: (d.destino || '').trim().slice(0, 200) || null,
        fecha_inicio: d.fecha_inicio,
        hora_inicio: d.hora_inicio || null,
        fecha_fin: fechaFin,
        hora_fin: d.hora_fin || null,
        transporte: (d.transporte || '').trim().slice(0, 200) || null,
        importe_estimado: importe,
        observaciones: (d.observaciones || '').trim().slice(0, 2000) || null,
        estado: pasaPorJefe ? 'pendiente_jefe' : 'pendiente_director',
        jefe_decision: pasaPorJefe ? null : 'no_aplica',
        jefe_limite: pasaPorJefe ? limitePlazo(3) : null,
      };

      const { data, error } = await sb.from(TABLA).insert([fila]).select('*');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const nueva = (data || [])[0];

      try {
        if (pasaPorJefe) {
          await enviarAviso('cs_jefe', jefes.map(j => j.email), { ...datosCorreo(nueva, yo), limite: nueva.jefe_limite });
        } else {
          await avisarDirector(sb, nueva, yo, {
            nota: !esFP ? ''
              : soyJefe ? 'La pide un jefe de departamento: no pasa por jefatura de departamento.'
              : 'Su departamento no tiene jefe asignado en el portal.',
          });
        }
      } catch (e) {
        console.error('[comisiones] aviso al crear:', e?.message);
      }

      return Response.json({ ok: true, solicitud: nueva });
    }

    // A partir de aquí todas trabajan sobre una solicitud existente
    if (!id) return Response.json({ error: 'Falta la solicitud' }, { status: 400 });
    const { data: filas } = await sb.from(TABLA).select('*').eq('id', id);
    const s = (filas || [])[0];
    if (!s) return Response.json({ error: 'No existe esa solicitud' }, { status: 404 });

    // ─── El profesor retira (o anula una ya concedida) ───
    if (accion === 'retirar') {
      if (s.profesor_id !== sesion.id) return Response.json({ error: 'No es tuya' }, { status: 403 });
      if (!['pendiente_jefe', 'pendiente_director', 'autorizada'].includes(s.estado)) {
        return Response.json({ error: 'Esta solicitud ya está cerrada' }, { status: 400 });
      }
      const motivo = (datos?.motivo || '').trim().slice(0, 1000);
      const yo = await fichaDe(sb, sesion.id);
      const previo = Array.isArray(s.historial) ? s.historial : [];
      const { data: act } = await sb.from(TABLA).update({
        estado: 'retirada',
        historial: [...previo, { fecha: ahora, por: nombreDe(yo), de: s.estado, a: 'retirada', motivo: motivo || 'Retirada por el profesor' }],
      }).eq('id', id).eq('estado', s.estado).select('*');
      if (!act?.length) return Response.json({ error: 'La solicitud ha cambiado. Recarga.' }, { status: 409 });

      try {
        if (['pendiente_director', 'autorizada'].includes(s.estado)) {
          const destinos = await correosDe(sb, 'director');
          if (s.estado === 'autorizada') destinos.push(...await correosDe(sb, 'secretari'));
          const unicos = [...new Set(destinos)];
          if (unicos.length) await enviarAviso('cs_anulada', unicos, { ...datosCorreo(s, yo), estado_antes: s.estado, motivo });
        }
      } catch (e) {
        console.error('[comisiones] retirar:', e?.message);
      }

      const aviso = s.ausencia_id
        ? 'Ya tenías registrada la ausencia de esta comisión: bórrala en Ausencias si no vas a faltar.'
        : null;
      return Response.json({ ok: true, aviso });
    }

    // ─── El director elimina del todo una anulada (pruebas, errores) ───
    if (accion === 'eliminar') {
      if (!esDirector(sesion)) return Response.json({ error: 'Solo el director' }, { status: 403 });
      if (s.estado !== 'retirada') return Response.json({ error: 'Solo se pueden eliminar las anuladas' }, { status: 400 });
      const { error } = await sb.from(TABLA).delete().eq('id', id).eq('estado', 'retirada');
      if (error) return Response.json({ error: error.message }, { status: 500 });
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
      const esSuJefe = rolesDe(yo).includes('jefe_departamento') && yo?.departamento === s.departamento
        && esSectorFP(departamentoASector(s.departamento));
      if (!esSuJefe) return Response.json({ error: 'No eres el jefe de este departamento' }, { status: 403 });
      if (s.profesor_id === sesion.id) return Response.json({ error: 'No puedes resolver tu propia solicitud' }, { status: 403 });

      const { data: act, error } = await sb.from(TABLA).update({
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
        await avisarDirector(sb, act[0], prof, { decision_jefe: decision, motivo_jefe: motivo, nombre_jefe: nombreDe(yo) });
        if (decision === 'denegada' && prof?.email) {
          await enviarAviso('cs_resuelta', [prof.email], {
            ...datosCorreo(act[0], prof), resultado: 'denegada', quien: `tu jefe de departamento, ${nombreDe(yo)}`, motivo,
          });
        }
      } catch (e) {
        console.error('[comisiones] aviso tras jefe:', e?.message);
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
      if (!['pendiente_director', 'pendiente_jefe', 'denegada_jefe'].includes(s.estado)) {
        return Response.json({ error: 'Esta solicitud ya está resuelta' }, { status: 400 });
      }

      const cambios = {
        estado: decision === 'autorizada' ? 'autorizada' : 'denegada_director',
        director_id: sesion.id,
        director_fecha: ahora,
        director_motivo: motivo || null,
      };
      if (s.estado === 'pendiente_jefe') cambios.jefe_decision = 'no_aplica';

      const { data: act, error } = await sb.from(TABLA)
        .update(cambios).eq('id', id).eq('estado', s.estado).select('*');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!act?.length) return Response.json({ error: 'La solicitud ha cambiado mientras la mirabas. Recarga.' }, { status: 409 });

      const prof = await fichaDe(sb, s.profesor_id);
      try {
        if (prof?.email) {
          await enviarAviso('cs_resuelta', [prof.email], {
            ...datosCorreo(act[0], prof), resultado: decision, quien: 'la dirección del centro', motivo, id_solicitud: act[0].id,
          });
        }
        if (decision === 'autorizada') await avisarSecretaria(sb, act[0], prof);
      } catch (e) {
        console.error('[comisiones] aviso tras director:', e?.message);
      }
      return Response.json({ ok: true, solicitud: act[0] });
    }

    // ─── El director cambia el estado (corregir, revocar, reabrir) ───
    if (accion === 'cambiar_estado') {
      if (!esDirector(sesion)) return Response.json({ error: 'Solo el director puede cambiar el estado' }, { status: 403 });
      const nuevo = datos?.estado;
      const motivo = (datos?.motivo || '').trim();
      const PERMITIDOS = ['pendiente_jefe', 'pendiente_director', 'autorizada', 'denegada_director', 'retirada'];
      if (!PERMITIDOS.includes(nuevo)) return Response.json({ error: 'Estado no válido' }, { status: 400 });
      if (nuevo === s.estado) return Response.json({ error: 'Ya está en ese estado' }, { status: 400 });
      if (!motivo) return Response.json({ error: 'Escribe el motivo del cambio' }, { status: 400 });

      const prof = await fichaDe(sb, s.profesor_id);
      const yo = await fichaDe(sb, sesion.id);
      const previo = Array.isArray(s.historial) ? s.historial : [];
      const cambios = {
        estado: nuevo,
        historial: [...previo, { fecha: ahora, por: nombreDe(yo), de: s.estado, a: nuevo, motivo }],
      };
      let jefes = [];

      if (nuevo === 'autorizada' || nuevo === 'denegada_director') {
        Object.assign(cambios, { director_id: sesion.id, director_fecha: ahora, director_motivo: motivo });
      } else if (nuevo === 'pendiente_director') {
        Object.assign(cambios, { director_id: null, director_fecha: null, director_motivo: null });
      } else if (nuevo === 'pendiente_jefe') {
        if (!esSectorFP(departamentoASector(s.departamento))) {
          return Response.json({ error: 'El paso por el jefe de departamento es solo para FP' }, { status: 400 });
        }
        jefes = (await jefesDe(sb, s.departamento, s.profesor_id)).filter(j => j.email);
        if (!jefes.length) return Response.json({ error: 'Su departamento no tiene jefe con correo: no se le puede devolver' }, { status: 400 });
        Object.assign(cambios, {
          jefe_id: null, jefe_decision: null, jefe_fecha: null, jefe_motivo: null, jefe_limite: limitePlazo(3),
          director_id: null, director_fecha: null, director_motivo: null,
        });
      }

      const { data: act, error } = await sb.from(TABLA)
        .update(cambios).eq('id', id).eq('estado', s.estado).select('*');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!act?.length) return Response.json({ error: 'La solicitud ha cambiado mientras la mirabas. Recarga.' }, { status: 409 });

      try {
        if (nuevo === 'pendiente_jefe') {
          await enviarAviso('cs_jefe', jefes.map(j => j.email), { ...datosCorreo(act[0], prof), limite: act[0].jefe_limite });
        }
        if (prof?.email) {
          if (nuevo === 'autorizada' || nuevo === 'denegada_director') {
            await enviarAviso('cs_resuelta', [prof.email], {
              ...datosCorreo(act[0], prof), resultado: nuevo === 'autorizada' ? 'autorizada' : 'denegada',
              quien: 'la dirección del centro', motivo, id_solicitud: act[0].id,
            });
          } else {
            await enviarAviso('cs_cambio', [prof.email], {
              ...datosCorreo(act[0], prof), estado_antes: s.estado, estado_ahora: nuevo, motivo,
            });
          }
        }
        if (nuevo === 'autorizada') await avisarSecretaria(sb, act[0], prof);
        // Si se le quita la autorización a una ya concedida, Secretaría también lo sabe
        if (s.estado === 'autorizada') {
          const sec = await correosDe(sb, 'secretari');
          if (sec.length) await enviarAviso('cs_cambio', sec, { ...datosCorreo(act[0], prof), estado_antes: s.estado, estado_ahora: nuevo, motivo, para_secretaria: true });
        }
      } catch (e) {
        console.error('[comisiones] aviso cambio de estado:', e?.message);
      }

      const aviso = s.estado === 'autorizada' && s.ausencia_id && nuevo !== 'autorizada'
        ? 'Ojo: ya tenía una ausencia registrada por esta comisión. Revísala en Gestión de ausencias.'
        : null;
      return Response.json({ ok: true, solicitud: act[0], aviso });
    }

    // ─── Enlazar la ausencia registrada con su solicitud ───
    if (accion === 'vincular_ausencia') {
      if (s.profesor_id !== sesion.id && !esDirectivo(sesion)) return Response.json({ error: 'No es tuya' }, { status: 403 });
      if (s.estado !== 'autorizada') return Response.json({ error: 'La comisión no está autorizada' }, { status: 400 });
      if (!datos?.ausencia_id) return Response.json({ error: 'Falta la ausencia' }, { status: 400 });
      await sb.from(TABLA).update({ ausencia_id: String(datos.ausencia_id) }).eq('id', id);
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
