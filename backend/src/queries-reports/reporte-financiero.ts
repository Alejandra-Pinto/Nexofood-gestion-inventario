/**
 * HU-6.4 · Reporte financiero de ingresos y egresos (SCRUM-225 / SCRUM-226)
 * ------------------------------------------------------------------
 * Convierte las filas YA AGREGADAS en SQL (SUM / COUNT / GROUP BY) en la
 * respuesta del endpoint. Aquí solo se juntan los pocos grupos que devuelve
 * la base de datos (como máximo 2 orígenes × 5 medios de pago), no se recorren
 * los movimientos uno por uno.
 *
 * Decisiones de negocio aprobadas por el usuario en el Paso 0:
 *  1. Consumo interno = Σ cantidad × costo_fabricacion ACTUAL del ítem
 *     (estimado: si el costo cambia, los períodos pasados se revalorizan).
 *     Sin migración ni cambios en HU-2.4. Un ítem con costo 0 suma unidades,
 *     no suma pesos y se cuenta en `items_sin_costo`.
 *  2. El consumo interno NO resta del saldo neto: el dinero de esos productos
 *     ya salió como egreso al comprarlos; restarlo lo contaría dos veces.
 *  3. Egresos = solo movimientos_financieros EGRESO. Las compras de inventario
 *     (movimiento_inventario COMPRA) se muestran aparte, como dato informativo
 *     que NO suma, junto al egreso registrado en la categoría compra_proveedores.
 *  4. Medios de pago: los 5 por separado (siempre, aunque estén en 0) más los
 *     subtotales "Efectivo" y "No efectivo".
 *  5. La merma queda fuera del reporte.
 *  6. Un único endpoint: GET /queries-reports/financiero (pestaña Financiero).
 *  7. Excel = CSV UTF-8 con BOM y separador ';' generado en el frontend con
 *     los datos de este mismo endpoint (sin dependencias nuevas).
 */
