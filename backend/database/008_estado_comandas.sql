-- ============================================================================
-- SCRUM-186 / SCRUM-187 · Estado de impresión y trazabilidad de comandas
-- ============================================================================

ALTER TABLE comandas
ADD COLUMN IF NOT EXISTS estado_impresion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE';

