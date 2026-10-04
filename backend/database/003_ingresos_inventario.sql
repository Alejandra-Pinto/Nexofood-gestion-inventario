-- ============================================================================
-- HU-2.3 · SCRUM-128 / SCRUM-129 · Soporte de datos para ingresos de inventario
-- ============================================================================
-- Extiende la tabla `movimiento_inventario` (002) para registrar el costo y el
-- proveedor de los ingresos, y crea el catálogo mínimo de proveedores que
-- alimenta el selector "Proveedor" del formulario (prototipo 13).
--
-- Es una migración INCREMENTAL e idempotente: se puede ejecutar más de una vez
-- y NO modifica ni elimina filas existentes (salidas ni entradas previas).
-- Ejecutar en PostgreSQL local (pgAdmin, DBeaver o psql) DESPUÉS de 001 y 002.
-- ============================================================================

-- 1. Catálogo de proveedores --------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedor (
  id_proveedor   SERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  estado_activo  BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_proveedor_nombre
  ON proveedor (LOWER(TRIM(nombre)));

-- Datos de ejemplo (borrar o reemplazar por los proveedores reales)
INSERT INTO proveedor (nombre) VALUES
  ('Carnes del Sur'),
  ('Panadería La Espiga'),
  ('Distribuidora Andina')
ON CONFLICT DO NOTHING;

-- 2. Nuevas columnas del kardex ----------------------------------------------
-- Son NULLABLE: las salidas (merma / consumo interno) no tienen costo ni proveedor.
ALTER TABLE movimiento_inventario
  ADD COLUMN IF NOT EXISTS id_proveedor   INTEGER REFERENCES proveedor (id_proveedor),
  ADD COLUMN IF NOT EXISTS costo_unitario INTEGER,
  ADD COLUMN IF NOT EXISTS total          INTEGER;

-- 3. Restricciones de integridad ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mov_costos') THEN
    ALTER TABLE movimiento_inventario
      ADD CONSTRAINT ck_mov_costos
      CHECK ((costo_unitario IS NULL OR costo_unitario >= 0)
         AND (total          IS NULL OR total          >= 0));
  END IF;

  -- total = cantidad x costo_unitario (o ambos NULL en las salidas)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mov_total_coherente') THEN
    ALTER TABLE movimiento_inventario
      ADD CONSTRAINT ck_mov_total_coherente
      CHECK ((costo_unitario IS NULL AND total IS NULL)
          OR (costo_unitario IS NOT NULL
              AND total = cantidad::BIGINT * costo_unitario));
  END IF;

  -- Solo las COMPRAS tienen proveedor
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mov_proveedor_solo_compra') THEN
    ALTER TABLE movimiento_inventario
      ADD CONSTRAINT ck_mov_proveedor_solo_compra
      CHECK (id_proveedor IS NULL OR motivo = 'COMPRA');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mov_proveedor
  ON movimiento_inventario (id_proveedor);
