import { createClient } from '@supabase/supabase-js';
import { nombresEnHorario } from '@/lib/horarioDeProfesor';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { computaComoFalta, exigeLicencia, AVISO_VARIOS_DIAS } from '@/lib/motivosAusencia';
import { AVISOS_BAJAS, enviarAviso } from '@/lib/notificaciones';
import { claveServidor } from '@/lib/claveServidor';
import { getCursoActual } from '@/lib/curso';
import { diasDeLaAusencia, tareaPara } from '@/lib/diasAusencia';
import { normClave, normHora, ahoraEnCentro } from '@/lib/asignacionGuardias';
import { adjuntosDe, MAX_ADJUNTOS } from '@/lib/adjuntos';
import { hoyLocal, sumarDias } from '@/lib/fechas';
import { rehacerReparto } from '@/lib/rehacerReparto';
import { problemaFechas } from '@/lib/validarFechas';

/**
 * LECTURA DE AUSENCIAS
 *
 * El texto de la justificación suele contener información médica.
 * Para que no lo pueda leer cualquiera consultando la base de datos
 * directamente, esa columna deja de estar disponible para el navegador
 * y se sirve solo desde aquí:
 *
 *   - Equipo directivo → todas las ausencias
 *   - Profesorado      → solo las suyas
 */

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * UNA SOLA AUSENCIA POR PROFESOR Y DÍA (oct. 2026)
 *
 * El 15/10 Ana Isabel Romero tenía dos ausencias para los mismos días
 * (la suya y la licencia de jefatura). El motor vio dos huecos en cada
 * hora y mandó a dos profesores a cada aula.
 *
 * Devuelve la primera ausencia de ese profesor cuyas fechas se pisan con
 * [inicio, fin]. fin = null es una baja abierta: llega hasta siempre.
 * El motor lee todas las ausencias sin mirar su estado, así que aquí
 * tampoco se mira.
 */
async function ausenciaQueSePisa(profesorId, inicio, fin, excluirId = null) {
  if (!profesorId || !inicio) return null;
  let q = supa().from('ausencias')
    .select('id, fecha_inicio, fecha_fin, motivo')
    .eq('profesor_id', profesorId)
    .or(`fecha_fin.gte.${inicio},fecha_fin.is.null`);
  if (fin) q = q.lte('fecha_inicio', fin);
  if (excluirId) q = q.neq('id', excluirId);
  const { data } = await q.order('fecha_inicio').limit(1);
  return (data || [])[0] || null;
}

function textoSolape(a) {
  const f = d => d ? d.split('-').reverse().join('/') : null;
  const fechas = a.fecha_fin
    ? (a.fecha_fin === a.fecha_inicio ? `el ${f(a.fecha_inicio)}` : `del ${f(a.fecha_inicio)} al ${f(a.fecha_fin)}`)
    : `abierta desde el ${f(a.fecha_inicio)}`;
  return `Ya hay una ausencia registrada para esas fechas (${fechas}${a.motivo ? ': ' + a.motivo : ''}). ` +
    'No se pueden tener dos ausencias el mismo día: edita la que ya existe.';
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) {
    return Response.json({ error: 'sin_sesion', ausencias: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const soloMias = url.searchParams.get('mias') === '1';
  const cuadrante = url.searchParams.get('cuadrante');

  // ── Horario del día (para las tareas de la ausencia) ──
  // Antes se leía desde el navegador y fallaba por RLS.
  const modoHorario = url.searchParams.get('horario_dia');
  if (modoHorario) {
    const fecha = url.searchParams.get('fecha');
    if (!fecha) return Response.json({ error: 'falta_fecha' }, { status: 400 });

    const DIAS = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
    const diaSemana = DIAS[new Date(fecha + 'T12:00:00').getDay()];
    if (!diaSemana || diaSemana === 'sabado' || diaSemana === 'domingo') {
      return Response.json({ horas: [], gruposUnicos: [], nombrePdf: null });
    }

    const curso = await getCursoActual();

    // Jefatura puede pedir el horario de OTRO profesor (para registrar
    // una ausencia telefónica). Solo directivos pueden pedir el de otra
    // persona; cualquiera puede pedir el suyo propio.
    const profesorIdParam = url.searchParams.get('profesor_id');
    const idBuscado = (profesorIdParam && esDirectivo(sesion)) ? profesorIdParam : sesion.id;

    // Reconocer su nombre en el horario con el mismo método que el reparto
    // de guardias (antes: primer nombre + primer apellido, sin mirar el
    // segundo; con dos «María Martínez» salían los grupos de la otra).
    const nombresPdf = await nombresEnHorario(supa(), idBuscado, curso);
    const nombrePdf = nombresPdf[0] || null;
    if (!nombrePdf) return Response.json({ horas: [], gruposUnicos: [], nombrePdf: null });

    // Horario del día concreto
    const { data: horas } = await supa()
      .from('horarios_profesores')
      .select('hora_id, hora_label, tipo, grupo, materia')
      .in('profesor_nombre_pdf', nombresPdf)
      .eq('dia', diaSemana)
      .eq('curso_academico', curso);

    // Grupos únicos (para ausencias de varios días)
    const { data: todos } = await supa()
      .from('horarios_profesores')
      .select('grupo, materia, tipo')
      .in('profesor_nombre_pdf', nombresPdf)
      .eq('tipo', 'clase')
      .eq('curso_academico', curso);

    const vistos = new Set();
    const gruposUnicos = [];
    (todos || []).forEach(h => {
      if (!h.grupo) return;
      const key = h.grupo + '|' + (h.materia || '');
      if (!vistos.has(key)) { vistos.add(key); gruposUnicos.push({ grupo: h.grupo, materia: h.materia || '' }); }
    });

    return Response.json({ horas: horas || [], gruposUnicos, nombrePdf });
  }

  // ── Cuadrante de guardias ──
  // Lo consulta todo el profesorado para saber a quién cubre. Devuelve
  // quién falta y en qué horas, pero NUNCA el motivo ni la justificación:
  // que alguien esté de baja lo tiene que saber quien le cubre; por qué
  // lo está, no.
  if (cuadrante) {
    // 'dias' trae las horas reales de cada día (calculadas contra el
    // horario al registrar). Sin ellas, una ausencia de varios días solo
    // dice «Ausencia larga» y jefatura no sabe a qué horas falta.
    const leer = campos => supa()
      .from('ausencias')
      .select(campos)
      .lte('fecha_inicio', cuadrante)
      .or(`fecha_fin.gte.${cuadrante},fecha_fin.is.null`);
    let { data, error } = await leer('profesor_id, profesor_nombre, subtipo, horas, dias, fecha_inicio, fecha_fin');
    if (error && /dias/.test(error.message || '')) {
      ({ data, error } = await leer('profesor_id, profesor_nombre, subtipo, horas, fecha_inicio, fecha_fin'));
    }

    if (error) return Response.json({ error: error.message, ausencias: [] }, { status: 500 });
    return Response.json({ ausencias: data || [] });
  }

  let consulta = supa()
    .from('ausencias')
    .select('*')
    .order('created_at', { ascending: false });

  // Un profesor solo ve las suyas.
  // Y en la pantalla personal ("mis ausencias") todo el mundo ve solo las
  // suyas, aunque sea del equipo directivo: para ver las del centro está
  // el panel de gestión.
  if (soloMias || !esDirectivo(sesion)) {
    consulta = consulta.eq('profesor_id', sesion.id);
  }

  const { data, error } = await consulta;

  if (error) {
    return Response.json({ error: error.message, ausencias: [] }, { status: 500 });
  }

  return Response.json({ ausencias: data || [] });
}

/**
 * ESCRITURA DE AUSENCIAS
 *
 * Antes las escribía el navegador, y el `profesor_id` salía de
 * sessionStorage: cualquiera podía cambiarlo desde la consola e
 * inventar una ausencia a nombre de otra persona, editar la de un
 * compañero o borrarla. Ahora el identificador sale siempre de la
 * cookie firmada.
 *
 * Quién puede hacer qué:
 *   - Cualquiera con sesión → notificar y editar LA SUYA
 *   - Equipo directivo      → notificar por otro, resolver y borrar
 */

/**
 * Quita las guardias que ya no hacen falta.
 *
 * Cuando una ausencia se borra o se acorta —porque llega el sustituto o
 * porque el compañero avisa de que al final sí viene—, las guardias que
 * se habían preasignado para los días siguientes se quedaban puestas: el
 * profesor de guardia seguía viendo que tenía que cubrir a alguien que ya
 * está en el centro.
 *
 * Solo se borran las PENDIENTES. Si un compañero llegó a fichar una, se
 * queda: la hizo, y tiene que constar y contar.
 */
// Ayer, en formato AAAA-MM-DD. Se usa como corte: lo de hoy en adelante
// se limpia; lo de días pasados se queda como registro de lo ocurrido.
// Con la fecha de Madrid: el servidor va en UTC y, de 00:00 a 02:00,
// toISOString() daba un día de menos.
function ayer() {
  return sumarDias(ahoraEnCentro().fecha, -1);
}

async function limpiarGuardias(profesorId, desde = null) {
  if (!profesorId) return;
  try {
    let q = supa().from('apoyos_asignados')
      .delete()
      .eq('profesor_ausente_id', profesorId)
      .eq('estado', 'pendiente');
    if (desde) q = q.gt('fecha', desde);
    const { error } = await q;
    if (error) console.error('limpiar guardias:', error.message);
  } catch (e) {
    console.error('limpiar guardias:', e?.message);
  }
}


/**
 * Expande una ausencia en sus días con sus horas, leyendo el horario del
 * profesor que ya está cargado en la aplicación.
 */
/**
 * Profesores, equivalencias y horario entero del curso: lo que necesita
 * calcularDias. Se separa para poder cargarlo UNA vez al recalcular
 * muchas ausencias seguidas (si no, se leería el horario entero por
 * cada una).
 */
async function cargarContextoDias() {
  const cliente = supa();
  const curso = await getCursoActual();
  const [{ data: profesores }, { data: equivalencias }] = await Promise.all([
    cliente.from('profesores').select('id, nombre, apellidos, departamento, en_baja, sustituto_id'),
    cliente.from('equivalencias_horario').select('nombre_horario, profesor_id'),
  ]);
  let horarios = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await cliente
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia, aula')
      .eq('curso_academico', curso)
      .range(desde, desde + 999);
    if (!data || data.length === 0) break;
    horarios = horarios.concat(data);
    if (data.length < 1000) break;
  }
  return { profesores: profesores || [], equivalencias: equivalencias || [], horarios };
}

function calcularDiasCon(fila, ctx) {
  if (!fila?.profesor_id || !fila?.fecha_inicio) return null;
  const profesor = ctx.profesores.find(p => p.id === fila.profesor_id);
  if (!profesor) return null;
  const sustituto = profesor.sustituto_id
    ? ctx.profesores.find(p => p.id === profesor.sustituto_id) || null
    : null;
  if (ctx.horarios.length === 0) return null;
  return diasDeLaAusencia({
    ausencia: fila,
    profesor,
    horarios: ctx.horarios,
    profesores: ctx.profesores,
    equivalencias: ctx.equivalencias,
    sustituto,
  });
}

async function calcularDias(fila) {
  if (!fila?.profesor_id || !fila?.fecha_inicio) return null;

  const cliente = supa();
  const curso = await getCursoActual();

  const [{ data: profesores }, { data: equivalencias }] = await Promise.all([
    cliente.from('profesores').select('id, nombre, apellidos, departamento, en_baja, sustituto_id'),
    cliente.from('equivalencias_horario').select('nombre_horario, profesor_id'),
  ]);

  const profesor = (profesores || []).find(p => p.id === fila.profesor_id);
  if (!profesor) return null;

  // Si esta persona está de baja y ya tiene sustituto, sus horas las da él:
  // ha asumido su horario entero, clases y guardias. Queda escrito en la
  // propia ausencia para que nadie lo tenga que deducir más tarde.
  const sustituto = profesor.sustituto_id
    ? (profesores || []).find(p => p.id === profesor.sustituto_id) || null
    : null;

  // El horario entero del curso, sin el tope de mil filas.
  let horarios = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await cliente
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia, aula')
      .eq('curso_academico', curso)
      .range(desde, desde + 999);
    if (!data || data.length === 0) break;
    horarios = horarios.concat(data);
    if (data.length < 1000) break;
  }
  if (horarios.length === 0) return null;

  return diasDeLaAusencia({
    ausencia: fila,
    profesor,
    horarios,
    profesores: profesores || [],
    equivalencias: equivalencias || [],
    sustituto,
  });
}

