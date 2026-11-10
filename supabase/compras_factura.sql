-- #216 · Albarán y factura por separado en las compras.
ALTER TABLE compras ADD COLUMN IF NOT EXISTS factura_url text;
