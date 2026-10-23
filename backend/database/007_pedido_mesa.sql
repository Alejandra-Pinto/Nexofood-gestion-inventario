-- ============================================================================
-- HU-3.1 · SCRUM-147 Modelar tablas de pedidos (mesa del pedido)
-- Agrega la mesa al pedido: el mesero toma el pedido desde "Mis mesas".
--   numero_mesa NULL = pedido sin mesa (para llevar / tomado en caja).
-- Ejecutar en PostgreSQL local DESPUÉS de 005_pedidos.sql.
-- ============================================================================

ALTER TABLE pedido
  ADD COLUMN IF NOT EXISTS numero_mesa SMALLINT;

-- Mesas del local: 1 a 8 (igual que en el prototipo "Mis mesas")
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS ck_pedido_mesa;
ALTER TABLE pedido
  ADD CONSTRAINT ck_pedido_mesa CHECK (numero_mesa IS NULL OR numero_mesa BETWEEN 1 AND 8);

-- Una mesa solo puede tener UN pedido activo (que no esté pagado ni anulado)
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_mesa_activa
  ON pedido (numero_mesa)
  WHERE numero_mesa IS NOT NULL AND estado_pedido NOT IN ('PAGADO', 'ANULADO');
