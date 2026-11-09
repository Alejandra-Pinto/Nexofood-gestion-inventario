/** Entidad: MovimientoFinanciero - Entrada o salida de dinero con su medio de pago */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Pedido } from '../../orders/entities/pedido.entity';

export enum TipoMovimientoFinanciero {
  INGRESO = 'INGRESO',
  EGRESO = 'EGRESO',
}

/** Origen del dinero */
export enum OrigenMovimiento {
  VENTA = 'VENTA',
  MANUAL = 'MANUAL',
}

/** Medios de pago del prototipo (deben coincidir con ck_movfin_medio en la BD) */
export enum MedioPago {
  EFECTIVO = 'EFECTIVO',
  TRANSFERENCIA = 'TRANSFERENCIA',
  NEQUI = 'NEQUI',
  DAVIPLATA = 'DAVIPLATA',
  TARJETA = 'TARJETA',
}

// Synchronize: false -> la tabla es movimientos_financieros
@Entity({ name: 'movimientos_financieros', synchronize: false })
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

  // Columnas de backend/database/011_ingresos_no_ventas.sql
  @Column({ type: 'varchar', length: 10, default: OrigenMovimiento.VENTA })
  origen: OrigenMovimiento;

  // Concepto del ingreso manual (ej. "Aporte de socios para base de caja")
  @Column({ type: 'varchar', length: 120, nullable: true })
  concepto: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  categoria: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observaciones: string | null;
}
