/**
 * EQUIVALENCIAS DE NOMBRES
 *
 * El horario viene de Delphos, donde el nombre lo escribe la
 * Administración ("García López-Tello, Pilar"). La ficha la rellena cada
 * profesor al registrarse ("María del Pilar García López-Tello"). Nadie
 * obliga a que coincidan.
 *
 * El motor de guardias necesita emparejarlas para saber qué clases tiene
 * cada persona. Cuando no casan, ese profesor sencillamente no existe
 * para el motor: no se le generan guardias y no se le puede asignar como
 * sustituto, sin que nadie se entere de por qué.
 *
 * Aquí se cruzan las dos listas y se deja que una persona confirme a
 * mano lo que la máquina no puede deducir sin riesgo. Lo confirmado se
 * guarda y el motor ya no tiene que adivinar nunca más.
 *
 * NO se tocan las fichas: cambiar el nombre que escribió el profesor
 * podría romper su acceso, sus informes o sus correos. Solo se guarda la
 * equivalencia.
 */

import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { indiceProfesores, buscaProfesor, normClave, claveLaxa } from '@/lib/asignacionGuardias';
import { getCursoActual } from '@/lib/curso';

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

/**
 * ¿Se parecen lo suficiente como para proponerlo, sin darlo por hecho?
 *
 * Solo se propone cuando los APELLIDOS coinciden exactamente y uno de
 * los nombres de pila está contenido en el otro ("Pilar" dentro de
 * "María del Pilar"). Con eso se cubre el caso habitual sin inventar:
 * la confirmación la da una persona, no el código.
 */
/**
 * Puntúa cuánto se parece una abreviatura del cuadrante a un profesor.
 *
 * El cuadrante de guardias no usa un formato único: se han visto
 * "ME Lop.", "M Núñ.", "MdlÁ Mat.", "MV Agu.", "Cár. C, LJ" y
 * "Aba. GP, MJ". Intentar reconocer cada patrón a mano es una carrera
 * perdida: siempre aparece uno nuevo.
 *
 * Así que no se intenta interpretar el formato. Se trocea la abreviatura
 * en pedazos y se mira cuántos encajan con las iniciales y los apellidos
 * del profesor. Sirve para ORDENAR los candidatos y ponerle fácil a
 * quien confirma; la decisión sigue siendo de una persona.
 */
function parecido(nombrePdf, profesor) {
  const limpio = t => normClave(t).replace(/\./g, '');
  const trozos = String(nombrePdf || '').split(/[\s,.]+/).filter(Boolean).map(limpio).filter(Boolean);
  if (trozos.length === 0) return 0;

  const apellidos = String(profesor.apellidos || '').split(/\s+/).filter(Boolean).map(limpio);
  const nombres   = String(profesor.nombre   || '').split(/\s+/).filter(Boolean).map(limpio);
  const inicNombre = nombres.map(n => n[0]).join('');      // "María Soledad" → "ms"
  const inicApe    = apellidos.map(a => a[0]).join('');

  let puntos = 0;
  for (const t of trozos) {
    // ¿Es el principio de alguno de sus apellidos? ("Lop." → "López")
    if (apellidos.some(a => a.startsWith(t) && t.length >= 3)) { puntos += 3; continue; }
    // ¿Es el principio de alguno de sus nombres?
    if (nombres.some(n => n.startsWith(t) && t.length >= 3))   { puntos += 2; continue; }
    // ¿Son sus iniciales? ("ME" → María Elena, "MdlÁ" → María de los Ángeles)
    if (t === inicNombre || t === inicApe)                      { puntos += 2; continue; }
    // Iniciales parciales
    if (t.length <= 4 && inicNombre.startsWith(t[0]))           { puntos += 1; continue; }
  }
  return puntos;
}

