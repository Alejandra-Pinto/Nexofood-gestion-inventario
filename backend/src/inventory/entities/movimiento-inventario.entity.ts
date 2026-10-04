/**
 * Entidad: MovimientoInventario (Kardex)
 * ------------------------------------------------------------------
 * Cada fila representa un movimiento de stock: entrada (compra o
 * producción) o salida (merma o consumo interno).
 *
 * Los valores de `stock_anterior` y `stock_nuevo` los calcula el
 * servicio dentro de una transacción, antes de guardar el registro.
 *
 * Cubre:
 *   HU-2.3 — Ingresos de inventario (COMPRA / PRODUCCION)
 *   HU-2.4 — Salidas manuales de inventario (MERMA / CONSUMO_INTERNO)
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ItemInventario } from '../../products/entities/item-inventario.entity';
import { User } from '../../users/entities/user.entity';

/** Dirección del movimiento */
export enum TipoMovimiento {
  ENTRADA = 'ENTRADA',
  SALIDA = 'SALIDA',
}

/** Causa del movimiento (debe respetar ck_mov_coherencia en la BD) */
export enum MotivoMovimiento {
  COMPRA = 'COMPRA',
  PRODUCCION = 'PRODUCCION',
  MERMA = 'MERMA',
  CONSUMO_INTERNO = 'CONSUMO_INTERNO',
}

// synchronize: false -> la tabla se crea con backend/database/002_movimiento_inventario.sql
@Entity({ name: 'movimiento_inventario', synchronize: false })
export class MovimientoInventario {
  @PrimaryGeneratedColumn({ name: 'id_movimiento' })
  id_movimiento: number;

  @Column({ name: 'id_item' })
  id_item: number;

  @ManyToOne(() => ItemInventario)
  @JoinColumn({ name: 'id_item' })
  item?: ItemInventario;

  @Column({ name: 'id_usuario' })
  id_usuario: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_usuario' })
  usuario?: User;

  @Column({ type: 'varchar', length: 10, name: 'tipo_movimiento' })
  tipo_movimiento: TipoMovimiento;

  @Column({ type: 'varchar', length: 20 })
  motivo: MotivoMovimiento;

  @Column({ type: 'integer' })
  cantidad: number;

  @Column({ type: 'integer', name: 'stock_anterior' })
  stock_anterior: number;

  @Column({ type: 'integer', name: 'stock_nuevo' })
  stock_nuevo: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observaciones: string | null;

  @Column({ type: 'timestamptz', name: 'fecha_hora', default: () => 'NOW()' })
  fecha_hora: Date;
}