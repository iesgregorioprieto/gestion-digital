import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { computaComoFalta } from '@/lib/motivosAusencia';
import { AVISOS_BAJAS, enviarAviso } from '@/lib/notificaciones';
import { claveServidor } from '@/lib/claveServidor';
import { getCursoActual } from '@/lib/curso';

/**
 * Departamentos de FP con cuadrante de guardias propio.
 *
 * Para estos departamentos, el permiso de formación pasa primero por el
 * jefe de departamento antes de llegar al director. El resto va directo.
 * Normalizado: minúsculas, sin acentos, sin espacios extra.
 */
const DPTOS_FP = [
  'tmv/carroceria', 'tmv/carrocería', 'carroceria', 'carrocería',
  'hosteleria', 'hostelería',
  'informatica', 'informática',
  'electricidad / electronica', 'electricidad / electrónica',
  'electricidad/electronica', 'electricidad/electrónica',
  'comercio',
  'administracion', 'administración',
  'industrias alimentarias',
  'fol',
];

/**
 * Fecha límite: X días laborables desde hoy.
 * Salta sábados y domingos.
 */
function limitePlazo(diasLaborables) {
  const d = new Date();
  let restantes = diasLaborables;
  while (restantes > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) restantes--;
  }
  return d.toISOString().slice(0, 10);
}

function esDptoFP(dpto) {
  if (!dpto) return false;
  const norm = dpto.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return DPTOS_FP.some(d =>
    d.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === norm
  );
}

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

    // Buscar el nombre PDF del profesor
    const { data: prof } = await supa().from('profesores').select('nombre, apellidos').eq('id', sesion.id);
    let nombrePdf = null;
    if (prof?.[0]) {
      const { nombre, apellidos } = prof[0];
      const p1 = nombre.split(' ')[0];
      const a1 = apellidos.split(' ')[0];

      // Intentar con la función SQL
      const { data: fn } = await supa().rpc('buscar_profesor_horario', { p_nombre: p1, p_apellido: a1 });
      if (fn) { nombrePdf = fn; }
      else {
        // Fallback: buscar por apellido
        const { data: rows } = await supa()
          .from('horarios_profesores')
          .select('profesor_nombre_pdf')
          .ilike('profesor_nombre_pdf', '%' + a1 + '%')
          .limit(5);
        if (rows?.length > 0) {
          const mejor = rows.find(r => r.profesor_nombre_pdf.toLowerCase().includes(p1.toLowerCase()));
          nombrePdf = mejor ? mejor.profesor_nombre_pdf : rows[0].profesor_nombre_pdf;
        }
      }
    }

    if (!nombrePdf) return Response.json({ horas: [], gruposUnicos: [], nombrePdf: null });

    // Horario del día concreto
    const { data: horas } = await supa()
      .from('horarios_profesores')
      .select('hora_id, hora_label, tipo, grupo, materia')
      .eq('profesor_nombre_pdf', nombrePdf)
      .eq('dia', diaSemana)
      .eq('curso_academico', curso);

    // Grupos únicos (para ausencias de varios días)
    const { data: todos } = await supa()
      .from('horarios_profesores')
      .select('grupo, materia, tipo')
      .eq('profesor_nombre_pdf', nombrePdf)
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
    const { data, error } = await supa()
      .from('ausencias')
      .select('profesor_id, profesor_nombre, horas, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', cuadrante)
      .or(`fecha_fin.gte.${cuadrante},fecha_fin.is.null`);

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
export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    const { accion, id, datos } = await request.json();
    if (!accion) return Response.json({ error: 'Falta la acción' }, { status: 400 });

    // ─── Notificar una ausencia ───
    if (accion === 'crear') {
      if (!datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // El equipo directivo puede darla de alta por otra persona;
      // el resto, solo la suya, venga lo que venga en la petición.
      const dueño = (esDirectivo(sesion) && datos.profesor_id) ? datos.profesor_id : sesion.id;

      const fila = { ...datos, profesor_id: dueño };
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

      const { data, error } = await supa().from('ausencias').insert([fila]).select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });

      // Permiso de formación: flujo de aprobación.
      //
      // Si el profesor es de un departamento de FP, el permiso pasa
      // primero por su jefe de departamento. Si es de otro, va directo
      // al director como hasta ahora.
      if (fila.subtipo === 'permiso_formacion') {
        const { data: profData } = await supa()
          .from('profesores')
          .select('departamento')
          .eq('id', fila.profesor_id);
        const dpto = (profData || [])[0]?.departamento || '';

        if (esDptoFP(dpto)) {
          // Marcar como pendiente de aprobación del jefe
          await supa().from('ausencias')
            .update({ aprobacion_jefe: 'pendiente', aprobacion_jefe_limite: limitePlazo(3) })
            .eq('id', (data || [])[0]?.id);

          avisarJefeFormacion(fila, dpto).catch(err =>
            console.error('aviso jefe formacion:', err?.message));
        } else {
          avisarFormacion(fila).catch(err =>
            console.error('aviso formacion:', err?.message));
        }
      }

      // Licencia por enfermedad: aviso a dirección y jefatura de estudios
      // con lo administrativo, para que valoren la sustitución y lo
      // tramiten ellos con Inspección. El portal no escribe a Inspección.
      if (fila.subtipo === 'lic_enfermedad') {
        avisarBaja(fila).catch(err => console.error('aviso baja:', err?.message));
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
      }

      let consulta = supa().from('ausencias').update(cambios).eq('id', id);
      // Quien no es directivo solo puede tocar las suyas
      if (!esDirectivo(sesion)) consulta = consulta.eq('profesor_id', sesion.id);

      const { data, error } = await consulta.select('id');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      if (!data || data.length === 0) {
        return Response.json({ error: 'no_encontrada_o_ajena' }, { status: 403 });
      }
      return Response.json({ ok: true });
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

    // ─── Borrar ───
    if (accion === 'borrar') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!id) return Response.json({ error: 'Falta el identificador' }, { status: 400 });

      const { error } = await supa().from('ausencias').delete().eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Cerrar la ausencia abierta de una baja sin sustituto ───
    // Cuando llega el sustituto, el titular deja de generar guardias.
    if (accion === 'cerrar_baja') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });
      if (!datos?.profesor_id || !datos?.fecha_fin) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }

      const { error } = await supa().from('ausencias')
        .update({ fecha_fin: datos.fecha_fin })
        .eq('profesor_id', datos.profesor_id)
        .eq('categoria', 'baja_sin_sustituto')
        .is('fecha_fin', null);

      if (error) return Response.json({ error: error.message }, { status: 500 });
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

