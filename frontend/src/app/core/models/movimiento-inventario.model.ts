/**
 * Modelos TypeScript: MovimientoInventario
 * ------------------------------------------------------------------
 * HU-2.4 · SCRUM-131 Diseñar interfaz de salidas
 *
 * Reflejan el contrato del endpoint:
 *   POST /inventory/salidas
 *
 * El backend responde con la entidad MovimientoInventario completa
 * (incluye stock_anterior y stock_nuevo calculados).
 */

/** Dirección del movimiento */
export type TipoMovimiento = 'ENTRADA' | 'SALIDA';

/** Motivo completo (entradas y salidas) */
export type MotivoMovimiento =
  | 'COMPRA'
  | 'PRODUCCION'
  | 'MERMA'
  | 'CONSUMO_INTERNO';

/** Motivos válidos únicamente para salidas manuales */
export type MotivoSalida = 'MERMA' | 'CONSUMO_INTERNO';

/** Cuerpo que se envía al backend para registrar una salida */
export interface CrearSalida {
  id_item: number;
  motivo: MotivoSalida;
  cantidad: number;
  observaciones?: string;
}

/** Respuesta del backend (kardex completo) */
export interface MovimientoInventario {
  id_movimiento: number;
  id_item: number;
  id_usuario: number;
  tipo_movimiento: TipoMovimiento;
  motivo: MotivoMovimiento;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  observaciones: string | null;
  fecha_hora: string;
}

/** Etiqueta legible para el usuario según el motivo */
export const ETIQUETA_MOTIVO: Record<MotivoSalida, string> = {
  MERMA: 'Merma o desperdicio',
  CONSUMO_INTERNO: 'Consumo interno',
};