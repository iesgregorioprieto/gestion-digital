/**
 * QUIÉN ESTÁ DE GUARDIA A ESTA HORA, Y CÓMO ESTÁ
 *
 * Jefatura necesita ver el cuadrante de una hora tal como está de verdad
 * para poder cambiar a quien cubre: si a 1ª falta alguien de Comercio y
 * lo está cubriendo alguien de Electricidad, quieren poder ponerle otro,
 * sea porque el reparto se equivocó o por cualquier motivo del día.
 *
 * Hasta ahora esa lista de candidatos la calculaba el navegador con las
 * reglas viejas: no sabía quién está de baja, ni quién tiene sustituto,
 * ni quién ya está cubriendo otra cosa a esa misma hora. Proponía gente
 * que no está en el centro y se dejaba fuera a gente que sí.
 *
 * Aquí se calcula con los mismos datos que usa el reparto, y de cada
 * persona se dice en qué estado está:
 *
 *   libre     · está de guardia a esa hora y no tiene nada asignado
 *   ocupado   · ya está cubriendo otra guardia a esa misma hora
 *   en_clase  · tiene clase a esa hora
 *   ausente   · no ha venido hoy
 *   de_baja   · no está en el centro
 *
 * Se devuelven todos, de todos los departamentos, con su estado. Quien
 * decide es la persona, no el programa: por eso no se ocultan los que no
 * están libres, se marcan.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import {
  construirCuadrante, ocupadosEnClase, normHora, diaSemanaEs, nombreDe,
} from '@/lib/asignacionGuardias';
import { getCursoActual } from '@/lib/curso';

export const dynamic = 'force-dynamic';

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

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) {
    return Response.json({ error: 'solo_equipo_directivo' }, { status: 403 });
  }

  const url = new URL(request.url);
  const fecha = url.searchParams.get('fecha');
  const hora = normHora(url.searchParams.get('hora'));
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !hora) {
    return Response.json({ error: 'faltan_datos' }, { status: 400 });
  }

  try {
    const cliente = supa();
    const curso = await getCursoActual();
    const dia = diaSemanaEs(fecha);

    const [{ data: profesores }, { data: equivalencias }, { data: asignados }, { data: ausencias }] =
      await Promise.all([
        cliente.from('profesores')
          .select('id, nombre, apellidos, departamento, en_baja, sustituto_id, titular_id'),
        cliente.from('equivalencias_horario').select('nombre_horario, profesor_id'),
        cliente.from('apoyos_asignados').select('profesor_id, hora').eq('fecha', fecha),
        cliente.from('ausencias')
          .select('profesor_id, dias, fecha_inicio, fecha_fin')
          .lte('fecha_inicio', fecha)
          .or(`fecha_fin.gte.${fecha},fecha_fin.is.null`),
      ]);

    let horarios = [];
    for (let desde = 0; ; desde += 1000) {
      const { data } = await cliente.from('horarios_profesores')
        .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, aula')
        .eq('curso_academico', curso).range(desde, desde + 999);
      if (!data || data.length === 0) break;
      horarios = horarios.concat(data);
      if (data.length < 1000) break;
    }

    const lista = profesores || [];
    const porId = new Map(lista.map(p => [p.id, p]));

    const { porSector } = construirCuadrante(horarios, lista, equivalencias || []);
    const enClase = ocupadosEnClase(horarios, lista, dia, hora, equivalencias || []);

    const yaCubriendo = new Set(
      (asignados || []).filter(a => normHora(a.hora) === hora && a.profesor_id)
        .map(a => a.profesor_id));

    // Ausente a esta hora concreta, según lo que quedó escrito en la
    // ausencia. Si no tiene días calculados, se da por el día entero.
    const ausentes = new Set();
    (ausencias || []).forEach(a => {
      if (!a.profesor_id) return;
      const dias = Array.isArray(a.dias) ? a.dias : null;
      if (!dias) { ausentes.add(a.profesor_id); return; }
      const hoy = dias.find(d => d.fecha === fecha);
      if (!hoy) return;
      if ((hoy.horas || []).some(h => normHora(h.hora) === hora)) ausentes.add(a.profesor_id);
    });

    const sectores = {};
    for (const [sector, dias] of Object.entries(porSector || {})) {
      const gente = ((dias || {})[dia] || {})[hora] || [];
      if (gente.length === 0) continue;

      sectores[sector] = gente.map(g => {
        const ficha = g.id ? porId.get(g.id) : null;
        let estado = 'libre';
        if (!g.id) estado = 'sin_identificar';
        else if (ficha?.en_baja) estado = 'de_baja';
        else if (ausentes.has(g.id)) estado = 'ausente';
        else if (yaCubriendo.has(g.id)) estado = 'ocupado';
        else if (enClase.has(g.id)) estado = 'en_clase';

        return {
          profesorId: g.id,
          nombre: ficha ? nombreDe(ficha) : g.nombre,
          departamento: ficha?.departamento || g.departamento || '',
          sector,
          estado,
        };
      }).sort((a, b) => {
        const orden = { libre: 0, sin_identificar: 1, ocupado: 2, en_clase: 3, ausente: 4, de_baja: 5 };
        return (orden[a.estado] - orden[b.estado]) || a.nombre.localeCompare(b.nombre, 'es');
      });
    }

    const libres = Object.values(sectores).flat().filter(p => p.estado === 'libre').length;
    return Response.json({ ok: true, fecha, hora, libres, sectores });
  } catch (e) {
    console.error('guardias/libres:', e?.message);
    return Response.json({ error: 'fallo_al_calcular' }, { status: 500 });
  }
}
