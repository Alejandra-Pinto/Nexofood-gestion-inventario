/**
 * Entidad: PedidoItemAdicional
 * ------------------------------------------------------------------
 * HU-3.2 · SCRUM-152 Adicionales elegidos para una línea del pedido.
 * Una línea (detalles_pedido) puede tener N adicionales. El precio y el
 * nombre se congelan al registrar el pedido, igual que precio_unitario.
 */
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DetallePedido } from './detalle-pedido.entity';
import { Adicional } from './adicional.entity';

@Entity({ name: 'pedido_item_adicional', synchronize: false })
export class PedidoItemAdicional {
  @PrimaryGeneratedColumn({ name: 'id_pedido_item_adicional' })
  id_pedido_item_adicional: number;

  @Column({ name: 'id_detalle' })
  id_detalle: number;

  @ManyToOne(() => DetallePedido, (d) => d.adicionales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_detalle' })
  detalle?: DetallePedido;

  @Column({ name: 'id_adicional' })
  id_adicional: number;

  @ManyToOne(() => Adicional)
  @JoinColumn({ name: 'id_adicional' })
  adicional?: Adicional;

  @Column({ type: 'integer', default: 1 })
  cantidad: number;

  @Column({ type: 'integer', name: 'precio_unitario' })
  precio_unitario: number;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'nombre_adicional',
    nullable: true,
  })
  nombre_adicional: string | null;
}
