-- #216 · Número de las peticiones de compra: «2026-27/001», por curso.
ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero text;

-- Numerar las que ya existen, por orden de fecha dentro de su curso.
WITH base AS (
  SELECT id, created_at,
    CASE WHEN EXTRACT(MONTH FROM created_at AT TIME ZONE 'Europe/Madrid') >= 9
         THEN EXTRACT(YEAR FROM created_at AT TIME ZONE 'Europe/Madrid')::int
         ELSE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Europe/Madrid')::int - 1 END AS y
  FROM compras WHERE numero IS NULL
), n AS (
  SELECT id, y, ROW_NUMBER() OVER (PARTITION BY y ORDER BY created_at, id) AS rn FROM base
)
UPDATE compras c
SET numero = n.y || '-' || RIGHT((n.y + 1)::text, 2) || '/' || LPAD(n.rn::text, 3, '0')
FROM n WHERE c.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS compras_numero_key ON compras (numero);

-- Comprobación
SELECT numero, profesor_nombre, created_at::date FROM compras ORDER BY numero;
