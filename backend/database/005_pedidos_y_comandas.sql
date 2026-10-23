-- ============================================================================
-- SCRUM-162 · Tablas base para Pedidos, Detalles y Comandas
-- Basado en el ESQUEMA FINAL de la líder
-- ============================================================================

CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido SERIAL PRIMARY KEY,
    id_mesero INTEGER REFERENCES usuarios(id_usuario),
    numero_mesa INTEGER, 
    nombre_cliente VARCHAR(100), 
    fecha_hora TIMESTAMPTZ DEFAULT NOW(),
    estado_pedido VARCHAR(50) NOT NULL DEFAULT 'Pendiente',
    total_calculado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS detalles_pedido (
    id_detalle SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES pedidos(id_pedido),
    id_item INTEGER NOT NULL REFERENCES item_inventario(id_item),
    cantidad NUMERIC NOT NULL,
    precio_unitario INTEGER NOT NULL,
    notas_especiales TEXT,
    promocion_aplicada VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS comandas (
    id_comanda SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL REFERENCES pedidos(id_pedido),
    fecha_impresion TIMESTAMPTZ DEFAULT NOW()
);