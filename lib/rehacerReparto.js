/**
 * REHACER EL REPARTO DE HOY (Y DEL SIGUIENTE DÍA LECTIVO)
 *
 * Cualquier cambio en quién falta cambia quién está en el centro, y con
 * ello el reparto de guardias. Antes solo se rehacía al CREAR una
 * ausencia: si el profesor corregía sus horas («al final solo falto a
 * 1ª»), cambiaba la fecha, jefatura borraba la ausencia o cerraba una
 * baja, o dirección aprobaba o revocaba un DLD, el cuadrante seguía con
 * lo de antes hasta el siguiente recálculo. Resultado: compañeros
 * enviados a cubrir a quien estaba dando su clase (#200, #201) y DLD
 * concedidos que no salían en guardias (#132).
 *
 * El reparto es idempotente y no toca lo fichado, lo puesto a mano ni
 * las horas ya pasadas. Que falle no puede tumbar la operación que lo
 * dispara, que ya está guardada: por eso nunca lanza.
 */

import { ahoraEnCentro } from '@/lib/asignacionGuardias';

export async function rehacerReparto(request) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.iesgregorioprieto.com';
  try {
    await fetch(`${baseUrl}/api/guardias/preasignar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') || '',
      },
      body: JSON.stringify({ fecha: ahoraEnCentro().fecha }),
    });
  } catch (err) {
    console.error('rehacer reparto de guardias:', err?.message);
  }
}