function pareceLaMisma(nombrePdf, profesor) {
  const partes = String(nombrePdf || '').split(',');
  if (partes.length < 2) return false;

  const apellidosPdf = normClave(partes[0]);
  const nombrePdfPila = normClave(partes.slice(1).join(' '));
  const apellidosFicha = normClave(profesor.apellidos || '');
  const nombreFicha = normClave(profesor.nombre || '');

  if (!apellidosPdf || !nombrePdfPila) return false;
  if (apellidosPdf !== apellidosFicha) return false;

  return nombreFicha.includes(nombrePdfPila) || nombrePdfPila.includes(nombreFicha);
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  const cliente = supa();
  const curso = await getCursoActual();

  const [{ data: profesores }, { data: equivalencias }] = await Promise.all([
    cliente.from('profesores').select('id, nombre, apellidos, departamento').eq('estado', 'activo'),
    cliente.from('equivalencias_horario').select('*'),
  ]);

  // Todos los nombres distintos que aparecen en el horario del curso
  let horarios = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await cliente
      .from('horarios_profesores')
      .select('profesor_nombre_pdf, tipo')
      .eq('curso_academico', curso)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    horarios = horarios.concat(data);
    if (data.length < 1000) break;
  }

  const nombresHorario = new Map();   // nombre → { clases, guardias }
  horarios.forEach(h => {
    const n = h.profesor_nombre_pdf;
    if (!n) return;
    if (!nombresHorario.has(n)) nombresHorario.set(n, { clases: 0, guardias: 0 });
    const c = nombresHorario.get(n);
    if (h.tipo === 'guardia') c.guardias++; else c.clases++;
  });

  const indice = indiceProfesores(profesores || []);
  const yaConfirmados = new Map((equivalencias || []).map(e => [e.nombre_horario, e.profesor_id]));

  const resueltos = [];
  const dudosos = [];
  const sinCasar = [];

  for (const [nombre, cuenta] of nombresHorario) {
    // 1. Confirmado a mano: manda esto por encima de todo
    const confirmado = yaConfirmados.get(nombre);
    if (confirmado) {
      const p = (profesores || []).find(x => x.id === confirmado);
      resueltos.push({ nombre, ...cuenta, profesor: p || null, via: 'confirmado' });
      continue;
    }

    // 2. El motor lo reconoce por sí solo
    const auto = buscaProfesor(indice, nombre);
    if (auto) {
      resueltos.push({ nombre, ...cuenta, profesor: auto, via: 'automatico' });
      continue;
    }

    // 3. Se parece a alguien: se propone, pero decide una persona
    const candidatos = (profesores || []).filter(p => pareceLaMisma(nombre, p));
    if (candidatos.length === 1) {
      dudosos.push({ nombre, ...cuenta, propuesta: candidatos[0] });
      continue;
    }

    // 4. No se reconoce: se ofrecen los más parecidos arriba del todo,
    //    para no tener que buscar entre 155 personas por cada abreviatura.
    const sugeridos = (profesores || [])
      .map(p => ({ p, punt: parecido(nombre, p) }))
      .filter(x => x.punt > 0)
      .sort((a, b) => b.punt - a.punt)
      .slice(0, 4)
      .map(x => x.p);
    sinCasar.push({ nombre, ...cuenta, candidatos: sugeridos });
  }

  const orden = (a, b) => (b.clases + b.guardias) - (a.clases + a.guardias);

  return Response.json({
    resueltos: resueltos.sort(orden),
    dudosos: dudosos.sort(orden),
    sinCasar: sinCasar.sort(orden),
    profesores: (profesores || []).sort((a, b) =>
      (a.apellidos || '').localeCompare(b.apellidos || '', 'es')),
  });
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  if (!esDirectivo(sesion)) return Response.json({ error: 'sin_permisos' }, { status: 403 });

  try {
    const { accion, nombre_horario, profesor_id } = await request.json();
    const cliente = supa();

    if (accion === 'confirmar') {
      if (!nombre_horario || !profesor_id) {
        return Response.json({ error: 'Faltan datos' }, { status: 400 });
      }
      // upsert: si ese nombre ya estaba asignado a otra persona, se corrige
      const { error } = await cliente
        .from('equivalencias_horario')
        .upsert({
          nombre_horario,
          profesor_id,
          confirmado_por: sesion.nombre || 'Dirección',
        }, { onConflict: 'nombre_horario' });

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    if (accion === 'deshacer') {
      if (!nombre_horario) return Response.json({ error: 'Falta el nombre' }, { status: 400 });
      const { error } = await cliente
        .from('equivalencias_horario').delete().eq('nombre_horario', nombre_horario);
      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: 'Error al procesar la petición' }, { status: 500 });
  }
}
