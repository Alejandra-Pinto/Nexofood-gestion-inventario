/**
 * Entidad: MovimientoFinanciero
 * ------------------------------------------------------------------
 * HU-3.5 · SCRUM-168 Implementar selección y registro del método de pago
 *
 * Registra la entrada o salida de dinero con su medio de pago.
 * Al cobrar un pedido se guarda un INGRESO ligado al pedido (id_pedido).
 * El módulo Finance (HU-7.1) la usa también para movimientos sin pedido.
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Pedido } from '../../orders/entities/pedido.entity';

export enum TipoMovimientoFinanciero {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

/** Medios de pago del prototipo (deben coincidir con ck_movfin_medio en la BD) */
export enum MedioPago {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  NEQUI = 'NEQUI',
  DAVIPLATA = 'DAVIPLATA',
  TARJETA = 'TARJETA',
}

// synchronize: false -> la tabla se crea con backend/database/006_movimiento_financiero.sql
@Entity({ name: 'movimiento_financiero', synchronize: false })
export class MovimientoFinanciero {
  @PrimaryGeneratedColumn({ name: 'id_movimiento' })
  id_movimiento: number;

  // Usuario que registró el movimiento (cajero o administrador)
  @Column({ name: 'id_usuario' })
  id_usuario: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_usuario' })
  usuario?: User;

  // Pedido que se cobró (NULL en movimientos que no son ventas)
  @Column({ name: 'id_pedido', type: 'integer', nullable: true })
  id_pedido: number | null;

  @ManyToOne(() => Pedido)
  @JoinColumn({ name: 'id_pedido' })
  pedido?: Pedido;

  @Column({ type: 'varchar', length: 10, name: 'tipo_movimiento' })
  tipo_movimiento: TipoMovimientoFinanciero;

  // Valor en pesos COP
  @Column({ type: 'integer' })
  monto: number;

  @Column({ type: 'varchar', length: 15, name: 'medio_pago' })
  medio_pago: MedioPago;

  @Column({ type: 'timestamptz', name: 'fecha_hora', default: () => 'NOW()' })
  fecha_hora: Date;
}
