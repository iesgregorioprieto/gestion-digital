-- ════════════════════════════════════════════════════════════════════
-- CALENDARIO DE EVENTOS — módulo nuevo (sugerencia #40 de José María)
--
-- Evaluaciones, reuniones, charlas, plazos… con fecha, hora, lugar y
-- enlace (Teams), y un aviso en el banner «Hoy» con la antelación que
-- se elija. Va APARTE: no toca calendario_escolar (el cartel oficial),
-- ni comunicaciones, ni convocatorias.
-- Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS eventos (
  id                      bigserial PRIMARY KEY,
  titulo                  text NOT NULL,
  tipo                    text NOT NULL DEFAULT 'otro'
                          CHECK (tipo IN ('evaluacion','reunion','claustro','charla','plazo','otro')),
  fecha                   date NOT NULL,
  fecha_fin               date,                 -- solo si dura varios días
  hora_inicio             text,                 -- 'HH:MM'; vacío = todo el día
  hora_fin                text,
  lugar                   text,
  enlace                  text,                 -- Teams, Meet, formulario…
  descripcion             text,
  -- A quién afecta: mismos ámbitos que Comunicaciones
  ambito                  text[] NOT NULL DEFAULT '{claustro}',
  departamento            text[],
  destinatarios           uuid[],               -- «a dedo» y miembros de equipos
  visible_todos           boolean NOT NULL DEFAULT true,   -- en el calendario lo ve todo el claustro
  asistencia_obligatoria  boolean NOT NULL DEFAULT false,
  aviso_minutos           int,                  -- antelación del banner; NULL = sin aviso, 0 = desde las 00:00 del día
  creado_por              uuid,
  creado_por_nombre       text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eventos_fecha_idx ON eventos (fecha);

-- ─── PERMISOS: el navegador no ve nada; todo pasa por /api/eventos ───
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON eventos FROM anon, authenticated;
GRANT  ALL ON eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE eventos_id_seq TO service_role;

-- ─── COMPROBACIÓN: debe salir la tabla con 0 filas ───
SELECT 'eventos' AS tabla, count(*) AS filas FROM eventos;
