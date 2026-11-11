import { createClient } from '@supabase/supabase-js';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal } from '@/lib/fechas';

/**
 * PANTALLA DE LA SALA DE PROFESORES
 *
 * Esta ruta NO pide sesión, y es a propósito: la pantalla está colgada
 * en la pared de la sala y la enciende cualquiera por la mañana. Pedir
 * contraseña ahí sería inservible.
 *
 * A cambio, devuelve lo mínimo y solo del día de hoy: quién falta, qué
 * horas deja libres y quién cubre. Es exactamente lo que antes estaba
 * escrito en el tablón de corcho.
 *
 * Lo que NO sale nunca: motivos de ausencia, justificaciones, causas de
 * los DLD, comentarios internos, ni nada de días distintos de hoy.
 */

function supa() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

// «1a», «1ª hora», {hora: '1ª'} → '1'
function numHora(h) {
  const v = typeof h === 'object' && h ? h.hora : h;
  const m = String(v ?? '').match(/\d+/);
  return m ? m[0] : null;
}

/**
 * A qué horas falta hoy. Primero la columna 'dias' (las horas reales de
 * ese día, sacadas del horario al registrar); si no la hay, la lista
 * antigua 'horas'. null = el día entero. Antes solo se miraba 'horas',
 * que en las bajas y días completos está vacía: salían en la sala sin
 * ninguna hora marcada y el contador de «ahora» se quedaba en 0.
 */
function horasDeHoy(a, hoy) {
  const unir = lista => [...new Set(lista.map(numHora).filter(Boolean))];
  if (Array.isArray(a.dias)) {
    const delDia = a.dias.find(d => d && d.fecha === hoy);
    if (delDia && Array.isArray(delDia.horas) && delDia.horas.length > 0) return unir(delDia.horas);
  }
  if (Array.isArray(a.horas) && a.horas.length > 0) return unir(a.horas);
  return null;
}

export async function GET(request) {
  try {
    // Se puede pedir otro día para ver cómo queda el escenario. Solo la
    // fecha: nunca llega de aquí un motivo de ausencia ni nada personal,
    // igual que en el día de hoy. La pantalla no tiene sesión.
    const pedida = new URL(request.url).searchParams.get('fecha');
    const valida = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && !isNaN(new Date(pedida + 'T12:00:00'));
    const hoy = valida ? pedida : hoyLocal();
    const cliente = supa();

    // Semana en curso, de lunes a domingo, para las extraescolares
    const d = new Date(hoy + 'T12:00:00');
    const diaSemana = (d.getDay() + 6) % 7;           // 0 = lunes
    const lunes = new Date(d); lunes.setDate(d.getDate() - diaSemana);
    const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
    const iso = f => f.toISOString().slice(0, 10);
    const lunesStr = iso(lunes), domingoStr = iso(domingo);

    const [aus, dlds, apoyos, avisos, actividades] = await Promise.all([
      cliente.from('ausencias')
        .select('profesor_nombre, horas, dias, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', hoy)
        .or(`fecha_fin.gte.${hoy},fecha_fin.is.null`),

      cliente.from('dld')
        .select('profesor_nombre, horas, grupos_afectados, guardias_horario')
        .eq('fecha_solicitada', hoy)
        .eq('estado', 'aprobada'),

      cliente.from('apoyos_asignados')
        .select('*')
        .eq('fecha', hoy),

      cliente.from('avisos_sala')
        .select('*')
        .eq('activo', true)
        .order('created_at', { ascending: false }),

      // Extraescolares de esta semana (las rechazadas se descartan luego)
      cliente.from('actividades')
        .select('titulo, profesor_nombre, acompanantes, grupos, fecha_inicio, fecha_fin, lugar, estado')
        .lte('fecha_inicio', domingoStr)
        .or(`fecha_fin.gte.${lunesStr},fecha_fin.is.null`)
        .order('fecha_inicio', { ascending: true }),
    ]);

    // Nombre completo de quien cubre. En la fila se guarda la abreviatura
    // del cuadrante («M Núñ.»), y en la tele así no se sabe quién es.
    // Primero por su ficha (profesor_id); si la guardia aún no tiene
    // dueño, por las equivalencias del cuadrante ya confirmadas.
    const listaApoyos = (apoyos.data || []).filter(a => a.estado !== 'anulada');
    const ids = [...new Set(listaApoyos.map(a => a.profesor_id).filter(Boolean))];
    const sinId = [...new Set(listaApoyos.filter(a => !a.profesor_id && a.profesor_nombre_pdf).map(a => a.profesor_nombre_pdf))];
    const equivs = sinId.length
      ? ((await cliente.from('equivalencias_horario').select('nombre_horario, profesor_id').in('nombre_horario', sinId)).data || [])
      : [];
    const todosIds = [...new Set([...ids, ...equivs.map(e => e.profesor_id).filter(Boolean)])];
    const fichas = todosIds.length
      ? ((await cliente.from('profesores').select('id, nombre, apellidos').in('id', todosIds)).data || [])
      : [];
    const porId = Object.fromEntries(fichas.map(f => [f.id, `${(f.nombre || '').trim()} ${(f.apellidos || '').trim()}`.trim()]));
    const porPdf = Object.fromEntries(equivs.map(e => [e.nombre_horario, porId[e.profesor_id]]));

    return Response.json({
      fecha: hoy,
      // Solo el nombre y los números de hora de HOY. La columna 'dias'
      // lleva tareas y archivos, que no pueden salir por una ruta sin
      // sesión: se resuelve aquí y no se envía.
      ausencias: (aus.data || []).map(a => ({
        profesor_nombre: a.profesor_nombre,
        horas_hoy: horasDeHoy(a, hoy),
      })),
      dlds: dlds.data || [],
      // Las anuladas por jefatura no se cubren: no se enseñan en la sala.
      // Solo lo que se pinta en la tele: nada de tareas ni motivos.
      apoyos: listaApoyos.map(a => ({
        hora: a.hora,
        estado: a.estado,
        grupo: a.grupo,
        aula: a.aula,
        profesor_nombre_pdf: a.profesor_nombre_pdf,
        nombre_completo: porId[a.profesor_id] || porPdf[a.profesor_nombre_pdf] || null,
      })),
      // Un aviso con fecha «visible hasta» sale ese día incluido y
      // desaparece solo al siguiente.
      avisos: (avisos.data || []).filter(a => !a.visible_hasta || a.visible_hasta >= hoy),
      actividades: (actividades.data || []).filter(a => a.estado !== 'rechazada'),
      semana: { desde: lunesStr, hasta: domingoStr },
    });
  } catch (e) {
    return Response.json({ error: e.message, ausencias: [], dlds: [], apoyos: [], avisos: [] }, { status: 500 });
  }
}
