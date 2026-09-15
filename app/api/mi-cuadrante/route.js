/**
 * ¿ERES TÚ? — IDENTIFICACIÓN EN EL CUADRANTE DE GUARDIAS
 *
 * El cuadrante de Delphos escribe los nombres abreviados ("Che. G, J") y
 * la ficha la rellena cada profesor a su manera ("Checa, Javier"). Cuando
 * no casan, esa persona no existe para el motor: no se le generan
 * guardias, su sector parece más pequeño de lo que es y baja gente de
 * otro sitio sin necesidad.
 *
 * Hasta ahora eso solo lo podía arreglar jefatura a mano. Aquí lo
 * arregla el propio interesado: al abrir la aplicación se le enseña el
 * puesto del cuadrante que encaja con su nombre, con sus días y sus
 * horas, y él confirma si es suyo. Lo confirmado se guarda en
 * 'equivalencias_horario' y vale para todo el curso y para los
 * siguientes, porque Delphos abrevia igual año tras año.
 *
 * Reglas de seguridad:
 *   - A cada uno solo se le ofrecen los puestos compatibles con SU
 *     propio apellido. Nadie puede apropiarse del cuadrante de otro.
 *   - La compatibilidad se vuelve a comprobar en el servidor al
 *     confirmar: el navegador no decide nada.
 *   - Si dos personas pudieran ser la misma abreviatura, se le pregunta
 *     a las dos, pero solo la primera en responder se lo queda. A la
 *     segunda se le dice que ya está cogido.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import {
  indiceProfesores, buscaProfesor, puedeSerLaMisma, normHora, franja,
} from '@/lib/asignacionGuardias';

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
  const cookies = request.headers.get('cookie') || '';
  const m = cookies.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return null;
  return verificarSesion(m[1], secreto);
}

// El curso activo, con la clave de servidor. No se usa getCursoActual()
// porque esa crea un cliente pensado para el navegador.
async function cursoActivo(cliente) {
  const { data } = await cliente
    .from('config_centro').select('*').eq('activo', true).limit(1);
  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
  const hoy = new Date();
  const anio = hoy.getFullYear();
  return hoy.getMonth() >= 8 ? `${anio}-${anio + 1}` : `${anio - 1}-${anio}`;
}

const ORDEN_DIA = { lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5 };

async function horariosDelCurso(cliente, curso) {
  let filas = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await cliente
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, hora_id, dia, tipo, grupo, aula')
      .eq('curso_academico', curso)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    filas = filas.concat(data);
    if (data.length < 1000) break;
  }
  return filas;
}

/**
 * Los puestos del cuadrante que podrían ser de esta persona: sin dueño,
 * que el motor no sabe resolver, compatibles con su nombre y que ella
 * misma no haya descartado ya.
 */
