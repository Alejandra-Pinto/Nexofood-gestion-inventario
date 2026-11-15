/** Servicio: ReportesService - Resumen de operaciones por período */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from '../orders/entities/pedido.entity';
import {
  MovimientoFinanciero,
  OrigenMovimiento,
  TipoMovimientoFinanciero,
} from '../finance/entities/movimiento-financiero.entity';
import { MovimientoInventario, MotivoMovimiento, TipoMovimiento } from '../inventory/entities/movimiento-inventario.entity';
import { hoyColombia } from '../finance/ingresos';
import {
  construirReporteFinanciero,
  FilaComprasInventario,
  FilaConsumoInterno,
  FilaEgresoAgrupado,
  FilaIngresoAgrupado,
  FilaMovimiento,
  MAX_MOVIMIENTOS,
  ReporteFinanciero,
} from './reporte-financiero';
import {
  calcularResumen,
  construirReporteProductosMasVendidos,
  construirReporteVentas,
  FilaProductoVendido,
  FilaVenta,
  ReporteProductosMasVendidos,
  ReporteVentas,
  ResumenPeriodo,
  validarPeriodo,
  ZONA_HORARIA,
} from './reportes';

/** Día de un timestamp en la hora de Colombia (para filtrar por fecha) */
const dia = (col: string) => `(${col} AT TIME ZONE '${ZONA_HORARIA}')::date`;

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
    @InjectRepository(MovimientoFinanciero)
    private readonly movimientosRepo: Repository<MovimientoFinanciero>,
  ) {}

  /** GET /queries-reports/resumen?desde=&hasta= (HU-6.7) */
  async resumen(desdeTxt?: string, hastaTxt?: string): Promise<ResumenPeriodo> {
    const { desde, hasta } = validarPeriodo(desdeTxt, hastaTxt);

    const pedidos = await this.pedidosRepo
      .createQueryBuilder('p')
      .select(['p.id_pedido', 'p.fecha_hora', 'p.estado_pedido', 'p.total_calculado'])
      .where(`${dia('p.fecha_hora')} BETWEEN :desde AND :hasta`, { desde, hasta })
      .getMany();

    const ingresos = await this.movimientosRepo
      .createQueryBuilder('m')
      .select(['m.id_movimiento', 'm.monto'])
      .where('m.origen = :origen', { origen: OrigenMovimiento.MANUAL })
      .andWhere('m.tipo_movimiento = :tipo', { tipo: TipoMovimientoFinanciero.INGRESO })
      .andWhere(`${dia('m.fecha_hora')} BETWEEN :desde AND :hasta`, { desde, hasta })
      .getMany();

    return calcularResumen(desde, hasta, pedidos, ingresos);
  }

  /** GET /queries-reports/ventas?desde=&hasta= */
  async ventas(desdeTxt?: string, hastaTxt?: string): Promise<ReporteVentas> {
    const { desde, hasta } = validarPeriodo(desdeTxt, hastaTxt);
    const fechaVenta = 'COALESCE(mf.fecha_hora, p.fecha_hora)';

    const filas = await this.pedidosRepo
      .createQueryBuilder('p')
      .leftJoin('p.mesero', 'u')
      .leftJoin(MovimientoFinanciero, 'mf', 'mf.id_pedido = p.id_pedido AND mf.tipo_movimiento = :ingreso', {
        ingreso: TipoMovimientoFinanciero.INGRESO,
      })
      .select('p.id_pedido', 'id_pedido')
      .addSelect(fechaVenta, 'fecha_venta')
      .addSelect('p.numero_mesa', 'numero_mesa')
      .addSelect('u.nombre_completo', 'mesero')
      .addSelect('mf.medio_pago', 'medio_pago')
      .addSelect('p.total_calculado', 'total')
      .where('UPPER(p.estado_pedido) = :pagado', { pagado: 'PAGADO' })
      .andWhere(`${dia(fechaVenta)} BETWEEN :desde AND :hasta`, { desde, hasta })
      .orderBy(fechaVenta, 'DESC')
      .addOrderBy('p.id_pedido', 'DESC')
      .getRawMany<FilaVenta>();

    return construirReporteVentas(desde, hasta, filas);
  }

  /** GET /queries-reports/productos-mas-vendidos?desde=&hasta= (HU-6.3) */
  async productosMasVendidos(desdeTxt?: string, hastaTxt?: string): Promise<ReporteProductosMasVendidos> {
    const { desde, hasta } = validarPeriodo(desdeTxt, hastaTxt);
    const fechaVenta = 'COALESCE(mf.fecha_hora, p.fecha_hora)';

    const filas = await this.pedidosRepo
      .createQueryBuilder('p')
      .innerJoin('p.detalles', 'd')
      .innerJoin('d.item', 'item')
      .leftJoin(MovimientoFinanciero, 'mf', 'mf.id_pedido = p.id_pedido AND mf.tipo_movimiento = :ingreso', {
        ingreso: TipoMovimientoFinanciero.INGRESO,
      })
      .select('d.id_item', 'id_item')
      .addSelect('item.nombre', 'nombre')
      .addSelect('SUM(d.cantidad)', 'unidades_vendidas')
      .addSelect('SUM(d.cantidad * d.precio_unitario)', 'total_recaudado')
      .where('UPPER(p.estado_pedido) = :pagado', { pagado: 'PAGADO' })
      .andWhere(`${dia(fechaVenta)} BETWEEN :desde AND :hasta`, { desde, hasta })
      .groupBy('d.id_item')
      .addGroupBy('item.nombre')
      .orderBy('SUM(d.cantidad)', 'DESC')
      .addOrderBy('SUM(d.cantidad * d.precio_unitario)', 'DESC')
      .addOrderBy('item.nombre', 'ASC')
      .getRawMany<FilaProductoVendido>();

    return construirReporteProductosMasVendidos(desde, hasta, filas);
  }

  /**
   * GET /queries-reports/financiero?desde=&hasta= (HU-6.4 · SCRUM-225 / SCRUM-226)
   * Sin fechas: mes en curso (del día 1 a hoy, hora Colombia).
   * Consultas propias: NO reutiliza FinanceService.listarIngresos/listarEgresos,
   * que filtran origen = MANUAL y dejarían fuera las ventas.
   * Las decisiones de negocio están documentadas en ./reporte-financiero.ts.
   */
  async financiero(desdeTxt?: string, hastaTxt?: string): Promise<ReporteFinanciero> {
    let d = desdeTxt;
    let h = hastaTxt;
    if (!d && !h) {
      h = hoyColombia();
      d = `${h.slice(0, 8)}01`;
    }
    const { desde, hasta } = validarPeriodo(d, h);
    const rango = { desde, hasta };
    const tipoIngreso = { tipo: TipoMovimientoFinanciero.INGRESO };
    const tipoEgreso = { tipo: TipoMovimientoFinanciero.EGRESO };
    const inventario = this.movimientosRepo.manager.getRepository(MovimientoInventario);

    // Ingresos (ventas + manuales) agrupados por origen y medio de pago
    const ingresos = this.movimientosRepo
      .createQueryBuilder('m')
      .select('m.origen', 'origen')
      .addSelect('m.medio_pago', 'medio_pago')
      .addSelect('SUM(m.monto)', 'total')
      .addSelect('COUNT(*)', 'cantidad')
      .where('m.tipo_movimiento = :tipo', tipoIngreso)
      .andWhere(`${dia('m.fecha_hora')} BETWEEN :desde AND :hasta`, rango)
      .groupBy('m.origen')
      .addGroupBy('m.medio_pago')
      .getRawMany<FilaIngresoAgrupado>();

    // Egresos agrupados por categoría
    const egresos = this.movimientosRepo
      .createQueryBuilder('m')
      .select('m.categoria', 'categoria')
      .addSelect('SUM(m.monto)', 'total')
      .addSelect('COUNT(*)', 'cantidad')
      .where('m.tipo_movimiento = :tipo', tipoEgreso)
      .andWhere(`${dia('m.fecha_hora')} BETWEEN :desde AND :hasta`, rango)
      .groupBy('m.categoria')
      .getRawMany<FilaEgresoAgrupado>();

    // Consumo interno valorizado a costo de fabricación actual (bigint para no desbordar integer)
    const consumo = inventario
      .createQueryBuilder('mi')
      .innerJoin('mi.item', 'item')
      .select('mi.id_item', 'id_item')
      .addSelect('item.nombre', 'nombre')
      .addSelect('item.costo_fabricacion', 'costo_fabricacion')
      .addSelect('SUM(mi.cantidad)', 'unidades')
      .addSelect('SUM(mi.cantidad::bigint * item.costo_fabricacion)', 'total_valorizado')
      .where('mi.tipo_movimiento = :salida', { salida: TipoMovimiento.SALIDA })
      .andWhere('mi.motivo = :motivo', { motivo: MotivoMovimiento.CONSUMO_INTERNO })
      .andWhere(`${dia('mi.fecha_hora')} BETWEEN :desde AND :hasta`, rango)
      .groupBy('mi.id_item')
      .addGroupBy('item.nombre')
      .addGroupBy('item.costo_fabricacion')
      .getRawMany<FilaConsumoInterno>();

    // Compras de inventario: solo informativo, no suma a egresos
    const compras = inventario
      .createQueryBuilder('mi')
      .select('SUM(mi.total)', 'total')
      .addSelect('COUNT(*)', 'cantidad')
      .where('mi.tipo_movimiento = :entrada', { entrada: TipoMovimiento.ENTRADA })
      .andWhere('mi.motivo = :motivo', { motivo: MotivoMovimiento.COMPRA })
      .andWhere(`${dia('mi.fecha_hora')} BETWEEN :desde AND :hasta`, rango)
      .getRawOne<FilaComprasInventario>();

    // Listado consolidado (limitado; los totales salen de las consultas agregadas)
    const movimientos = this.movimientosRepo
      .createQueryBuilder('m')
      .select('m.id_movimiento', 'id_movimiento')
      .addSelect('m.fecha_hora', 'fecha_hora')
      .addSelect('m.tipo_movimiento', 'tipo_movimiento')
      .addSelect('m.origen', 'origen')
      .addSelect('m.medio_pago', 'medio_pago')
      .addSelect('m.monto', 'monto')
      .addSelect('m.concepto', 'concepto')
      .addSelect('m.categoria', 'categoria')
      .addSelect('m.id_pedido', 'id_pedido')
      .where(`${dia('m.fecha_hora')} BETWEEN :desde AND :hasta`, rango)
      .orderBy('m.fecha_hora', 'DESC')
      .addOrderBy('m.id_movimiento', 'DESC')
      .limit(MAX_MOVIMIENTOS)
      .getRawMany<FilaMovimiento>();

    const [filasIngresos, filasEgresos, filasConsumo, filaCompras, filasMovimientos] = await Promise.all([
      ingresos,
      egresos,
      consumo,
      compras,
      movimientos,
    ]);

    return construirReporteFinanciero(desde, hasta, {
      ingresos: filasIngresos,
      egresos: filasEgresos,
      consumo: filasConsumo,
      compras: filaCompras,
      movimientos: filasMovimientos,
    });
  }
}
