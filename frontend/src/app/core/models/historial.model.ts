/**
 * Modelos: historial de pedidos y ventas
 * HU-5.2 · Historial con filtros (fecha, rango, producto)
 */
import { EstadoPedido } from './pedido.model';

/** Filtros que se envían como query params (fechas en formato AAAA-MM-DD) */
export interface FiltrosHistorial {
  fecha?: string;
  desde?: string;
  hasta?: string;
  id_item?: number;
  estado?: EstadoPedido;
}

export interface ProductoHistorial {
  id_item: number;
  nombre: string;
  cantidad: number;
}

export interface PedidoHistorial {
  id_pedido: number;
  fecha_hora: string;
  numero_mesa: number | null;
  estado_pedido: EstadoPedido;
  total_calculado: number;
  mesero: string | null;
  productos: ProductoHistorial[];
}

export interface ResultadoHistorial {
  filtros: {
    fecha: string | null;
    desde: string | null;
    hasta: string | null;
    producto: { id_item: number; nombre: string } | null;
    estado?: EstadoPedido | null;
  };
  /** ventas = pedidos pagados */
  resumen: { pedidos: number; ventas: number; total_vendido: number };
  pedidos: PedidoHistorial[];
}
