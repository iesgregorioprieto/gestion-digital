/**
 * PREASIGNACIÓN DE GUARDIAS
 *
 * Calcula quién cubre cada hueco de un día y lo deja registrado como
 * guardia pendiente, para que le llegue directamente al profesorado
 * sin tener que pasar por jefatura de estudios.
 *
 * Cubre un día o un rango: una baja de tres días se preasigna entera de
 * una sola vez, sin esperar a que alguien abra la aplicación cada
 * mañana. Los datos pesados (horarios y profesorado) se leen una vez y
 * valen para todos los días.
 *
 * Es idempotente: si un hueco ya tiene a alguien puesto, no se vuelve a
 * crear. Las guardias ya fichadas y las que ha puesto dirección a mano
 * NO se tocan nunca.
 *
 * Solo cuentan para la rotación las guardias fichadas.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import {
  HORAS_GUARDIA, diaSemanaEs, construirCuadrante, prepararHuecos,
  asignacionesDeHora, normHora, ocupadosEnClase, nombreDe,
  indiceProfesores, clavesAmbiguas, franja, ahoraEnCentro, fichajesDeRecreo,
} from '@/lib/asignacionGuardias';
import { normSector, esSectorRecreo } from '@/lib/sectores';
import { normGrupo } from '@/lib/grupos';

const FICHADAS = ['confirmado', 'realizado'];

// Tope de días por llamada. Una baja sin fecha de fin es infinita: se
// preasignan los próximos días y el resto lo va añadiendo el día a día.
const MAX_DIAS = 15;

function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}


// ¿Esta falta afecta a este día?
/**
 * ¿Esta falta afecta a este día?
 *
 * Cuidado con la ausencia SIN fecha de fin, que es justo lo que es una
 * baja: abierta, sin alta prevista. Antes, al no haber fin se usaba la
 * fecha de inicio como fin, y la baja pasaba a durar un solo día: las
 * clases de quien llevaba dos semanas de baja se cubrieron el primer día
 * y ninguno más.
 */
function afectaA(falta, fecha) {
  // Un DLD es siempre de un día concreto.
  if (falta.fecha_solicitada) return falta.fecha_solicitada === fecha;

  const ini = falta.fecha_inicio;
  if (!ini || ini > fecha) return false;

  // Sin fecha de fin, la ausencia sigue abierta.
  return !falta.fecha_fin || falta.fecha_fin >= fecha;
}

