-- =====================================================================
-- HU-1.4 Modificar permisos de usuarios
-- Agrega las funcionalidades habilitadas por usuario.
-- Ejecutar en Supabase: SQL Editor -> New query -> pegar -> Run
-- (NULL = el usuario usa los permisos por defecto de su rol)
-- Valores válidos: productos, inventario, ventas, reportes, financiero
-- (se validan en el backend con UpdatePermisosDto)
-- =====================================================================

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS permisos TEXT[];
