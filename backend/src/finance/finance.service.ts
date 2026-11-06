/** Servicio: FinanceService - Registrar ingresos no provenientes de ventas */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MovimientoFinanciero,
  OrigenMovimiento,
  TipoMovimientoFinanciero,
} from './entities/movimiento-financiero.entity';
import { CreateIngresoFinancieroDto } from './dto/create-ingreso-financiero.dto';
import { CATEGORIAS_INGRESO, errorMonto, fechaInexistente, hoyColombia, ZONA_HORARIA } from './ingresos';

/** Ingreso tal como lo ve el frontend */
export interface IngresoFinanciero {
  id_movimiento: number;
  fecha_hora: Date;
  concepto: string;
  categoria: string;
  monto: number;
  medio_pago: string;
  observaciones: string | null;
  registrado_por: string | null;
}

export interface ListaIngresos {
  desde: string;
  hasta: string;
  total: number;
  ingresos: IngresoFinanciero[];
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(MovimientoFinanciero)
    private readonly movimientosRepo: Repository<MovimientoFinanciero>,
  ) {}

  /** Registra un ingreso que NO viene de ventas. */
  async registrarIngreso(dto: CreateIngresoFinancieroDto, idUsuario: number): Promise<IngresoFinanciero> {
    // El DTO ya valida; se repite aquí por si otro módulo llama al servicio
    const error = errorMonto(dto?.monto);
    if (error) throw new BadRequestException(error);
    if (!dto.concepto?.trim()) throw new BadRequestException('El concepto es obligatorio');
    if (!(dto.categoria in CATEGORIAS_INGRESO)) throw new BadRequestException('Seleccione una categoría válida');

    const hoy = hoyColombia();
    const fecha = dto.fecha ?? hoy;
    if (fechaInexistente(fecha)) throw new BadRequestException('La fecha no es válida');
    if (fecha > hoy) throw new BadRequestException('La fecha no puede ser posterior a hoy');

    const guardado = await this.movimientosRepo.save(
      this.movimientosRepo.create({
        id_usuario: idUsuario,
        id_pedido: null, // No viene de un pedido: no afecta ventas
        tipo_movimiento: TipoMovimientoFinanciero.INGRESO,
        origen: OrigenMovimiento.MANUAL,
        monto: dto.monto,
        medio_pago: dto.medio_pago,
        concepto: dto.concepto.trim(),
        categoria: dto.categoria,
        observaciones: dto.observaciones?.trim() || null,
        // Hoy -> hora actual; fecha pasada -> mediodía de ese día en Colombia
        fecha_hora: fecha === hoy ? new Date() : new Date(`${fecha}T12:00:00-05:00`),
      }),
    );

    return this.aIngreso(guardado, null);
  }

  /** GET /finance/ingresos?desde=&hasta= -> ingresos manuales del período (por defecto, el mes actual) */
  async listarIngresos(desde?: string, hasta?: string): Promise<ListaIngresos> {
    const hoy = hoyColombia();
    const d = desde ?? `${hoy.slice(0, 8)}01`;
    const h = hasta ?? hoy;
    for (const [valor, nombre] of [[d, 'La fecha inicial'], [h, 'La fecha final']] as const) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || fechaInexistente(valor)) {
        throw new BadRequestException(`${nombre} no es válida`);
      }
    }
    if (d > h) throw new BadRequestException('La fecha inicial no puede ser posterior a la fecha final');

    const filas = await this.movimientosRepo
      .createQueryBuilder('m')
      .leftJoin('m.usuario', 'u')
      .addSelect(['u.id_usuario', 'u.nombre_completo']) // Nunca el password_hash
      .where('m.origen = :origen', { origen: OrigenMovimiento.MANUAL })
      .andWhere('m.tipo_movimiento = :tipo', { tipo: TipoMovimientoFinanciero.INGRESO })
      .andWhere(`(m.fecha_hora AT TIME ZONE '${ZONA_HORARIA}')::date BETWEEN :desde AND :hasta`, { desde: d, hasta: h })
      .orderBy('m.fecha_hora', 'DESC')
      .addOrderBy('m.id_movimiento', 'DESC')
      .getMany();

    const ingresos = filas.map((m) => this.aIngreso(m, m.usuario?.nombre_completo ?? null));
    return { desde: d, hasta: h, total: ingresos.reduce((s, i) => s + i.monto, 0), ingresos };
  }

  private aIngreso(m: MovimientoFinanciero, registradoPor: string | null): IngresoFinanciero {
    return {
      id_movimiento: m.id_movimiento,
      fecha_hora: m.fecha_hora,
      concepto: m.concepto ?? '',
      categoria: m.categoria ?? '',
      monto: Number(m.monto),
      medio_pago: m.medio_pago,
      observaciones: m.observaciones ?? null,
      registrado_por: registradoPor,
    };
  }
}
