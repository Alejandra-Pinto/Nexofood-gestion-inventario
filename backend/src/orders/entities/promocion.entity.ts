/**
 * Entidad: Promocion
 * ------------------------------------------------------------------
 * HU-3.2 · SCRUM-153 Promociones y combos vigentes (ej. "Combo con papa").
 *
 * Precio de la unidad con la promoción (antes de sumar adicionales):
 *   precio_final (si viene) -> precio fijo
 *   COMBO                   -> precio_venta + recargo
 *   DESCUENTO               -> precio_venta - porcentaje_descuento %
 *
 * Vigente = estado_activo y vigente_desde <= ahora <= vigente_hasta.
 * Tabla creada con backend/database/009_hu_3_2_adicionales_promociones_combos.sql
 */
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ItemInventario } from '../../products/entities/item-inventario.entity';

export enum TipoPromocion {
  COMBO = 'COMBO',
  DESCUENTO = 'DESCUENTO',
}

@Entity({ name: 'promociones', synchronize: false })
export class Promocion {
  @PrimaryGeneratedColumn({ name: 'id_promocion' })
  id_promocion: number;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 20 })
  tipo: TipoPromocion;

  @Column({ type: 'integer', name: 'precio_final', nullable: true })
  precio_final: number | null;

  @Column({ type: 'integer', default: 0 })
  recargo: number;

  /** PostgreSQL devuelve NUMERIC como texto: usar Number(porcentaje_descuento) */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    name: 'porcentaje_descuento',
    default: 0,
  })
  porcentaje_descuento: number;

  /** Si se llena, la promoción solo aplica a productos de esa categoría */
  @Column({ type: 'integer', name: 'id_categoria', nullable: true })
  id_categoria: number | null;

  /** Insumo que consume el combo (ej. porción de papas) */
  @Column({ type: 'integer', name: 'id_insumo', nullable: true })
  id_insumo: number | null;

  @ManyToOne(() => ItemInventario, { nullable: true })
  @JoinColumn({ name: 'id_insumo' })
  insumo?: ItemInventario | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    name: 'cantidad_insumo',
    default: 1,
  })
  cantidad_insumo: number;

  @Column({ type: 'timestamptz', name: 'vigente_desde' })
  vigente_desde: Date;

  @Column({ type: 'timestamptz', name: 'vigente_hasta' })
  vigente_hasta: Date;

  @Column({ name: 'estado_activo', default: true })
  estado_activo: boolean;
}
