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

// ---------- HU-3.2 Adicionales, promociones, combos y notas ----------

/** PAN = paso 2 · ADEREZO = chips del paso 3 · EXTRA = checkbox "+$1.500" */
export type TipoAdicional = 'PAN' | 'ADEREZO' | 'EXTRA';
export type TipoPromocion = 'COMBO' | 'DESCUENTO';

/** Adicional del catálogo (GET /orders/opciones) */
export interface OpcionAdicional {
  id_adicional: number;
  nombre: string;
  tipo: TipoAdicional;
  descripcion: string | null;
  precio_adicional: number;
  id_categoria: number | null;
  id_insumo: number | null;
  insumo: string | null;
  cantidad_insumo: number;
  /** Unidades del insumo en stock (null = sin control de stock) */
  stock_disponible: number | null;
  disponible: boolean;
}

/** Promoción/combo VIGENTE (GET /orders/opciones) */
export interface OpcionPromocion {
  id_promocion: number;
  nombre: string;
  descripcion: string | null;
  tipo: TipoPromocion;
  precio_final: number | null;
  recargo: number;
  porcentaje_descuento: number;
  id_categoria: number | null;
  id_insumo: number | null;
  insumo: string | null;
  cantidad_insumo: number;
  stock_disponible: number | null;
  disponible: boolean;
  vigente_hasta: string;
}

export interface OpcionesPedido {
  adicionales: OpcionAdicional[];
  promociones: OpcionPromocion[];
}

/** Tabla pedido_item_adicional (adicionales guardados en una línea) */
export interface AdicionalDetalle {
  id_pedido_item_adicional?: number;
  id_adicional: number;
  cantidad: number;
  precio_unitario: number;
  nombre_adicional: string | null;
}

/** Resultado de POST /orders/cotizar */
export interface LineaCotizada {
  id_item: number;
  nombre: string;
  cantidad: number;
  precio_base: number;
  precio_unitario: number;
  subtotal: number;
  id_promocion: number | null;
  promocion_aplicada: string | null;
  notas_especiales: string | null;
  adicionales: { id_adicional: number; nombre: string; cantidad: number; precio_unitario: number }[];
  lineas_cocina: string[];
}
export interface ResultadoCotizacion {
  lineas: LineaCotizada[];
  total: number;
}

/** Cuerpo de error 400 STOCK_INSUFICIENTE / 422 PROMOCION_NO_VIGENTE */
export interface ErrorPedido {
  codigo?: 'STOCK_INSUFICIENTE' | 'PROMOCION_NO_VIGENTE';
  message?: string | string[];
  /** STOCK_INSUFICIENTE */
  id_item?: number;
  insumo?: string;
  adicionales?: string[];
  disponible?: number;
  requerido?: number;
  /** PROMOCION_NO_VIGENTE */
  id_promocion?: number;
  promocion?: string;
}

/** Tabla detalle_pedido */
export interface DetallePedido {
  id_detalle: number;
  id_pedido: number;
  id_item: number;
  cantidad: number;
  precio_unitario: number;
  notas_especiales: string | null;
  promocion_aplicada: string | null;
  id_comanda?: number | null;
  item?: ItemInventario;
  /** HU-3.2: adicionales elegidos para la línea */
  adicionales?: AdicionalDetalle[];
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
  mesero?: { nombre?: string; nombre_completo?: string };
  motivo_anulacion?: string | null;
  id_usuario_anulacion?: number | null;
  usuario_anulacion?: { nombre_completo?: string; credencial?: string };
  fecha_anulacion?: string | null;
}

/** Una línea al registrar o cotizar un pedido (HU-3.2: adicionales, promo y nota) */
export interface DetalleCrearPedido {
  id_item: number;
  cantidad: number;
  adicionales?: { id_adicional: number; cantidad?: number }[];
  id_promocion?: number;
  notas_especiales?: string;
}

/** Lo que se envía al registrar un pedido (POST /orders) */
export interface CrearPedido {
  numero_mesa?: number;
  detalles: DetalleCrearPedido[];
}

/** HU-3.3: Modificar pedido existente */
export interface ModificarDetallePedido {
  /** Línea con adicionales/combo: se edita esa línea (sus adicionales se conservan) */
  id_detalle?: number;
  id_item: number;
  /** Lista COMPLETA de adicionales (reemplaza la anterior). Si no se envía, se conservan */
  adicionales?: { id_adicional: number; cantidad?: number }[];
  /** Formato: id del combo/promoción, null = Individual. Si no se envía, se conserva */
  id_promocion?: number | null;
  cantidad: number;
  notas_especiales?: string;
  promocion_aplicada?: string;
}

export interface ModificarPedido {
  detalles: ModificarDetallePedido[];
}

/** HU-3.6: Anular pedido */
export interface AnularPedido {
  motivo: string;
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
      adicionales: (d.adicionales ?? []).map((a) => ({
        ...a,
        cantidad: Number(a.cantidad),
        precio_unitario: Number(a.precio_unitario),
      })),
    })),
  };
}