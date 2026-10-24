/**
 * Entidad: Pedido
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

export enum EstadoPedido {
  PENDIENTE = 'PENDIENTE',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  ENTREGADO = 'ENTREGADO',
  PAGADO = 'PAGADO',
  ANULADO = 'ANULADO',
}

// CORREGIDO: La tabla en Supabase se llama 'pedidos' (plural)
@Entity({ name: 'pedidos', synchronize: false })
export class Pedido {
  @PrimaryGeneratedColumn({ name: 'id_pedido' })
  id_pedido: number;

  @Column({ name: 'id_mesero' })
  id_mesero: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_mesero' })
  mesero?: User;

  @Column({ type: 'smallint', name: 'numero_mesa', nullable: true })
  numero_mesa: number | null;

  @Column({ type: 'timestamptz', name: 'fecha_hora', default: () => 'NOW()' })
  fecha_hora: Date;

  @Column({ type: 'varchar', length: 20, name: 'estado_pedido', default: EstadoPedido.PENDIENTE })
  estado_pedido: EstadoPedido;

  @Column({ type: 'integer', name: 'total_calculado', default: 0 })
  total_calculado: number;

  @OneToMany(() => DetallePedido, (d) => d.pedido)
  detalles: DetallePedido[];
}