-- ════════════════════════════════════════════════════════════════════
-- ENERGÍA DEL CENTRO (panel de la sala de profesores)
-- Home Assistant envía cada minuto la producción solar y el consumo a
-- /api/energia. Aquí solo se guarda el ÚLTIMO dato: una sola fila que
-- se sobrescribe, así la tabla nunca crece.
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS energia (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  datos       jsonb NOT NULL,
  recibido    timestamptz NOT NULL DEFAULT now()
);

-- ─── PERMISOS: el navegador no ve nada; todo pasa por /api/energia ───
ALTER TABLE energia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON energia FROM anon, authenticated;
GRANT  ALL ON energia TO service_role;

-- ─── COMPROBACIÓN: debe salir la tabla con 0 filas ───
SELECT 'energia' AS tabla, count(*) AS filas FROM energia;
