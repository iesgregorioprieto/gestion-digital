-- ════════════════════════════════════════════════════════════════════
-- FICHAR GUARDIAS DESDE JEFATURA
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
--
--   fichado_por          quién de jefatura la dio por hecha (vacío si la
--                        fichó el propio profesor)
--   asignado_original_id a quién se la había asignado la app, cuando la
--                        hizo otra persona (para que quede constancia)
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE apoyos_asignados
  ADD COLUMN IF NOT EXISTS fichado_por          uuid,
  ADD COLUMN IF NOT EXISTS asignado_original_id uuid;

-- Comprobación: deben salir las dos columnas
SELECT column_name FROM information_schema.columns
WHERE table_name = 'apoyos_asignados' AND column_name IN ('fichado_por', 'asignado_original_id');