/**
 * Aviso al jefe de departamento de que un profesor de su departamento
 * ha pedido un permiso de formación. El jefe tiene 3 días laborables
 * para aprobar o denegar. Si no contesta, pasa al director.
 */
async function avisarJefeFormacion(fila, dpto) {
  const cliente = supa();

  // Buscar al jefe del departamento
  const { data: jefes } = await cliente
    .from('profesores')
    .select('id, nombre, apellidos, email, departamento')
    .eq('departamento', dpto)
    .contains('rol', ['jefe_departamento']);

  if (!jefes || jefes.length === 0) {
    // Sin jefe → directo al director
    console.error(`[formacion] Sin jefe en ${dpto}, va directo al director`);
    return avisarFormacion(fila);
  }

  const jefe = jefes[0];
  if (!jefe.email) return avisarFormacion(fila);

  // Datos del profesor que pide
  const { data: profs } = await cliente
    .from('profesores').select('nombre, apellidos').eq('id', fila.profesor_id);
  const prof = (profs || [])[0];
  const nombre = prof ? `${prof.nombre || ''} ${prof.apellidos || ''}`.trim() : 'Un profesor/a';
  const ex = fila.datos_extra || {};

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';

  await fetch(`${baseUrl}/api/enviar-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-clave-interna': process.env.SESSION_SECRET || '',
    },
    body: JSON.stringify({
      tipo: 'formacion_jefe_pendiente',
      datos: {
        email: jefe.email,
        nombre,
        jefe_nombre: `${jefe.nombre || ''} ${jefe.apellidos || ''}`.trim(),
        departamento: dpto,
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
