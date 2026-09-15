/**
 * PUESTA AL DÍA DEL CUADRANTE
 *
 * En un centro de 155 profesores los imprevistos son diarios: alguien
 * llama a media mañana, otro se va a las 11. Las ausencias previstas se
 * registran con tiempo, pero las de verdad aparecen sobre la marcha, y
 * el cuadrante tiene que ir con ellas.
 *
 * Por eso el reparto se rehace DIEZ MINUTOS ANTES de que termine cada
 * hora de clase: cuando suena el timbre, todo el mundo sabe ya lo que le
 * toca en la siguiente, con su grupo y su aula.
 *
 * No lo hace un cron. Los cron de Vercel en plan Hobby solo corren una
 * vez al día y a la hora que ellos quieran dentro de esa hora, así que
 * no valen para esto. Lo dispara la propia aplicación: la pantalla de la
 * sala de profesores, que está encendida todo el día, y cualquiera que
 * entre en sus guardias. El primero que pasa por la ventana de los diez
 * minutos lo lanza, y solo él: la marca se guarda antes de recalcular,
 * así que aunque entren treinta personas a la vez el reparto se hace una
 * sola vez.
 */

import { createClient } from '@supabase/supabase-js';
import { FRANJAS } from '@/lib/asignacionGuardias';

export const dynamic = 'force-dynamic';

const MINUTOS_ANTES = 10;

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

function ahoraEnMadrid() {
  const f = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(f.find(p => p.type === 'hour').value);
  const m = Number(f.find(p => p.type === 'minute').value);
  const fecha = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return { fecha, minutos: h * 60 + m };
}

const aMinutos = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * ¿Estamos en los diez minutos finales de alguna hora? Devuelve cuál,
 * que es la marca que impide repetir el recálculo dentro de la misma
 * ventana.
 */
function ventanaActual(minutos) {
  for (const f of FRANJAS) {
    const fin = aMinutos(f.fin);
    if (minutos >= fin - MINUTOS_ANTES && minutos < fin) return f.id;
  }
  return null;
}

export async function POST(request) {
  try {
    const { fecha, minutos } = ahoraEnMadrid();

    const diaSemana = new Date(`${fecha}T12:00:00`).getDay();
    if (diaSemana === 0 || diaSemana === 6) {
      return Response.json({ recalculado: false, motivo: 'fin_de_semana' });
    }

    const ventana = ventanaActual(minutos);
    if (!ventana) return Response.json({ recalculado: false, motivo: 'fuera_de_ventana' });

    // La marca se pone ANTES de recalcular. Si dos personas entran a la
    // vez, la segunda choca con la clave repetida y no hace nada.
    const clave = `${fecha}|${ventana}`;
    const { error: yaHecho } = await supa()
      .from('recalculos_guardias').insert({ clave });
    if (yaHecho) {
      return Response.json({ recalculado: false, motivo: 'ya_hecho', ventana });
    }

    const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
    const r = await fetch(`${base}/api/guardias/preasignar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
      },
      body: JSON.stringify({ fecha }),
    });
    const d = await r.json().catch(() => ({}));

    return Response.json({ recalculado: true, ventana, fecha, resultado: d });
  } catch (e) {
    // Esto nunca puede tumbar una pantalla: si falla, se sigue viendo el
    // reparto anterior.
    console.error('guardias/al-dia:', e?.message);
    return Response.json({ recalculado: false, motivo: 'error' });
  }
}
