-- ════════════════════════════════════════════════════════════════════
-- ANTIGÜEDAD DESDE LA HOJA DE SERVICIOS
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
--
--   servicios_dias    días de servicio docente acreditados (meses de 30,
--                     años de 360), sin contar el bloque de cargo directivo
--   servicios_fecha   fecha hasta la que la hoja cuenta esos servicios
--   servicios_origen  'hoja' si sale del PDF oficial, 'manual' si se
--                     escribió a mano
--   servicios_leido   cuándo se subió la hoja
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE profesores
  ADD COLUMN IF NOT EXISTS servicios_dias   integer,
  ADD COLUMN IF NOT EXISTS servicios_fecha  date,
  ADD COLUMN IF NOT EXISTS servicios_origen text,
  ADD COLUMN IF NOT EXISTS servicios_leido  timestamptz;

-- Comprobación: deben salir las cuatro columnas
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profesores' AND column_name LIKE 'servicios_%'
ORDER BY column_name;
