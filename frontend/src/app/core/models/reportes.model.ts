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
