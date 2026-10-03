/**
 * Entidad: Categoria
 * ------------------------------------------------------------------
 * Representa la tabla `categoria` de PostgreSQL (Supabase).
 * Agrupa los ítems del inventario (ej: Choripanes, Bebidas, Insumos cárnicos).
 *
 * Relación en el modelo de datos:
 *   Categoria (1) ◇── agrupa ──> (0..*) Item_Inventario
 *
 * HU-2.1 · SCRUM-122 Modelar tablas de productos e insumos
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// @Entity indica a TypeORM que esta clase corresponde a la tabla 'categoria'
@Entity('categoria')
export class Categoria {
  // Llave primaria autoincremental (SERIAL en PostgreSQL)
  @PrimaryGeneratedColumn({ name: 'id_categoria' })
  id_categoria: number;

  // Nombre de la categoría, máximo 60 caracteres (único en la base de datos)
  @Column({ length: 60 })
  nombre: string;
}
