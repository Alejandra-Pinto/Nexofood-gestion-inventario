-- Solo para bases LOCALES creadas en el Sprint 2.
-- Las tablas viejas "pedido" y "detalle_pedido" impiden que 000_esquema_completo.sql
-- cree sus vistas de compatibilidad con esos nombres (y el script completo falla).
-- Aquí se renombran a *_sprint2 (no se borra nada). En Supabase no hace falta.
-- Orden en una base local vieja: 011 -> 012 -> 000.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'detalle_pedido') THEN
    ALTER TABLE detalle_pedido RENAME TO detalle_pedido_sprint2;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'pedido') THEN
    ALTER TABLE pedido RENAME TO pedido_sprint2;
  END IF;
END $$;
