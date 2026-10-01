-- ════════════════════════════════════════════════════════════════════
-- CONVOCATORIAS OFICIALES — módulo nuevo (paso 1: tablas y funciones)
--
-- Va APARTE de lo antiguo: no toca comunicaciones, votaciones, votos
-- ni votantes. Se ejecuta UNA VEZ en Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

-- 1. La convocatoria (con su orden del día y los datos del acta)
CREATE TABLE IF NOT EXISTS convocatorias (
  id                 bigserial PRIMARY KEY,
  titulo             text NOT NULL,
  organo             text NOT NULL DEFAULT 'claustro',  -- claustro, ccp, departamento, equipo, otro
  convocados_texto   text,                              -- cómo sale en el acta: «Claustro de profesores»
  convocados         uuid[] NOT NULL DEFAULT '{}',      -- lista nominal, fijada al convocar
  fecha              date,
  hora               text,
  lugar              text,
  orden_dia          jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{ "texto": "...", "desarrollo": "..." }]
  estado             text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','convocada','en_curso','cerrada')),
  fichaje_inicio     timestamptz,
  fichaje_fin        timestamptz,                       -- hora real de cierre, nunca «minutos»
  inicio_real        timestamptz,
  fin_real           timestamptz,
  preside            text,
  secretaria         text,
  creada_por         uuid,
  creada_por_nombre  text,
  convocada_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- 2. Respuesta y fichaje de cada convocado
CREATE TABLE IF NOT EXISTS convocatoria_asistencia (
  convocatoria_id     bigint NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  profesor_id         uuid   NOT NULL,
  asistira            boolean,
  respondida_at       timestamptz,
  fichado_at          timestamptz,
  fichado_a_mano_por  text,
  PRIMARY KEY (convocatoria_id, profesor_id)
);

-- 3. Votaciones preparadas de antemano, cada una ligada a su punto
CREATE TABLE IF NOT EXISTS convocatoria_votaciones (
  id               bigserial PRIMARY KEY,
  convocatoria_id  bigint NOT NULL REFERENCES convocatorias(id) ON DELETE CASCADE,
  punto            int,                 -- nº del punto del orden del día
  orden            int NOT NULL DEFAULT 1,
  pregunta         text NOT NULL,
  opciones         jsonb NOT NULL DEFAULT '["A favor","En contra","Abstención"]'::jsonb,
  duracion_seg     int NOT NULL DEFAULT 180 CHECK (duracion_seg BETWEEN 30 AND 3600),
  estado           text NOT NULL DEFAULT 'preparada'
                   CHECK (estado IN ('preparada','abierta','cerrada')),
  abierta_at       timestamptz,
  cierre_at        timestamptz
);
CREATE INDEX IF NOT EXISTS conv_votaciones_conv_idx ON convocatoria_votaciones (convocatoria_id);

-- 4. Quién ha votado (sin qué) — sin hora
CREATE TABLE IF NOT EXISTS convocatoria_votantes (
  votacion_id  bigint NOT NULL REFERENCES convocatoria_votaciones(id) ON DELETE CASCADE,
  profesor_id  uuid   NOT NULL,
  PRIMARY KEY (votacion_id, profesor_id)
);

-- 5. Qué se ha votado (sin quién) — solo un contador por opción.
--    No existe ningún voto suelto que se pueda emparejar.
CREATE TABLE IF NOT EXISTS convocatoria_recuento (
  votacion_id  bigint NOT NULL REFERENCES convocatoria_votaciones(id) ON DELETE CASCADE,
  opcion       text   NOT NULL,
  n            int    NOT NULL DEFAULT 0,
  PRIMARY KEY (votacion_id, opcion)
);

-- ─── FUNCIONES ───────────────────────────────────────────────────────

-- Cerrar y SELLAR. Al cerrar se reescriben recuento y votantes en una
-- sola operación: así ninguna fila conserva rastro del orden en que se
-- votó, ni en la base de datos ni en las copias de seguridad.
CREATE OR REPLACE FUNCTION conv_cerrar_votacion(p_votacion bigint)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v       convocatoria_votaciones%ROWTYPE;
  rec_op  text[];
  rec_n   int[];
  vot     uuid[];
BEGIN
  SELECT * INTO v FROM convocatoria_votaciones WHERE id = p_votacion FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_existe'; END IF;
  IF v.estado = 'cerrada'   THEN RETURN 'ok'; END IF;
  IF v.estado = 'preparada' THEN RETURN 'no_lanzada'; END IF;

  SELECT array_agg(opcion ORDER BY opcion), array_agg(n ORDER BY opcion)
    INTO rec_op, rec_n
    FROM convocatoria_recuento WHERE votacion_id = p_votacion;
  SELECT array_agg(profesor_id ORDER BY profesor_id)
    INTO vot
    FROM convocatoria_votantes WHERE votacion_id = p_votacion;

  DELETE FROM convocatoria_recuento WHERE votacion_id = p_votacion;
  DELETE FROM convocatoria_votantes WHERE votacion_id = p_votacion;

  INSERT INTO convocatoria_recuento (votacion_id, opcion, n)
    SELECT p_votacion, x.o, x.n FROM unnest(rec_op, rec_n) AS x(o, n);
  INSERT INTO convocatoria_votantes (votacion_id, profesor_id)
    SELECT p_votacion, u FROM unnest(vot) AS u;

  UPDATE convocatoria_votaciones
     SET estado = 'cerrada', cierre_at = LEAST(cierre_at, now())
   WHERE id = p_votacion;
  RETURN 'ok';
