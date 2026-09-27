/**
 * CONTADOR DE GUARDIAS DEL CURSO
 *
 * Directivos: la tabla completa, todos los profesores con guardias.
 * Cualquier otro profesor: SOLO su fila y la media de su sector, sin
 * nombres de compañeros.
 *
 * El cálculo está en lib/contadorGuardias.js.
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { hoyLocal } from '@/lib/fechas';
import { calcularContador } from '@/lib/contadorGuardias';

export const dynamic = 'force-dynamic';

function supa() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
    { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return null;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return m ? verificarSesion(m[1], secreto) : null;
}

// Mismo criterio que el reparto (app/api/guardias/preasignar)
async function cursoActivo(cliente) {
  const { data } = await cliente.from('config_centro').select('*').eq('activo', true).limit(1);
  const fila = (data || [])[0];
  const curso = fila?.config?.curso || fila?.curso || fila?.curso_academico;
  if (curso) return curso;
  const hoy = new Date();
  const anio = hoy.getMonth() >= 8 ? hoy.getFullYear() : hoy.getFullYear() - 1;
  return `${anio}-${anio + 1}`;
}

async function todas(consulta) {
  let filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas = filas.concat(data || []);
    if (!data || data.length < 1000) break;
  }
  return filas;
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  try {
    const cliente = supa();
    const curso = await cursoActivo(cliente);
    const [horarios, profesores, equivalencias, apoyos] = await Promise.all([
      todas(() => cliente.from('horarios_profesores')
        .select('profesor_nombre_pdf,hora_id,dia,tipo,grupo,materia,aula')
        .eq('curso_academico', curso).eq('tipo', 'guardia')),
      todas(() => cliente.from('profesores').select('id,nombre,apellidos,departamento,especialidad')),
      todas(() => cliente.from('equivalencias_horario').select('nombre_horario, profesor_id')),
      todas(() => cliente.from('apoyos_asignados')
        .select('profesor_id,profesor_nombre_pdf,estado,fecha,sector_apoyo,sector_destino,cuenta_reparto')
        .eq('curso_academico', curso)),
    ]);

    const r = calcularContador({ horarios, profesores, equivalencias, apoyos, hoy: hoyLocal() });

    if (esDirectivo(sesion)) return Response.json({ curso, ...r });

    const mio = r.filas.find(f => f.profesorId === sesion.id) || null;
    const sector = mio ? r.sectores.find(s => s.sector === mio.sector) : null;
    return Response.json({
      curso,
      mio: mio && { semanales: mio.semanales, hechas: mio.hechas, esperadas: mio.esperadas, sector: mio.sector },
      sector: sector && { sector: sector.sector, media: Math.round(sector.media * 10) / 10, profesores: sector.profesores },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