/**
 * LAS TAREAS LLEGAN A LAS GUARDIAS YA REPARTIDAS (nov. 2026)
 *
 * El profesorado puede añadir o cambiar sus tareas hasta el mismo día de
 * la ausencia, también en un DLD ya concedido: hasta el último momento
 * puede cambiar lo que tienen que hacer sus alumnos. Rehacer el reparto
 * no basta, porque no toca lo fichado, lo puesto a mano por jefatura ni
 * la hora en curso; y justo el mismo día es cuando más cuenta que quien
 * está en el aula vea la tarea buena. Aquí se escribe la tarea en todas
 * sus guardias de hoy en adelante, sin mover a nadie.
 *
 * Nunca lanza: la ausencia ya está guardada. Devuelve cuántas cambió.
 */
async function llevarTareasAGuardias(aus, nuevas) {
  let cambiadas = 0;
  try {
    const numHora = h => String(h?.hora || h?.hora_id || '').trim().match(/^(\d)/)?.[1] || '';
    const porHoras = (nuevas || []).some(h => numHora(h) || /^tarde/i.test(String(h?.hora || h?.hora_id || '').trim()));
    const hoy = hoyLocal();
    const desde = aus.fecha_inicio > hoy ? aus.fecha_inicio : hoy;
    const hasta = porHoras ? (aus.fecha_fin || aus.fecha_inicio) : aus.fecha_fin;
    if (hasta && hasta < desde) return 0;

    let q = supa().from('apoyos_asignados')
      .select('id, fecha, hora, grupo, materia, tarea, tarea_archivos')
      .eq('profesor_ausente_id', aus.profesor_id)
      .gte('fecha', desde);
    if (hasta) q = q.lte('fecha', hasta);
    const { data: apoyos } = await q;

    const bloques = (nuevas || []).filter(h => !numHora(h));
    const unico = bloques.length === 1 ? bloques[0] : null;
    const n = s => normClave(s || '');

    for (const ap of apoyos || []) {
      const t = porHoras
        ? nuevas.find(h => numHora(h) && numHora(h) === normHora(ap.hora))
        : (bloques.find(b => n(b.grupo) === n(ap.grupo) && n(b.materia) === n(ap.materia))
          || bloques.find(b => n(b.grupo) === n(ap.grupo))
          || unico);
      if (!t) continue;
      const tarea = t.instrucciones || null;
      const archivos = adjuntosDe(t);
      const antes = JSON.stringify((ap.tarea_archivos || []).map(a => a?.url));
      if ((ap.tarea || null) === tarea && antes === JSON.stringify(archivos.map(a => a.url))) continue;
      const { error } = await supa().from('apoyos_asignados')
        .update({ tarea, tarea_archivos: archivos.length ? archivos : null })
        .eq('id', ap.id);
      if (!error) cambiadas++;
    }
  } catch (e) {
    console.error('llevar tareas a las guardias:', e?.message);
  }
  return cambiadas;
}

