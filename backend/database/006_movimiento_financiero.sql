

CREATE TABLE IF NOT EXISTS movimiento_financiero (
  id_movimiento    SERIAL PRIMARY KEY,
  id_usuario       INTEGER      NOT NULL REFERENCES usuarios (id_usuario),
  id_pedido        INTEGER      REFERENCES pedido (id_pedido),
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

-- Evita pagos duplicados: un pedido solo puede tener un ingreso
CREATE UNIQUE INDEX IF NOT EXISTS ux_movfin_pago_pedido
  ON movimiento_financiero (id_pedido)
  WHERE tipo_movimiento = 'INGRESO' AND id_pedido IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_movfin_fecha   ON movimiento_financiero (fecha_hora);
CREATE INDEX IF NOT EXISTS idx_movfin_usuario ON movimiento_financiero (id_usuario);
