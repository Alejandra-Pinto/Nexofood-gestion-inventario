/**
 * Entidad: ItemInventario 
 * ------------------------------------------------------------------
 * Se usa UNA sola tabla para dos tipos de ítems, diferenciados por `tipo_item`:
 *   - PRODUCTO: lo que se vende al cliente (choripán, gaseosa…). Tiene precio de venta.
 *   - INSUMO:   materia prima para preparar productos (chorizo, pan…). Precio de venta = 0.
 * HU-2.1 · SCRUM-122 Modelar tablas de productos e insumos (costos, precios, stock)
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Categoria } from './categoria.entity';

/** Tipos permitidos de ítem  */
export enum TipoItem {
  PRODUCTO = 'PRODUCTO',
  INSUMO = 'INSUMO',
}

// synchronize: false -> TypeORM no modifica esta tabla; se crea con backend/database/001_productos_insumos.sql
@Entity({ name: 'item_inventario', synchronize: false })
export class ItemInventario {
  @PrimaryGeneratedColumn({ name: 'id_item' })
  id_item: number;

  @Column()
  id_categoria: number;

  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'id_categoria' })
  categoria?: Categoria;

  @Column({ length: 80 })
  nombre: string;

  //'PRODUCTO' o 'INSUMO'
  @Column({ type: 'varchar', length: 10 })
  tipo_item: TipoItem;

  // Unidades disponibles actualmente (al crear el ítem = stock inicial)
  @Column({ type: 'integer', default: 0 })
  cantidad_stock: number;

  // Cuando cantidad_stock <= stock_minimo se genera alerta de stock bajo
  @Column({ type: 'integer', default: 0 })
  stock_minimo: number;

  // Costo de producción (productos) o de compra (insumos), en pesos COP 
  @Column({ type: 'integer', default: 0 })
  costo_fabricacion: number;

  // Precio al que se vende al cliente en COP. Para insumos siempre es 0.
  @Column({ type: 'integer', default: 0 })
  precio_venta: number;

  // Permite "desactivar" un ítem sin borrarlo (borrado lógico)
  @Column({ default: true })
  estado_activo: boolean;
}
