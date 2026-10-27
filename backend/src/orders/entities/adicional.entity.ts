/**
 * Entidad: Adicional
 * ------------------------------------------------------------------
 * HU-3.2 · SCRUM-152 Catálogo de adicionales que el mesero puede sumar
 * a un producto del pedido (prototipo "Nuevo choripán", pasos 2 y 3).
 *
 *   PAN     -> paso 2 "Elegí tu pan" (Ciabatta, Orégano)
 *   ADEREZO -> paso 3 "Elegí tu aderezo" (Chimi Rojo, BBQ Mango…)
 *   EXTRA   -> paso 3 bloque "ADICIONALES" (Aderezo adicional extra +$1.500)
 *
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

export enum TipoAdicional {
  PAN = 'PAN',
  ADEREZO = 'ADEREZO',
  EXTRA = 'EXTRA',
}

@Entity({ name: 'adicionales', synchronize: false })
export class Adicional {
  @PrimaryGeneratedColumn({ name: 'id_adicional' })
  id_adicional: number;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'varchar', length: 20, default: TipoAdicional.EXTRA })
  tipo: TipoAdicional;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion: string | null;

  /** Insumo que consume una unidad del adicional (null = sin control de stock) */
  @Column({ type: 'integer', name: 'id_insumo', nullable: true })
  id_insumo: number | null;

  @ManyToOne(() => ItemInventario, { nullable: true })
  @JoinColumn({ name: 'id_insumo' })
  insumo?: ItemInventario | null;

  /** PostgreSQL devuelve NUMERIC como texto: usar Number(cantidad_insumo) */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 3,
    name: 'cantidad_insumo',
    default: 1,
  })
  cantidad_insumo: number;

  /** Valor que se suma al precio de la unidad, en pesos COP */
  @Column({ type: 'integer', name: 'precio_adicional', default: 0 })
  precio_adicional: number;

  /** Si se llena, el adicional solo aplica a productos de esa categoría */
  @Column({ type: 'integer', name: 'id_categoria', nullable: true })
  id_categoria: number | null;

  @Column({ type: 'smallint', default: 0 })
  orden: number;

  @Column({ name: 'estado_activo', default: true })
  estado_activo: boolean;
}
