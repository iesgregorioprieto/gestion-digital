/**
 * TUTORÍA: propuesta y vinculación (ver lib/tutoria.js)
 *
 * GET  → { actual, valida, sugerencia, opciones } para quien tiene la sesión
 * POST { grupo } → vincula ese grupo como su tutoría. Solo se acepta un
 *      grupo que exista (alumnado, lista oficial o su propio horario).
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { getCursoActual } from '@/lib/curso';
import { horarioDe } from '@/lib/horarioDeProfesor';
import { proponerTutoria } from '@/lib/tutoria';
import { mismoGrupo } from '@/lib/grupos';

export const dynamic = 'force-dynamic';

const cliente = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
  { auth: { persistSession: false, autoRefreshToken: false } });

async function sesionDe(request) {
  const secreto = process.env.SESSION_SECRET;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  return secreto && m ? verificarSesion(m[1], secreto) : null;
}

async function datos(c, id) {
  const curso = await getCursoActual();
  const [{ data: prof }, alumnos, { data: oficiales }, { horas }] = await Promise.all([
    c.from('profesores').select('grupo_tutoria, rol').eq('id', id),
    (async () => {
      let t = [];
      for (let d = 0; ; d += 1000) {
        const { data } = await c.from('alumnos').select('grupo').eq('curso_academico', curso).range(d, d + 999);
        t = t.concat(data || []); if (!data || data.length < 1000) break;
      }
      return t;
    })(),
    c.from('grupos').select('codigo').eq('curso_academico', curso),
    horarioDe(c, id, curso),
  ]);
  const cnt = {};
  alumnos.forEach(a => { if (a.grupo) cnt[a.grupo] = (cnt[a.grupo] || 0) + 1; });
  const grupos = [...new Set([...Object.keys(cnt), ...(oficiales || []).map(g => g.codigo)])]
    .map(g => ({ grupo: g, alumnos: cnt[g] || 0 }));
  return { p: (prof || [])[0] || {}, grupos, horas };
}

export async function GET(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  try {
    const c = cliente();
    const { p, grupos, horas } = await datos(c, sesion.id);
    const esTutor = (Array.isArray(p.rol) ? p.rol : []).includes('tutor') || !!p.grupo_tutoria;
    if (!esTutor) return Response.json({ esTutor: false });
    return Response.json({ esTutor: true, actual: p.grupo_tutoria || null, ...proponerTutoria({ actual: p.grupo_tutoria, horas, grupos }) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const sesion = await sesionDe(request);
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });
  const { grupo } = await request.json().catch(() => ({}));
  if (!grupo) return Response.json({ error: 'Falta el grupo' }, { status: 400 });
  try {
    const c = cliente();
    const { p, grupos, horas } = await datos(c, sesion.id);
    const { opciones } = proponerTutoria({ actual: null, horas, grupos });
    const valido = grupos.find(g => mismoGrupo(g.grupo, grupo)) || opciones.find(o => mismoGrupo(o.grupo, grupo));
    if (!valido) return Response.json({ error: 'Ese grupo no existe este curso' }, { status: 400 });
    const rol = Array.isArray(p.rol) ? p.rol : [];
    const { error } = await c.from('profesores')
      .update({ grupo_tutoria: valido.grupo, rol: rol.includes('tutor') ? rol : [...rol, 'tutor'] })
      .eq('id', sesion.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, grupo: valido.grupo, alumnos: valido.alumnos || 0 });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
