-- ============================================================================
-- Diagnóstico · Bug "7 + 1 = 71" (HU-2.3 ingresos de inventario)
-- ============================================================================
-- SOLO LECTURA (únicamente SELECT): no modifica nada. Ejecutar en tu BD real
-- (psql, pgAdmin o DBeaver).
--
--  Consulta 1 -> confirma la CAUSA: si cantidad_stock NO es "integer", el driver
--                `pg` la devuelve como TEXTO y "7" + 1 daba "71".
--  Consulta 2 -> lista los ingresos ya registrados con el stock mal calculado.
--  Consulta 3 -> ítems cuyo stock actual no coincide con su último movimiento.
-- ============================================================================

-- 1) Tipo real de las columnas en TU base de datos
--    Esperado por el proyecto: integer. Si ves numeric o bigint, ahí está la causa.
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE (table_name = 'item_inventario'
        AND column_name IN ('cantidad_stock', 'stock_minimo', 'costo_fabricacion', 'precio_venta'))
    OR (table_name = 'movimiento_inventario'
        AND column_name IN ('cantidad', 'stock_anterior', 'stock_nuevo'))
 ORDER BY table_name, column_name;

-- 2) Ingresos con el stock mal calculado (stock_nuevo debe ser stock_anterior + cantidad)
SELECT m.id_movimiento, m.id_item, i.nombre, m.motivo, m.cantidad,
       m.stock_anterior, m.stock_nuevo,
       (m.stock_anterior + m.cantidad) AS stock_nuevo_correcto,
       m.fecha_hora
  FROM movimiento_inventario m
  JOIN item_inventario i ON i.id_item = m.id_item
 WHERE m.tipo_movimiento = 'ENTRADA'
   AND m.stock_nuevo <> m.stock_anterior + m.cantidad
 ORDER BY m.fecha_hora;

-- 3) Ítems cuyo stock actual difiere del stock_nuevo de su último movimiento
SELECT i.id_item, i.nombre, i.cantidad_stock AS stock_actual,
       u.stock_nuevo AS stock_ultimo_movimiento, u.id_movimiento, u.fecha_hora
  FROM item_inventario i
  JOIN LATERAL (
        SELECT id_movimiento, stock_nuevo, fecha_hora
          FROM movimiento_inventario
         WHERE id_item = i.id_item
         ORDER BY fecha_hora DESC, id_movimiento DESC
         LIMIT 1
       ) u ON TRUE
 WHERE i.cantidad_stock <> u.stock_nuevo;

-- Si las consultas 2 o 3 devuelven filas, el stock de esos ítems quedó corrupto por el bug.
-- Corríjalos manualmente con el conteo físico real (no hay una regla automática segura).
