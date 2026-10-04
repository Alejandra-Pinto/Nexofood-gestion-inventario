-- ============================================================================
-- SCRUM-132 · Tabla: movimiento_inventario (Kardex del sistema)
-- Cubre:
--   HU-2.3 — Ingresos de inventario (COMPRA / PRODUCCION)
--   HU-2.4 — Salidas manuales de inventario (MERMA / CONSUMO_INTERNO)
-- ============================================================================
-- Ejecutar en PostgreSQL local (pgAdmin, DBeaver o psql).
-- La entidad TypeORM asociada se marca synchronize:false, por eso la tabla
-- se crea manualmente aquí (mismo patrón que 001_productos_insumos.sql).
-- ============================================================================

CREATE TABLE IF NOT EXISTS movimiento_inventario (
  id_movimiento    SERIAL PRIMARY KEY,

  id_item          INTEGER NOT NULL
                   REFERENCES item_inventario(id_item),

  id_usuario       INTEGER NOT NULL
                   REFERENCES usuarios(id_usuario),

  tipo_movimiento  VARCHAR(10)  NOT NULL,
  motivo           VARCHAR(20)  NOT NULL,
  cantidad         INTEGER      NOT NULL,

  stock_anterior   INTEGER      NOT NULL,
  stock_nuevo      INTEGER      NOT NULL,

  observaciones    VARCHAR(255),
  fecha_hora       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_mov_tipo
    CHECK (tipo_movimiento IN ('ENTRADA','SALIDA')),

  CONSTRAINT ck_mov_motivo
    CHECK (motivo IN ('COMPRA','PRODUCCION','MERMA','CONSUMO_INTERNO')),

  CONSTRAINT ck_mov_cantidad
    CHECK (cantidad > 0),

  CONSTRAINT ck_mov_stock_anterior
    CHECK (stock_anterior >= 0),

  CONSTRAINT ck_mov_stock_nuevo
    CHECK (stock_nuevo >= 0),

  CONSTRAINT ck_mov_coherencia
    CHECK (
      (tipo_movimiento = 'ENTRADA' AND motivo IN ('COMPRA','PRODUCCION')) OR
      (tipo_movimiento = 'SALIDA'  AND motivo IN ('MERMA','CONSUMO_INTERNO'))
    )
);

CREATE INDEX IF NOT EXISTS idx_mov_item
  ON movimiento_inventario (id_item);

CREATE INDEX IF NOT EXISTS idx_mov_usuario
  ON movimiento_inventario (id_usuario);

CREATE INDEX IF NOT EXISTS idx_mov_fecha
  ON movimiento_inventario (fecha_hora);