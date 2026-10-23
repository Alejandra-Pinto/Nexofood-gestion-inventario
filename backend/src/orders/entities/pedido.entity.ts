import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ItemInventario } from '../../products/entities/item-inventario.entity';

// Nombres EXACTOS según la líder
export enum EstadoPedido {
  PENDIENTE = 'Pendiente',
  EN_PREPARACION = 'En preparación',
  LISTO = 'Listo',
  ENTREGADO = 'Entregado',
  PAGADO = 'Pagado',
  ANULADO = 'Anulado',
}

@Entity({ name: 'pedidos', synchronize: false })
export class Pedido {
  @PrimaryGeneratedColumn({ name: 'id_pedido' })
  id_pedido: number;

  @Column({ name: 'id_mesero', nullable: true })
  id_mesero: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'id_mesero' })
  mesero?: User;

  @Column({ type: 'integer', name: 'numero_mesa', nullable: true })
  numero_mesa: number;

  @Column({ type: 'varchar', length: 100, name: 'nombre_cliente', nullable: true })
  nombre_cliente: string;

  @Column({ type: 'timestamptz', name: 'fecha_hora', default: () => 'NOW()' })
  fecha_hora: Date;

  @Column({ type: 'varchar', length: 50, name: 'estado_pedido', default: EstadoPedido.PENDIENTE })
  estado_pedido: EstadoPedido;

  @Column({ type: 'integer', name: 'total_calculado', default: 0 })
  total_calculado: number;

  @OneToMany(() => DetallePedido, (detalle) => detalle.pedido, { cascade: true })
  detalles?: DetallePedido[];
}

@Entity({ name: 'detalles_pedido', synchronize: false })
export class DetallePedido {
  @PrimaryGeneratedColumn({ name: 'id_detalle' })
  id_detalle: number;

  @Column({ name: 'id_pedido' })
  id_pedido: number;

  @ManyToOne(() => Pedido, (pedido) => pedido.detalles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_pedido' })
  pedido?: Pedido;

  @Column({ name: 'id_item' })
  id_item: number;

  @ManyToOne(() => ItemInventario)
  @JoinColumn({ name: 'id_item' })
  item?: ItemInventario;

  @Column({ type: 'numeric' })
  cantidad: number;

  @Column({ type: 'integer', name: 'precio_unitario' })
  precio_unitario: number;

  @Column({ type: 'text', name: 'notas_especiales', nullable: true })
  notas_especiales: string | null;

  @Column({ type: 'varchar', length: 100, name: 'promocion_aplicada', nullable: true })
  promocion_aplicada: string | null;
}