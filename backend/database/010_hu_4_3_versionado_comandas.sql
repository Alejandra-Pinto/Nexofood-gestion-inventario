-- ============================================================================
-- HU-4.3 · Actualizar comanda ante modificaciones (roles CAJERO / MESERO)
--   SCRUM-181 Actualizar la comanda al modificar el pedido
--   SCRUM-182 Control de versiones e identificación de cambios
--   SCRUM-183 Bloquear modificación de pedido finalizado
--
-- Ejecutar en PostgreSQL LOCAL después de 001…009 y luego en Supabase.
-- Es IDEMPOTENTE: se puede ejecutar varias veces sin error.
--
-- Modelo:
--   · Cada vez que un pedido cambia (producto agregado/quitado, cantidad o nota)
--     se crea una NUEVA fila en comandas con version = N + 1 y
--     estado_impresion = 'PENDIENTE'. Cocina recibe el pedido COMPLETO
--     actualizado y, aparte, la lista de cambios (columna cambios).
--   · Si la versión anterior aún no se había impreso, queda 'REEMPLAZADA'
--     para que la impresora no saque dos comandas del mismo pedido.
--   · historial_impresion guarda cada impresión que reporta el agente Electron
--     ("12:45:22 · Comanda v1 · OK", prototipo 14).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Versión de la comanda (v1, v2, v3…) por pedido
-- ----------------------------------------------------------------------------
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Comandas existentes: se numeran 1, 2, 3… por pedido en orden de creación.
-- Volver a ejecutar produce los mismos números (no altera nada).
WITH numeradas AS (
  SELECT id_comanda,
         ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_comanda) AS v
  FROM comandas
)
UPDATE comandas c
SET version = n.v
FROM numeradas n
WHERE c.id_comanda = n.id_comanda
  AND c.version <> n.v;

ALTER TABLE comandas DROP CONSTRAINT IF EXISTS ck_comandas_version;
ALTER TABLE comandas ADD CONSTRAINT ck_comandas_version CHECK (version >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS ux_comandas_pedido_version ON comandas (id_pedido, version);

-- ----------------------------------------------------------------------------
-- 2. Cambios respecto a la versión anterior (SCRUM-182)
--    Ej: [{"tipo":"AGREGADO","producto":"Cerveza","cantidad":1,
--          "texto":"Se agregó 1x Cerveza"}]
-- ----------------------------------------------------------------------------
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS cambios JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- 3. Fecha en que se generó la versión (fecha_impresion cambia al imprimir)
-- ----------------------------------------------------------------------------
ALTER TABLE comandas ADD COLUMN IF NOT EXISTS fecha_creacion TIMESTAMPTZ;
UPDATE comandas SET fecha_creacion = COALESCE(fecha_impresion, NOW()) WHERE fecha_creacion IS NULL;
ALTER TABLE comandas ALTER COLUMN fecha_creacion SET DEFAULT NOW();
ALTER TABLE comandas ALTER COLUMN fecha_creacion SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Estados de impresión: se agrega REEMPLAZADA
--    NOT VALID: no revisa filas viejas (por si hay valores escritos a mano).
-- ----------------------------------------------------------------------------
ALTER TABLE comandas DROP CONSTRAINT IF EXISTS ck_comandas_estado_impresion;
ALTER TABLE comandas
  ADD CONSTRAINT ck_comandas_estado_impresion
  CHECK (estado_impresion IN ('PENDIENTE', 'IMPRESA', 'ERROR', 'REEMPLAZADA')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_comandas_estado ON comandas (estado_impresion);

-- ----------------------------------------------------------------------------
-- 5. Historial de impresión (prototipo 14)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_impresion (
  id_impresion  SERIAL PRIMARY KEY,
  id_pedido     INTEGER      NOT NULL REFERENCES pedidos (id_pedido) ON DELETE CASCADE,
  id_comanda    INTEGER      REFERENCES comandas (id_comanda) ON DELETE CASCADE,
  -- COMPROBANTE queda listo para la impresión del comprobante del cliente
  tipo          VARCHAR(20)  NOT NULL DEFAULT 'COMANDA',
  version       INTEGER,
  resultado     VARCHAR(10)  NOT NULL,
  fecha_hora    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_historial_tipo      CHECK (tipo IN ('COMANDA', 'COMPROBANTE')),
  CONSTRAINT ck_historial_resultado CHECK (resultado IN ('OK', 'ERROR'))
);

CREATE INDEX IF NOT EXISTS idx_historial_impresion_pedido
  ON historial_impresion (id_pedido, fecha_hora);

-- Comandas ya impresas antes de esta migración: se registran una sola vez
INSERT INTO historial_impresion (id_pedido, id_comanda, tipo, version, resultado, fecha_hora)
SELECT c.id_pedido, c.id_comanda, 'COMANDA', c.version, 'OK', c.fecha_impresion
FROM comandas c
WHERE c.estado_impresion = 'IMPRESA'
  AND c.fecha_impresion IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM historial_impresion h WHERE h.id_comanda = c.id_comanda);

COMMIT;

-- ============================================================================
-- Verificación rápida
--   SELECT id_pedido, version, estado_impresion, fecha_creacion, cambios
--   FROM comandas ORDER BY id_pedido, version;
--   SELECT * FROM historial_impresion ORDER BY fecha_hora DESC LIMIT 20;
-- ============================================================================
