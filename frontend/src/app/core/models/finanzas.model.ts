/** Modelos del módulo Financiero - Registrar ingresos no provenientes de ventas */
import { MedioPago } from './pedido.model';

/** Categorías de ingreso (iguales a CATEGORIAS_INGRESO del backend) */
export type CategoriaIngreso = 'APORTE_SOCIOS' | 'BASE_CAJA' | 'PRESTAMO' | 'DEVOLUCION_PROVEEDOR' | 'OTRO';

export const CATEGORIAS_INGRESO: { valor: CategoriaIngreso; texto: string }[] = [
  { valor: 'APORTE_SOCIOS', texto: 'Aporte de socios' },
  { valor: 'BASE_CAJA', texto: 'Base de caja' },
  { valor: 'PRESTAMO', texto: 'Préstamo' },
  { valor: 'DEVOLUCION_PROVEEDOR', texto: 'Devolución de proveedor' },
  { valor: 'OTRO', texto: 'Otro ingreso' },
];

/** Monto máximo de un ingreso (igual que en el backend) */
export const MONTO_MAXIMO = 100_000_000;

/** Lo que se envía en POST /finance/ingresos */
export interface CrearIngreso {
  concepto: string;
  categoria: CategoriaIngreso;
  monto: number;
  medio_pago: MedioPago;
  fecha?: string;
  observaciones?: string;
}

/** Un ingreso registrado */
export interface IngresoFinanciero {
  id_movimiento: number;
  fecha_hora: string;
  concepto: string;
  categoria: CategoriaIngreso;
  monto: number;
  medio_pago: MedioPago;
  observaciones: string | null;
  registrado_por: string | null;
}

/** Respuesta de GET /finance/ingresos */
export interface ListaIngresos {
  desde: string;
  hasta: string;
  total: number;
  ingresos: IngresoFinanciero[];
}

// ---------- HU-7.3 Historial de ingresos y egresos ----------
export type TipoMovimiento = 'INGRESO' | 'EGRESO';

/** Un movimiento del historial: cobro de pedido, ingreso manual o egreso */
export interface MovimientoHistorial {
  id_movimiento: number;
  fecha_hora: string;
  tipo_movimiento: TipoMovimiento;
  origen: 'VENTA' | 'MANUAL';
  concepto: string;
  monto: number;
  medio_pago: MedioPago;
  id_pedido: number | null;
  registrado_por: string | null;
}

export interface TotalesFinancieros {
  ingresos: number;
  egresos: number;
  /** Ingresos - Egresos */
  saldo: number;
}

/** Respuesta de GET /finance/movimientos */
export interface HistorialFinanciero {
  resumen: TotalesFinancieros;
  por_medio: (TotalesFinancieros & { medio_pago: MedioPago })[];
  movimientos: MovimientoHistorial[];
}

/** Mensaje de error del monto escrito en el formulario, o null si es válido. */
export function errorMonto(texto: string): string | null {
  const t = texto.trim();
  if (!t) return 'El monto es obligatorio.';
  const n = Number(t);
  if (Number.isNaN(n)) return 'El monto debe ser un número.';
  if (!Number.isInteger(n)) return 'El monto debe ser un valor entero en pesos (sin decimales).';
  if (n <= 0) return 'Debe ser mayor a cero.';
  if (n > MONTO_MAXIMO) return 'El monto supera el máximo permitido ($100.000.000).';
  return null;
}

/** Fecha de hoy en Colombia (AAAA-MM-DD) */
export function hoyColombia(ahora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
}
