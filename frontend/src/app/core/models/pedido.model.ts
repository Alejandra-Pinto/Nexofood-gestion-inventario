/**
 * Modelos de Pedidos (módulo Orders del backend)
 * HU-3.1 Registrar nuevo pedido
 */
import { ItemInventario } from './item-inventario.model';

export type EstadoPedido =
  | 'PENDIENTE'
  | 'EN_PREPARACION'
  | 'LISTO'
  | 'ENTREGADO'
  | 'PAGADO'
  | 'ANULADO';

/** Texto que se muestra para cada estado */
export const ETIQUETA_ESTADO: Record<EstadoPedido, string> = {
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  ENTREGADO: 'Entregado',
  PAGADO: 'Pagado',
  ANULADO: 'Anulado',
};

/** Tabla detalle_pedido */
export interface DetallePedido {
  id_detalle: number;
  id_pedido: number;
  id_item: number;
  cantidad: number;
  precio_unitario: number;
  notas_especiales: string | null;
  promocion_aplicada: string | null;
  item?: ItemInventario;
}

/** Tabla pedido */
export interface Pedido {
  id_pedido: number;
  id_mesero: number;
  fecha_hora: string;
  estado_pedido: EstadoPedido;
  total_calculado: number;
  detalles: DetallePedido[];
}

/** Lo que se envía al registrar un pedido (POST /orders) */
export interface CrearPedido {
  detalles: { id_item: number; cantidad: number }[];
}

/** Cantidad máxima por producto (igual que en el backend) */
export const CANTIDAD_MAXIMA = 99;

/** El backend (PostgreSQL) puede devolver números como texto: se convierten */
export function normalizarPedido(p: Pedido): Pedido {
  return {
    ...p,
    total_calculado: Number(p.total_calculado),
    detalles: (p.detalles ?? []).map((d) => ({
      ...d,
      cantidad: Number(d.cantidad),
      precio_unitario: Number(d.precio_unitario),
    })),
  };
}