import { CATEGORIAS_EGRESO } from '../finance/egresos';
import { MedioPago, OrigenMovimiento, TipoMovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';

/** Máximo de movimientos que se devuelven en el listado (los totales no se limitan) */
export const MAX_MOVIMIENTOS = 1000;

/** Orden fijo de los medios de pago en el desglose */
export const ORDEN_MEDIOS: string[] = [
  MedioPago.EFECTIVO,
  MedioPago.TRANSFERENCIA,
  MedioPago.NEQUI,
  MedioPago.DAVIPLATA,
  MedioPago.TARJETA,
];

/**
 * `SUM()` de una columna integer llega desde `pg` como bigint en string
 * ("30000"), y como NULL si no hay filas. Siempre devuelve un número finito.
 */
export function aNumero(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Filas crudas (como las devuelve getRawMany)
// ---------------------------------------------------------------------------
export interface FilaIngresoAgrupado {
  origen: string;
  medio_pago: string;
  total: string | number | null;
  cantidad: string | number | null;
}

export interface FilaEgresoAgrupado {
  categoria: string | null;
  total: string | number | null;
  cantidad: string | number | null;
}

export interface FilaConsumoInterno {
  id_item: string | number;
  nombre: string;
  costo_fabricacion: string | number | null;
  unidades: string | number | null;
  total_valorizado: string | number | null;
}

export interface FilaComprasInventario {
  total: string | number | null;
  cantidad: string | number | null;
}

export interface FilaMovimiento {
  id_movimiento: string | number;
  fecha_hora: Date | string;
  tipo_movimiento: string;
  origen: string;
  medio_pago: string;
  monto: string | number;
  concepto: string | null;
  categoria: string | null;
  id_pedido: string | number | null;
}

// ---------------------------------------------------------------------------
// Respuesta
// ---------------------------------------------------------------------------
export interface MedioPagoTotal {
  medio_pago: string;
  total: number;
  cantidad: number;
}

export interface MovimientoReporte {
  id_movimiento: number;
  fecha_hora: string;
  concepto: string;
  tipo: TipoMovimientoFinanciero | string;
  origen: OrigenMovimiento | string;
  medio_pago: string;
  monto: number;
}

export interface ReporteFinanciero {
  desde: string;
  hasta: string;
  /** true si no hubo ingresos, egresos ni consumo interno en el período */
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
  /** ingresos.total − egresos.total (puede ser negativo) */
  saldo_neto: number;
  consumo_interno: {
    total_valorizado: number;
    unidades: number;
    items_sin_costo: number;
    afecta_saldo: false;
    criterio: string;
    por_item: { id_item: number; nombre: string; unidades: number; costo_fabricacion: number; total_valorizado: number }[];
  };
  /** Informativo: NO suma a egresos ni al saldo (decisión 3) */
  compras_inventario: {
    total: number;
    cantidad: number;
    egresos_compra_proveedores: number;
    incluido_en_egresos: false;
  };
  movimientos: MovimientoReporte[];
  total_movimientos: number;
  movimientos_truncados: boolean;
}

/** Concepto visible de un movimiento: las ventas no tienen concepto en la tabla */
export function conceptoMovimiento(f: Pick<FilaMovimiento, 'origen' | 'id_pedido' | 'concepto' | 'categoria'>): string {
  if (f.origen === OrigenMovimiento.VENTA) {
    return f.id_pedido !== null && f.id_pedido !== undefined ? `Venta pedido #${f.id_pedido}` : 'Venta';
  }
  return f.concepto?.trim() || f.categoria || 'Movimiento manual';
}

export function construirReporteFinanciero(
  desde: string,
  hasta: string,
  datos: {
    ingresos: FilaIngresoAgrupado[];
    egresos: FilaEgresoAgrupado[];
    consumo: FilaConsumoInterno[];
    compras: FilaComprasInventario | undefined;
    movimientos: FilaMovimiento[];
  },
): ReporteFinanciero {
  // --- Ingresos (SCRUM-225) y desglose por medio de pago (SCRUM-226) ---
  const porMedio = new Map<string, MedioPagoTotal>(ORDEN_MEDIOS.map((m) => [m, { medio_pago: m, total: 0, cantidad: 0 }]));
  let ventas = 0;
  let manuales = 0;
  for (const f of datos.ingresos) {
    const total = aNumero(f.total);
    const cantidad = aNumero(f.cantidad);
    if (f.origen === OrigenMovimiento.VENTA) ventas += total;
    else manuales += total;
    // Un medio desconocido también se muestra, para que la suma del desglose cuadre siempre
    const m = porMedio.get(f.medio_pago) ?? { medio_pago: f.medio_pago, total: 0, cantidad: 0 };
    m.total += total;
    m.cantidad += cantidad;
    porMedio.set(f.medio_pago, m);
  }
  const por_medio_pago = [...porMedio.values()];
  const totalIngresos = ventas + manuales;
  const efectivo = porMedio.get(MedioPago.EFECTIVO)?.total ?? 0;
  const cantidadIngresos = por_medio_pago.reduce((s, m) => s + m.cantidad, 0);

  // --- Egresos ---
  const por_categoria = datos.egresos
    .map((f) => {
      const categoria = f.categoria ?? 'sin_categoria';
      return {
        categoria,
        etiqueta: (CATEGORIAS_EGRESO as Record<string, string>)[categoria] ?? 'Sin categoría',
        total: aNumero(f.total),
        cantidad: aNumero(f.cantidad),
      };
    })
    .sort((a, b) => b.total - a.total);
  const totalEgresos = por_categoria.reduce((s, c) => s + c.total, 0);
  const cantidadEgresos = por_categoria.reduce((s, c) => s + c.cantidad, 0);

  // --- Consumo interno (decisión 1: costo actual; decisión 2: no afecta el saldo) ---
  const por_item = datos.consumo
    .map((f) => ({
      id_item: aNumero(f.id_item),
      nombre: f.nombre,
      unidades: aNumero(f.unidades),
      costo_fabricacion: aNumero(f.costo_fabricacion),
      total_valorizado: aNumero(f.total_valorizado),
    }))
    .sort((a, b) => b.total_valorizado - a.total_valorizado || b.unidades - a.unidades);

  const movimientos = datos.movimientos.slice(0, MAX_MOVIMIENTOS).map<MovimientoReporte>((f) => ({
    id_movimiento: aNumero(f.id_movimiento),
    fecha_hora: new Date(f.fecha_hora).toISOString(),
    concepto: conceptoMovimiento(f),
    tipo: f.tipo_movimiento,
    origen: f.origen,
    medio_pago: f.medio_pago,
    monto: aNumero(f.monto),
  }));

  const unidadesConsumo = por_item.reduce((s, i) => s + i.unidades, 0);

  return {
    desde,
    hasta,
    sin_movimientos: cantidadIngresos === 0 && cantidadEgresos === 0 && unidadesConsumo === 0,
    ingresos: {
      total: totalIngresos,
      cantidad: cantidadIngresos,
      ventas,
      manuales,
      por_medio_pago,
      efectivo,
      no_efectivo: totalIngresos - efectivo,
    },
    egresos: { total: totalEgresos, cantidad: cantidadEgresos, por_categoria },
    saldo_neto: totalIngresos - totalEgresos,
    consumo_interno: {
      total_valorizado: por_item.reduce((s, i) => s + i.total_valorizado, 0),
      unidades: unidadesConsumo,
      items_sin_costo: por_item.filter((i) => i.costo_fabricacion === 0).length,
      afecta_saldo: false,
      criterio: 'Cantidad consumida × costo de fabricación actual del ítem (estimado)',
      por_item,
    },
    compras_inventario: {
      total: aNumero(datos.compras?.total),
      cantidad: aNumero(datos.compras?.cantidad),
      egresos_compra_proveedores: por_categoria.find((c) => c.categoria === 'compra_proveedores')?.total ?? 0,
      incluido_en_egresos: false,
    },
    movimientos,
    total_movimientos: cantidadIngresos + cantidadEgresos,
    movimientos_truncados: cantidadIngresos + cantidadEgresos > movimientos.length,
  };
}
