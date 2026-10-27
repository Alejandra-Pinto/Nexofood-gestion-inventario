-- ============================================================================
-- HU-3.2 · Adicionales, promociones, combos y notas (rol MESERO)
--   SCRUM-151 Interfaz de adicionales, promociones y notas
--   SCRUM-152 Adicionales y actualización de precio
--   SCRUM-153 Promociones y combos vigentes
--   SCRUM-154 Notas especiales por producto
--   SCRUM-155 Validar promoción no vigente y adicional sin stock
--
-- Ejecutar en PostgreSQL LOCAL (psql o pgAdmin) DESPUÉS de 001…008.
-- Luego, el mismo script se ejecuta en Supabase (SQL Editor) antes de desplegar.
--
-- · Es IDEMPOTENTE: se puede ejecutar varias veces sin error.
-- · Reemplaza al borrador 006_hu_3_2_adicionales_promociones.sql: si ese script
--   ya se ejecutó, aquí solo se agregan las columnas que le faltaban.
-- · NO modifica ninguna de las tablas existentes. Usa:
--     detalles_pedido.notas_especiales   -> nota de cocina ("sin cebolla")
--     detalles_pedido.promocion_aplicada -> nombre de la promoción/combo aplicado
--     detalles_pedido.precio_unitario    -> precio final de la unidad
--                                           (base o promo + adicionales)
--     comandas.estado_impresion          -> toda comanda nace 'PENDIENTE' (008)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Catálogo de ADICIONALES
--    tipo PAN     -> paso 2 "Elegí tu pan" (Ciabatta, Orégano)
--    tipo ADEREZO -> paso 3 "Elegí tu aderezo" (Chimi Rojo, BBQ Mango…)
--    tipo EXTRA   -> paso 3 bloque "ADICIONALES" con checkbox (+$1.500)
--    id_insumo / cantidad_insumo: insumo que consume UNA unidad del adicional.
--    Es lo que se valida contra item_inventario.cantidad_stock (SCRUM-155).
--    id_categoria: si se llena, el adicional solo aplica a esa categoría.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adicionales (
  id_adicional      SERIAL PRIMARY KEY,
  nombre            VARCHAR(100)  NOT NULL UNIQUE,
  id_insumo         INTEGER       REFERENCES item_inventario (id_item) ON DELETE RESTRICT,
  cantidad_insumo   NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (cantidad_insumo > 0),
  precio_adicional  INTEGER       NOT NULL DEFAULT 0 CHECK (precio_adicional >= 0),
  estado_activo     BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Columnas nuevas respecto al borrador 006
ALTER TABLE adicionales ALTER COLUMN id_insumo DROP NOT NULL;
ALTER TABLE adicionales ADD COLUMN IF NOT EXISTS tipo         VARCHAR(20)  NOT NULL DEFAULT 'EXTRA';
ALTER TABLE adicionales ADD COLUMN IF NOT EXISTS descripcion  VARCHAR(255);
ALTER TABLE adicionales ADD COLUMN IF NOT EXISTS id_categoria INTEGER REFERENCES categoria (id_categoria);
ALTER TABLE adicionales ADD COLUMN IF NOT EXISTS orden        SMALLINT     NOT NULL DEFAULT 0;

ALTER TABLE adicionales DROP CONSTRAINT IF EXISTS ck_adicional_tipo;
ALTER TABLE adicionales
  ADD CONSTRAINT ck_adicional_tipo CHECK (tipo IN ('PAN', 'ADEREZO', 'EXTRA'));

CREATE INDEX IF NOT EXISTS idx_adicionales_tipo ON adicionales (tipo) WHERE estado_activo;

-- ----------------------------------------------------------------------------
-- 2. Catálogo de PROMOCIONES y COMBOS
--    Precio de la unidad con promoción (antes de sumar adicionales):
--      precio_final  (si se llena)  -> precio fijo
--      COMBO                        -> precio_venta + recargo
--      DESCUENTO                    -> precio_venta - porcentaje_descuento %
--    Vigente = estado_activo AND vigente_desde <= NOW() <= vigente_hasta
--    id_insumo / cantidad_insumo: insumo del combo (ej. porción de papas).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS promociones (
  id_promocion   SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  descripcion    TEXT,
  tipo           VARCHAR(20)  NOT NULL CHECK (tipo IN ('COMBO', 'DESCUENTO')),
  precio_final   INTEGER      CHECK (precio_final >= 0),
  vigente_desde  TIMESTAMPTZ  NOT NULL,
  vigente_hasta  TIMESTAMPTZ  NOT NULL,
  estado_activo  BOOLEAN      NOT NULL DEFAULT TRUE,
  CHECK (vigente_hasta > vigente_desde)
);

-- En el borrador 006 precio_final era obligatorio; ahora es opcional
ALTER TABLE promociones ALTER COLUMN precio_final DROP NOT NULL;
ALTER TABLE promociones ADD COLUMN IF NOT EXISTS recargo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE promociones ADD COLUMN IF NOT EXISTS porcentaje_descuento NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE promociones ADD COLUMN IF NOT EXISTS id_categoria INTEGER REFERENCES categoria (id_categoria);
ALTER TABLE promociones ADD COLUMN IF NOT EXISTS id_insumo INTEGER REFERENCES item_inventario (id_item) ON DELETE RESTRICT;
ALTER TABLE promociones ADD COLUMN IF NOT EXISTS cantidad_insumo NUMERIC(12,3) NOT NULL DEFAULT 1;

ALTER TABLE promociones DROP CONSTRAINT IF EXISTS ck_promocion_valores;
ALTER TABLE promociones
  ADD CONSTRAINT ck_promocion_valores CHECK (
    recargo >= 0
    AND porcentaje_descuento BETWEEN 0 AND 100
    AND cantidad_insumo > 0
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_promociones_nombre ON promociones (LOWER(TRIM(nombre)));
CREATE INDEX IF NOT EXISTS idx_promociones_vigencia
  ON promociones (vigente_desde, vigente_hasta) WHERE estado_activo;

-- ----------------------------------------------------------------------------
-- 3. Adicionales elegidos en cada línea del pedido (N adicionales por detalle)
--    precio_unitario y nombre_adicional se congelan al momento del pedido.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_item_adicional (
  id_pedido_item_adicional SERIAL PRIMARY KEY,
  id_detalle       INTEGER NOT NULL REFERENCES detalles_pedido (id_detalle) ON DELETE CASCADE,
  id_adicional     INTEGER NOT NULL REFERENCES adicionales (id_adicional) ON DELETE RESTRICT,
  cantidad         INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario  INTEGER NOT NULL CHECK (precio_unitario >= 0),
  UNIQUE (id_detalle, id_adicional)
);

ALTER TABLE pedido_item_adicional ADD COLUMN IF NOT EXISTS nombre_adicional VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_pia_detalle   ON pedido_item_adicional (id_detalle);
CREATE INDEX IF NOT EXISTS idx_pia_adicional ON pedido_item_adicional (id_adicional);

COMMIT;


-- ============================================================================
-- 4. DATOS DE EJEMPLO (OPCIONAL, SOLO PARA PRUEBAS LOCALES)
--    Catálogo de los prototipos step-2 / step-3. Si ya tiene sus propios
--    insumos, puede omitir esta sección o ajustar los nombres.
--    El stock inicial se carga directo (no pasa por el Kardex). Para producción,
--    registre los ingresos desde Inventario > Ingresos.
--    "Chimichurri rojo" queda con 5 unidades para probar el aviso
--    "Quedan 5 unidades y el pedido requiere 8" (prototipo 21).
-- ============================================================================
BEGIN;

-- 4.1 Insumos que consumen los adicionales y el combo
INSERT INTO item_inventario
  (id_categoria, nombre, tipo_item, cantidad_stock, stock_minimo, costo_fabricacion, precio_venta)
SELECT c.id_categoria, v.nombre, 'INSUMO', v.stock, v.minimo, v.costo, 0
FROM (VALUES
  ('Pan ciabatta',                 'Panadería',      40, 10, 1200),
  ('Pan de orégano',               'Panadería',      40, 10, 1300),
  ('Chimichurri rojo',             'Salsas y otros',  5, 10,  400),
  ('Mayonesa de ajo negro',        'Salsas y otros', 30, 10,  500),
  ('Chucrut de gulupa',            'Salsas y otros', 30, 10,  600),
  ('Salsa BBQ de mango',           'Salsas y otros', 30, 10,  450),
  ('Salsa jalapeño',               'Salsas y otros', 30, 10,  450),
  ('Queso mozzarella (porción)',   'Adicionales',    25,  5,  900),
  ('Tocineta (porción)',           'Adicionales',    25,  5, 1100),
  ('Papa a la francesa (porción)', 'Adicionales',    50, 10, 1500)
) AS v (nombre, categoria, stock, minimo, costo)
JOIN categoria c ON c.nombre = v.categoria
WHERE NOT EXISTS (
  SELECT 1 FROM item_inventario i WHERE LOWER(TRIM(i.nombre)) = LOWER(TRIM(v.nombre))
);

-- 4.2 Adicionales (solo aplican a la categoría Choripanes)
INSERT INTO adicionales
  (nombre, tipo, descripcion, id_insumo, cantidad_insumo, precio_adicional, id_categoria, orden)
SELECT v.nombre, v.tipo, v.descripcion, i.id_item, v.cantidad, v.precio, c.id_categoria, v.orden
FROM (VALUES
  ('Ciabatta',                'PAN',     'Pan artesanal de origen italiano, corteza fina y miga aireada.', 'Pan ciabatta',               1.0, 0,    1),
  ('Orégano',                 'PAN',     'Pan aromático y esponjoso con orégano fresco.',                  'Pan de orégano',             1.0, 0,    2),
  ('Chimi Rojo',              'ADEREZO', NULL,                                                             'Chimichurri rojo',           1.0, 0,    1),
  ('Mayo Ajo Negro',          'ADEREZO', NULL,                                                             'Mayonesa de ajo negro',      1.0, 0,    2),
  ('Chucrut de Gulupa',       'ADEREZO', NULL,                                                             'Chucrut de gulupa',          1.0, 0,    3),
  ('BBQ Mango',               'ADEREZO', NULL,                                                             'Salsa BBQ de mango',         1.0, 0,    4),
  ('Salsa Jalapeño',          'ADEREZO', NULL,                                                             'Salsa jalapeño',             1.0, 0,    5),
  ('Aderezo adicional extra', 'EXTRA',   'Porción extra del aderezo elegido.',                             NULL,                         1.0, 1500, 1),
  ('Queso fundido',           'EXTRA',   NULL,                                                             'Queso mozzarella (porción)', 1.0, 2500, 2),
  ('Tocineta',                'EXTRA',   NULL,                                                             'Tocineta (porción)',         1.0, 3000, 3)
) AS v (nombre, tipo, descripcion, insumo, cantidad, precio, orden)
LEFT JOIN item_inventario i ON LOWER(TRIM(i.nombre)) = LOWER(TRIM(v.insumo))
LEFT JOIN categoria c ON c.nombre = 'Choripanes'
ON CONFLICT (nombre) DO NOTHING;

-- 4.3 Promociones: un combo vigente por un año y uno INACTIVO para probar
--     el caso "promoción no vigente" (SCRUM-155) desde la API.
INSERT INTO promociones
  (nombre, descripcion, tipo, recargo, id_categoria, id_insumo, cantidad_insumo,
   vigente_desde, vigente_hasta, estado_activo)
SELECT v.nombre, v.descripcion, 'COMBO', v.recargo, c.id_categoria, i.id_item, 1,
       NOW() - INTERVAL '1 day', NOW() + INTERVAL '365 days', v.activo
FROM (VALUES
  ('Combo con papa',    'Choripán + porción de papa a la francesa', 3000, TRUE),
  ('Combo con gaseosa', 'Choripán + gaseosa (temporada terminada)', 4000, FALSE)
) AS v (nombre, descripcion, recargo, activo)
LEFT JOIN categoria c ON c.nombre = 'Choripanes'
LEFT JOIN item_inventario i ON LOWER(TRIM(i.nombre)) = 'papa a la francesa (porción)'
WHERE NOT EXISTS (
  SELECT 1 FROM promociones p WHERE LOWER(TRIM(p.nombre)) = LOWER(TRIM(v.nombre))
);

COMMIT;

-- ============================================================================
-- Verificación rápida
--   SELECT tipo, nombre, precio_adicional, id_insumo FROM adicionales ORDER BY tipo, orden;
--   SELECT nombre, tipo, recargo, estado_activo, vigente_hasta FROM promociones;
-- ============================================================================