async function propuestasPara(cliente, sesion) {
  const curso = await cursoActivo(cliente);

  const [{ data: profesores }, { data: equivalencias }, { data: descartes }] = await Promise.all([
    cliente.from('profesores').select('id, nombre, apellidos, departamento'),
    cliente.from('equivalencias_horario').select('nombre_horario, profesor_id'),
    cliente.from('descartes_horario').select('nombre_horario').eq('profesor_id', sesion.id),
  ]);

  const yo = (profesores || []).find(p => p.id === sesion.id);
  if (!yo) return { propuestas: [], curso };

  const horarios = await horariosDelCurso(cliente, curso);
  const indice = indiceProfesores(profesores || [], equivalencias || []);
  const yaCogidos = new Set((equivalencias || []).map(e => e.nombre_horario));
  const descartados = new Set((descartes || []).map(d => d.nombre_horario));

  // Agrupa las guardias del cuadrante por nombre abreviado
  const porNombre = new Map();
  horarios.filter(h => h.tipo === 'guardia').forEach(h => {
    const n = h.profesor_nombre_pdf;
    if (!n) return;
    if (!porNombre.has(n)) porNombre.set(n, { nombre: n, sector: '', horas: [] });
    const p = porNombre.get(n);
    if (!p.sector) p.sector = (h.grupo || '').trim() || (h.aula || '').trim();
    p.horas.push({ dia: (h.dia || '').toLowerCase(), hora: normHora(h.hora_id) });
  });

  const propuestas = [];
  for (const [nombre, info] of porNombre) {
    if (yaCogidos.has(nombre)) continue;       // ya lo reconoció alguien
    if (descartados.has(nombre)) continue;     // yo ya dije que no soy
    if (buscaProfesor(indice, nombre)) continue; // el motor ya sabe quién es
    if (!puedeSerLaMisma(nombre, yo)) continue;  // no encaja con mi apellido

    info.horas.sort((a, b) =>
      (ORDEN_DIA[a.dia] || 9) - (ORDEN_DIA[b.dia] || 9)
      || String(a.hora).localeCompare(String(b.hora)));
    propuestas.push({
      ...info,
      horas: info.horas.map(h => ({ ...h, rango: franja(h.hora)?.inicio || '' })),
    });
  }

  return { propuestas, curso };
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ propuestas: [] });

  try {
    const { propuestas } = await propuestasPara(supa(), sesion);
    return Response.json({ propuestas });
  } catch (e) {
    // Este aviso no puede tumbar ninguna pantalla: si falla, no sale.
    console.error('mi-cuadrante:', e?.message);
    return Response.json({ propuestas: [] });
  }
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion?.id) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const { accion, nombre_horario } = await request.json();
    if (!nombre_horario) return Response.json({ error: 'Falta el nombre' }, { status: 400 });

    const cliente = supa();

    if (accion === 'no_soy_yo') {
      await cliente.from('descartes_horario')
        .upsert({ nombre_horario, profesor_id: sesion.id },
                { onConflict: 'nombre_horario,profesor_id' });
      return Response.json({ ok: true });
    }

    if (accion === 'soy_yo') {
      // El navegador no decide: se vuelve a comprobar aquí que ese
      // puesto puede ser suyo de verdad.
      const { data: fichas } = await cliente
        .from('profesores').select('id, nombre, apellidos').eq('id', sesion.id).limit(1);
      const yo = (fichas || [])[0];
      if (!yo) return Response.json({ error: 'sin_ficha' }, { status: 403 });
      if (!puedeSerLaMisma(nombre_horario, yo)) {
        return Response.json({ error: 'no_es_compatible' }, { status: 403 });
      }

      // Primero en llegar, primero en quedárselo.
      const { data: previo } = await cliente.from('equivalencias_horario')
        .select('profesor_id').eq('nombre_horario', nombre_horario).limit(1);
      const duenio = (previo || [])[0]?.profesor_id;
      if (duenio && duenio !== sesion.id) {
        return Response.json({ error: 'ya_cogido' }, { status: 409 });
      }

      const { error } = await cliente.from('equivalencias_horario').upsert({
        nombre_horario,
        profesor_id: sesion.id,
        confirmado_por: sesion.nombre || 'El propio profesor',
      }, { onConflict: 'nombre_horario' });

      if (error) return Response.json({ error: error.message }, { status: 500 });

      /**
       * Y se queda con las guardias que ya tenía ese puesto.
       *
       * Mientras no se sabía quién era, sus guardias se le asignaban
       * igualmente —el cuadrante dice que esa persona está de guardia— y
       * quedaban a nombre del cuadrante, sin dueño. Al identificarse pasan
       * a ser suyas, con su grupo y su aula, sin esperar al siguiente
       * reparto.
       *
       * Solo las de hoy en adelante: las de días pasados ya no se pueden
       * fichar y ponerle el nombre ahora solo serviría para que le constara
       * como no realizada una guardia de la que nadie le avisó.
       */
      const hoy = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());

      const { data: adoptadas } = await cliente.from('apoyos_asignados')
        .update({ profesor_id: sesion.id })
        .is('profesor_id', null)
        .eq('profesor_nombre_pdf', nombre_horario)
        .gte('fecha', hoy)
        .select('id');

      return Response.json({ ok: true, guardias_adoptadas: (adoptadas || []).length });
    }

    return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: 'fallo_al_guardar' }, { status: 500 });
  }
}
