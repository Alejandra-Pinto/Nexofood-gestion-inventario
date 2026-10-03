/**
 * Entidad: Categoria
 * ------------------------------------------------------------------
 * Agrupa los ítems del inventario (ej: Choripanes, Bebidas, Insumos cárnicos).
 * HU-2.1 · SCRUM-122 Modelar tablas de productos e insumos
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// synchronize: false -> TypeORM no modifica esta tabla; se crea con backend/database/001_productos_insumos.sql
@Entity({ name: 'categoria', synchronize: false })
export class Categoria {
  @PrimaryGeneratedColumn({ name: 'id_categoria' })
  id_categoria: number;

  @Column({ length: 60 })
  nombre: string;
}
