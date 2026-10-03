/**
 * Entidad: ItemInventario  (<<STI>> Single Table Inheritance)
 * ------------------------------------------------------------------
 * Representa la tabla `item_inventario` de PostgreSQL (Supabase).
 *
 * Se usa UNA sola tabla para dos tipos de ítems, diferenciados por `tipo_item`:
 *   - PRODUCTO: lo que se vende al cliente (choripán, gaseosa…). Tiene precio de venta.
 *   - INSUMO:   materia prima para preparar productos (chorizo, pan…). Precio de venta = 0.
 *
 * Relaciones en el modelo de datos:
 *   Categoria (1) ◇── agrupa ──> (0..*) Item_Inventario
 *   Item_Inventario (1) ◆── compuesto por ──> (0..*) Receta_Escandallo  (HU posteriores)
 *
 * HU-2.1 · SCRUM-122 Modelar tablas de productos e insumos (costos, precios, stock)
 */
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Categoria } from './categoria.entity';

/** Tipos permitidos de ítem (discriminador del STI) */
export enum TipoItem {
  PRODUCTO = 'PRODUCTO',
  INSUMO = 'INSUMO',
}

// @Entity indica a TypeORM que esta clase corresponde a la tabla 'item_inventario'
@Entity('item_inventario')
export class ItemInventario {
  // Llave primaria autoincremental
  @PrimaryGeneratedColumn({ name: 'id_item' })
  id_item: number;

  // Llave foránea hacia la tabla categoria
  @Column()
  id_categoria: number;

  // Relación muchos-a-uno: muchos ítems pertenecen a una categoría.
  // @JoinColumn usa la columna id_categoria como llave foránea.
  @ManyToOne(() => Categoria)
  @JoinColumn({ name: 'id_categoria' })
  categoria?: Categoria;

  // Nombre del ítem (máx. 80 caracteres, no se puede repetir)
  @Column({ length: 80 })
  nombre: string;

  // Discriminador STI: 'PRODUCTO' o 'INSUMO'
  @Column({ type: 'varchar', length: 10 })
  tipo_item: TipoItem;

  // Unidades disponibles actualmente (al crear el ítem = stock inicial)
  @Column({ type: 'integer', default: 0 })
  cantidad_stock: number;

  // Cuando cantidad_stock <= stock_minimo se genera alerta de stock bajo
  @Column({ type: 'integer', default: 0 })
  stock_minimo: number;

  // Costo de producción (productos) o de compra (insumos), en pesos COP sin decimales
  @Column({ type: 'integer', default: 0 })
  costo_fabricacion: number;

  // Precio al que se vende al cliente en COP. Para insumos siempre es 0.
  @Column({ type: 'integer', default: 0 })
  precio_venta: number;

  // Permite "desactivar" un ítem sin borrarlo (borrado lógico)
  @Column({ default: true })
  estado_activo: boolean;
}
