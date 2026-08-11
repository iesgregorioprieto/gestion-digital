import { NextResponse } from 'next/server';
import { verificarSesion, esDirectivo, COOKIE } from '@/lib/sesion';

/**
 * PORTERO DEL SERVIDOR
 *
 * Se ejecuta antes de servir cualquier página protegida. Comprueba la
 * cookie firmada, que el navegador no puede falsificar.
 *
 * Hasta ahora el control estaba solo en el navegador: bastaba con editar
 * sessionStorage para entrar en el panel del director. Esto lo impide.
 */

// Rutas que solo puede ver el equipo directivo
const SOLO_DIRECTIVOS = [
  '/gestion',
  '/director',
  '/secretario',
  '/jefe-estudios',
  '/demo',
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  const protegida = SOLO_DIRECTIVOS.some(
    r => pathname === r || pathname.startsWith(r + '/')
  );
  if (!protegida) return NextResponse.next();

  const secreto = process.env.SESSION_SECRET;

  // Sin secreto configurado no se bloquea nada: evita dejar el centro
  // fuera del portal por un despiste de configuración.
  if (!secreto) return NextResponse.next();

  const token = request.cookies.get(COOKIE)?.value;
  const sesion = await verificarSesion(token, secreto);

  if (!esDirectivo(sesion)) {
    const destino = new URL('/login', request.url);
    destino.searchParams.set('motivo', 'permisos');
    return NextResponse.redirect(destino);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/gestion/:path*',
    '/director/:path*',
    '/secretario/:path*',
    '/jefe-estudios/:path*',
    '/demo/:path*',
  ],
};
