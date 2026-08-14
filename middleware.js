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

  // Sin secreto configurado NO se puede comprobar la sesión, así que no
  // se deja pasar a nadie. Antes se dejaba pasar para no dejar al centro
  // fuera por un despiste, pero eso abría el panel de dirección a
  // cualquiera en cuanto faltase la variable (despliegue nuevo, preview,
  // variable mal copiada...). Es preferible un portal caído y visible
  // que un portal abierto y silencioso.
  if (!secreto) {
    console.error('SESSION_SECRET no configurado — acceso a gestión bloqueado');
    const destino = new URL('/login', request.url);
    destino.searchParams.set('motivo', 'config');
    return NextResponse.redirect(destino);
  }

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
