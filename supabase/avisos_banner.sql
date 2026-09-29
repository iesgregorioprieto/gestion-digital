-- ════════════════════════════════════════════════════════════════════
-- AVISOS «SOLO EN EL BANNER»
-- Un tercer tipo de comunicación: sale como una línea en el banner «Hoy»
-- de sus destinatarios hasta la fecha que se elija (no a pantalla completa).
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE comunicaciones DROP CONSTRAINT IF EXISTS comunicaciones_tipo_check;
ALTER TABLE comunicaciones ADD CONSTRAINT comunicaciones_tipo_check
  CHECK (tipo = ANY (ARRAY['aviso'::text, 'convocatoria'::text, 'banner'::text]));

-- Comprobación: debe salir la regla con los tres tipos
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'comunicaciones_tipo_check';
