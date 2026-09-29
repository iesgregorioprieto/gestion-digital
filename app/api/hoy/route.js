/**
 * «HOY» — lo que le toca hoy a quien tiene la sesión, para el banner del panel
 *
 * Líneas automáticas, sin que nadie las escriba:
 *   · sus guardias de hoy sin fichar, con las horas en que puede fichar
 *   · su recreo, con la zona
 *   · reuniones y citas de su horario (complementarias: «REUNIÓN…»,
 *     «ATENCIÓN A PADRES», «CLAUSTRO»…) de las horas que aún no han pasado
 * Lo ya fichado, lo que ya no se puede fichar y lo pasado no sale.
 */
import { createClient } from '@supabase/supabase-js';
import { verificarSesion, COOKIE } from '@/lib/sesion';
import { claveServidor } from '@/lib/claveServidor';
import { getCursoActual } from '@/lib/curso';
import { hoyLocal } from '@/lib/fechas';
import { horarioDe } from '@/lib/horarioDeProfesor';
import { franja, fichajeCerrado, fichajeAbierto, ventanaFichaje, ahoraEnCentro } from '@/lib/asignacionGuardias';

export const dynamic = 'force-dynamic';

const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const CITA = /reuni|claustro|atenci|evaluaci|junta|comisi|coordinaci|consejo|cce\b|ccp\b/i;

export async function GET(request) {
  const secreto = process.env.SESSION_SECRET;
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  const sesion = secreto && m ? await verificarSesion(m[1], secreto) : null;
  if (!sesion) return Response.json({ error: 'sin_sesion' }, { status: 401 });

  const fecha = hoyLocal();
  const dia = DIAS[new Date(`${fecha}T12:00:00`).getDay()];
  if (dia === 'sabado' || dia === 'domingo') return Response.json({ lineas: [] });

  try {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, claveServidor(),
      { auth: { persistSession: false, autoRefreshToken: false } });
    const ahora = ahoraEnCentro(new Date());
    const aMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const lineas = [];

    // Guardias y recreos de hoy, sin fichar y aún a tiempo
    const { data: guardias } = await c.from('apoyos_asignados')
      .select('id, hora, grupo, aula, estado, created_at, sector_apoyo')
      .eq('fecha', fecha).eq('profesor_id', sesion.id);
    for (const g of guardias || []) {
      if (['confirmado', 'incidencia'].includes(g.estado)) continue;
      const hora = String(g.hora);
      if (fichajeCerrado(hora, fecha, g.created_at)) continue;
      const v = ventanaFichaje(hora, fecha, g.created_at);
      const abierto = fichajeAbierto(hora, fecha, g.created_at);
      const esRecreo = hora === 'recreo' || /recreo/i.test(g.sector_apoyo || '');
      lineas.push({
        tipo: esRecreo ? 'recreo' : 'guardia', orden: franja(hora)?.inicio || '99',
        texto: esRecreo
          ? `Recreo en ${g.aula || 'tu zona'}: ficha de ${v.desde} a ${v.hasta}`
          : `Guardia a ${hora}ª${g.aula ? ` (aula ${g.aula})` : ''}: ficha de ${v.desde} a ${v.hasta}`,
        ahora: abierto, enlace: '/guardias',
      });
    }

    // Reuniones y citas de su horario que aún no han pasado
    const { horas } = await horarioDe(c, sesion.id, await getCursoActual(), dia);
    for (const h of horas || []) {
      if (h.tipo !== 'complementaria' || !CITA.test(h.materia || '')) continue;
      const id = String(h.hora_id).replace(/a$/, '');
      // La 7ª (14:30) no es de guardias, pero sí de reuniones de departamento
      const f = franja(id) || (id === '7' ? { inicio: '14:30', fin: '15:25' } : null);
      if (!f || ahora.minutos >= aMin(f.fin)) continue;
      lineas.push({
        tipo: 'reunion', orden: f.inicio,
        // «REUNIÓN Tutores 4ºES» → «Reunión Tutores 4ºES» (solo la primera palabra)
        texto: `${h.materia.replace(/^(\S)(\S*)/, (_, a, b) => a + b.toLowerCase())} a ${id}ª (${f.inicio})`,
        ahora: ahora.minutos >= aMin(f.inicio),
      });
    }

    lineas.sort((a, b) => a.orden.localeCompare(b.orden));
    return Response.json({ lineas });
  } catch (e) {
    return Response.json({ error: e.message, lineas: [] }, { status: 500 });
  }
}
