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

/** Motivos válidos únicamente para ingresos (HU-2.3) */
export type MotivoIngreso = 'COMPRA' | 'PRODUCCION';

/**
 * Cuerpo que se envía al backend para registrar un ingreso (HU-2.3)
 *  - COMPRA:      id_proveedor y costo_unitario obligatorios
 *  - PRODUCCION:  sin proveedor; costo_unitario opcional
 */
export interface CrearIngreso {
  id_item: number;
  motivo: MotivoIngreso;
  id_proveedor?: number;
  cantidad: number;
  costo_unitario?: number;
  /** AAAA-MM-DD (no puede ser futura) */
  fecha_ingreso?: string;
  observaciones?: string;
}

/** Tabla proveedor (selector del formulario de ingresos) */
export interface Proveedor {
  id_proveedor: number;
  nombre: string;
  estado_activo: boolean;
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
  /** Solo en ingresos (HU-2.3) */
  id_proveedor?: number | null;
  costo_unitario?: number | null;
  total?: number | null;
}

/** Etiqueta legible para el usuario según el motivo */
export const ETIQUETA_MOTIVO: Record<MotivoSalida, string> = {
  MERMA: 'Merma o desperdicio',
  CONSUMO_INTERNO: 'Consumo interno',
};
/** Etiqueta legible para el tipo de ingreso (prototipo 13) */
export const ETIQUETA_INGRESO: Record<MotivoIngreso, string> = {
  COMPRA: 'Compra a proveedor',
  PRODUCCION: 'Producción propia',
};
