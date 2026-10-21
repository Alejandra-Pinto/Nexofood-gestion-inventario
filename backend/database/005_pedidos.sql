

-- Cabecera del pedido. id_pedido (SERIAL) es el ID único del pedido.
CREATE TABLE IF NOT EXISTS pedido (
  id_pedido        SERIAL PRIMARY KEY,

  -- Usuario (mesero, cajero o administrador) que registró el pedido
  id_mesero        INTEGER       NOT NULL REFERENCES usuarios (id_usuario),

  fecha_hora       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Todo pedido nuevo inicia en PENDIENTE (el flujo de estados es de la HU-3.4)
  estado_pedido    VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE',

  -- Suma de (cantidad x precio_unitario) de sus detalles, en pesos COP
  total_calculado  INTEGER       NOT NULL DEFAULT 0,

  CONSTRAINT ck_pedido_estado CHECK (
    estado_pedido IN ('PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'PAGADO', 'ANULADO')
  ),
  CONSTRAINT ck_pedido_total CHECK (total_calculado >= 0)
);

-- Productos del pedido: una fila por producto con su cantidad
CREATE TABLE IF NOT EXISTS detalle_pedido (
  id_detalle          SERIAL PRIMARY KEY,
  id_pedido           INTEGER      NOT NULL REFERENCES pedido (id_pedido) ON DELETE CASCADE,
  id_item             INTEGER      NOT NULL REFERENCES item_inventario (id_item),
  cantidad            INTEGER      NOT NULL,

  -- Precio de venta del producto en el momento del pedido (si luego cambia
  -- el precio del producto, el pedido conserva el valor cobrado)
  precio_unitario     INTEGER      NOT NULL,

  -- Se llenan en la HU-3.2 (adicionales, promociones y notas)
  notas_especiales    VARCHAR(255),
  promocion_aplicada  VARCHAR(100),

  CONSTRAINT ck_detalle_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_detalle_precio   CHECK (precio_unitario >= 0)
);

CREATE INDEX IF NOT EXISTS idx_pedido_mesero  ON pedido (id_mesero);
CREATE INDEX IF NOT EXISTS idx_pedido_fecha   ON pedido (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_pedido_estado  ON pedido (estado_pedido);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedido (id_pedido);
CREATE INDEX IF NOT EXISTS idx_detalle_item   ON detalle_pedido (id_item);
