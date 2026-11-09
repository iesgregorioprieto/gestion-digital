-- ════════════════════════════════════════════════════════════════════
-- COMISIONES DE SERVICIO — actividades extraescolares y FCT
-- (sugerencia #239 de José María)
--
-- Mismo recorrido que Formación:
--   FP            → jefe de departamento → director
--   ESO / Bach.   → director
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS comisiones_servicio (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  curso_academico   text,

  -- Solicitante (el NIF solo se guarda aquí, no en la ficha)
  profesor_id       uuid NOT NULL,
  departamento      text,
  nif               text,
  puesto            text,

  -- Desplazamiento
  ambito            text NOT NULL DEFAULT 'actividad'
                    CHECK (ambito IN ('actividad', 'fct')),
  motivo            text NOT NULL,
  destino           text,
  fecha_inicio      date NOT NULL,
  hora_inicio       time,
  fecha_fin         date NOT NULL,
  hora_fin          time,
  transporte        text,
  importe_estimado  numeric(10,2),
  observaciones     text,

  -- Recorrido
  estado            text NOT NULL DEFAULT 'pendiente_jefe'
                    CHECK (estado IN ('pendiente_jefe','pendiente_director','autorizada',
                                      'denegada_jefe','denegada_director','retirada')),
  jefe_id           uuid,
  jefe_decision     text,            -- aprobada · denegada · escalada · no_aplica
  jefe_fecha        timestamptz,
  jefe_motivo       text,
  jefe_limite       date,
  director_id       uuid,
  director_fecha    timestamptz,
  director_motivo   text,

  ausencia_id       text,            -- la ausencia registrada para cubrir sus clases
  historial         jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS comisiones_servicio_profesor_idx ON comisiones_servicio (profesor_id);
CREATE INDEX IF NOT EXISTS comisiones_servicio_estado_idx   ON comisiones_servicio (estado);
CREATE INDEX IF NOT EXISTS comisiones_servicio_fecha_idx    ON comisiones_servicio (fecha_inicio);

-- Cerrada al navegador: todo pasa por /api/comisiones
ALTER TABLE comisiones_servicio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON comisiones_servicio FROM PUBLIC, anon, authenticated;
GRANT  ALL ON comisiones_servicio TO service_role;
