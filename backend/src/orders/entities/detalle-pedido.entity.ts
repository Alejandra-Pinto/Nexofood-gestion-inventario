/**
 * Entidad: DetallePedido
 * ------------------------------------------------------------------
 * Cada fila es un producto del pedido con su cantidad y el precio
 * de venta que tenía en el momento de registrar el pedido.
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ItemInventario } from '../../products/entities/item-inventario.entity';
import { Pedido } from './pedido.entity';

// synchronize: false -> la tabla se crea con backend/database/005_pedidos.sql
@Entity({ name: 'detalle_pedido', synchronize: false })
export class DetallePedido {
  @PrimaryGeneratedColumn({ name: 'id_detalle' })
  id_detalle: number;

  @Column({ name: 'id_pedido' })
  id_pedido: number;

  @ManyToOne(() => Pedido, (p) => p.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_pedido' })
  pedido?: Pedido;

  @Column({ name: 'id_item' })
  id_item: number;

  @ManyToOne(() => ItemInventario)
  @JoinColumn({ name: 'id_item' })
  item?: ItemInventario;

  @Column({ type: 'integer' })
  cantidad: number;

  // Precio de venta del producto al momento del pedido, en COP
  @Column({ type: 'integer', name: 'precio_unitario' })
  precio_unitario: number;

  // HU-3.2 (adicionales, promociones y notas)
  @Column({ type: 'varchar', length: 255, name: 'notas_especiales', nullable: true })
  notas_especiales: string | null;

  @Column({ type: 'varchar', length: 100, name: 'promocion_aplicada', nullable: true })
  promocion_aplicada: string | null;
}
