-- ============================================================================
-- HU-7.2 · SCRUM-246 Registrar ingresos no provenientes de ventas
-- Tabla: movimientos_financieros (la que usa la entidad MovimientoFinanciero)
-- ============================================================================
-- Ejecutar en PostgreSQL local (pgAdmin -> nexofood -> Query Tool).
-- Es seguro ejecutarlo más de una vez.
--
-- 1. Si la base local tiene la tabla vieja "movimiento_financiero" (script 006)
--    y todavía no existe "movimientos_financieros", se renombra (no se pierden datos).
-- 2. Agrega los campos del ingreso manual: concepto, categoría, observaciones y origen.
--    origen = 'VENTA'  -> cobro de un pedido (HU-3.5)
--    origen = 'MANUAL' -> ingreso que NO viene de ventas (HU-7.2): aportes, base de
--                         caja, préstamos... No tiene pedido y no cuenta en los
--                         reportes de ventas.
-- 3. En bases locales del Sprint 2, desliga los pagos que apuntaban a la tabla
--    vieja "pedido" para que no choquen con los pedidos nuevos de "pedidos".
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.movimientos_financieros') IS NULL
     AND EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'movimiento_financiero') THEN
    ALTER TABLE movimiento_financiero RENAME TO movimientos_financieros;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS movimientos_financieros (
  id_movimiento    SERIAL PRIMARY KEY,
  id_usuario       INTEGER      NOT NULL REFERENCES usuarios (id_usuario),
  id_pedido        INTEGER,
  tipo_movimiento  VARCHAR(10)  NOT NULL CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO')),
  monto            INTEGER      NOT NULL CHECK (monto > 0),
  medio_pago       VARCHAR(15)  NOT NULL,
  fecha_hora       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE movimientos_financieros
  ADD COLUMN IF NOT EXISTS origen        VARCHAR(10)  NOT NULL DEFAULT 'VENTA',
  ADD COLUMN IF NOT EXISTS concepto      VARCHAR(120),
  ADD COLUMN IF NOT EXISTS categoria     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS observaciones VARCHAR(255);

ALTER TABLE movimientos_financieros DROP CONSTRAINT IF EXISTS ck_movfin_origen;
ALTER TABLE movimientos_financieros
  ADD CONSTRAINT ck_movfin_origen CHECK (origen IN ('VENTA', 'MANUAL'));

-- Un ingreso manual nunca está ligado a un pedido y siempre tiene concepto
ALTER TABLE movimientos_financieros DROP CONSTRAINT IF EXISTS ck_movfin_manual;
ALTER TABLE movimientos_financieros
  ADD CONSTRAINT ck_movfin_manual CHECK (
    origen = 'VENTA' OR (id_pedido IS NULL AND concepto IS NOT NULL AND categoria IS NOT NULL)
  );

-- 3. Bases locales del Sprint 2: los pagos viejos quedaron ligados (con llave foránea)
--    a la tabla vieja "pedido". Sus ids chocan con los de la tabla nueva "pedidos"
--    (ej. el pago del pedido viejo #1 hacía creer que el pedido nuevo #1 ya estaba pagado).
--    Se desligan (id_pedido = NULL, se anota en observaciones) y la llave pasa a "pedidos".
DO $$
DECLARE
  r RECORD;
  col SMALLINT;
  fk_a_pedidos BOOLEAN := FALSE;
BEGIN
  SELECT attnum INTO col FROM pg_attribute
   WHERE attrelid = 'public.movimientos_financieros'::regclass AND attname = 'id_pedido';

  FOR r IN
    SELECT con.conname, cl.relname AS tabla_ref
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.confrelid
     WHERE con.conrelid = 'public.movimientos_financieros'::regclass
       AND con.contype = 'f'
       AND con.conkey = ARRAY[col]
  LOOP
    IF r.tabla_ref = 'pedidos' THEN
      fk_a_pedidos := TRUE;
    ELSE
      UPDATE movimientos_financieros
         SET observaciones = COALESCE(observaciones, 'Pago del Sprint 2 (tabla vieja pedido #' || id_pedido || ')'),
             id_pedido = NULL
       WHERE id_pedido IS NOT NULL;
      EXECUTE format('ALTER TABLE movimientos_financieros DROP CONSTRAINT %I', r.conname);
    END IF;
  END LOOP;

  IF NOT fk_a_pedidos AND to_regclass('public.pedidos') IS NOT NULL THEN
    ALTER TABLE movimientos_financieros
      ADD CONSTRAINT fk_movfin_pedidos FOREIGN KEY (id_pedido) REFERENCES pedidos (id_pedido) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_movfin_origen_fecha ON movimientos_financieros (origen, fecha_hora);

-- Compatibilidad con scripts que usan el nombre viejo (ej. 008): vista de solo lectura
DO $$
BEGIN
  IF to_regclass('public.movimiento_financiero') IS NULL THEN
    CREATE VIEW movimiento_financiero AS SELECT * FROM movimientos_financieros;
  END IF;
END $$;
