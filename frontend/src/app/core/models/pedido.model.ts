/**
 * Modelos de Pedidos (módulo Orders del backend)
 * HU-3.1, HU-3.4, HU-3.5, HU-4.1
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
  numero_mesa: number | null;
  fecha_hora: string;
  estado_pedido: EstadoPedido;
  total_calculado: number;
  detalles: DetallePedido[];
  mesero?: { nombre: string }; // Agregado para nuestro ticket
}

/** Lo que se envía al registrar un pedido (POST /orders) */
export interface CrearPedido {
  numero_mesa?: number;
  detalles: { id_item: number; cantidad: number }[];
}

// ---------- Mesas (prototipo "Mis mesas") ----------
export type EstadoMesa = 'LIBRE' | 'PENDIENTE' | 'OCUPADA';
export interface MesaResumen {
  numero: number;
  estado: EstadoMesa;
  id_pedido: number | null;
  total: number;
}
export const ETIQUETA_MESA: Record<EstadoMesa, string> = {
  LIBRE: 'Libre', PENDIENTE: 'Pendiente', OCUPADA: 'Ocupada',
};
export const CANTIDAD_MAXIMA = 99;

// ---------- HU-3.5 Método de pago ----------
export type MedioPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'TARJETA';
export const MEDIOS_PAGO: { valor: MedioPago; texto: string }[] = [
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
  { valor: 'NEQUI', texto: 'Nequi' },
  { valor: 'DAVIPLATA', texto: 'Daviplata' },
  { valor: 'TARJETA', texto: 'Tarjeta' },
];
export interface RegistrarPago {
  medio_pago: MedioPago;
  monto_recibido?: number;
}
export interface ResultadoPago {
  pedido: Pedido;
  movimiento: { id_movimiento: number; monto: number; medio_pago: MedioPago; fecha_hora: string };
  cambio: number;
}

/** El backend puede devolver números como texto: se convierten */
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