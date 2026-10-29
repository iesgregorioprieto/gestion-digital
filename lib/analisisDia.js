/**
 * ANÁLISIS DEL DÍA: QUÉ CLASES SE PIERDEN Y QUÉ GRUPOS LO SUFREN
 *
 * Petición de José María (#231, 27/10/2026):
 *   · Al revisar un DLD, que la app compruebe si algún grupo se queda sin
 *     su profesor en MÁS DE 2 periodos lectivos ese día, y que si no pasa
 *     lo diga también («no existe ese problema»).
 *   · En el análisis del día, ver las horas de clase que pierde cada
 *     profesor ausente.
 *
 * Hasta ahora el aviso de grupos del DLD solo cruzaba unos DLD con
 * otros, con los grupos que cada profesor escribió en su solicitud. No
 * sabía nada de las ausencias, ni de las bajas: un grupo podía perder
 * tres horas por dos ausencias y un DLD sin que saliera nada.
 *
 * Aquí se mira el día entero, con el horario real:
 *   · ausencias (con sus horas de ese día, si las tiene guardadas)
 *   · bajas marcadas en la ficha sin ausencia registrada
 *   · DLD aprobados
 *   · y, si se pide, el DLD que se está revisando, como si se concediera
 *
 * Mismo criterio que el reparto de guardias:
 *   · quien tiene sustituto no deja nada: sus clases las da el sustituto
 *   · las guardias y las horas sin alumnos (OTRA, LFPDU, EAPP…) no cuentan
 *   · si el grupo entero está fuera en una actividad a esa hora, esa hora
 *     no la pierde (no está en el centro)
 *   · el recreo no es un periodo lectivo
 *
 * Un periodo cuenta una vez por grupo aunque falten dos profesores a la
 * misma hora (desdobles).
 */
import { normHora, actividadOcupaHora, esHoraSinAlumnos, diaSemanaEs } from '@/lib/asignacionGuardias';
import { separarGrupoAula, claveGrupo, normGrupo } from '@/lib/grupos';
import { datosNombres } from '@/lib/cacheNombres';

export const UMBRAL_PERIODOS = 2;   // «más de 2 periodos lectivos»

async function cursoActivo(cliente) {
  const { data } = await cliente.from('config_centro').select('*').eq('activo', true).limit(1);
  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
  const hoy = new Date();
  const anio = hoy.getFullYear();
  return hoy.getMonth() >= 8 ? `${anio}-${anio + 1}` : `${anio - 1}-${anio}`;
}

// «1ª hora», «1a», «1» → «1». Recreo → 'recreo'. Tarde → tal cual.
function claveHora(h) {
  const s = String(h ?? '').toLowerCase().trim();
  if (s.includes('recreo')) return 'recreo';
  const m = s.match(/^(\d)/);
  return m ? m[1] : normHora(s);
}

const ordenHora = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });

/** Los grupos que hay en un texto del horario o de un DLD. */
function gruposDe(texto) {
  const { grupo } = separarGrupoAula(texto);
  return (grupo || '').split(',').map(g => g.trim()).filter(Boolean);
}

/**
 * @param cliente  Supabase con clave de servidor
 * @param fecha    'AAAA-MM-DD'
 * @param opciones.dldId  DLD que se está revisando: se suma como si se concediera
 * @returns {
 *   porProfesor: Map(profesorId → [{ hora, grupo, materia, grupoFuera }]),
 *   grupos: [{ grupo, periodos: [{ hora, profesor, origen, esEsteDld }], tocaEsteDld }],
 *   dld: la fila del DLD revisado (o null)
 * }
 */
