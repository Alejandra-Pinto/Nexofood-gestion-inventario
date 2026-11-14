-- OBSOLETO: las tablas de pedidos ahora se llaman "pedidos" y "detalles_pedido".
-- Se crean en 000_esquema_completo.sql (o en 005_pedidos_y_comandas.sql).
-- Este archivo se deja vacío para no crear las tablas viejas "pedido" y "detalle_pedido",
-- que chocan con las vistas de compatibilidad del esquema completo.
SELECT 'Script obsoleto: use 000_esquema_completo.sql' AS aviso;
