import { createClient } from '@supabase/supabase-js';
import { mismoGrupo, resolverGrupo } from '@/lib/grupos';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';

/**
 * DATOS DE ALUMNADO
 *
 * Esta tabla contiene DNI de menores y sus autorizaciones de imagen.
 * Son datos personales con protección reforzada, así que solo se sirven
 * a profesorado con sesión iniciada, y nunca directamente desde la base
 * de datos al navegador.
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


/**
 * TODOS los alumnos, sin el tope de mil filas.
 *
 * Supabase devuelve como mucho 1000 registros por consulta. El centro
 * pasa de mil alumnos, así que un select sin paginar se quedaba con los
 * mil primeros por orden de grupo y los grupos del final del alfabeto
 * desaparecían del desplegable: sus tutores no podían marcar ninguna
 * autorización porque su grupo no aparecía por ninguna parte.
 */
async function todasLasFilas(columnas) {
  let filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supa()
      .from('alumnos').select(columnas).range(desde, desde + 999);
    if (error || !data || data.length === 0) break;
    filas = filas.concat(data);
    if (data.length < 1000) break;
  }
  return filas;
}


/**
 * LOS GRUPOS QUE APARECEN EN EL HORARIO
 *
 * Es la fuente más fiable: un grupo existe desde que tiene clases, aunque
 * su matrícula todavía no se haya importado. Eso es justo lo que pasaba
 * con GM-1SMR.B, que tiene horario pero ningún alumno cargado: no salía
 * en el desplegable y su tutor no podía seleccionarlo.
 *
 * El horario guarda el grupo dentro de un código largo de Delphos
 * ("IPCG-3095215GS-1GVEC(6 F109 COM)"), así que se extrae de dentro.
 */
const CODIGO_GRUPO = /(ESO|BTO|GB|GM|GS|FPPE)-\d+[A-ZÑ0-9.]*/g;

async function gruposDelHorario() {
  const encontrados = new Set();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supa()
      .from('horarios_profesores').select('grupo').range(desde, desde + 999);
    if (error || !data || data.length === 0) break;
    data.forEach(h => {
      const texto = (h.grupo || '').toUpperCase();
      for (const m of texto.matchAll(CODIGO_GRUPO)) encontrados.add(m[0]);
    });
    if (data.length < 1000) break;
  }
  return [...encontrados];
}

