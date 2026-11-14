-- Pagos de pedidos (HU-3.5): tabla movimientos_financieros con llave a "pedidos".
-- Mismo diseño que 000_esquema_completo.sql. Ejecutar después de crear "pedidos".

CREATE TABLE IF NOT EXISTS movimientos_financieros (
  id_movimiento    SERIAL PRIMARY KEY,
  id_usuario       INTEGER      NOT NULL REFERENCES usuarios (id_usuario),
  id_pedido        INTEGER      REFERENCES pedidos (id_pedido),
  tipo_movimiento  VARCHAR(10)  NOT NULL,
  monto            INTEGER      NOT NULL,
  medio_pago       VARCHAR(15)  NOT NULL,
  fecha_hora       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT ck_movfin_tipo  CHECK (tipo_movimiento IN ('INGRESO', 'EGRESO')),
  CONSTRAINT ck_movfin_monto CHECK (monto > 0),
  CONSTRAINT ck_movfin_medio CHECK (
    medio_pago IN ('EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA', 'TARJETA')
  )
);

-- Un pedido solo puede tener un pago (evita cobros duplicados)
CREATE UNIQUE INDEX IF NOT EXISTS ux_movfin_pago_pedido
  ON movimientos_financieros (id_pedido)
  WHERE tipo_movimiento = 'INGRESO' AND id_pedido IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movfin_fecha   ON movimientos_financieros (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_movfin_usuario ON movimientos_financieros (id_usuario);