/**
 * AUSENCIA DE UN DLD → SU SOLICITUD
 *
 * Si el profesor cambia las tareas desde «Mis ausencias», el DLD tiene
 * que quedarse con las mismas: es lo que ve José María en Gestión → DLD
 * y lo que vuelve a ver el profesor en su módulo DLD. Nunca lanza.
 */
async function copiarTareasAlDld(ausId) {
  try {
    const { data } = await supa().from('ausencias')
      .select('subtipo, datos_extra, horas').eq('id', ausId);
    const a = (data || [])[0];
    const dldId = a?.subtipo === 'dld' ? a?.datos_extra?.dld_id : null;
    if (!dldId) return;
    const horas = Array.isArray(a.horas) ? a.horas : [];
    const porGrupo = {};
    horas.forEach(h => {
      if (h?.tipo !== 'clase' || !h.grupo) return;
      const adj = adjuntosDe(h);
      (porGrupo[h.grupo] ||= []).push({
        hora: h.hora,
        instrucciones: h.instrucciones || '',
        archivoUrl: adj[0]?.url || '',
        archivoNombre: adj[0]?.nombre || '',
      });
    });
    const { error } = await supa().from('dld').update({
      horas,
      grupos_afectados: Object.entries(porGrupo).map(([grupo, hs]) => ({ grupo, horas: hs })),
    }).eq('id', dldId);
    if (error) console.error('copiar tareas al DLD:', error.message);
  } catch (e) {
    console.error('copiar tareas al DLD:', e?.message);
  }
}

/** ¿Tiene esa persona una actividad complementaria autorizada (o una comisión de servicio autorizada) en esas fechas? */
async function actividadAutorizadaPara(profesorId, ini, fin, comisionId) {
  if (!ini) return false;
  if (comisionId) {
    const { data } = await supa().from('comisiones_servicio')
      .select('id').eq('id', comisionId).eq('profesor_id', profesorId).eq('estado', 'autorizada');
    if ((data || []).length) return true;
  }
  const { data: acts } = await supa().from('actividades')
    .select('profesor_id, acompanantes, fecha_inicio, fecha_fin')
    .eq('estado', 'aprobada')
    .lte('fecha_inicio', fin)
    .gte('fecha_inicio', sumarDias(ini, -60));
  return (acts || []).some(a =>
    (a.profesor_id === profesorId || (Array.isArray(a.acompanantes) && a.acompanantes.includes(profesorId)))
    && (a.fecha_fin || a.fecha_inicio) >= ini);
}

