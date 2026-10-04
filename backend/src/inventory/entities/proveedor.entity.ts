/**
 * Entidad: Proveedor
 * ------------------------------------------------------------------
 * Catálogo mínimo de proveedores. Se usa en los ingresos por COMPRA
 * (HU-2.3) para saber a quién se le compró la mercancía.
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// synchronize: false -> la tabla se crea con backend/database/003_ingresos_inventario.sql
@Entity({ name: 'proveedor', synchronize: false })
export class Proveedor {
  @PrimaryGeneratedColumn({ name: 'id_proveedor' })
  id_proveedor: number;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  // Borrado lógico: un proveedor inactivo no aparece en el selector
  @Column({ type: 'boolean', name: 'estado_activo', default: true })
  estado_activo: boolean;
}
