/**
 * Entidad: HistorialImpresion
 * ------------------------------------------------------------------
 * HU-4.3 · Historial de impresión del prototipo 14:
 *   12:45:22 · Comanda v1 · OK
 *   12:48:10 · Comanda v2 · OK
 * Se registra cada vez que el agente Electron reporta IMPRESA o ERROR.
 * Tabla creada con backend/database/010_hu_4_3_versionado_comandas.sql
 */
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum TipoImpresion {
  COMANDA = 'COMANDA',
  COMPROBANTE = 'COMPROBANTE',
}

export enum ResultadoImpresion {
  OK = 'OK',
  ERROR = 'ERROR',
}

@Entity({ name: 'historial_impresion', synchronize: false })
export class HistorialImpresion {
  @PrimaryGeneratedColumn({ name: 'id_impresion' })
  id_impresion: number;

  @Column({ type: 'integer', name: 'id_pedido' })
  id_pedido: number;

  @Column({ type: 'integer', name: 'id_comanda', nullable: true })
  id_comanda: number | null;

  @Column({ type: 'varchar', length: 20, default: TipoImpresion.COMANDA })
  tipo: TipoImpresion;

  @Column({ type: 'integer', nullable: true })
  version: number | null;

  @Column({ type: 'varchar', length: 10 })
  resultado: ResultadoImpresion;

  @Column({ type: 'timestamptz', name: 'fecha_hora', default: () => 'NOW()' })
  fecha_hora: Date;
}
