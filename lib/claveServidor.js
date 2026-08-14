/**
 * CLAVE DE SERVIDOR
 *
 * Las rutas de /api trabajan con datos que el navegador no puede tocar
 * (DNI de menores, hashes de contraseña, justificantes médicos). Para eso
 * tienen que usar la clave privada de Supabase.
 *
 * Antes cada ruta hacía esto:
 *
 *   SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Es decir: si faltaba la clave privada, seguía funcionando con la
 * pública, en silencio y con permisos recortados. El resultado eran
 * errores raros ("permission denied") en vez de un aviso claro, y la
 * falsa sensación de que todo iba bien.
 *
 * Ahora, si falta la clave, la ruta falla y lo deja escrito en el log.
 */
export function claveServidor() {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clave) {
    console.error(
      'SUPABASE_SERVICE_ROLE_KEY no configurada — ruta de servidor bloqueada. ' +
      'Revisa las variables de entorno en Vercel.'
    );
    throw new Error('config_incompleta');
  }
  return clave;
}
