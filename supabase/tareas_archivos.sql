-- ════════════════════════════════════════════════════════════════════
-- ARCHIVOS DE LA TAREA EN CADA GUARDIA
-- Para que quien cubre vea y abra las fichas o exámenes que dejó el
-- profesor. Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE apoyos_asignados ADD COLUMN IF NOT EXISTS tarea_archivos jsonb;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'apoyos_asignados' AND column_name = 'tarea_archivos';