END $$;

-- Lanzar una votación preparada. Solo con la reunión en curso y sin
-- otra votación abierta a la vez.
CREATE OR REPLACE FUNCTION conv_lanzar_votacion(p_votacion bigint)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v         convocatoria_votaciones%ROWTYPE;
  c_estado  text;
  vencida   bigint;
  o         text;
BEGIN
  SELECT * INTO v FROM convocatoria_votaciones WHERE id = p_votacion FOR UPDATE;
  IF NOT FOUND THEN RETURN 'no_existe'; END IF;
  IF v.estado <> 'preparada' THEN RETURN 'ya_lanzada'; END IF;

  SELECT estado INTO c_estado FROM convocatorias WHERE id = v.convocatoria_id;
  IF c_estado IS DISTINCT FROM 'en_curso' THEN RETURN 'reunion_no_iniciada'; END IF;

  -- Las que ya agotaron su tiempo se cierran y sellan antes
  FOR vencida IN
    SELECT id FROM convocatoria_votaciones
     WHERE convocatoria_id = v.convocatoria_id AND estado = 'abierta' AND cierre_at <= now()
  LOOP
    PERFORM conv_cerrar_votacion(vencida);
  END LOOP;

  IF EXISTS (SELECT 1 FROM convocatoria_votaciones
              WHERE convocatoria_id = v.convocatoria_id AND estado = 'abierta') THEN
    RETURN 'otra_abierta';
  END IF;

  IF jsonb_array_length(v.opciones) < 2 THEN RETURN 'faltan_opciones'; END IF;

  DELETE FROM convocatoria_recuento WHERE votacion_id = p_votacion;
  FOR o IN SELECT jsonb_array_elements_text(v.opciones) LOOP
    INSERT INTO convocatoria_recuento (votacion_id, opcion, n)
    VALUES (p_votacion, o, 0) ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE convocatoria_votaciones
     SET estado = 'abierta', abierta_at = now(),
         cierre_at = now() + make_interval(secs => v.duracion_seg)
   WHERE id = p_votacion;
  RETURN 'ok';
END $$;

-- Votar. Apuntar a la persona y sumar su voto van juntos: o se hacen
-- las dos cosas o ninguna. Solo vota quien ha fichado en la reunión.
CREATE OR REPLACE FUNCTION conv_votar(p_votacion bigint, p_profesor uuid, p_opcion text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v convocatoria_votaciones%ROWTYPE;
BEGIN
  SELECT * INTO v FROM convocatoria_votaciones WHERE id = p_votacion FOR SHARE;
  IF NOT FOUND THEN RETURN 'no_existe'; END IF;
  IF v.estado <> 'abierta' OR now() >= v.cierre_at THEN RETURN 'cerrada'; END IF;

  IF NOT EXISTS (SELECT 1 FROM convocatoria_asistencia
                  WHERE convocatoria_id = v.convocatoria_id
                    AND profesor_id = p_profesor
                    AND fichado_at IS NOT NULL) THEN
    RETURN 'no_presente';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM convocatoria_recuento
                  WHERE votacion_id = p_votacion AND opcion = p_opcion) THEN
    RETURN 'opcion_no_valida';
  END IF;

  BEGIN
    INSERT INTO convocatoria_votantes (votacion_id, profesor_id) VALUES (p_votacion, p_profesor);
  EXCEPTION WHEN unique_violation THEN
    RETURN 'ya_votado';
  END;

  UPDATE convocatoria_recuento SET n = n + 1
   WHERE votacion_id = p_votacion AND opcion = p_opcion;
  RETURN 'ok';
END $$;

-- ─── PERMISOS: el navegador no ve nada; todo pasa por el servidor ───
ALTER TABLE convocatorias            ENABLE ROW LEVEL SECURITY;
ALTER TABLE convocatoria_asistencia  ENABLE ROW LEVEL SECURITY;
ALTER TABLE convocatoria_votaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE convocatoria_votantes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE convocatoria_recuento    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON convocatorias, convocatoria_asistencia, convocatoria_votaciones,
              convocatoria_votantes, convocatoria_recuento FROM anon, authenticated;
GRANT  ALL ON convocatorias, convocatoria_asistencia, convocatoria_votaciones,
              convocatoria_votantes, convocatoria_recuento TO service_role;
GRANT USAGE, SELECT ON SEQUENCE convocatorias_id_seq, convocatoria_votaciones_id_seq TO service_role;

REVOKE ALL ON FUNCTION conv_cerrar_votacion(bigint)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION conv_lanzar_votacion(bigint)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION conv_votar(bigint, uuid, text)        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION conv_cerrar_votacion(bigint)       TO service_role;
GRANT EXECUTE ON FUNCTION conv_lanzar_votacion(bigint)       TO service_role;
GRANT EXECUTE ON FUNCTION conv_votar(bigint, uuid, text)     TO service_role;

-- ─── COMPROBACIÓN: deben salir 5 tablas y 3 funciones ───
SELECT 'tabla' AS que, table_name AS nombre
  FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name LIKE 'convocatoria%'
UNION ALL
SELECT 'función', routine_name
  FROM information_schema.routines
 WHERE routine_schema = 'public' AND routine_name LIKE 'conv\_%'
ORDER BY 1, 2;
