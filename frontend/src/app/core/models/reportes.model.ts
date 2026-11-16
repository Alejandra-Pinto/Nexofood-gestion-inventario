/** Modelos de los reportes - Resumen de operaciones por período · Reporte general de ventas */

export interface DiaResumen {
  fecha: string;
  pedidos: number;
  ventas: number;
  total_vendido: number;
  anulados: number;
}

/** Respuesta de GET /queries-reports/resumen */
export interface ResumenPeriodo {
  desde: string;
  hasta: string;
  sin_operaciones: boolean;
  pedidos: { total: number; en_curso: number };
  ventas: { cantidad: number; total: number; ticket_promedio: number };
  anulados: { cantidad: number; total: number };
  otros_ingresos: { cantidad: number; total: number };
  por_dia: DiaResumen[];
}

/** Una venta finalizada (pedido PAGADO) del reporte de ventas */
export interface VentaReporte {
  id_pedido: number;
  fecha_hora: string;
  numero_mesa: number | null;
  mesero: string | null;
  medio_pago: string;
  total: number;
}

/** Respuesta de GET /queries-reports/ventas (HU-6.2) */
export interface ReporteVentas {
  desde: string;
  hasta: string;
  sin_ventas: boolean;
  resumen: { ventas: number; total_vendido: number; ticket_promedio: number };
  por_medio_pago: { medio_pago: string; ventas: number; total: number }[];
  ventas: VentaReporte[];
}

export const MSJ_SIN_VENTAS = 'No hay ventas finalizadas en el período seleccionado.';
export const MSJ_SIN_PRODUCTOS_VENDIDOS = 'No se registraron productos vendidos en el período seleccionado.';

/** Fila del ranking de productos más vendidos (HU-6.3) */
export interface ProductoRanking {
  posicion: number;
  id_item: number;
  nombre: string;
  unidades_vendidas: number;
  total_recaudado: number;
}

/** Respuesta de GET /queries-reports/productos-mas-vendidos (HU-6.3) */
export interface ReporteProductosMasVendidos {
  desde: string;
  hasta: string;
  sin_ventas: boolean;
  total_unidades: number;
  total_recaudado: number;
  productos: ProductoRanking[];
}

/** Texto de cada medio de pago */
export const TEXTO_MEDIO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  NEQUI: 'Nequi',
  DAVIPLATA: 'Daviplata',
  TARJETA: 'Tarjeta',
  SIN_REGISTRO: 'Sin registro',
};

/** Período rápido del selector (como "Este mes" en el prototipo de Reportes) */
export type PeriodoRapido = 'hoy' | 'semana' | 'mes' | 'personalizado';

export const MSJ_SIN_OPERACIONES = 'No se registraron operaciones en el período seleccionado.';

// ---------------------------------------------------------------------------
// HU-6.4 · Reporte financiero de ingresos y egresos
// ---------------------------------------------------------------------------
export interface MedioPagoTotal {
  medio_pago: string;
  total: number;
  cantidad: number;
}

/** Movimiento del listado consolidado (Prototipo 16) */
export interface MovimientoFinancieroReporte {
  id_movimiento: number;
  fecha_hora: string;
  concepto: string;
  tipo: 'INGRESO' | 'EGRESO' | string;
  origen: 'VENTA' | 'MANUAL' | string;
  medio_pago: string;
  monto: number;
}

/** Respuesta de GET /queries-reports/financiero (HU-6.4). Todos los totales vienen calculados del backend. */
export interface ReporteFinanciero {
  desde: string;
  hasta: string;
  sin_movimientos: boolean;
  ingresos: {
    total: number;
    cantidad: number;
    ventas: number;
    manuales: number;
    por_medio_pago: MedioPagoTotal[];
    efectivo: number;
    no_efectivo: number;
  };
  egresos: {
    total: number;
    cantidad: number;
    por_categoria: { categoria: string; etiqueta: string; total: number; cantidad: number }[];
  };
  saldo_neto: number;
  consumo_interno: {
    total_valorizado: number;
    unidades: number;
    items_sin_costo: number;
    afecta_saldo: false;
    criterio: string;
    por_item: { id_item: number; nombre: string; unidades: number; costo_fabricacion: number; total_valorizado: number }[];
  };
  compras_inventario: {
    total: number;
    cantidad: number;
    egresos_compra_proveedores: number;
    incluido_en_egresos: false;
  };
  movimientos: MovimientoFinancieroReporte[];
  total_movimientos: number;
  movimientos_truncados: boolean;
}

export const MSJ_SIN_MOVIMIENTOS_FINANCIEROS = 'No se registraron ingresos, egresos ni consumo interno en el período seleccionado.';

/** Pesos colombianos sin decimales, con signo si es negativo: -$40.000 (nunca valor absoluto) */
export function formatoCop(valor: number): string {
  const abs = Math.round(Math.abs(valor)).toLocaleString('es-CO');
  return `${valor < 0 ? '-' : ''}$${abs}`;
}

/** AAAA-MM-DD de una fecha en la hora de Colombia */
export function fechaColombia(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
}

/** Calcula desde/hasta de un período rápido (la semana empieza el lunes) */
export function rangoDe(periodo: Exclude<PeriodoRapido, 'personalizado'>, hoy = fechaColombia()): { desde: string; hasta: string } {
  if (periodo === 'hoy') return { desde: hoy, hasta: hoy };
  if (periodo === 'mes') return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
  const [a, m, d] = hoy.split('-').map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  const diaSemana = (fecha.getUTCDay() + 6) % 7; // Lunes = 0
  fecha.setUTCDate(fecha.getUTCDate() - diaSemana);
  return { desde: fecha.toISOString().slice(0, 10), hasta: hoy };
}
