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

CREATE INDEX IF NOT EXISTS idx_movfin_origen_fecha ON movimientos_financieros (origen, fecha_hora);

-- Compatibilidad con scripts que usan el nombre viejo (ej. 008): vista de solo lectura
DO $$
BEGIN
  IF to_regclass('public.movimiento_financiero') IS NULL THEN
    CREATE VIEW movimiento_financiero AS SELECT * FROM movimientos_financieros;
  END IF;
END $$;