export async function analizarDia(cliente, fecha, { dldId = null } = {}) {
  const dia = diaSemanaEs(fecha);
  const vacio = { porProfesor: new Map(), grupos: [], dld: null };
  if (dia === 'sabado' || dia === 'domingo') return vacio;

  const curso = await cursoActivo(cliente);

  const [rProf, rAus, rAct, rDld] = await Promise.all([
    cliente.from('profesores')
      .select('id, nombre, apellidos, en_baja, fecha_baja, sustituto_id, titular_id'),
    cliente.from('ausencias')
      .select('id, profesor_id, profesor_nombre, subtipo, horas, dias, fecha_inicio, fecha_fin')
      .lte('fecha_inicio', fecha)
      .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
    cliente.from('actividades')
      .select('grupos, alumnos_asistentes, fecha_inicio, fecha_fin, estado, horas, hora_salida, hora_regreso')
      .lte('fecha_inicio', fecha)
      .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
    cliente.from('dld')
      .select('id, profesor_id, profesor_nombre, grupos_afectados, fecha_solicitada, estado')
      .eq('fecha_solicitada', fecha),
  ]);
  if (rAus.error) throw new Error(rAus.error.message);

  const profesores = rProf.data || [];
  const ficha = new Map(profesores.map(p => [p.id, p]));
  const nombreDe = (id, respaldo) => {
    const p = ficha.get(id);
    return p ? `${p.nombre || ''} ${p.apellidos || ''}`.trim() : (respaldo || '—');
  };

  // Quien tiene sustituto no deja ninguna clase: el horario es del sustituto.
  const conSustituto = new Set();
  profesores.forEach(p => {
    if (p.titular_id) conSustituto.add(p.titular_id);
    if (p.en_baja && p.sustituto_id) conSustituto.add(p.id);
  });

  // ─── Quién falta ese día ───
  const faltas = [];   // { profesorId, nombre, origen, horasDeclaradas, diasGuardados, gruposDld, esEsteDld }
  const ausDld = new Set();
  (rAus.data || []).forEach(a => {
    if (a.subtipo === 'dld') ausDld.add(a.profesor_id);
    faltas.push({
      profesorId: a.profesor_id,
      nombre: nombreDe(a.profesor_id, a.profesor_nombre),
      origen: a.subtipo === 'dld' ? 'DLD' : 'ausencia',
      horasDeclaradas: Array.isArray(a.horas) ? a.horas : [],
      diaGuardado: (Array.isArray(a.dias) ? a.dias : []).find(d => d?.fecha === fecha) || null,
    });
  });

  const dlds = rDld.data || [];
  const dldRevisado = dldId ? dlds.find(d => String(d.id) === String(dldId)) || null : null;
  dlds
    .filter(d => d.estado === 'aprobada' || (dldRevisado && d.id === dldRevisado.id))
    .forEach(d => {
      const esEste = !!dldRevisado && d.id === dldRevisado.id;
      // El DLD concedido ya tiene su ausencia «DLD»: no se cuenta dos veces.
      if (!esEste && d.profesor_id && ausDld.has(d.profesor_id)) return;
      if (esEste && d.profesor_id && faltas.some(f => f.profesorId === d.profesor_id && f.origen === 'DLD')) {
        faltas.find(f => f.profesorId === d.profesor_id && f.origen === 'DLD').esEsteDld = true;
        return;
      }
      faltas.push({
        profesorId: d.profesor_id || `dld-${d.id}`,
        nombre: nombreDe(d.profesor_id, d.profesor_nombre),
        origen: 'DLD',
        horasDeclaradas: [],          // un DLD es el día entero
        gruposDld: Array.isArray(d.grupos_afectados) ? d.grupos_afectados : [],
        esEsteDld: esEste,
      });
    });

  // Bajas de la ficha sin ausencia registrada (igual que el reparto)
  const yaFalta = new Set(faltas.map(f => f.profesorId));
  profesores
    .filter(p => p.en_baja && !conSustituto.has(p.id) && !yaFalta.has(p.id))
    .filter(p => !p.fecha_baja || p.fecha_baja <= fecha)
    .forEach(p => faltas.push({
      profesorId: p.id, nombre: nombreDe(p.id), origen: 'baja', horasDeclaradas: [],
    }));

  if (faltas.length === 0) return { ...vacio, dld: dldRevisado };

  // ─── Horario de ese día de quienes faltan (solo sus filas) ───
  const { duenio } = await datosNombres(cliente, curso);
  const ids = new Set(faltas.map(f => f.profesorId));
  const nombresPdf = [...duenio.entries()].filter(([, id]) => id && ids.has(id)).map(([n]) => n);
  let horario = [];
  for (let i = 0; i < nombresPdf.length; i += 100) {
    const { data } = await cliente.from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, materia')
      .eq('curso_academico', curso).eq('dia', dia)
      .in('profesor_nombre_pdf', nombresPdf.slice(i, i + 100));
    horario = horario.concat(data || []);
  }

  // Grupos enteros fuera del centro por una actividad
  const gruposFuera = [];
  (rAct.data || []).filter(a => a.estado !== 'rechazada').forEach(a => {
    const asistentes = a.alumnos_asistentes || {};
    (Array.isArray(a.grupos) ? a.grupos : []).forEach(g => {
      if (asistentes[g] === 'todos') gruposFuera.push({ g: normGrupo(g), act: a });
    });
  });
  const estaFuera = (grupo, hora) => {
    const t = normGrupo(grupo);
    return !!t && gruposFuera.some(({ g, act }) => g && t.includes(g) && actividadOcupaHora(act, hora));
  };

  const esClase = h => (h.tipo || '').toLowerCase() !== 'guardia'
    && (h.tipo || '').toLowerCase() !== 'complementaria'
    && !esHoraSinAlumnos(h);

  // ─── Horas de clase que pierde cada uno ───
  const porProfesor = new Map();
  for (const f of faltas) {
    if (conSustituto.has(f.profesorId)) { porProfesor.set(f.profesorId, []); continue; }

    let clases;
    if (f.diaGuardado && Array.isArray(f.diaGuardado.horas)) {
      // Lo calculado al registrar la ausencia, contra el horario real.
      clases = f.diaGuardado.horas
        .filter(h => h.tipo === 'clase' && !esHoraSinAlumnos(h))
        .map(h => ({ hora: claveHora(h.hora), texto: h.grupo, materia: h.materia || '' }));
    } else {
      const delHorario = horario
        .filter(h => duenio.get(h.profesor_nombre_pdf) === f.profesorId)
        .filter(esClase)
        .map(h => ({ hora: claveHora(h.hora_id), texto: h.grupo, materia: h.materia || '' }));
      // Si marcó horas concretas, solo esas; si no, el día entero.
      const marcadas = new Set((f.horasDeclaradas || [])
        .map(d => claveHora(d?.hora)).filter(h => /^\d$/.test(h)));
      clases = marcadas.size ? delHorario.filter(h => marcadas.has(h.hora)) : delHorario;

      // DLD de alguien sin horario reconocido: lo que puso en la solicitud.
      if (clases.length === 0 && f.gruposDld?.length) {
        clases = [];
        f.gruposDld.forEach(g => {
          const texto = typeof g === 'object' ? g.grupo : g;
          (Array.isArray(g?.horas) ? g.horas : []).forEach(h =>
            clases.push({ hora: claveHora(h), texto, materia: '' }));
        });
      }
    }

    const lista = clases
      .filter(c => c.hora && c.hora !== 'recreo')
      .map(c => {
        const grupos = gruposDe(c.texto);
        return {
          hora: c.hora,
          grupo: grupos.join(', ') || (c.texto || '').split('(')[0].trim(),
          grupos,
          materia: c.materia,
          grupoFuera: grupos.length > 0 && grupos.every(g => estaFuera(g, c.hora)),
        };
      })
      .sort((a, b) => ordenHora(a.hora, b.hora));

    // Si tiene dos registros ese día, se juntan sin repetir horas.
    const previas = porProfesor.get(f.profesorId) || [];
    const vistas = new Set(previas.map(x => `${x.hora}|${x.grupo}`));
    porProfesor.set(f.profesorId,
      [...previas, ...lista.filter(x => !vistas.has(`${x.hora}|${x.grupo}`))].sort((a, b) => ordenHora(a.hora, b.hora)));
  }

  // ─── Por grupo ───
  const porGrupo = new Map();   // clave → { grupo, horas: Map(hora → [{profesor, origen, esEsteDld}]) }
  for (const f of faltas) {
    for (const c of porProfesor.get(f.profesorId) || []) {
      for (const g of c.grupos) {
        if (estaFuera(g, c.hora)) continue;
        const k = claveGrupo(g);
        if (!k) continue;
        if (!porGrupo.has(k)) porGrupo.set(k, { grupo: g, horas: new Map() });
        const e = porGrupo.get(k);
        if (!e.horas.has(c.hora)) e.horas.set(c.hora, []);
        const quien = e.horas.get(c.hora);
        if (!quien.some(q => q.profesor === f.nombre)) {
          quien.push({ profesor: f.nombre, origen: f.origen, esEsteDld: !!f.esEsteDld });
        }
      }
    }
  }

  const grupos = [...porGrupo.values()].map(e => {
    const periodos = [...e.horas.entries()]
      .sort((a, b) => ordenHora(a[0], b[0]))
      .map(([hora, quien]) => ({ hora, quien }));
    return {
      grupo: e.grupo,
      periodos,
      tocaEsteDld: periodos.some(p => p.quien.some(q => q.esEsteDld)),
      // Sin el DLD revisado, ¿cuántos periodos perdería?
      sinEsteDld: periodos.filter(p => p.quien.some(q => !q.esEsteDld)).length,
    };
  }).sort((a, b) => b.periodos.length - a.periodos.length || a.grupo.localeCompare(b.grupo));

  return { porProfesor, grupos, dld: dldRevisado };
}
