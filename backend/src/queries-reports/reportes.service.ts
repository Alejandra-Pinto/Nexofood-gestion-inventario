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
import {
  calcularResumen,
  construirReporteVentas,
  FilaVenta,
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
}
