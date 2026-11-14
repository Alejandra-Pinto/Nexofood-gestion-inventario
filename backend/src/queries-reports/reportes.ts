/** Cálculos de los reportes - Calcular cantidad de pedidos, ventas acumuladas y anulados */
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

// Resumen de operaciones por período

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

// Reporte general de ventas

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

// Reporte de productos más vendidos (HU-6.3)

export interface FilaProductoVendido {
  id_item: number | string;
  nombre: string;
  unidades_vendidas: number | string;
  total_recaudado: number | string;
}

export interface ProductoRanking {
  posicion: number;
  id_item: number;
  nombre: string;
  unidades_vendidas: number;
  total_recaudado: number;
}

export interface ReporteProductosMasVendidos {
  desde: string;
  hasta: string;
  sin_ventas: boolean;
  total_unidades: number;
  total_recaudado: number;
  productos: ProductoRanking[];
}

/** SCRUM-222: construye el ranking ordenado por unidades vendidas DESC, total recaudado DESC, nombre ASC */
export function construirReporteProductosMasVendidos(
  desde: string,
  hasta: string,
  filas: FilaProductoVendido[],
): ReporteProductosMasVendidos {
  const items = filas.map((f) => ({
    id_item: Number(f.id_item),
    nombre: f.nombre || 'Sin nombre',
    unidades_vendidas: Math.round(Number(f.unidades_vendidas) || 0),
    total_recaudado: Math.round(Number(f.total_recaudado) || 0),
  }));

  // Ordenamiento con reglas de desempate acordadas:
  // 1º Unidades vendidas (DESC)
  // 2º Total recaudado (DESC)
  // 3º Nombre del producto (ASC)
  items.sort((a, b) => {
    if (b.unidades_vendidas !== a.unidades_vendidas) {
      return b.unidades_vendidas - a.unidades_vendidas;
    }
    if (b.total_recaudado !== a.total_recaudado) {
      return b.total_recaudado - a.total_recaudado;
    }
    return a.nombre.localeCompare(b.nombre, 'es');
  });

  const productos: ProductoRanking[] = items.map((item, index) => ({
    posicion: index + 1,
    id_item: item.id_item,
    nombre: item.nombre,
    unidades_vendidas: item.unidades_vendidas,
    total_recaudado: item.total_recaudado,
  }));

  const totalUnidades = productos.reduce((acc, p) => acc + p.unidades_vendidas, 0);
  const totalRecaudado = productos.reduce((acc, p) => acc + p.total_recaudado, 0);

  return {
    desde,
    hasta,
    sin_ventas: productos.length === 0,
    total_unidades: totalUnidades,
    total_recaudado: totalRecaudado,
    productos,
  };
}
