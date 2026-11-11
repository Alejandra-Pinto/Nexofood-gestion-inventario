-- Mesa del pedido (HU-3.1) sobre la tabla "pedidos".
-- numero_mesa NULL = pedido para llevar. Mesas del local: 1 a 8.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS numero_mesa SMALLINT;

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS ck_pedido_mesa;
ALTER TABLE pedidos
  ADD CONSTRAINT ck_pedido_mesa CHECK (numero_mesa IS NULL OR numero_mesa BETWEEN 1 AND 8);

-- Una mesa solo puede tener UN pedido activo (ni pagado ni anulado).
-- Evita dos pedidos en la misma mesa aunque lleguen al mismo tiempo (H-04).
-- Si ya hay mesas con dos pedidos activos, avisa en vez de fallar.
DO $$
BEGIN
  IF EXISTS (
    SELECT numero_mesa FROM pedidos
     WHERE numero_mesa IS NOT NULL AND UPPER(estado_pedido) NOT IN ('PAGADO', 'ANULADO')
     GROUP BY numero_mesa HAVING COUNT(*) > 1
  ) THEN
    RAISE NOTICE 'Hay mesas con más de un pedido activo: páguelos o anúlelos y ejecute de nuevo este script.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS ux_pedido_mesa_activa
      ON pedidos (numero_mesa)
      WHERE numero_mesa IS NOT NULL AND estado_pedido NOT IN ('PAGADO', 'ANULADO');
  END IF;
END $$;