let _cliente = null;
function supa() {
  if (!_cliente) {
    _cliente = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _cliente;
}

/**
 * Curso académico activo, leído con la clave de servidor.
 * No se usa getCursoActual() porque esa función crea un cliente
 * pensado para el navegador y aquí estamos en el servidor.
 */
async function cursoActivo(cliente) {
  // select('*') a propósito: la tabla no tiene siempre las mismas
  // columnas, y pedir una que no existe hace fallar toda la consulta.
  const { data, error } = await cliente
    .from('config_centro')
    .select('*')
    .eq('activo', true)
    .limit(1);
  if (error) console.error('leer config_centro:', error.message);

  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
  const hoy = new Date();
  const anio = hoy.getFullYear();
  return hoy.getMonth() >= 8 ? `${anio}-${anio + 1}` : `${anio - 1}-${anio}`;
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

export async function POST(request) {
  try {
    // El cron de cada mañana no tiene sesión: se identifica con la clave
    // de cron, igual que los demás.
    const cronSecret = process.env.CRON_SECRET;
    const esCron = cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;
    const sesion = esCron ? { id: 'cron' } : await sesionDe(request);
    if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

    /**
     * HOY Y, COMO MUCHO, MAÑANA. NUNCA LA SEMANA.
     *
     * Antes se repartía hasta quince días por adelantado a partir de las
     * ausencias conocidas. Eso no se sostiene: el día tiene imprevistos.
     * Si a 3ª se pone malo un compañero, el reparto de esa hora cambia
     * entero, y lo que se hubiera dejado escrito el lunes para el jueves
     * no vale nada.
     *
     * Todo lo que sale de aquí es PROVISIONAL mientras no se fiche. Un
     * profesor que hoy no tiene guardia puede tenerla a 3ª porque ha
     * faltado alguien a media mañana. El sistema tiene que ser así de
     * vivo; encorchetarlo es lo que lo rompía.
     *
     * El reparto se rehace cuando cambia algo: al registrar una ausencia,
     * al aprobar un DLD, cuando jefatura lo pide, y cada mañana desde el
     * cron. Siempre sobre el día que se está viviendo.
     */
    const { fecha } = await request.json();
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return Response.json({ error: 'fecha_no_valida' }, { status: 400 });
    }

    // El día de hoy y, como mucho, el siguiente lectivo. Ni un día más.
    // Lo de mañana es orientativo y se volverá a calcular mañana por la
    // mañana: sirve para que alguien sepa que en principio le toca, no
    // para darlo por cerrado.
    const dias = [];
    let f = fecha;
    for (let i = 0; i < 5 && dias.length < 2; i++) {
      const ds = diaSemanaEs(f);
      if (ds !== 'sabado' && ds !== 'domingo') dias.push({ fecha: f, diaSemana: ds });
      f = sumarDias(f, 1);
    }
    if (dias.length === 0) {
      return Response.json({ ok: true, creadas: 0, motivo: 'fin_de_semana' });
    }

    const cliente = supa();
    const curso = await cursoActivo(cliente);

    // ─── Horarios del curso (paginados) ───
    let horarios = [];
    for (let offset = 0; ; offset += 1000) {
      const { data } = await cliente
        .from('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
        .eq('curso_academico', curso)
        .range(offset, offset + 999);
      if (!data || data.length === 0) break;
      horarios = horarios.concat(data);
      if (data.length < 1000) break;
    }
    if (horarios.length === 0) {
      return Response.json({ ok: true, creadas: 0, motivo: 'sin_horarios' });
    }

    // ─── Profesorado y equivalencias de nombre ───
    // El horario de Delphos y la ficha del profesor no siempre escriben
    // el nombre igual. Las equivalencias confirmadas a mano en Personal
    // son las que permiten reconocer a esas personas; sin ellas, el motor
    // sencillamente no las ve y no les genera guardias.
    const [{ data: profesores }, { data: equivalencias }] = await Promise.all([
      cliente.from('profesores')
        .select('id,nombre,apellidos,departamento,especialidad,en_baja,fecha_baja,sustituto_id,titular_id'),
      cliente.from('equivalencias_horario').select('nombre_horario, profesor_id'),
    ]);

    // ─── Faltas que tocan el rango: ausencias y DLD aprobados ───
    const ultimo = dias[dias.length - 1].fecha;   // hoy y, como mucho, mañana
    const [rAus, rAct, rDld] = await Promise.all([
      cliente.from('ausencias')
        .select('id, profesor_id, horas, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', ultimo)
        .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
      cliente.from('actividades')
        .select('grupos, alumnos_asistentes, fecha_inicio, fecha_fin, estado')
        .lte('fecha_inicio', ultimo)
        .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
      cliente.from('dld')
        .select('id, profesor_id, horas, fecha_solicitada')
        .gte('fecha_solicitada', fecha)
        .lte('fecha_solicitada', ultimo)
        .eq('estado', 'aprobada'),
    ]);

    /**
     * EL ESCENARIO DEL DÍA
     *
     * El punto de partida no son las ausencias sueltas, es quién está hoy
     * en el centro. Y ahí entran tres cosas:
     *
     *   · las ausencias y los DLD aprobados de ese día
     *   · quién está de baja, aunque nadie haya registrado una ausencia
     *     suya: la baja se marca en su ficha y eso ya basta
     *   · quién ha venido a sustituir a quién
     *
     * Lo de la baja hacía falta porque el motor solo miraba la tabla de
     * ausencias. Una baja antigua, o una cuya ausencia se borró, dejaba al
     * profesor como disponible y se le asignaban guardias estando de baja.
     */
    const listaProfes = profesores || [];

    // El sustituto asume el horario del titular, y con él sus guardias.
    const relevo = new Map();          // id del titular → id del sustituto
    listaProfes.forEach(p => {
      if (p.titular_id) relevo.set(p.titular_id, p.id);
    });
    listaProfes.forEach(p => {
      if (p.en_baja && p.sustituto_id && !relevo.has(p.id)) relevo.set(p.id, p.sustituto_id);
    });

    const faltas = [
      ...(rAus.data || []).map(a => ({ ...a, origen: 'ausencia' })),
      ...(rDld.data || []).map(d => ({ ...d, origen: 'dld' })),
    ];

    // Quien está de baja y NO tiene sustituto falta el día entero: sus
    // grupos hay que cubrirlos. Si ya tiene sustituto, no falta nadie: el
    // sustituto da sus clases y hace sus guardias.
    const yaTieneFalta = new Set(faltas.map(f => f.profesor_id));
    listaProfes
      .filter(p => p.en_baja && !relevo.has(p.id) && !yaTieneFalta.has(p.id))
      .filter(p => !p.fecha_baja || p.fecha_baja <= ultimo)
      .forEach(p => faltas.push({
        id: `baja-${p.id}`, profesor_id: p.id, origen: 'baja',
        horas: null, fecha_inicio: p.fecha_baja || fecha, fecha_fin: null,
      }));

    // Aunque no falte nadie, NO se sale: el recreo se vigila todos los días
    // y sus guardias hay que generarlas igual. Solo se saltan los repartos
    // de las horas de clase, que sin ausencias no tienen nada que cubrir.

    // ─── Guardias ya registradas ───
    const [{ data: yaEnRango }, { data: delCurso }] = await Promise.all([
      cliente.from('apoyos_asignados').select('*')
        .gte('fecha', fecha).lte('fecha', ultimo).eq('curso_academico', curso),
      cliente.from('apoyos_asignados')
        .select('sector_apoyo,sector_destino,profesor_id,estado')
        .eq('curso_academico', curso),
    ]);

    // Rotación: SOLO las fichadas. Una guardia sin fichar no cuenta.
    const apoyosPorProfesor = {};
    const apoyosFueraPorSector = {};
    (delCurso || []).forEach(a => {
      if (!FICHADAS.includes(a.estado)) return;
      if (a.profesor_id) {
        apoyosPorProfesor[a.profesor_id] = (apoyosPorProfesor[a.profesor_id] || 0) + 1;
      }
      // Para la rotación entre departamentos solo cuentan las salidas
      // fuera del propio sector: lo que se reparte es bajar a cubrir a otros.
      const suyo = normSector(a.sector_apoyo);
      const destino = normSector(a.sector_destino);
      if (suyo && destino && suyo !== destino) {
        apoyosFueraPorSector[suyo] = (apoyosFueraPorSector[suyo] || 0) + 1;
      }
    });

    const { porSector: cuadranteBruto, sinResolver } =
      construirCuadrante(horarios, listaProfes, equivalencias || []);

    /**
     * El cuadrante de guardias lleva el nombre del TITULAR, porque se
     * hizo en septiembre. Si esa persona está de baja y ha venido alguien
     * a sustituirla, quien hace esa guardia es el sustituto: ha asumido
     * su horario entero, y las guardias forman parte del horario.
     */
    const porFicha = new Map(listaProfes.map(p => [p.id, p]));
    const cuadrante = {};
    for (const [sector, dias] of Object.entries(cuadranteBruto || {})) {
      cuadrante[sector] = {};
      for (const [d, horas] of Object.entries(dias || {})) {
        cuadrante[sector][d] = {};
        for (const [h, gente] of Object.entries(horas || {})) {
          const vistos = new Set();
          cuadrante[sector][d][h] = (gente || []).map(g => {
            const sustituto = relevo.get(g.profesorId);
            if (!sustituto) return g;
            const f = porFicha.get(sustituto);
            if (!f) return g;
            return { ...g, profesorId: f.id, nombre: nombreDe(f) };
          }).filter(g => {
            if (!g.profesorId) return true;

            // CERROJO: quien está de baja no cubre nada. Da igual que su
            // ausencia esté registrada, que se borrara o que nadie la
            // creara nunca: si la ficha dice que está de baja, no está en
            // el centro y no puede estar en un aula. Esto no depende de
            // ningún otro flujo a propósito.
            if (porFicha.get(g.profesorId)?.en_baja) return false;

            // El sustituto puede estar ya en el cuadrante con su propio
            // nombre, si alguien actualizó el horario. Sin esto quedaría
            // dos veces a la misma hora y podría cubrir dos aulas a la vez.
            if (vistos.has(g.profesorId)) return false;
            vistos.add(g.profesorId);
            return true;
          });
        }
      }
    }
    if (sinResolver.length) {
      console.warn('preasignar: nombres del cuadrante sin ficha →', sinResolver.join(' | '));
    }

    // Dos compañeros con la misma abreviatura ("Gar. M, JL" puede ser
    // García Moreno o García Muñoz): a esos no se les asigna nada, y hay
    // que poder verlo en vez de que desaparezcan en silencio.
    const ambiguas = clavesAmbiguas(indiceProfesores(profesores || [], equivalencias || []));
    if (ambiguas.length) {
      console.warn('preasignar: abreviaturas ambiguas →',
        ambiguas.map(a => `${a.clave}: ${a.personas.join(' / ')}`).join(' | '));
    }

    /**
     * QUÉ SE PUEDE REHACER Y QUÉ NO
     *
     * El reparto no se calcula una vez al día: se recalcula cada vez que
     * alguien registra una ausencia. Hasta ahora TODO lo ya guardado era
     * intocable, aunque estuviera sin fichar, y eso rompía la regla del
     * centro por la puerta de atrás: cada ausencia nueva se encajaba en
     * las sobras de la anterior.
     *
     * Pasó el 15/09. A las 16:44 se registró una ausencia de Informática
     * y salió a cubrirla un guardia de TMV, con todo el derecho: a esa
     * hora no había ninguna ausencia en TMV. A las 20:01 se registró la
     * de Sánchez Anegas, de TMV, y ya no quedaba nadie en casa: sus tres
     * horas las cubrieron Industrias Alimentarias, General y FOL.
     *
     * La regla es que cada hora se resuelve entera y de cero. Para que
     * eso sea verdad, las propuestas que aún no ha fichado nadie tienen
     * que poder deshacerse.
     *
     * Intocable es solo lo que no se puede deshacer sin perjudicar a
     * alguien:
     *   · lo ya fichado, que es trabajo hecho
     *   · lo que puso una persona a mano desde jefatura
     *   · el recreo, que no sustituye a nadie
     *   · las horas que ya han pasado: rehacerlas no cambia nada de lo
     *     ocurrido y solo confunde a quien ya estuvo allí
     */
    const ahora = ahoraEnCentro();
    const aMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

    const yaPasada = (f, h) => {
      if (f < ahora.fecha) return true;
      if (f > ahora.fecha) return false;
      const fin = franja(h)?.fin;
      return fin ? ahora.minutos >= aMin(fin) : false;
    };

    const esIntocable = a =>
      FICHADAS.includes(a.estado)
      || a.estado === 'incidencia'
      || !!a.asignado_por
      || esSectorRecreo(a.sector_apoyo)
      || yaPasada(a.fecha, normHora(a.hora));

    const aBorrar = [];

    // ─── Cálculo, día por día ───
    const nuevas = [];
    const sinCubrir = [];

    for (const { fecha: diaFecha, diaSemana } of dias) {
      const delDia = faltas.filter(f => afectaA(f, diaFecha));
      /**
       * GUARDIAS DE RECREO
       *
       * El patio se vigila todos los días, falte quien falte: no son un
       * reparto, son del cuadrante tal cual. Cada profesor con guardia de
       * recreo recibe la suya, con su zona, para que salga en «Mis guardias»
       * con su botón de fichar y el de incidencias como cualquier otra.
       *
       * Ya pasan por el relevo de sustitutos y por el cerrojo de bajas del
       * cuadrante, así que las de alguien de baja las hace su sustituto. Y
       * solo se crean las que falten: repetir el reparto no las duplica.
       */
      const deRecreo = fichajesDeRecreo({ cuadrante, dia: diaSemana });
      const recreoYa = new Set(
        (yaEnRango || [])
          .filter(a => a.fecha === diaFecha && esSectorRecreo(a.sector_apoyo))
          .map(a => a.profesor_id || a.profesor_nombre_pdf));
      deRecreo.forEach(r => {
        const clave = r.profesorId || r.nombre;
        if (recreoYa.has(clave)) return;
        recreoYa.add(clave);
        nuevas.push({
          fecha: diaFecha,
          hora: 'recreo',
          sector_apoyo: 'RECREO',
          sector_destino: 'RECREO',
          profesor_ausente_id: null,
          profesor_id: r.profesorId || null,
          profesor_nombre_pdf: r.nombre,
          grupo: `Recreo · ${r.zona}`,
          aula: r.zona,
          materia: '',
          tarea: '',
          asignado_por: null,
          estado: 'pendiente',
          tipo_apoyo: 'recreo',
          curso_academico: curso,
          escalon: 0,
          motivo_asignacion: `Guardia de recreo, zona ${r.zona}.`,
        });
      });

      if (delDia.length === 0) continue;

      // Las horas salen de lo que marcó el profesor; si dejó las tareas
      // por módulo (ausencia larga) o no dejó nada (baja), del horario.
      const huecosBrutos = prepararHuecos(delDia, listaProfes, {
        horarios, dia: diaSemana, equivalencias: equivalencias || [],
      });

      /**
       * GRUPOS QUE HOY NO ESTÁN EN EL CENTRO
       *
       * Si 2º CAR se va entero de excursión, la clase de 2º CAR no hay que
       * cubrirla: no queda nadie a quien atender. Pero al profesor que se
       * va con ellos sí hay que cubrirle el resto de sus clases, las de
       * los grupos que se quedan.
       *
       * El dato ya lo recoge el módulo de actividades: por cada grupo se
       * guarda la lista de alumnos que van, o la palabra 'todos' si va el
       * grupo completo. Si va solo una parte, el resto se queda en el
       * centro y esa clase se cubre como cualquier otra.
       */
      const gruposFuera = [];
      (rAct.data || [])
        .filter(a => a.estado !== 'rechazada' && afectaA(a, diaFecha))
        .forEach(a => {
          const asistentes = a.alumnos_asistentes || {};
          (Array.isArray(a.grupos) ? a.grupos : []).forEach(g => {
            if (asistentes[g] === 'todos') gruposFuera.push(normGrupo(g));
          });
        });

      // El grupo de una clase viene dentro de un código largo de Delphos
      // ("IPCG-3095215GS-1GVEC(6 F109 COM)"), así que se busca dentro.
      const grupoSeHaIdo = texto => {
        if (!texto || gruposFuera.length === 0) return false;
        const t = normGrupo(texto);
        return gruposFuera.some(g => g && t.includes(g));
      };

      const huecos = huecosBrutos
        .map(h => ({ ...h, horas: (h.horas || []).filter(x => !grupoSeHaIdo(x.grupo)) }))
        .filter(h => (h.horas || []).length > 0 || h.diaCompleto);

      // Solo lo intocable condiciona el reparto. Lo demás se rehace.
      const yaCubiertos = (yaEnRango || [])
        .filter(a => a.fecha === diaFecha && esIntocable(a))
        .filter(a => !esSectorRecreo(a.sector_apoyo))
        .map(a => ({
          hora: normHora(a.hora),
          profesorAusenteId: a.profesor_ausente_id,
          profesorId: a.profesor_id,
        }));

      // Las propuestas antiguas de este día se borran y la hora se
      // resuelve entera otra vez.
      (yaEnRango || [])
        .filter(a => a.fecha === diaFecha && !esIntocable(a) && a.id)
        .forEach(a => aBorrar.push(a.id));

      for (const hora of HORAS_GUARDIA) {
        if (hora === 'recreo') continue;   // el recreo no sustituye a nadie

        // Quien da clase a esta hora no puede cubrir. Y si el horario es
        // de un titular de baja, quien está dando esa clase es su
        // sustituto: es él quien queda ocupado, no el que no ha venido.
        const enClaseBruto = ocupadosEnClase(horarios, listaProfes, diaSemana, hora, equivalencias || []);
        const enClase = new Set(
          [...enClaseBruto].map(id => relevo.get(id) || id)
        );

        const asignaciones = asignacionesDeHora({
          hora, dia: diaSemana, huecos, cuadrante, horarios,
          profesores: listaProfes,
          apoyosPorProfesor, apoyosFueraPorSector,
          yaCubiertos, ocupadosIds: enClase,
          equivalencias: equivalencias || [],
        });

        for (const asig of asignaciones) {
          if (!asig.cubre?.profesorId) {
            sinCubrir.push({
              fecha: diaFecha, hora,
              ausente: asig.hueco.profesor,
              grupo: asig.grupo || null,
              aula: asig.aula || null,
            });
            continue;
          }

          // Se apunta en la lista viva para que el resto de horas y
          // huecos de este mismo día no le asignen otra cosa a la vez.
          yaCubiertos.push({
            hora,
            profesorAusenteId: asig.hueco.profesorId,
            profesorId: asig.cubre.profesorId,
          });

          nuevas.push({
            fecha: diaFecha,
            hora,
            sector_apoyo: asig.cubre.sector,
            sector_destino: normSector(asig.hueco.sector),
            profesor_ausente_id: asig.hueco.profesorId || null,
            // Puede ir sin dueño: si el cuadrante dice que a esa hora hay
            // un guardia de ese departamento pero su nombre abreviado no
            // casa con ninguna ficha, la guardia se le asigna igualmente a
            // ese puesto. Queda a nombre del cuadrante hasta que alguien la
            // reclame desde la aplicación y se identifique de paso.
            profesor_id: asig.cubre.profesorId || null,
            // Nombre completo, no la abreviatura del cuadrante: lo que se
            // guarda aquí es lo que acaba viendo el profesorado.
            profesor_nombre_pdf: asig.cubre.nombrePdf || asig.cubre.nombre || null,
            grupo: asig.grupo || null,
            aula: asig.aula || null,
            materia: asig.materia || null,
            tarea: asig.instrucciones || null,
            asignado_por: null,          // la propuso el sistema, no una persona
            estado: 'pendiente',
            tipo_apoyo: asig.escalon === 0 ? 'sector' : 'obligatorio',
            /**
             * POR QUÉ LE HA TOCADO A ESTA PERSONA
             *
             * El motor ya sabía el motivo y el escalón, pero se perdían al
             * guardar. Quien recibe una guardia de otro departamento tiene
             * derecho a saber por qué: no es un capricho del programa, es
             * que en ese departamento no quedaba nadie libre a esa hora.
             * Explicarlo evita la mitad de las quejas.
             */
            escalon: asig.escalon,
            motivo_asignacion: (() => {
              const suyo = asig.hueco?.sector || 'su departamento';
              if (asig.escalon === 0) return `Guardia de ${suyo}, tu propio departamento.`;
              if (asig.escalon === 1) {
                return `A esta hora no quedaba nadie de guardia en ${suyo}, `
                  + `así que se ha pedido fuera. Te ha tocado por rotación: `
                  + `de los disponibles, eres quien menos guardias lleva hechas.`;
              }
              return `A esta hora no quedaba nadie libre ni en ${suyo} ni en las `
                + `guardias generales. Te ha tocado por rotación entre los `
                + `departamentos, repartiendo según el tamaño de cada uno.`;
            })(),
            curso_academico: curso,
          });
        }
      }
    }

    // Fuera las propuestas viejas que se acaban de rehacer. Se borran
    // ahora, justo antes de escribir las nuevas, para que la ventana en
    // la que el día está a medias sea lo más corta posible.
    for (let i = 0; i < aBorrar.length; i += 200) {
      const { error: errBorrado } = await cliente
        .from('apoyos_asignados').delete().in('id', aBorrar.slice(i, i + 200));
      if (errBorrado) {
        return Response.json({ error: errBorrado.message }, { status: 500 });
      }
    }

    if (nuevas.length === 0) {
      return Response.json({
        ok: true, creadas: 0, rehechas: aBorrar.length, motivo: 'todo_cubierto',
        dias: dias.length, sin_cubrir: sinCubrir,
        sin_resolver: sinResolver, ambiguas,
      });
    }

    const { error } = await cliente.from('apoyos_asignados').insert(nuevas);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    /**
     * AVISAR A QUIEN LE ACABA DE TOCAR
     *
     * El cuadrante se rehace durante la mañana: alguien se va a las once y
     * a las 11:35 el reparto cambia. Si no se avisa, el compañero se
     * entera cuando el grupo lleva diez minutos solo, o no se entera.
     *
     * Solo se avisa de las guardias de HOY y que empiezan a partir de
     * ahora: una de mañana no urge, y una cuya hora ya pasó solo serviría
     * para quedar mal. Y nunca puede tumbar el reparto: si el aviso falla,
     * la guardia está guardada igual.
     */
    const ahoraMadrid = ahoraEnCentro();
    const aAvisar = nuevas.filter(n =>
      n.profesor_id
      && n.fecha === ahoraMadrid.fecha
      && !esSectorRecreo(n.sector_apoyo)
      && (() => {
        const f = franja(normHora(n.hora));
        if (!f) return false;
        const fin = Number(f.fin.slice(0, 2)) * 60 + Number(f.fin.slice(3, 5));
        return ahoraMadrid.minutos < fin;      // aún no ha terminado
      })());

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
    await Promise.all(aAvisar.map(n => {
      const f = franja(normHora(n.hora));
      const cuando = f ? `${f.label} (${f.inicio})` : `${n.hora}ª`;
      const donde = (n.grupo || '').replace(/^[A-Z0-9-]+?(?=[A-Z]{2,})/, '').trim() || n.grupo || '';
      return fetch(`${base}/api/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
          cookie: request.headers.get('cookie') || '',
        },
        body: JSON.stringify({
          accion: 'enviar',
          profesor_id: n.profesor_id,
          titulo: `🛡️ Guardia a ${cuando}`,
          cuerpo: donde ? `Te toca cubrir ${donde}${n.aula ? ` · aula ${n.aula}` : ''}` : 'Tienes una guardia asignada',
          url: '/guardias',
        }),
      }).catch(() => {});
    }));

    return Response.json({
      ok: true,
      creadas: nuevas.length,
      rehechas: aBorrar.length,
      dias: dias.length,
      sin_cubrir: sinCubrir,
      sin_resolver: sinResolver,
      ambiguas,
    });
  } catch (e) {
    console.error('preasignar guardias:', e?.message);
    return Response.json({ error: 'fallo_al_preasignar' }, { status: 500 });
  }
}
