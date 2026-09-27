import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { indiceProfesores, buscaProfesor, nombreDe } from '@/lib/asignacionGuardias';
import { getCursoActual } from '@/lib/curso';
import { esSectorRecreo } from '@/lib/sectores';

/**
 * HORARIOS DEL PROFESORADO
 *
 * Son 3.000 registros de los que dependen el cuadrante de guardias, las
 * ausencias y las solicitudes de DLD. Con el permiso abierto en el
 * navegador, cualquiera podía vaciarlos de una sola orden y dejar el
 * centro sin cuadrante en plena mañana.
 *
 * Todas las operaciones exigen sesión de equipo directivo.
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

export async function POST(request) {
  try {
    const sesion = await sesionDe(request);
    if (!esDirectivo(sesion)) {
      return Response.json({ error: 'sin_permisos' }, { status: 403 });
    }

    const cuerpo = await request.json();
    const { accion, curso, tipo, profesor_id, lote } = cuerpo;
    const datosExtra = cuerpo;

    // ─── Borrar los horarios de un curso (antes de reimportarlos) ───
    /**
     * CUADRANTE DE GUARDIAS NUEVO: fuera TODAS las guardias anteriores, de
     * cualquier curso y recreos incluidos. Y se comprueba que no queda
     * ninguna antes de dejar cargar las nuevas: mezclar un cuadrante viejo
     * con el nuevo pone guardias a quien ya no las tiene.
     */
    if (accion === 'borrar_todas_las_guardias') {
      const cliente = supa();
      const { error } = await cliente.from('horarios_profesores').delete().eq('tipo', 'guardia');
      if (error) return Response.json({ error: error.message }, { status: 500 });
      const { count, error: e2 } = await cliente.from('horarios_profesores')
        .select('id', { count: 'exact', head: true }).eq('tipo', 'guardia');
      if (e2) return Response.json({ error: e2.message }, { status: 500 });
      if (count > 0) return Response.json({ error: `No se han podido borrar ${count} guardias antiguas. No se ha cargado nada.` }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'borrar_curso') {
      if (!curso) return Response.json({ error: 'Falta el curso' }, { status: 400 });

      let consulta = supa().from('horarios_profesores').delete().eq('curso_academico', curso);
      if (tipo) consulta = consulta.eq('tipo', tipo);   // solo guardias, por ejemplo

      /**
       * Carga del cuadrante de guardias: se sustituye TODO lo de guardia
       * (como siempre) salvo los sectores de RECREO que no vengan en esta
       * carga. Así los recreos se pueden subir aparte, en otro momento,
       * sin que una carga borre la otra.
       * Los nombres se comparan sin tildes: «HOSTELERÍA» y «HOSTELERIA»
       * son el mismo sector.
       */
      if (Array.isArray(cuerpo.sectoresNuevos)) {
        const clave = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const nuevos = new Set(cuerpo.sectoresNuevos.map(clave));
        const { data: filas } = await supa().from('horarios_profesores')
          .select('grupo').eq('curso_academico', curso).eq('tipo', 'guardia');
        const existentes = [...new Set((filas || []).map(f => f.grupo))];
        // Si la carga trae SOLO recreos, se sustituyen solo esos. Si trae
        // el cuadrante normal, se sustituye todo salvo los recreos que no
        // vengan en ella.
        const soloRecreos = cuerpo.sectoresNuevos.length > 0 && cuerpo.sectoresNuevos.every(esSectorRecreo);
        const borrar = existentes.filter(g => g && (soloRecreos
          ? nuevos.has(clave(g))
          : !(esSectorRecreo(g) && !nuevos.has(clave(g)))));
        if (borrar.length) {
          const { error } = await supa().from('horarios_profesores').delete()
            .eq('curso_academico', curso).eq('tipo', 'guardia').in('grupo', borrar);
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }
        // Filas de guardia sin sector (no deberían existir): fuera también
        await supa().from('horarios_profesores').delete()
          .eq('curso_academico', curso).eq('tipo', 'guardia').or('grupo.is.null,grupo.eq.');
        return Response.json({ ok: true, borrados: borrar });
      }

      const { error } = await consulta;
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Insertar un lote de la importación ───
    if (accion === 'insertar') {
      if (!Array.isArray(lote) || lote.length === 0) {
        return Response.json({ error: 'Lote vacío' }, { status: 400 });
      }
      if (lote.length > 600) {
        return Response.json({ error: 'Lote demasiado grande' }, { status: 400 });
      }

      const { error } = await supa().from('horarios_profesores').insert(lote);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, insertados: lote.length });
    }

    // ─── Borrar el horario de una persona (sustituciones) ───
    if (accion === 'borrar_de_profesor') {
      if (!profesor_id) return Response.json({ error: 'Falta el profesor' }, { status: 400 });

      const { error } = await supa().from('horarios_profesores')
        .delete().eq('profesor_id', profesor_id);

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    // ─── Copiar el horario de un titular a su sustituto ───
    //
    // Antes lo hacía el navegador: buscaba el horario del titular con un
    // "se parece a su primer apellido", así que a un titular apellidado
    // Gómez le copiaba el horario de todos los Gómez del centro. Y grababa
    // el del sustituto con una abreviatura inventada, cuando las clases se
    // guardan con el nombre completo.
    //
    // Ahora se identifica a cada persona igual que lo hace el motor de
    // guardias, y el horario copiado lleva el nombre completo.
    /**
     * TRASPASAR EL HORARIO AL SUSTITUTO
     *
     * Antes esto COPIABA el horario y dejaba el del titular intacto. El
     * resultado era que dos personas ocupaban el mismo horario: Consuegra
     * seguía con sus 18 clases y sus 3 guardias, y Laura Martín, su
     * sustituta, con otras 18 y otras 3. El centro contaba el doble de
     * gente de la que tenía.
     *
     * Y lo peor eran las guardias. La copia se hacía con el nombre
     * completo, pero el cuadrante de guardias lleva la abreviatura
     * ("Con. M, VA"), que es otra fila. Así que las guardias del titular
     * se quedaban a su nombre pasara lo que pasara con sus ausencias:
     * jefatura registraba una baja tras otra y él seguía saliendo en el
     * cuadrante, porque el motor lee el cuadrante y allí seguía estando.
     *
     * Ahora se TRASPASA. Las filas cambian de dueño —las de clase y las
     * de guardia, con abreviatura incluida— y se guarda de quién eran,
     * para poder devolverlas el día del alta. El titular desaparece del
     * cuadrante porque deja de estar en él, sin tocar el motor.
     */
    if (accion === 'traspasar_horario') {
      const { titular_id, sustituto_id } = datosExtra;
      if (!titular_id || !sustituto_id) {
        return Response.json({ error: 'Faltan el titular o el sustituto' }, { status: 400 });
      }

      const cliente = supa();
      const cursoActivo = curso || await getCursoActual();

      const { data: profesores } = await cliente
        .from('profesores').select('id,nombre,apellidos');
      const titular = (profesores || []).find(p => p.id === titular_id);
      const sustituto = (profesores || []).find(p => p.id === sustituto_id);
      if (!titular || !sustituto) {
        return Response.json({ error: 'Profesor no encontrado' }, { status: 404 });
      }

      const indice = indiceProfesores(profesores || []);

      let horarios = [];
      for (let offset = 0; ; offset += 1000) {
        const { data } = await cliente.from('horarios_profesores')
          .select('*').eq('curso_academico', cursoActivo).range(offset, offset + 999);
        if (!data || data.length === 0) break;
        horarios = horarios.concat(data);
        if (data.length < 1000) break;
      }

      // Suyas y solo suyas: se identifica a la persona, no se busca un
      // parecido en el apellido. Aquí entran también las filas del
      // cuadrante de guardias, que van con su abreviatura.
      const suyas = horarios.filter(h =>
        buscaProfesor(indice, h.profesor_nombre_pdf)?.id === titular.id);

      if (suyas.length === 0) {
        return Response.json({ ok: true, traspasados: 0, motivo: 'el titular no tiene horario' });
      }

      // Restos de traspasos anteriores del sustituto, si los hubiera.
      await cliente.from('horarios_profesores')
        .delete().eq('profesor_id', sustituto_id).eq('curso_academico', cursoActivo);

      let traspasados = 0;
      for (const h of suyas) {
        const { error } = await cliente.from('horarios_profesores')
          .update({
            profesor_id: sustituto_id,
            profesor_nombre_pdf: nombreDe(sustituto),
            // De quién era y cómo se llamaba aquí: es lo que permite
            // devolvérselo intacto el día que se incorpore.
            titular_original_id: titular.id,
            nombre_original_pdf: h.profesor_nombre_pdf,
          })
          .eq('id', h.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        traspasados++;
      }

      return Response.json({ ok: true, traspasados, nombre: nombreDe(sustituto) });
    }

    /**
     * VOLVER A APLICAR LAS SUSTITUCIONES (tras cargar horarios o cuadrante)
     *
     * Peñalara trae el horario a nombre del TITULAR aunque esté de baja.
     * Cada carga nueva devolvía sus clases y guardias al titular, y había
     * que repetir «Asignar sustituto» baja por baja. Ahora, para cada
     * sustitución vigente (el sustituto tiene anotado su titular y el
     * titular sigue de baja), se pasan al sustituto las filas que sigan a
     * nombre del titular.
     *
     * A diferencia del traspaso inicial, aquí NO se borra nada del
     * sustituto: lo que ya tenía pasado de antes (sus clases, si ahora se
     * ha subido solo el cuadrante) se queda donde está.
     */
    if (accion === 'reaplicar_sustituciones') {
      const cliente = supa();
      const cursoActivo = curso || await getCursoActual();

      const { data: profesores } = await cliente
        .from('profesores').select('id,nombre,apellidos,en_baja,titular_id,estado');
      const porId = new Map((profesores || []).map(p => [p.id, p]));
      const pares = (profesores || [])
        .filter(s => s.titular_id && s.estado !== 'inactivo' && porId.get(s.titular_id)?.en_baja)
        .map(s => ({ sustituto: s, titular: porId.get(s.titular_id) }));
      if (pares.length === 0) return Response.json({ ok: true, sustituciones: 0, traspasados: 0, detalle: [] });

      const indice = indiceProfesores(profesores || []);
      let horarios = [];
      for (let offset = 0; ; offset += 1000) {
        const { data } = await cliente.from('horarios_profesores')
          .select('id, profesor_nombre_pdf').eq('curso_academico', cursoActivo).range(offset, offset + 999);
        if (!data || data.length === 0) break;
        horarios = horarios.concat(data);
        if (data.length < 1000) break;
      }

      let total = 0;
      const detalle = [];
      for (const { titular, sustituto } of pares) {
        const suyas = horarios.filter(h => buscaProfesor(indice, h.profesor_nombre_pdf)?.id === titular.id);
        for (const h of suyas) {
          const { error } = await cliente.from('horarios_profesores').update({
            profesor_id: sustituto.id,
            profesor_nombre_pdf: nombreDe(sustituto),
            titular_original_id: titular.id,
            nombre_original_pdf: h.profesor_nombre_pdf,
          }).eq('id', h.id);
          if (error) return Response.json({ error: error.message }, { status: 500 });
        }
        total += suyas.length;
        detalle.push({ titular: nombreDe(titular), sustituto: nombreDe(sustituto), horas: suyas.length });
      }
      return Response.json({ ok: true, sustituciones: pares.length, traspasados: total, detalle });
    }

    /**
     * DEVOLVER EL HORARIO AL TITULAR
     *
     * El día del alta, cada fila vuelve a su dueño con el nombre que
     * tenía, abreviatura del cuadrante incluida. Si no se hace, el
     * sustituto seguiría dando sus clases y haciendo sus guardias
     * aunque ya se hubiera ido del centro.
     */
    if (accion === 'devolver_horario') {
      const { titular_id } = datosExtra;
      if (!titular_id) return Response.json({ error: 'Falta el titular' }, { status: 400 });

      const cliente = supa();
      const { data: prestadas } = await cliente.from('horarios_profesores')
        .select('id, nombre_original_pdf').eq('titular_original_id', titular_id);

      let devueltos = 0;
      for (const h of (prestadas || [])) {
        const { error } = await cliente.from('horarios_profesores')
          .update({
            profesor_id: titular_id,
            profesor_nombre_pdf: h.nombre_original_pdf,
            titular_original_id: null,
            nombre_original_pdf: null,
          })
          .eq('id', h.id);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        devueltos++;
      }

      return Response.json({ ok: true, devueltos });
    }


    return Response.json({ error: 'Acción desconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
