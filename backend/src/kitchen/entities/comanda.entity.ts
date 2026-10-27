/**
 * Entidad: Comanda
 * ------------------------------------------------------------------
 * Comanda de cocina de un pedido.
 * HU-4.3 · SCRUM-181/182: cada modificación del pedido genera una NUEVA
 * versión (v1, v2, v3…) con el pedido completo y la lista de cambios.
 * Columnas de versionado: backend/database/010_hu_4_3_versionado_comandas.sql
 */
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Pedido } from '../../orders/entities/pedido.entity';
import { DetallePedido } from '../../orders/entities/detalle-pedido.entity';
import type { CambioComanda } from '../../orders/cambios-comanda';

export enum EstadoImpresionComanda {
  PENDIENTE = 'PENDIENTE',
  IMPRESA = 'IMPRESA',
  ERROR = 'ERROR',
  /** HU-4.3: una versión más nueva la reemplazó antes de imprimirse */
  REEMPLAZADA = 'REEMPLAZADA',
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

  /** HU-4.3: versión de la comanda dentro del pedido (1, 2, 3…) */
  @Column({ type: 'integer', default: 1 })
  version: number;

  /** HU-4.3: cambios respecto a la versión anterior ([] en la v1) */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  cambios: CambioComanda[];

  /** HU-4.3: cuándo se generó esta versión (fecha_impresion cambia al imprimir) */
  @Column({ type: 'timestamptz', name: 'fecha_creacion', default: () => 'NOW()' })
  fecha_creacion: Date;

  @OneToMany(() => DetallePedido, (d) => d.comanda)
  detalles?: DetallePedido[];
}
