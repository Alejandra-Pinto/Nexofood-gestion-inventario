/**
 * Mesas del local
 * ------------------------------------------------------------------
 * 8 mesas numeradas del 1 al 8. Cada mesa puede tener un pedido activo (pendiente, en preparación, listo o entregado) o estar libre (sin pedido activo). 
 */
import { EstadoPedido } from './entities/pedido.entity';

export const TOTAL_MESAS = 8;

/**
 * Estado de la mesa que ve el mesero:
 *   LIBRE     -> sin pedido activo
 *   PENDIENTE -> tiene un pedido enviado a caja que aún no pasa a cocina
 *   OCUPADA   -> su pedido ya está en preparación, listo o entregado
 */
export type EstadoMesa = 'LIBRE' | 'PENDIENTE' | 'OCUPADA';

/** Estados de pedido que mantienen la mesa ocupada (todo menos pagado y anulado) */
export const ESTADOS_PEDIDO_ACTIVO: EstadoPedido[] = [
  EstadoPedido.PENDIENTE,
  EstadoPedido.EN_PREPARACION,
  EstadoPedido.LISTO,
  EstadoPedido.ENTREGADO,
];

export interface MesaResumen {
  numero: number;
  estado: EstadoMesa;
  /** Pedido activo de la mesa (null si está libre) */
  id_pedido: number | null;
  total: number;
}
