/**
 * Entidad: DetallePedido
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ItemInventario } from '../../products/entities/item-inventario.entity';
import { Pedido } from './pedido.entity';

// CORREGIDO: La tabla en Supabase se llama 'detalles_pedido'
@Entity({ name: 'detalles_pedido', synchronize: false })
export class DetallePedido {
  @PrimaryGeneratedColumn({ name: 'id_detalle' })
  id_detalle: number;

  @Column({ name: 'id_pedido' })
  id_pedido: number;

  @ManyToOne(() => Pedido, (pedido) => pedido.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_pedido' })
  pedido: Pedido;

  @Column({ name: 'id_item' })
  id_item: number;

  @ManyToOne(() => ItemInventario)
  @JoinColumn({ name: 'id_item' })
  item: ItemInventario;

  @Column({ type: 'numeric' })
  cantidad: number;

  @Column({ type: 'integer', name: 'precio_unitario' })
  precio_unitario: number;

  @Column({ type: 'text', name: 'notas_especiales', nullable: true })
  notas_especiales: string | null;

  @Column({ type: 'varchar', length: 100, name: 'promocion_aplicada', nullable: true })
  promocion_aplicada: string | null;
}