export async function GET(request) {
  // La lista de códigos de grupo no contiene ningún dato personal, y hace
  // falta en el formulario de alta, donde todavía no hay sesión: es donde
  // el profesor elige de qué grupo es tutor. Si no, tendría que
  // escribirlo a mano, que es de donde venían los "1º ESO A".
  if (new URL(request.url).searchParams.get('grupos') === '1') {
    /**
     * Los grupos del centro salen de DOS sitios y se juntan los dos:
     *
     *   - la tabla 'grupos', que es la lista oficial de unidades que se
     *     sube al importar. Ahí están todas, tengan o no alumnado
     *     cargado todavía.
     *   - los grupos que aparecen en el alumnado, por si alguno llegó
     *     sin estar en esa lista.
     *
     * Antes solo se miraba el alumnado, y un grupo que existe pero cuya
     * matrícula aún no se ha subido no aparecía por ninguna parte: su
     * tutor no podía ni seleccionarlo.
     */
    const [{ data: oficiales }, alumnado, deHorarios] = await Promise.all([
      supa().from('grupos').select('codigo'),
      todasLasFilas('grupo'),
      gruposDelHorario(),
    ]);

    const grupos = [...new Set([
      ...(oficiales || []).map(g => g.codigo),
      ...alumnado.map(a => a.grupo),
      ...deHorarios,
    ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

    return Response.json({ grupos });
  }

  const sesion = await sesionDe(request);
  if (!sesion) {
    return Response.json({ error: 'sin_sesion', alumnos: [] }, { status: 401 });
  }

  const url = new URL(request.url);
  const grupo    = url.searchParams.get('grupo');
  const apellidos = url.searchParams.get('apellidos');
  const resumen  = url.searchParams.get('resumen') === '1';

  // Resumen: solo cifras, sin datos personales
  if (resumen) {
    const filas = await todasLasFilas(
      'grupo, auth_imagenes, auth_salidas, auth_actividades, auth_informar_progeni, auth_imagenes_mayor');

    const conRestricciones = filas.filter(a =>
      a.auth_imagenes === false || a.auth_salidas === false || a.auth_actividades === false ||
      a.auth_informar_progeni === false || a.auth_imagenes_mayor === false
    ).length;

    return Response.json({
      total: filas.length,
      conRestricciones,
      grupos: new Set(filas.map(a => a.grupo)).size,
    });
  }

  // Lista de grupos: no contiene datos personales
  // Recuento por grupo, para el panel de datos del centro
  if (url.searchParams.get('recuento') === '1') {
    return Response.json({ alumnos: await todasLasFilas('id, grupo') });
  }

  // Búsqueda: siempre acotada, nunca el listado completo del centro
  if (!grupo && !apellidos) {
    return Response.json({ error: 'Indica un grupo o unos apellidos', alumnos: [] }, { status: 400 });
  }

  // El grupo puede llegar escrito de otra forma ("2º DDC" frente a
  // "2DDC"). Se traduce al nombre que está realmente guardado antes de
  // consultar; si no, el tutor no ve a su propia tutoría.
  let grupoReal = grupo;
  if (grupo) {
    const todos = await todasLasFilas('grupo');
    const existentes = [...new Set(todos.map(a => a.grupo).filter(Boolean))];
    grupoReal = resolverGrupo(grupo, existentes) || grupo;
  }

  let consulta = supa().from('alumnos').select('*');
  if (grupo)          consulta = consulta.eq('grupo', grupoReal);
  else if (apellidos) consulta = consulta.ilike('apellidos', `%${apellidos}%`);

  const { data, error } = await consulta.order('apellidos');
  if (error) return Response.json({ error: error.message, alumnos: [] }, { status: 500 });

  return Response.json({ alumnos: data || [] });
}


export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const cuerpo = await request.json();
    const { accion } = cuerpo;

    // Guardar las autorizaciones de un alumno
    if (accion === 'actualizar') {
      const { id, datos } = cuerpo;
      if (!id || !datos) return Response.json({ error: 'Faltan datos' }, { status: 400 });

      // Solo estos campos son editables desde la pantalla de
      // autorizaciones. Antes se hacía update(datos) con lo que llegara,
      // así que se podía cambiar cualquier columna del alumno (nombre,
      // grupo, curso...) mandando la petición a mano.
      const permitidos = [
        'auth_imagenes', 'auth_salidas', 'auth_actividades',
        'auth_informar_progeni', 'auth_imagenes_mayor', 'dni',
        'seguro_pagado', 'seguro_forma_pago', 'seguro_fecha',
        'modulos_convalidados',
      ];
      const limpio = {};
      for (const k of permitidos) {
        if (k in datos) limpio[k] = datos[k];
      }
      if (Object.keys(limpio).length === 0) {
        return Response.json({ error: 'Nada que actualizar' }, { status: 400 });
      }

      // Quién puede tocar a quién. La pantalla ya se lo enseña al tutor
      // limitado a su grupo, pero eso es solo lo que se ve: la comprobación
      // de verdad tiene que estar aquí, porque una petición se puede
      // enviar a mano sin pasar por la pantalla. Son autorizaciones de
      // imágenes y salidas de menores.
      // El seguro escolar lo marca ÚNICAMENTE el tutor de ese grupo.
      // Es un cobro que gestiona la tutoría, y dejarlo abierto a más
      // gente acabaría en dos personas marcando lo mismo con criterios
      // distintos. Dirección puede verlo en el informe, pero no tocarlo.
      // El seguro escolar sigue siendo cosa solo del tutor: es un cobro.
      // Las convalidaciones NO: las puede marcar el tutor del grupo y
      // también el equipo directivo, que a menudo las tramita sin ser
      // tutor de ese grupo.
      const tocaSeguro = ['seguro_pagado', 'seguro_forma_pago', 'seguro_fecha']
        .some(k => k in limpio);

      if (tocaSeguro) {
        const [{ data: alumnos }, { data: profes }] = await Promise.all([
          supa().from('alumnos').select('grupo').eq('id', id),
          supa().from('profesores').select('grupo_tutoria, rol').eq('id', sesion.id),
        ]);
        const grupoAlumno = (alumnos || [])[0]?.grupo;
        const profe = (profes || [])[0];
        const esTutor = Array.isArray(profe?.rol) && profe.rol.includes('tutor');
        const suGrupo = profe?.grupo_tutoria;

        if (!esTutor || !suGrupo || !grupoAlumno
            || !mismoGrupo(grupoAlumno, suGrupo)) {
          return Response.json(
            { error: 'Esto solo lo puede marcar el tutor del grupo' },
            { status: 403 });
        }
      }

      if (!esDirectivo(sesion)) {
        const [{ data: alumnos }, { data: profes }] = await Promise.all([
          supa().from('alumnos').select('grupo').eq('id', id),
          supa().from('profesores').select('grupo_tutoria, rol').eq('id', sesion.id),
        ]);

        const grupoAlumno = (alumnos || [])[0]?.grupo;
        const profe = (profes || [])[0];
        const esTutor = Array.isArray(profe?.rol) && profe.rol.includes('tutor');
        const suGrupo = profe?.grupo_tutoria;

        if (!esTutor || !suGrupo) {
          return Response.json({ error: 'Sin permisos' }, { status: 403 });
        }
        if (!mismoGrupo(grupoAlumno, suGrupo)) {
          return Response.json({ error: 'Ese alumno no es de tu tutoría' }, { status: 403 });
        }
      }

      const { error } = await supa().from('alumnos').update(limpio).eq('id', id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // Importar grupos (vacía todo y crea los nuevos, en orden correcto)
    if (accion === 'importar_grupos') {
      if (!esDirectivo(sesion)) return Response.json({ error: 'Sin permisos' }, { status: 403 });
      const { grupos, curso } = cuerpo;
      if (!Array.isArray(grupos) || !curso) return Response.json({ error: 'Datos incorrectos' }, { status: 400 });

      // 1. Vaciar alumnos (todos los cursos: la matrícula se reimporta entera)
      const { error: eA } = await supa().from('alumnos').delete().gte('id', 0);
      if (eA) return Response.json({ error: 'Alumnos: ' + eA.message }, { status: 500 });

      // 2. Vaciar grupos (todos los cursos)
      const { error: eG } = await supa().from('grupos').delete().gte('id', 0);
      if (eG) return Response.json({ error: 'Grupos: ' + eG.message }, { status: 500 });

      // 3. Insertar grupos nuevos en lotes
      const LOTE = 100;
      const lista = grupos.map(g => ({ ...g, curso_academico: curso }));
      for (let i = 0; i < lista.length; i += LOTE) {
        const { error } = await supa().from('grupos').insert(lista.slice(i, i + LOTE));
        if (error) return Response.json({ error: 'Insertar grupos: ' + error.message }, { status: 500 });
      }
      return Response.json({ ok: true, grupos: lista.length });
    }

    // Importar la matrícula del curso (solo equipo directivo)
    /**
     * IDENTIFICAR AL ALUMNADO QUE YA ESTÁ (fichero datAlumnos de Delphos)
     *
     * Ese fichero trae el DNI, que el de matrículas no tiene. Con él se le
     * pone a cada alumno su identificador de Delphos sin margen de error,
     * y a partir de ahí el fichero de matrículas ya los reconoce a todos
     * por ese identificador en vez de por el nombre.
     *
     * No crea ni borra a nadie: solo pone el identificador y el DNI a los
     * que ya están. Se puede repetir las veces que haga falta.
     */
    if (accion === 'identificar') {
      if (!esDirectivo(sesion)) {
        return Response.json({ error: 'Sin permisos' }, { status: 403 });
      }
      const { alumnos: deDelphos } = cuerpo;
      if (!Array.isArray(deDelphos)) {
        return Response.json({ error: 'Datos incorrectos' }, { status: 400 });
      }

      const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const ndni = t => (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      const existentes = await todasLasFilas('id, alumno_id, dni, apellidos, nombre');
      const porDni = new Map();
      const porNombre = new Map();
      existentes.forEach(a => {
        if (ndni(a.dni)) porDni.set(ndni(a.dni), a.id);
        const k = norm(a.apellidos) + '|' + norm(a.nombre);
        porNombre.set(k, porNombre.has(k) ? null : a.id);
      });

      let porDniOk = 0, porNombreOk = 0, sinPareja = 0;
      const nombresSinPareja = [];

      for (const d of deDelphos) {
        if (!d.alumno_id) continue;
        let id = ndni(d.dni) ? porDni.get(ndni(d.dni)) : null;
        let via = 'dni';
        if (!id) { id = porNombre.get(norm(d.apellidos) + '|' + norm(d.nombre)) || null; via = 'nombre'; }
        if (!id) {
          sinPareja++;
          if (nombresSinPareja.length < 40) nombresSinPareja.push(`${d.apellidos}, ${d.nombre}`);
          continue;
        }
        const datos = { alumno_id: String(d.alumno_id) };
        if (ndni(d.dni)) datos.dni = d.dni;     // se aprovecha para completarlo
        const { error } = await supa().from('alumnos').update(datos).eq('id', id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (via === 'dni') porDniOk++; else porNombreOk++;
      }

      return Response.json({
        ok: true,
        por_dni: porDniOk,
        por_nombre: porNombreOk,
        identificados: porDniOk + porNombreOk,
        sin_pareja: sinPareja,
        nombres_sin_pareja: nombresSinPareja,
      });
    }

    if (accion === 'importar') {
      if (!esDirectivo(sesion)) {
        return Response.json({ error: 'Sin permisos' }, { status: 403 });
      }
      const { alumnos, curso, reemplazar } = cuerpo;
      if (!Array.isArray(alumnos)) return Response.json({ error: 'Datos incorrectos' }, { status: 400 });

      /**
       * SE ACTUALIZA, NO SE BORRA.
       *
       * Antes esto borraba el alumnado entero del curso y volvía a
       * insertarlo. Se iban las filas completas y con ellas los seguros
       * escolares y las autorizaciones que los tutores marcan uno a uno:
       * 314 seguros y 1.062 autorizaciones de imagen, el trabajo de un
       * trimestre de 75 personas.
       *
       * Ahora cada alumno se reconoce por su identificador de Delphos
       * (columna ALUMNO del fichero de matrículas). Si ya existe, se le
       * cambia el grupo, el nombre y el expediente, que es lo que de
       * verdad cambia, y se le respeta TODO lo demás. Si es nuevo, se
       * crea. A nadie se le borra.
       *
       * El borrado sigue existiendo, pero hay que pedirlo a propósito y
       * solo se hace si TODOS los alumnos traen identificador; si no, no
       * habría forma de recuperar lo marcado.
       */
      const conId = alumnos.filter(a => a.alumno_id);
      const sinId = alumnos.filter(a => !a.alumno_id);

      if (reemplazar === true && curso && conId.length === alumnos.length) {
        await supa().from('alumnos').delete().eq('curso_academico', curso);
      }

      let actualizados = 0;
      let creados = 0;

      /**
       * RECONOCER A LOS QUE YA ESTÁN, AUNQUE NO TENGAN IDENTIFICADOR.
       *
       * Los 1.076 alumnos que ya hay se cargaron antes de que existiera el
       * identificador de Delphos. Si solo se buscara por ahí, no se
       * reconocería a ninguno y se crearían todos otra vez: quedarían
       * duplicados, los viejos con sus autorizaciones y los nuevos en
       * blanco.
       *
       * Por eso se busca en tres pasos: primero por identificador, luego
       * por DNI y, si no, por apellidos y nombre. En este centro no hay
       * dos alumnos que se llamen igual, así que el nombre identifica sin
       * ambigüedad. Al reconocerlo se le pone además su identificador, de
       * modo que a partir del año que viene ya baste con el primero.
       */
      const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const ndni = t => (t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

      const existentes = await todasLasFilas('id, alumno_id, dni, apellidos, nombre');
      const porIdDelphos = new Map();
      const porDni = new Map();
      const porNombre = new Map();
      existentes.forEach(a => {
        if (a.alumno_id) porIdDelphos.set(String(a.alumno_id), a.id);
        if (ndni(a.dni)) porDni.set(ndni(a.dni), a.id);
        const clave = norm(a.apellidos) + '|' + norm(a.nombre);
        // Si dos se llamaran igual, se descarta esa clave: mejor crear uno
        // nuevo que asignarle las autorizaciones a quien no es.
        porNombre.set(clave, porNombre.has(clave) ? null : a.id);
      });

      let adoptados = 0;

      /**
       * POR LOTES, NO UNO A UNO.
       *
       * Antes se hacía una petición a la base de datos por cada alumno:
       * 1.243 seguidas. El servidor cortaba antes de acabar y los nuevos
       * no llegaban a crearse nunca.
       *
       * Ahora se separan en dos listas y se mandan de quinientos en
       * quinientos: tres o cuatro peticiones en total.
       *
       * Para los que ya están se usa upsert con SOLO las columnas que
       * cambian —nombre, grupo, expediente, curso e identificador—. En un
       * upsert, lo que no se envía no se toca: el seguro escolar y las
       * autorizaciones ni siquiera viajan, así que no se pueden pisar.
       */
      const aActualizar = [];
      const aCrear = [];

      for (const a of conId) {
        let yaEsta = porIdDelphos.get(String(a.alumno_id));
        if (!yaEsta && ndni(a.dni)) yaEsta = porDni.get(ndni(a.dni));
        if (!yaEsta) yaEsta = porNombre.get(norm(a.apellidos) + '|' + norm(a.nombre)) || null;

        if (yaEsta) {
          if (!porIdDelphos.has(String(a.alumno_id))) adoptados++;
          aActualizar.push({
            id: yaEsta,
            nombre: a.nombre,
            apellidos: a.apellidos,
            grupo: a.grupo,
            num_expediente: a.num_expediente,
            curso_academico: a.curso_academico,
            alumno_id: String(a.alumno_id),
          });
        } else {
          aCrear.push(a);
        }
      }

      const LOTE = 500;
      for (let i = 0; i < aActualizar.length; i += LOTE) {
        const { error } = await supa().from('alumnos')
          .upsert(aActualizar.slice(i, i + LOTE), { onConflict: 'id' });
        if (error) return Response.json({ error: error.message, actualizados }, { status: 500 });
        actualizados += Math.min(LOTE, aActualizar.length - i);
      }
      for (let i = 0; i < aCrear.length; i += LOTE) {
        const { error } = await supa().from('alumnos').insert(aCrear.slice(i, i + LOTE));
        if (error) return Response.json({ error: error.message, creados }, { status: 500 });
        creados += Math.min(LOTE, aCrear.length - i);
      }

      // Los que llegan sin identificador se insertan como antes: no hay
      // forma de saber si ya estaban.
      for (let i = 0; i < sinId.length; i += LOTE) {
        const { error } = await supa().from('alumnos').insert(sinId.slice(i, i + LOTE));
        if (error) return Response.json({ error: error.message, creados }, { status: 500 });
        creados += Math.min(LOTE, sinId.length - i);
      }

      return Response.json({
        ok: true,
        actualizados,
        adoptados,
        creados,
        sin_identificador: sinId.length,
        insertados: actualizados + creados,
      });
    }

    // Borrar el alumnado de un grupo (antes de reimportarlo)
    // Solo equipo directivo: es una acción destructiva y sin vuelta atrás.
    // Antes bastaba con tener sesión de profesor.
    if (accion === 'borrar_grupo') {
      if (!esDirectivo(sesion)) {
        return Response.json({ error: 'Sin permisos' }, { status: 403 });
      }
      const { grupo } = cuerpo;
      if (!grupo) return Response.json({ error: 'Falta el grupo' }, { status: 400 });
      const { error } = await supa().from('alumnos').delete().eq('grupo', grupo);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
