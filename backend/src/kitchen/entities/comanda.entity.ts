import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Pedido } from '../../orders/entities/pedido.entity';

export enum EstadoImpresionComanda {
  PENDIENTE = 'PENDIENTE',
  IMPRESA = 'IMPRESA',
  ERROR = 'ERROR',
}

@Entity({ name: 'comandas', synchronize: false })
export class Comanda {
  @PrimaryGeneratedColumn({ name: 'id_comanda' })
  id_comanda: number;

  @Column({ name: 'id_pedido' })
  id_pedido: number;

  @ManyToOne(() => Pedido)
  @JoinColumn({ name: 'id_pedido' })
  pedido?: Pedido;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'estado_impresion',
    default: EstadoImpresionComanda.PENDIENTE,
  })
  estado_impresion: EstadoImpresionComanda;

  @Column({ type: 'timestamptz', name: 'fecha_impresion', default: () => 'NOW()' })
  fecha_impresion: Date;
}
