-- =====================================================================
-- SCRUM-122 · Modelar tablas de productos e insumos (costos, precios, stock)
-- HU-2.1 Registrar insumos y productos en inventario
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- (El backend usa synchronize: false, por eso las tablas se crean aquí)
-- =====================================================================

-- Tabla CATEGORIA: agrupa los ítems (Choripanes, Bebidas, Insumos…)
CREATE TABLE IF NOT EXISTS categoria (
  id_categoria  SERIAL PRIMARY KEY,
  nombre        VARCHAR(60) NOT NULL,
  CONSTRAINT uq_categoria_nombre UNIQUE (nombre)
);

-- Item_Inventario (<<STI>>): un mismo registro es PRODUCTO (se vende) o INSUMO (materia prima)
CREATE TABLE IF NOT EXISTS item_inventario (
  id_item            SERIAL PRIMARY KEY,
  id_categoria       INTEGER      NOT NULL REFERENCES categoria (id_categoria),
  nombre             VARCHAR(80)  NOT NULL,
  tipo_item          VARCHAR(10)  NOT NULL,
  cantidad_stock     INTEGER      NOT NULL DEFAULT 0,
  stock_minimo       INTEGER      NOT NULL DEFAULT 0,
  costo_fabricacion  INTEGER      NOT NULL DEFAULT 0,   -- COP, sin decimales
  precio_venta       INTEGER      NOT NULL DEFAULT 0,   -- COP, 0 para insumos
  estado_activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Solo se permiten estos dos tipos
  CONSTRAINT ck_item_tipo      CHECK (tipo_item IN ('PRODUCTO', 'INSUMO')),
  -- El stock nunca puede ser negativo
  CONSTRAINT ck_item_stock     CHECK (cantidad_stock >= 0 AND stock_minimo >= 0),
  -- Costos y precios no pueden ser negativos
  CONSTRAINT ck_item_valores   CHECK (costo_fabricacion >= 0 AND precio_venta >= 0),
  -- Todo PRODUCTO debe tener precio de venta mayor a 0
  CONSTRAINT ck_item_precio    CHECK (tipo_item = 'INSUMO' OR precio_venta > 0)
);


CREATE UNIQUE INDEX IF NOT EXISTS uq_item_nombre
  ON item_inventario (LOWER(TRIM(nombre)));


CREATE TABLE IF NOT EXISTS receta_escandallo (
  id_producto         INTEGER NOT NULL REFERENCES item_inventario (id_item),
  id_insumo           INTEGER NOT NULL REFERENCES item_inventario (id_item),
  cantidad_requerida  NUMERIC(10, 3) NOT NULL CHECK (cantidad_requerida > 0),
  PRIMARY KEY (id_producto, id_insumo)
);


INSERT INTO categoria (nombre) VALUES
  ('Choripanes'), ('Bebidas'), ('Adicionales'), ('Insumos cárnicos'), ('Panadería'), ('Salsas y otros')
ON CONFLICT (nombre) DO NOTHING;
