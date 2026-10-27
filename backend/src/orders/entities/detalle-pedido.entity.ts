/**
 * Entidad: DetallePedido
 */
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ItemInventario } from '../../products/entities/item-inventario.entity';
import { Pedido } from './pedido.entity';
import { Comanda } from '../../kitchen/entities/comanda.entity';
import { PedidoItemAdicional } from './pedido-item-adicional.entity';

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

  // HU-3.2: precio final de UNA unidad = (base o precio con promoción) + Σ adicionales
  @Column({ type: 'integer', name: 'precio_unitario' })
  precio_unitario: number;

  // HU-3.2 · SCRUM-154: nota de cocina ("sin cebolla"); en la comanda sale como ** SIN CEBOLLA **
  @Column({ type: 'text', name: 'notas_especiales', nullable: true })
  notas_especiales: string | null;

  // HU-3.2 · SCRUM-153: nombre de la promoción/combo aplicado ("Combo con papa")
  @Column({ type: 'varchar', length: 100, name: 'promocion_aplicada', nullable: true })
  promocion_aplicada: string | null;

  @Column({ type: 'integer', name: 'id_comanda', nullable: true })
  id_comanda?: number | null;

  @ManyToOne(() => Comanda, { nullable: true })
  @JoinColumn({ name: 'id_comanda' })
  comanda?: Comanda;

  // HU-3.2 · SCRUM-152: adicionales elegidos para esta línea (pan, aderezo, extras)
  @OneToMany(() => PedidoItemAdicional, (a) => a.detalle)
  adicionales?: PedidoItemAdicional[];
}
