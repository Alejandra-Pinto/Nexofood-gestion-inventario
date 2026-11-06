/**
 * Servicio: ReportesService
 * ------------------------------------------------------------------
 * HU-6.7 · Resumen de operaciones por período
 *   SCRUM-237 Cantidad de pedidos, ventas acumuladas y anulados
 *   SCRUM-238 Período sin operaciones
 *
 * Las consultas solo traen los datos del período; los cálculos están en
 * reportes.ts (funciones puras que se prueban sin base de datos).
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pedido } from '../orders/entities/pedido.entity';
import {
  MovimientoFinanciero,
  OrigenMovimiento,
  TipoMovimientoFinanciero,
} from '../finance/entities/movimiento-financiero.entity';
import { calcularResumen, ResumenPeriodo, validarPeriodo, ZONA_HORARIA } from './reportes';

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
}
