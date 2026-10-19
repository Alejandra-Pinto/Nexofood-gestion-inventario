/**
 * Entidad: Pedido
 * ------------------------------------------------------------------
 * Cabecera de un pedido. Un pedido tiene uno o más detalles (productos).
 * `id_pedido` es el ID único que genera la base de datos (SERIAL).
 */
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DetallePedido } from './detalle-pedido.entity';

/** Estados posibles del pedido (deben coincidir con ck_pedido_estado en la BD) */
export enum EstadoPedido {
  PENDIENTE = 'PENDIENTE',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  ENTREGADO = 'ENTREGADO',
  PAGADO = 'PAGADO',
  ANULADO = 'ANULADO',
}

// synchronize: false -> la tabla se crea con backend/database/005_pedidos.sql
@Entity({ name: 'pedido', synchronize: false })
export class Pedido {
  @PrimaryGeneratedColumn({ name: 'id_pedido' })
  id_pedido: number;

  // Usuario que registró el pedido (se toma del token JWT)
  @Column({ name: 'id_mesero' })
  id_mesero: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_mesero' })
  mesero?: User;

  // Mesa del pedido (1 a 8). NULL = para llevar / tomado en caja.
  // Columna agregada en backend/database/007_pedido_mesa.sql
  @Column({ type: 'smallint', name: 'numero_mesa', nullable: true })
  numero_mesa: number | null;

  @Column({ type: 'timestamptz', name: 'fecha_hora', default: () => 'NOW()' })
  fecha_hora: Date;

  // Todo pedido nuevo inicia en PENDIENTE
  @Column({ type: 'varchar', length: 20, name: 'estado_pedido', default: EstadoPedido.PENDIENTE })
  estado_pedido: EstadoPedido;

  // Suma de cantidad x precio_unitario de los detalles, en COP
  @Column({ type: 'integer', name: 'total_calculado', default: 0 })
  total_calculado: number;

  // Productos del pedido (se guardan en la misma transacción que el pedido)
  @OneToMany(() => DetallePedido, (d) => d.pedido)
  detalles: DetallePedido[];
}
