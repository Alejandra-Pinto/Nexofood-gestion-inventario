-- HU-3.2: catálogo de adicionales, promociones y relación con líneas de pedido.
CREATE TABLE IF NOT EXISTS adicionales (
  id_adicional SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  id_insumo INTEGER NOT NULL REFERENCES item_inventario(id_item) ON DELETE RESTRICT,
  cantidad_insumo NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (cantidad_insumo > 0),
  precio_adicional INTEGER NOT NULL DEFAULT 0 CHECK (precio_adicional >= 0),
  estado_activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS promociones (
  id_promocion SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('COMBO', 'DESCUENTO')),
  precio_final INTEGER NOT NULL CHECK (precio_final >= 0),
  vigente_desde TIMESTAMPTZ NOT NULL,
  vigente_hasta TIMESTAMPTZ NOT NULL,
  estado_activo BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (vigente_hasta > vigente_desde)
);

CREATE TABLE IF NOT EXISTS pedido_item_adicional (
  id_pedido_item_adicional SERIAL PRIMARY KEY,
  id_detalle INTEGER NOT NULL REFERENCES detalles_pedido(id_detalle) ON DELETE CASCADE,
  id_adicional INTEGER NOT NULL REFERENCES adicionales(id_adicional) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
  UNIQUE (id_detalle, id_adicional)
);
