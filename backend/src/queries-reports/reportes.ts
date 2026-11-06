/**
 * Cálculos de los reportes (funciones puras, sin base de datos)
 * ------------------------------------------------------------------
 * HU-6.7 · SCRUM-237 Calcular cantidad de pedidos, ventas acumuladas y anulados
 *        · SCRUM-238 Manejar período sin operaciones
 * HU-6.2 · SCRUM-219 Consulta de ventas finalizadas
 *
 * Reglas:
 *   - Venta     = pedido en estado PAGADO.
 *   - Anulado   = pedido en estado ANULADO.
 *   - En curso  = cualquier otro estado (pendiente, en preparación, listo, entregado).
 *   - Los ingresos manuales (HU-7.2) se muestran aparte y NUNCA se suman a las ventas.
 * Las fechas se cuentan en la hora de Colombia.
 */
import { BadRequestException } from '@nestjs/common';

export const ZONA_HORARIA = 'America/Bogota';
/** Rango máximo de un reporte (un año) */
export const MAX_DIAS_PERIODO = 366;

/** Fecha AAAA-MM-DD de un instante, en la hora de Colombia */
export function diaColombia(fecha: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(new Date(fecha));
}

function fechaInexistente(valor: string): boolean {
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d;
}

/** Valida el período del reporte; lanza 400 con un mensaje claro si no sirve */
export function validarPeriodo(desde?: string, hasta?: string): { desde: string; hasta: string } {
  if (!desde || !hasta) throw new BadRequestException('Indique la fecha inicial y la fecha final del período');
  for (const [valor, nombre] of [[desde, 'La fecha inicial'], [hasta, 'La fecha final']]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || fechaInexistente(valor)) {
      throw new BadRequestException(`${nombre} no es válida`);
    }
  }
  if (desde > hasta) throw new BadRequestException('La fecha inicial no puede ser posterior a la fecha final');
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000 + 1;
  if (dias > MAX_DIAS_PERIODO) throw new BadRequestException('El período no puede ser mayor a un año');
  return { desde, hasta };
}

/** Todos los días del período (para mostrar también los días en cero) */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let t = Date.parse(desde); t <= Date.parse(hasta); t += 86_400_000) {
    dias.push(new Date(t).toISOString().slice(0, 10));
  }
  return dias;
}

// ---------------------------------------------------------------------------
// HU-6.7 Resumen de operaciones por período
// ---------------------------------------------------------------------------

export interface PedidoResumen {
  fecha_hora: Date | string;
  estado_pedido: string;
  total_calculado: number | string;
}

export interface DiaResumen {
  fecha: string;
  pedidos: number;
  ventas: number;
  total_vendido: number;
  anulados: number;
}

export interface ResumenPeriodo {
  desde: string;
  hasta: string;
  /** SCRUM-238: true si en el período no hubo pedidos ni ingresos */
  sin_operaciones: boolean;
  pedidos: { total: number; en_curso: number };
  ventas: { cantidad: number; total: number; ticket_promedio: number };
  anulados: { cantidad: number; total: number };
  /** HU-7.2: ingresos que no son ventas (informativo, no suma a ventas) */
  otros_ingresos: { cantidad: number; total: number };
  por_dia: DiaResumen[];
}

/** SCRUM-237: arma el resumen a partir de los pedidos e ingresos manuales del período */
export function calcularResumen(
  desde: string,
  hasta: string,
  pedidos: PedidoResumen[],
  ingresosManuales: { monto: number | string }[] = [],
): ResumenPeriodo {
  const porDia = new Map<string, DiaResumen>(
    diasDelPeriodo(desde, hasta).map((f) => [f, { fecha: f, pedidos: 0, ventas: 0, total_vendido: 0, anulados: 0 }]),
  );

  let ventas = 0, totalVentas = 0, anulados = 0, totalAnulados = 0;
  for (const p of pedidos) {
    const estado = String(p.estado_pedido).toUpperCase();
    const total = Number(p.total_calculado) || 0;
    const dia = porDia.get(diaColombia(p.fecha_hora));
    if (dia) dia.pedidos++;
    if (estado === 'PAGADO') {
      ventas++;
      totalVentas += total;
      if (dia) { dia.ventas++; dia.total_vendido += total; }
    } else if (estado === 'ANULADO') {
      anulados++;
      totalAnulados += total;
      if (dia) dia.anulados++;
    }
  }

  const totalIngresos = ingresosManuales.reduce((s, i) => s + (Number(i.monto) || 0), 0);
  return {
    desde,
    hasta,
    sin_operaciones: pedidos.length === 0 && ingresosManuales.length === 0,
    pedidos: { total: pedidos.length, en_curso: pedidos.length - ventas - anulados },
    ventas: { cantidad: ventas, total: totalVentas, ticket_promedio: ventas ? Math.round(totalVentas / ventas) : 0 },
    anulados: { cantidad: anulados, total: totalAnulados },
    otros_ingresos: { cantidad: ingresosManuales.length, total: totalIngresos },
    por_dia: [...porDia.values()],
  };
}

// ---------------------------------------------------------------------------
// HU-6.2 Reporte general de ventas
// ---------------------------------------------------------------------------

/** Fila tal como sale de la consulta (getRawMany: los números llegan como texto) */
export interface FilaVenta {
  id_pedido: number | string;
  fecha_venta: Date | string;
  numero_mesa: number | string | null;
  mesero: string | null;
  medio_pago: string | null;
  total: number | string;
}

export interface VentaReporte {
  id_pedido: number;
  fecha_hora: string;
  numero_mesa: number | null;
  mesero: string | null;
  medio_pago: string;
  total: number;
}

export interface ReporteVentas {
  desde: string;
  hasta: string;
  sin_ventas: boolean;
  resumen: { ventas: number; total_vendido: number; ticket_promedio: number };
  por_medio_pago: { medio_pago: string; ventas: number; total: number }[];
  ventas: VentaReporte[];
}

/** SCRUM-219: convierte las filas en el reporte (totales y agrupación por medio de pago) */
export function construirReporteVentas(desde: string, hasta: string, filas: FilaVenta[]): ReporteVentas {
  const ventas = filas.map<VentaReporte>((f) => ({
    id_pedido: Number(f.id_pedido),
    fecha_hora: new Date(f.fecha_venta).toISOString(),
    numero_mesa: f.numero_mesa === null || f.numero_mesa === undefined ? null : Number(f.numero_mesa),
    mesero: f.mesero ?? null,
    medio_pago: f.medio_pago ?? 'SIN_REGISTRO',
    total: Number(f.total) || 0,
  }));

  const porMedio = new Map<string, { medio_pago: string; ventas: number; total: number }>();
  for (const v of ventas) {
    const m = porMedio.get(v.medio_pago) ?? { medio_pago: v.medio_pago, ventas: 0, total: 0 };
    m.ventas++;
    m.total += v.total;
    porMedio.set(v.medio_pago, m);
  }

  const total = ventas.reduce((s, v) => s + v.total, 0);
  return {
    desde,
    hasta,
    sin_ventas: ventas.length === 0,
    resumen: { ventas: ventas.length, total_vendido: total, ticket_promedio: ventas.length ? Math.round(total / ventas.length) : 0 },
    por_medio_pago: [...porMedio.values()].sort((a, b) => b.total - a.total),
    ventas,
  };
}
