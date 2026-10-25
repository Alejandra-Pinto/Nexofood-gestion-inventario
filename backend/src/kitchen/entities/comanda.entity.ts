import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Pedido } from '../../orders/entities/pedido.entity';
import { DetallePedido } from '../../orders/entities/detalle-pedido.entity';

@Entity({ name: 'comandas', synchronize: false })
export class Comanda {
  @PrimaryGeneratedColumn({ name: 'id_comanda' })
  id_comanda: number;

  @Column({ name: 'id_pedido' })
  id_pedido: number;

  @ManyToOne(() => Pedido)
  @JoinColumn({ name: 'id_pedido' })
  pedido?: Pedido;

  @Column({ type: 'timestamptz', name: 'fecha_impresion', default: () => 'NOW()' })
  fecha_impresion: Date;

  @Column({ type: 'varchar', length: 50, name: 'estado_impresion', default: 'PENDIENTE' })
  estado_impresion: string;

  @OneToMany(() => DetallePedido, (d) => d.comanda)
  detalles?: DetallePedido[];
}