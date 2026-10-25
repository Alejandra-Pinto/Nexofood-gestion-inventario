-- ============================================================================
-- HU-3.3 y HU-3.6 · Modificaciones de pedidos, anulación y comandas de adición
-- ============================================================================

-- 1. Tabla de auditoría para anulación de pedidos (HU-3.6)
CREATE TABLE IF NOT EXISTS pedidos_anulaciones (
    id_anulacion SERIAL PRIMARY KEY,
    id_pedido INTEGER NOT NULL UNIQUE REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    motivo TEXT NOT NULL,
    fecha_hora TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Campos de trazabilidad directa en pedidos (HU-3.6)
ALTER TABLE pedidos
    ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT,
    ADD COLUMN IF NOT EXISTS id_usuario_anulacion INTEGER REFERENCES usuarios(id_usuario),
    ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMPTZ;

-- 3. Identificación de comanda por detalle para evitar reprocesar en cocina (HU-3.3)
ALTER TABLE detalles_pedido
    ADD COLUMN IF NOT EXISTS id_comanda INTEGER REFERENCES comandas(id_comanda);

-- 4. Backfill para asociar detalles existentes a la comanda existente
UPDATE detalles_pedido d
SET id_comanda = c.id_comanda
FROM (
    SELECT DISTINCT ON (id_pedido) id_comanda, id_pedido
    FROM comandas
    ORDER BY id_pedido, id_comanda ASC
) c
WHERE d.id_pedido = c.id_pedido AND d.id_comanda IS NULL;

-- 5. Vista de compatibilidad para movimiento_financiero / movimientos_financieros
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'movimiento_financiero' AND schemaname = 'public') THEN
        CREATE OR REPLACE VIEW movimiento_financiero AS SELECT * FROM movimientos_financieros;
    END IF;
END $$;