export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos, sin_reparto } = await request.json();
    if (!accion) return Response.json({ error: 'Falta la acción' }, { status: 400 });

    /**
     * Rehacer los días de las ausencias abiertas de una persona.
     *
     * Se llama cuando cambia algo que afecta a todo su horario: se le
     * asigna un sustituto, se le quita, o se registra el alta. Sin esto,
     * al titular le quedarían guardadas las horas de antes y seguiría
     * apareciendo como si hubiera que cubrirle.
     */
    if (accion === 'recalcular_dias') {
      if (!esDirectivo(sesion)) {
        return Response.json({ error: 'Solo el equipo directivo' }, { status: 403 });
      }
      const hoy = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());

      /**
       * TODAS las ausencias abiertas (tras subir horarios nuevos): las que
       * se registraron con el horario anterior se quedarían con sus horas
       * viejas y el reparto cubriría lo que ya no es. El horario se lee
       * una sola vez para todas.
       */
      if (datos?.todas) {
        const { data: abiertas, error } = await supa().from('ausencias')
          .select('id, profesor_id, fecha_inicio, fecha_fin, horas')
          .or(`fecha_fin.gte.${hoy},fecha_fin.is.null`);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const ctx = await cargarContextoDias();
        if (ctx.horarios.length === 0) {
          return Response.json({ error: 'No hay horarios cargados para este curso' }, { status: 400 });
        }
        let rehechas = 0;
        const fallidas = [];
        for (const a of (abiertas || [])) {
          try {
            const dias = calcularDiasCon(a, ctx);
            const { error: e2 } = await supa().from('ausencias').update({ dias }).eq('id', a.id);
            if (e2) throw e2;
            rehechas++;
          } catch (e) {
            console.error('recalcular_dias (todas):', e?.message);
            fallidas.push(a.id);
          }
        }
        return Response.json({ ok: true, rehechas, total: (abiertas || []).length, fallidas });
      }

      const profesorId = datos?.profesor_id;
      if (!profesorId) return Response.json({ error: 'Falta el profesor' }, { status: 400 });

      const { data: suyas } = await supa().from('ausencias')
        .select('id, profesor_id, fecha_inicio, fecha_fin, horas')
        .eq('profesor_id', profesorId)
        .or(`fecha_fin.gte.${hoy},fecha_fin.is.null`);

      let rehechas = 0;
      for (const a of (suyas || [])) {
        try {
          const dias = await calcularDias(a);
          await supa().from('ausencias').update({ dias }).eq('id', a.id);
          rehechas++;
        } catch (e) {
          console.error('recalcular_dias:', e?.message);
        }
      }
      return Response.json({ ok: true, rehechas });
    }

    // ─── Notificar una ausencia ───
    if (accion === 'crear') {
      if (!datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // El equipo directivo puede darla de alta por otra persona;
      // el resto, solo la suya, venga lo que venga en la petición.
      const dueño = (esDirectivo(sesion) && datos.profesor_id) ? datos.profesor_id : sesion.id;

      const fila = { ...datos, profesor_id: dueño };

      // El DLD concedido se registra solo al aprobarlo dirección. Si el
      // profesor lo notificaba además a mano, las guardias salían dobles.
      // Jefatura sí puede (DLD que llegan en papel).
      if (fila.subtipo === 'dld' && !esDirectivo(sesion)) {
        const texto = 'No hace falta registrar el DLD: cuando dirección lo concede, aparece solo en tus ausencias. Entra en él para rellenar o revisar las tareas.';
        return Response.json({ error: texto, message: texto }, { status: 400 });
      }

      // #254: un motivo de salud de un día puesto en varios días es una
      // baja. Se comprueba también aquí, no solo en el navegador.
      if (exigeLicencia(fila.subtipo, fila.fecha_inicio, fila.fecha_fin)) {
        return Response.json({ error: AVISO_VARIOS_DIAS, message: AVISO_VARIOS_DIAS }, { status: 400 });
      }

      // #254: la Licencia por enfermedad queda grabada como baja, igual que
      // la que abre jefatura en Bajas y sustituciones: abierta hasta el
      // alta (o hasta que llegue sustituto). La duración probable se queda
      // solo como dato para dirección, en datos_extra.
      const esBaja = fila.subtipo === 'lic_enfermedad';
      if (esBaja) {
        fila.fecha_fin = null;
        fila.categoria = 'baja_sin_sustituto';
        fila.horas = horasDeBaja(fila.horas);
      }

      // Dos ausencias el mismo día = dos guardias por hora. No se permite.
      // fecha_fin null = baja abierta (igual que la lee el motor); vacía = un solo día.
      const finNueva = fila.fecha_fin === '' ? fila.fecha_inicio : (fila.fecha_fin ?? null);
      // Año a medias tecleado en el móvil (0002-09-16) o fin antes que
      // inicio: sin esto la ausencia se guarda y no genera ninguna guardia.
      const malCrear = problemaFechas(fila.fecha_inicio, finNueva);
      if (malCrear) {
        const texto = `No se puede crear esta ausencia. ${malCrear}`;
        return Response.json({ error: texto, message: texto }, { status: 400 });
      }
      const pisada = await ausenciaQueSePisa(dueño, fila.fecha_inicio, finNueva);
      if (pisada) {
        const texto = textoSolape(pisada);
        return Response.json({ error: texto, message: texto, ausencia_existente: pisada.id }, { status: 409 });
      }

      /**
       * FORMACIÓN: solo con autorización previa (sugerencia #93).
       *
       * Primero se pide en el módulo de Formación; lo aprueba el jefe de
       * departamento y lo autoriza el director. Sin una solicitud
       * autorizada que cubra esas fechas, el profesorado no puede
       * registrar una ausencia por formación. El equipo directivo sí
       * (formación de todo el claustro, cursos convocados por el centro).
       */
      const formacionId = fila.formacion_id || null;
      delete fila.formacion_id;   // no es columna de ausencias
      // Comisión de servicio autorizada que origina esta ausencia (no es columna)
      const comisionId = fila.comision_id || null;
      delete fila.comision_id;
      /**
       * ACTIVIDAD COMPLEMENTARIA: no computa como falta ni sale en el
       * informe de la Delegación, así que el profesorado solo puede
       * registrarla si de verdad hay una autorizada para él ese día (como
       * responsable o acompañante) o viene de una comisión de servicio
       * autorizada. Las de Actividades ya se crean solas al autorizarse.
       */
      if (fila.subtipo === 'act_complementarias' && !esDirectivo(sesion)) {
        if (!(await actividadAutorizadaPara(dueño, fila.fecha_inicio, finNueva || fila.fecha_inicio, comisionId))) {
          const texto = 'No hay ninguna actividad complementaria autorizada a tu nombre en esas fechas. Las actividades autorizadas aparecen solas en tus ausencias; si la tuya no está, consulta con jefatura de estudios.';
          return Response.json({ error: texto, message: texto }, { status: 403 });
        }
      }

      let solicitudFormacion = null;
      if (['permiso_formacion', 'act_formacion'].includes(fila.subtipo) && !esDirectivo(sesion)) {
        const { data: autorizadas } = await supa().from('solicitudes_formacion')
          .select('id, fecha_inicio, fecha_fin, ausencia_id')
          .eq('profesor_id', dueño).eq('estado', 'autorizada');
        const cubre = s => s.fecha_inicio <= fila.fecha_inicio && s.fecha_fin >= (fila.fecha_fin || fila.fecha_inicio);
        const lista = (autorizadas || []).filter(cubre);
        solicitudFormacion = lista.find(s => s.id === formacionId) || lista[0] || null;
        if (!solicitudFormacion) {
          const texto = 'Para registrar una ausencia por formación, primero tiene que estar autorizada en el módulo de Formación y las fechas deben estar dentro de las autorizadas.';
          return Response.json({ error: texto, message: texto }, { status: 403 });
        }
      }
      // El profesorado no decide el estado de su propia ausencia; el
      // equipo directivo sí (por ejemplo, una baja ya aprobada).
      if (!esDirectivo(sesion)) {
        delete fila.estado;
        delete fila.observaciones_directivo;
        delete fila.comentario_secretario;
      }

      // Días de libre disposición y actividades complementarias: ya
      // están autorizados por otra vía, así que la ausencia se registra
      // para el cuadrante de guardias pero no queda pendiente de
      // justificar ni cuenta como falta.
      if (fila.subtipo && !computaComoFalta(fila.subtipo)) {
        fila.estado = 'justificada';
      }

      /**
       * Las horas se resuelven AQUÍ, día a día, contra el horario real.
       *
       * Antes se guardaba una sola lista para toda la ausencia, y una
       * lista vacía quería decir dos cosas distintas: "falto el día
       * entero" en una baja y "no rellené las horas" en un análisis de
       * sangre de dos horas. El motor daba por hecho lo primero y cubría
       * clases que la persona iba a dar. Y en una ausencia de varios días
       * esa misma lista se aplicaba igual al lunes que al jueves.
       *
       * Ahora queda escrito qué tiene esa persona a cada hora de cada
       * día. El campo 'horas' se sigue guardando igual que siempre: no se
       * pierde nada de lo ya registrado ni de lo que mande el formulario.
       */
      try {
        fila.dias = await calcularDias(fila);
      } catch (e) {
        // Que esto falle no puede impedir registrar una ausencia.
        console.error('ausencias: no se han podido calcular los días:', e?.message);
      }

      const { data, error } = await supa().from('ausencias').insert([fila]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // #254: la ficha queda de baja y sale en Bajas y sustituciones.
      if (esBaja) await marcarDeBaja(dueño, fila);

      // Dejar enlazada la solicitud de formación con su (primera) ausencia
      if (solicitudFormacion && !solicitudFormacion.ausencia_id && (data || [])[0]?.id) {
        await supa().from('solicitudes_formacion')
          .update({ ausencia_id: data[0].id }).eq('id', solicitudFormacion.id)
          .then(() => {}, err => console.error('vincular formacion:', err?.message));
      }

      // Dejar enlazada la comisión de servicio con su ausencia. Solo si es
      // de la misma persona y está autorizada.
      if (comisionId && (data || [])[0]?.id) {
        await supa().from('comisiones_servicio')
          .update({ ausencia_id: String(data[0].id) })
          .eq('id', comisionId).eq('profesor_id', dueño).eq('estado', 'autorizada')
          .then(() => {}, err => console.error('vincular comision:', err?.message));
      }

      // Preasignación automática de guardias: en cuanto se registra una
      // ausencia, el sistema asigna a quien corresponda según el cuadrante
      // y la rotación. No espera a que nadie abra la app ni pulse nada.
      //
      // Se espera a que termine (antes iba sin await y en el servidor la
      // función se cerraba a veces antes de que saliera la petición).
      // Solo el día que se está viviendo y el siguiente: los demás se
      // recalculan esa misma mañana.
      // En lotes (pasar a ausencias los DLD ya concedidos) dirección pide
      // no rehacerlo en cada una: se rehace una sola vez al final.
      if (fila.fecha_inicio && !(sin_reparto && esDirectivo(sesion))) await rehacerReparto(request);

      // Permiso de formación: la aprobación (jefe de departamento y
      // director) se hace ANTES, en el módulo de Formación. Aquí ya no se
      // avisa a nadie: la ausencia solo sirve para el cuadrante y las tareas.

      // Licencia por enfermedad: aviso a dirección y jefatura de estudios
      // con lo administrativo, para que valoren la sustitución y lo
      // tramiten ellos con Inspección. El portal no escribe a Inspección.
      // Con await: sin él, Vercel podía cerrar la función antes de que
      // saliera el correo y el aviso de la baja no llegaba.
      if (fila.subtipo === 'lic_enfermedad') {
        await avisarBaja(fila).catch(err => console.error('aviso baja:', err?.message));
      }

      return Response.json({ ok: true, id: (data || [])[0]?.id });
    }

    // ─── Editar una ausencia ───
    if (accion === 'editar') {
      if (!id || !datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const cambios = { ...datos };
      // Los comentarios internos son cosa de dirección, aunque la
      // ausencia sea propia.
      if (!esDirectivo(sesion)) {
        delete cambios.observaciones_directivo;
        delete cambios.comentario_secretario;
        delete cambios.profesor_id;      // no se puede cambiar de dueño
        // El estado solo lo puede dejar en pendiente o justificada; lo
        // demás (tramitada, aprobada…) es cosa de dirección.
        if ('estado' in cambios && !['pendiente', 'justificada', 'sin_justificar'].includes(cambios.estado)) {
          delete cambios.estado;
        }
        // Pasar una ausencia a DLD o a actividad complementaria la sacaría
        // del cómputo de faltas: eso solo llega por su propio camino.
        if (['dld', 'act_complementarias'].includes(cambios.subtipo)) {
          const { data: act } = await supa().from('ausencias').select('subtipo').eq('id', id);
          if ((act || [])[0]?.subtipo !== cambios.subtipo) {
            const texto = cambios.subtipo === 'dld'
              ? 'El DLD no se registra a mano: aparece solo en tus ausencias cuando dirección lo concede.'
              : 'Una ausencia no se puede cambiar a actividad complementaria: las autorizadas aparecen solas en tus ausencias.';
            return Response.json({ error: texto, message: texto }, { status: 400 });
          }
        }
      }

      // El formulario manda datos_extra = null en los motivos sin campos
      // propios (DLD, actividad). Eso borraba el enlace con su actividad o
      // su DLD: al anularlos ya no se encontraba la ausencia. Se conserva.
      if ('datos_extra' in cambios) {
        const { data: exAnt } = await supa().from('ausencias').select('datos_extra').eq('id', id);
        const ant = (exAnt || [])[0]?.datos_extra || {};
        const enlace = {};
        for (const k of ['actividad_id', 'horas_actividad', 'dld_id']) if (ant[k] !== undefined) enlace[k] = ant[k];
        if (Object.keys(enlace).length) cambios.datos_extra = { ...(cambios.datos_extra || {}), ...enlace };
      }

      // #254 al editar: la misma regla, y una baja abierta se queda
      // abierta. El formulario del profesor siempre manda una fecha de fin;
      // sin esto, abrir la baja para añadir una tarea la cerraría.
      let pasaABaja = false;
      {
        const { data: act254 } = await supa().from('ausencias')
          .select('subtipo, fecha_inicio, fecha_fin, categoria').eq('id', id);
        const a = (act254 || [])[0];
        if (a) {
          const bajaAbierta = a.categoria === 'baja_sin_sustituto' && !a.fecha_fin;
          if (bajaAbierta && !esDirectivo(sesion)) delete cambios.fecha_fin;
          const sub = cambios.subtipo ?? a.subtipo;
          const ini = cambios.fecha_inicio ?? a.fecha_inicio;
          const fin = 'fecha_fin' in cambios ? cambios.fecha_fin : a.fecha_fin;
          if (exigeLicencia(sub, ini, fin)) {
            return Response.json({ error: AVISO_VARIOS_DIAS, message: AVISO_VARIOS_DIAS }, { status: 400 });
          }
          if (cambios.subtipo === 'lic_enfermedad' && a.subtipo !== 'lic_enfermedad') {
            cambios.fecha_fin = null;
            cambios.categoria = 'baja_sin_sustituto';
            pasaABaja = true;
          }
          // Una baja abierta lleva las tareas por grupo, nunca por hora.
          if ((pasaABaja || bajaAbierta) && 'horas' in cambios) {
            cambios.horas = horasDeBaja(cambios.horas);
          }
        }
      }

      // Al justificar, el plazo de 3 días desde el día de la falta se
      // vuelve a comprobar aquí. El navegador ya lo calcula para avisar
      // al profesor, pero es solo una ayuda visual: si se llamara a esta
      // API directamente, "justificada_fuera_plazo" llegaría en lo que
      // mande quien la llame, y no es de fiar. Se recalcula con la fecha
      // real guardada en la propia ausencia.
      if (cambios.estado === 'justificada') {
        const { data: propia } = await supa()
          .from('ausencias').select('fecha_inicio').eq('id', id);
        const fechaInicio = (propia || [])[0]?.fecha_inicio;
        if (fechaInicio) {
          const limite = new Date(fechaInicio + 'T00:00:00');
          limite.setDate(limite.getDate() + 3);
          cambios.justificada_fuera_plazo = new Date() > limite;
        }
      }

      // Si se cambian las fechas o las horas, los días hay que rehacerlos:
      // si no, quedarían los del registro anterior.
      const cambiaCuandoFalta = 'horas' in cambios || 'fecha_inicio' in cambios || 'fecha_fin' in cambios;
      // Mover las fechas encima de otra ausencia suya tampoco se permite.
      if ('fecha_inicio' in cambios || 'fecha_fin' in cambios) {
        const { data: actual } = await supa().from('ausencias')
          .select('profesor_id, fecha_inicio, fecha_fin').eq('id', id);
        const a = (actual || [])[0];
        if (a) {
          const ini = cambios.fecha_inicio ?? a.fecha_inicio;
          const finRaw = 'fecha_fin' in cambios ? cambios.fecha_fin : a.fecha_fin;
          const fin = finRaw === '' ? ini : (finRaw ?? null);
          const malEditar = problemaFechas(ini, fin);
          if (malEditar) {
            const texto = `No se puede guardar el cambio. ${malEditar}`;
            return Response.json({ error: texto, message: texto }, { status: 400 });
          }
          const pisada = await ausenciaQueSePisa(cambios.profesor_id || a.profesor_id, ini, fin, id);
          if (pisada) {
            const texto = textoSolape(pisada);
            return Response.json({ error: texto, message: texto, ausencia_existente: pisada.id }, { status: 409 });
          }
        }
      }

      if (cambiaCuandoFalta) {
        try {
          const { data: previa } = await supa().from('ausencias')
            .select('profesor_id, fecha_inicio, fecha_fin, horas').eq('id', id);
          const antes = (previa || [])[0];
          if (antes) cambios.dias = await calcularDias({ ...antes, ...cambios });
        } catch (e) {
          console.error('ausencias: no se han podido rehacer los días:', e?.message);
        }
      }

      let consulta = supa().from('ausencias').update(cambios).eq('id', id);
      // Quien no es directivo solo puede tocar las suyas
      if (!esDirectivo(sesion)) consulta = consulta.eq('profesor_id', sesion.id);

      const { data, error } = await consulta.select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        return Response.json({ error: 'no_encontrada_o_ajena' }, { status: 403 });
      }

      // #254: ha pasado a Licencia por enfermedad al editarla.
      if (pasaABaja) {
        const { data: tras } = await supa().from('ausencias')
          .select('*').eq('id', id);
        const filaBaja = (tras || [])[0];
        if (filaBaja) {
          await marcarDeBaja(filaBaja.profesor_id, filaBaja);
          await avisarBaja(filaBaja).catch(err => console.error('aviso baja:', err?.message));
        }
      }

      // Si ha cambiado cuándo falta, el reparto de hoy ya no vale. Justificar
      // (solo estado y documentos) no cambia nada y no lo dispara.
      if (cambiaCuandoFalta) await rehacerReparto(request);

      // Las tareas nuevas, también en las guardias que el reparto no
      // rehace (fichadas, puestas a mano o de la hora en curso), y en el
      // DLD si la ausencia viene de uno.
      if ('horas' in cambios) {
        const { data: tras } = await supa().from('ausencias')
          .select('profesor_id, fecha_inicio, fecha_fin, horas').eq('id', id);
        const fila = (tras || [])[0];
        if (fila) await llevarTareasAGuardias(fila, Array.isArray(fila.horas) ? fila.horas : []);
        await copiarTareasAlDld(id);
      }

      return Response.json({ ok: true });
    }

    /**
     * SE INCORPORA ANTES DE TIEMPO (petición de Delia, nov. 2026)
     *
     * Ausencia de varios días y el profesor vuelve antes de la fecha
     * prevista. Jefatura indica el día y la hora a la que se incorpora:
     *
     *   · A 1ª hora → la ausencia termina el día anterior.
     *   · A otra hora → ese día pasa a ser una ausencia aparte de las horas
     *     anteriores (los días parciales nunca se agrupan con los
     *     completos), con las tareas que dejó para esos grupos. Si el día
     *     de vuelta es el primero de la ausencia, la propia ausencia se
     *     queda en ese día con esas horas.
     *
     * Las guardias pendientes de los días que ya no falta se borran y el
     * reparto se rehace. Lo fichado no se toca.
     */
    if (accion === 'incorporar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      const fecha = datos?.fecha;
      const hora = parseInt(datos?.hora, 10);
      if (!id || !fecha || !(hora >= 1 && hora <= 6)) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }
      const { data: filas } = await supa().from('ausencias').select('*').eq('id', id);
      const orig = (filas || [])[0];
      if (!orig) return Response.json({ error: 'No se encuentra la ausencia' }, { status: 404 });

      const ini = orig.fecha_inicio;
      const fin = orig.fecha_fin;
      const error = texto => Response.json({ error: texto, message: texto }, { status: 400 });
      if (!fin || fin === ini) return error('Solo para ausencias de varios días. En las de un día usa «Cambiar horas».');
      if (problemaFechas(fecha, null)) return error(problemaFechas(fecha, null));
      if (fecha < ini || fecha > fin) return error('El día de incorporación tiene que estar dentro de las fechas de la ausencia.');
      if (fecha === ini && hora === 1) return error('Si se incorpora el primer día a 1ª hora, no llega a faltar: borra la ausencia.');

      // Horas de ese día anteriores a la de incorporación, con su tarea
      let horasDia = [];
      if (hora > 1) {
        let dias = null;
        try { dias = await calcularDias({ profesor_id: orig.profesor_id, fecha_inicio: fecha, fecha_fin: fecha, horas: [] }); }
        catch (e) { console.error('incorporar: horario:', e?.message); }
        const declaradas = Array.isArray(orig.horas) ? orig.horas : [];
        horasDia = ((dias || [])[0]?.horas || [])
          .filter(h => { const n = parseInt(String(h.hora).match(/\d/)?.[0] || '0', 10); return n >= 1 && n < hora; })
          .map(h => {
            const n = String(h.hora).match(/\d/)[0];
            const t = h.tipo === 'clase' ? tareaPara({ hora_id: n + 'a', grupo: h.grupo, materia: h.materia }, declaradas) : {};
            return {
              hora: `${n}ª hora`, tipo: h.tipo, grupo: h.grupo || null, materia: h.materia || null,
              instrucciones: t.instrucciones || null,
              archivo_url: t.archivo_url || null, archivo_nombre: t.archivo_nombre || null,
              ...(Array.isArray(t.archivos) ? { archivos: t.archivos } : {}),
            };
          });
      }

      const nota = `Se incorpora el ${fecha.split('-').reverse().join('/')}${hora > 1 ? ` a ${hora}ª hora` : ''} (registrado por jefatura).`;
      const obs = orig.observaciones ? `${orig.observaciones}\n${nota}` : nota;

      if (fecha === ini) {
        // Solo falta parte del primer día: la ausencia se queda en ese día
        if (!horasDia.length) return error(`No tiene horas antes de ${hora}ª ese día: no llega a faltar. Borra la ausencia.`);
        const cambios = { fecha_fin: ini, horas: horasDia, observaciones: obs };
        try { cambios.dias = await calcularDias({ ...orig, ...cambios }); } catch {}
        const { error: e1 } = await supa().from('ausencias').update(cambios).eq('id', id);
        if (e1) return Response.json({ error: e1.message }, { status: 500 });
      } else {
        // Termina el día anterior…
        const nuevoFin = sumarDias(fecha, -1);
        const cambios = { fecha_fin: nuevoFin, observaciones: obs };
        try { cambios.dias = await calcularDias({ ...orig, ...cambios }); } catch {}
        const { error: e1 } = await supa().from('ausencias').update(cambios).eq('id', id);
        if (e1) return Response.json({ error: e1.message }, { status: 500 });

        // …y el día de vuelta, si falta a alguna hora, va aparte
        if (horasDia.length) {
          const nueva = { ...orig, fecha_inicio: fecha, fecha_fin: fecha, horas: horasDia, observaciones: obs };
          delete nueva.id; delete nueva.created_at; delete nueva.updated_at;
          try { nueva.dias = await calcularDias(nueva); } catch {}
          const { error: e2 } = await supa().from('ausencias').insert([nueva]);
          if (e2) {
            // Que no se quede a medias: se deshace el recorte
            await supa().from('ausencias').update({ fecha_fin: fin, observaciones: orig.observaciones, dias: orig.dias }).eq('id', id);
            return Response.json({ error: e2.message }, { status: 500 });
          }
        }
      }

      // Guardias pendientes de los días que ya no falta. El día de vuelta
      // se conserva si falta a alguna hora: lo rehace el reparto.
      await limpiarGuardias(orig.profesor_id, hora > 1 ? fecha : sumarDias(fecha, -1));
      await rehacerReparto(request);

      return Response.json({ ok: true, horas_dia: horasDia.length });
    }

    /**
     * TAREAS PUESTAS POR JEFATURA (petición de Sebas, oct. 2026)
     *
     * A veces el profesor registra la ausencia sin tareas y luego las
     * manda por correo. Jefatura las escribe aquí, en su ausencia.
     *
     * Solo se tocan las tareas: ni las horas, ni las fechas, ni el motivo.
     *   · Ausencia de un día → una tarea por hora de clase.
     *   · Varios días o baja → una tarea por módulo. Se guardan TODOS los
     *     módulos, también los que quedan vacíos: si solo hubiera uno, el
     *     motor lo engancharía a todas sus clases.
     *
     * La tarea ya está copiada en las guardias repartidas, así que se
     * lleva también allí (de hoy en adelante, fichadas incluidas) para
     * que quien está en el aula vea la nueva al momento.
     *
     * Cada tarea cambiada queda firmada (tarea_jefatura: por y cuándo),
     * para que no parezca que la dejó el profesor.
     */
    if (accion === 'editar_tareas') {
      // Jefatura con cualquier ausencia; el profesor, con las suyas, siempre
      // (también un DLD ya concedido): hasta el mismo día puede cambiar.
      if (!id || !Array.isArray(datos?.tareas)) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { data: filas, error: errLee } = await supa()
        .from('ausencias')
        .select('id, profesor_id, fecha_inicio, fecha_fin, horas')
        .eq('id', id);
      if (errLee) return Response.json({ error: errLee.message }, { status: 500 });
      const aus = (filas || [])[0];
      if (!aus) return Response.json({ error: 'no_encontrada' }, { status: 404 });
      const directivo = esDirectivo(sesion);
      if (!directivo && aus.profesor_id !== sesion.id) {
        return Response.json({ error: 'sin_permisos' }, { status: 403 });
      }

      const numHora = h => String(h?.hora || h?.hora_id || '').trim().match(/^(\d)/)?.[1] || '';
      const limpia = t => ({
        instrucciones: String(t?.instrucciones || '').trim() || null,
        archivos: (Array.isArray(t?.archivos) ? t.archivos : [])
          .filter(a => a && a.url)
          .slice(0, MAX_ADJUNTOS)
          .map(a => ({ url: String(a.url), nombre: String(a.nombre || 'Archivo') })),
      });
      // El aviso que pone "Cambiar horas" en las horas añadidas no es una tarea
      const textoDe = h => (/^Hora añadida por jefatura/.test(h?.instrucciones || '') ? null : (h?.instrucciones || null));
      const mismaTarea = (h, t) =>
        textoDe(h) === t.instrucciones
        && JSON.stringify(adjuntosDe(h).map(a => a.url)) === JSON.stringify(t.archivos.map(a => a.url));
      const firma = { por: sesion.nombre || 'Jefatura', en: new Date().toISOString() };
      const conTarea = (h, t) => {
        const fila = {
          ...h,
          instrucciones: t.instrucciones,
          archivos: t.archivos,
          archivo_url: t.archivos[0]?.url || null,
          archivo_nombre: t.archivos[0]?.nombre || null,
        };
        // La firma de jefatura solo cuando la pone jefatura; si la cambia
        // el propio profesor, la tarea vuelve a ser suya.
        if (directivo) fila.tarea_jefatura = firma;
        else delete fila.tarea_jefatura;
        return fila;
      };

      const horas = Array.isArray(aus.horas) ? aus.horas : [];
      // Por horas si marcó alguna hora concreta (también de tarde); si no, por módulos
      const porHoras = horas.some(h => numHora(h) || /^tarde/i.test(String(h?.hora || h?.hora_id || '').trim()));
      let nuevas = [...horas];
      let cambiadas = 0;

      if (porHoras) {
        nuevas = horas.map(h => {
          const n = numHora(h);
          const llega = n && datos.tareas.find(t => String(t?.hora || '') === n);
          if (!llega) return h;
          const t = limpia(llega);
          if (mismaTarea(h, t)) return h;
          cambiadas++;
          return conTarea(h, t);
        });
      } else {
        const clave = x => normClave(x?.grupo) + '|' + normClave(x?.materia);
        for (const llega of datos.tareas) {
          if (!llega?.grupo) continue;
          const t = limpia(llega);
          const i = nuevas.findIndex(b => clave(b) === clave(llega));
          if (i >= 0) {
            if (mismaTarea(nuevas[i], t)) continue;
            nuevas[i] = conTarea(nuevas[i], t);
            cambiadas++;
          } else {
            const bloque = {
              hora: 'Ausencia larga', tipo: 'clase',
              grupo: String(llega.grupo), materia: llega.materia ? String(llega.materia) : null,
            };
            if (t.instrucciones || t.archivos.length) { nuevas.push(conTarea(bloque, t)); cambiadas++; }
            else nuevas.push({ ...bloque, instrucciones: null, archivo_url: null, archivo_nombre: null });
          }
        }
      }

      if (cambiadas === 0 && nuevas.length === horas.length) {
        return Response.json({ ok: true, horas, cambiadas: 0, guardias_actualizadas: 0 });
      }

      const cambios = { horas: nuevas };
      try {
        const dias = await calcularDias({ ...aus, horas: nuevas });
        if (dias) cambios.dias = dias;
      } catch (e) {
        console.error('editar_tareas: no se han podido rehacer los días:', e?.message);
      }
      const { error: errGuarda } = await supa().from('ausencias').update(cambios).eq('id', id);
      if (errGuarda) return Response.json({ error: errGuarda.message }, { status: 500 });

      // Llevar la tarea a las guardias ya repartidas, de hoy en adelante
      const guardiasActualizadas = await llevarTareasAGuardias(aus, nuevas);
      // Si es la ausencia de un DLD, la solicitud se queda con las mismas
      await copiarTareasAlDld(id);

      return Response.json({ ok: true, horas: nuevas, cambiadas, guardias_actualizadas: guardiasActualizadas });
    }

    // ─── Resolver: justificada o sin justificar ───
    if (accion === 'resolver') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id || !datos?.estado) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      const { error } = await supa().from('ausencias').update({
        estado: datos.estado,
        comentario_secretario: datos.comentario_secretario ?? null,
        observaciones_directivo: datos.observaciones_directivo ?? null,
      }).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Marcar/desmarcar «Tramitado en Delphos» en el informe para la
    // Delegación. Antes se guardaba en el navegador de quien lo marcara;
    // ahora queda en la base de datos, con quién y cuándo, para que todo
    // el equipo directivo vea lo mismo lo marque quien lo marque. ───
    if (accion === 'tramitar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      // El checkbox y las observaciones se guardan por separado: escribir
      // una nota no tiene por qué marcar la fila como tramitada, y
      // marcarla no debe borrar lo que Elena ya había anotado.
      const cambios = {};
      if (datos?.tramitado !== undefined) {
        const marcar = !!datos.tramitado;
        cambios.tramitado = marcar;
        cambios.tramitado_por = marcar ? sesion.id : null;
        cambios.tramitado_at = marcar ? new Date().toISOString() : null;
      }
      if (datos?.observaciones !== undefined) {
        cambios.tramitado_obs = String(datos.observaciones).trim() || null;
      }
      if (Object.keys(cambios).length === 0) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { error } = await supa().from('ausencias').update(cambios).eq('id', id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Borrar ───
    if (accion === 'borrar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      // Se mira antes de borrarla, que después ya no se puede saber a
      // quién pertenecía ni desde cuándo.
      const { data: previa } = await supa().from('ausencias')
        .select('profesor_id, fecha_inicio').eq('id', id);
      const dueño = (previa || [])[0];

      const { error } = await supa().from('ausencias').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Si ya no falta, nadie tiene que cubrirle. Las guardias que algún
      // compañero haya fichado se quedan: esas se hicieron.
      if (dueño?.profesor_id) {
        await limpiarGuardias(dueño.profesor_id, ayer());
        // limpiarGuardias se lleva TODAS las guardias pendientes de esta
        // persona, también las de otra ausencia o DLD suyo que siga en
        // pie. El reparto las vuelve a poner, y de paso recoloca a quien
        // estaba cubriendo y ahora queda libre.
        await rehacerReparto(request);
      }

      return Response.json({ ok: true });
    }

    // ─── Cerrar la ausencia abierta de una baja sin sustituto ───
    // Cuando llega el sustituto, el titular deja de generar guardias.
    if (accion === 'cerrar_baja') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!datos?.profesor_id || !datos?.fecha_fin) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }
      const malCierre = problemaFechas(datos.fecha_fin, null);
      if (malCierre) {
        const texto = malCierre.replace('de inicio', 'de cierre');
        return Response.json({ error: texto, message: texto }, { status: 400 });
      }

      const { error } = await supa().from('ausencias')
        .update({ fecha_fin: datos.fecha_fin })
        .eq('profesor_id', datos.profesor_id)
        .eq('categoria', 'baja_sin_sustituto')
        .is('fecha_fin', null);

      if (error) return Response.json({ error: error.message }, { status: 500 });

      // A partir del cierre ya no hay que cubrirle: viene el sustituto.
      await limpiarGuardias(datos.profesor_id, datos.fecha_fin);
      await rehacerReparto(request);

      return Response.json({ ok: true });
    }

    // ─── Aprobación/denegación del jefe de departamento ───
    if (accion === 'resolver_jefe') {
      if (!id || !datos?.decision || !datos?.motivo?.trim()) {
        return Response.json({ error: 'Falta la decisión o la justificación' }, { status: 400 });
      }

      const decision = datos.decision; // 'aprobada' o 'denegada'
      if (!['aprobada', 'denegada'].includes(decision)) {
        return Response.json({ error: 'Decisión no válida' }, { status: 400 });
      }

      // Comprobar que es el jefe del departamento del profesor
      const { data: ausRows } = await supa().from('ausencias')
        .select('id, profesor_id, subtipo, aprobacion_jefe, datos_extra, fecha_inicio, fecha_fin')
        .eq('id', id);
      const aus = (ausRows || [])[0];
      if (!aus || aus.subtipo !== 'permiso_formacion' || aus.aprobacion_jefe !== 'pendiente') {
        return Response.json({ error: 'No se puede resolver esta solicitud' }, { status: 400 });
      }

      const { data: profAus } = await supa().from('profesores').select('departamento, nombre, apellidos').eq('id', aus.profesor_id);
      const dptoProf = (profAus || [])[0]?.departamento || '';
      const nombreProf = profAus?.[0] ? `${profAus[0].nombre || ''} ${profAus[0].apellidos || ''}`.trim() : '';

      const { data: misDatos } = await supa().from('profesores').select('departamento, rol, nombre, apellidos').eq('id', sesion.id);
      const miDpto = (misDatos || [])[0]?.departamento || '';
      const misRoles = Array.isArray((misDatos || [])[0]?.rol) ? (misDatos || [])[0].rol : [];
      const nombreJefe = misDatos?.[0] ? `${misDatos[0].nombre || ''} ${misDatos[0].apellidos || ''}`.trim() : '';

      if (miDpto !== dptoProf || !misRoles.includes('jefe_departamento')) {
        if (!esDirectivo(sesion)) {
          return Response.json({ error: 'No eres el jefe de este departamento' }, { status: 403 });
        }
      }

      // Guardar la resolución
      await supa().from('ausencias').update({
        aprobacion_jefe: decision,
        aprobacion_jefe_por: sesion.id,
        aprobacion_jefe_fecha: new Date().toISOString(),
        aprobacion_jefe_motivo: datos.motivo.trim(),
      }).eq('id', id);

      const ex = aus.datos_extra || {};

      // Avisar al director siempre
      avisarFormacion({
        ...aus,
        _decision_jefe: decision,
        _motivo_jefe: datos.motivo.trim(),
        _nombre_jefe: nombreJefe,
        _nombre_prof: nombreProf,
        _departamento: dptoProf,
      }).catch(err => console.error('aviso director tras jefe:', err?.message));

      // Si denegada, avisar al profesor
      if (decision === 'denegada') {
        const { data: profEmail } = await supa().from('profesores').select('email').eq('id', aus.profesor_id);
        const emailProf = (profEmail || [])[0]?.email;
        if (emailProf) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
          fetch(`${baseUrl}/api/enviar-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-clave-interna': process.env.SESSION_SECRET || '' },
            body: JSON.stringify({
              tipo: 'formacion_denegada_profesor',
              datos: {
                email: emailProf,
                nombre: nombreProf,
                jefe_nombre: nombreJefe,
                departamento: dptoProf,
                fecha: aus.fecha_inicio || '',
                fecha_fin: aus.fecha_fin || '',
                curso: ex.curso || '',
                motivo: datos.motivo.trim(),
              },
            }),
          }).catch(() => {});
        }
      }

      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}


/**
 * Avisa por correo a la dirección de que alguien ha comunicado un
 * permiso de formación. No bloquea el guardado: se lanza en segundo
 * plano y si falla solo se registra en el log.
 */
/**
 * Aviso de baja médica a dirección y jefatura de estudios.
 *
 * Va con lo administrativo y nada clínico: quién, desde cuándo, cuánto
 * se prevé y si el interesado ve recomendable sustituir. Ellos deciden
 * qué se manda a Inspección y por dónde.
 */
/**
 * #254: una baja abierta lleva las tareas POR GRUPO, no por hora.
 *
 * Si el profesor la notifica poniendo un solo día, el formulario manda
 * sus horas de ese día («1ª hora», «2ª hora»…). Abierta hasta el alta, el
 * motor de guardias tomaría esas horas concretas como las únicas a cubrir
 * TODOS los días, con los grupos del primer día. Se pasan a bloques por
 * grupo («Ausencia larga»), como en las de varios días: así cada día se
 * sacan sus clases del horario y a cada grupo le llega su tarea.
 * Las horas de guardia se quitan: no llevan tarea.
 */
function horasDeBaja(horas) {
  if (!Array.isArray(horas) || horas.length === 0) return horas ?? null;
  if (horas.every(h => h?.hora === 'Ausencia larga')) return horas;
  const bloques = new Map();
  for (const h of horas) {
    if (!h || h.tipo === 'guardia' || !h.grupo) continue;
    const clave = `${h.grupo}|${h.materia || ''}`;
    const previo = bloques.get(clave);
    if (previo) {
      // Mismo grupo a varias horas: se juntan las tareas sin repetirlas.
      if (h.instrucciones && !(previo.instrucciones || '').includes(h.instrucciones)) {
        previo.instrucciones = [previo.instrucciones, h.instrucciones].filter(Boolean).join('\n');
      }
      const arch = [...(previo.archivos || []), ...(h.archivos || [])];
      previo.archivos = arch.filter((a, i) => arch.findIndex(b => b?.url === a?.url) === i);
      continue;
    }
    bloques.set(clave, {
      hora: 'Ausencia larga', tipo: 'clase',
      grupo: h.grupo, materia: h.materia || null,
      instrucciones: h.instrucciones || null,
      archivos: Array.isArray(h.archivos) ? [...h.archivos] : [],
      archivo_url: h.archivo_url || null,
      archivo_nombre: h.archivo_nombre || null,
    });
  }
  const lista = [...bloques.values()].map(b => ({
    ...b,
    archivo_url: b.archivos[0]?.url || b.archivo_url,
    archivo_nombre: b.archivos[0]?.nombre || b.archivo_nombre,
  }));
  return lista.length > 0 ? lista : null;
}

/**
 * #254: marca la ficha como de baja, igual que «Registrar baja» en
 * Bajas y sustituciones, para que jefatura la vea allí y pueda asignar
 * sustituto. Si ya estaba de baja no se toca (no se pisa la fecha).
 * Fecha de baja: la del parte, si la ha puesto; si no, la de la ausencia.
 */
async function marcarDeBaja(profesorId, fila) {
  try {
    const { data } = await supa().from('profesores').select('en_baja').eq('id', profesorId);
    const p = (data || [])[0];
    if (!p || p.en_baja) return;
    const delParte = fila?.datos_extra?.fecha_inicio_baja;
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(delParte || '') ? delParte : fila.fecha_inicio;
    await supa().from('profesores')
      .update({ en_baja: true, tipo_baja: 'temporal', fecha_baja: fecha })
      .eq('id', profesorId);
  } catch (e) {
    // Que esto falle no puede deshacer la ausencia ya guardada.
    console.error('marcar de baja:', e?.message);
  }
}

async function avisarBaja(fila) {
  const cliente = supa();

  const { data: profs } = await cliente
    .from('profesores')
    .select('nombre, apellidos, departamento, tipo_contrato')
    .eq('id', fila.profesor_id);
  const prof = (profs || [])[0];
  const nombre = prof ? `${prof.nombre || ''} ${prof.apellidos || ''}`.trim() : 'Un profesor/a';

  const ex = fila.datos_extra || {};
  await enviarAviso('baja_medica', AVISOS_BAJAS, {
    nombre,
    departamento: prof?.departamento || '',
    contrato: prof?.tipo_contrato || '',
    fecha_ausencia: fila.fecha_inicio || '',
    inicio_baja: ex.fecha_inicio_baja || '',
    duracion: ex.duracion_probable ? `${ex.duracion_probable} días` : '',
    sustitucion: ex.sustitucion || '',
    observaciones: fila.observaciones || '',
  });
}

async function avisarFormacion(fila) {
  const cliente = supa();

  const { data: directivos } = await cliente
    .from('profesores')
    .select('nombre, apellidos, email, rol_gestion')
    .not('rol_gestion', 'is', null);

  const destinos = (directivos || [])
    .filter(p => (p.rol_gestion || '').toLowerCase().startsWith('director') && p.email)
    .map(p => p.email);

  if (destinos.length === 0) return;

  const { data: profs } = await cliente
    .from('profesores')
    .select('nombre, apellidos')
    .eq('id', fila.profesor_id);
  const prof = (profs || [])[0];
  const nombre = prof ? `${prof.nombre || ''} ${prof.apellidos || ''}`.trim() : 'Un profesor/a';

  const ex = fila.datos_extra || {};
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';

  // Si viene con la decisión del jefe, el correo lo incluye
  const tipoCorreo = fila._decision_jefe ? 'formacion_resuelta_jefe' : 'formacion_solicitada';

  for (const email of destinos) {
    await fetch(`${baseUrl}/api/enviar-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-clave-interna': process.env.SESSION_SECRET || '',
      },
      body: JSON.stringify({
        tipo: tipoCorreo,
        datos: {
          email,
          nombre: fila._nombre_prof || nombre,
          decision_jefe: fila._decision_jefe || '',
          motivo_jefe: fila._motivo_jefe || '',
          nombre_jefe: fila._nombre_jefe || '',
          departamento: fila._departamento || '',
          fecha: fila.fecha_inicio || '',
          fecha_fin: fila.fecha_fin || '',
          dias: (() => {
            if (!fila.fecha_inicio || !fila.fecha_fin) return '';
            const d = Math.round((new Date(fila.fecha_fin + 'T12:00:00') - new Date(fila.fecha_inicio + 'T12:00:00')) / 86400000) + 1;
            return d > 1 ? `${d} días` : '1 día';
          })(),
          curso: ex.curso || '',
          entidad: ex.entidad || '',
          lugar: ex.lugar || '',
          horario: ex.horario || '',
          horas: ex.horas ? `${ex.horas} h` : '',
        },
      }),
    });
  }
}
