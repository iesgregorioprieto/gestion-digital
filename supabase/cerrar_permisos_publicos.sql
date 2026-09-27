-- ════════════════════════════════════════════════════════════════════
-- CERRAR LOS PERMISOS QUE LE SOBRAN A LA CLAVE PÚBLICA
--
-- La clave pública de Supabase va dentro de la aplicación y cualquiera
-- puede verla en el navegador. Hoy todo el portal lee y escribe por el
-- servidor (clave de servicio), pero la base de datos conservaba permisos
-- antiguos para esa clave pública. Los más graves, en `profesores`, que no
-- tiene activada la seguridad por filas:
--   · LEER nombre, email, rol y cargo de todo el profesorado
--   · CREAR fichas con estado y rol a elección
--   · CAMBIAR el estado, la autorización, las bajas y los sustitutos de
--     cualquier profesor
-- Y además escribir y borrar en `descartes_horario` y `recalculos_guardias`.
--
-- Se quita TODO a la clave pública y se devuelve solo lo que el navegador
-- sigue leyendo directamente: el calendario del curso (config_centro y
-- periodos_no_lectivos), que no tiene datos personales.
--
-- No cambia nada para el servidor del portal (service_role).
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT ON public.config_centro, public.periodos_no_lectivos TO anon, authenticated;

-- Las tablas que se creen a partir de ahora tampoco tendrán permisos
-- para la clave pública (Supabase se los daba por defecto).
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Comprobación: solo deben salir config_centro y periodos_no_lectivos, con SELECT
SELECT grantee, table_name, string_agg(privilege_type, ', ') AS permisos
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;
