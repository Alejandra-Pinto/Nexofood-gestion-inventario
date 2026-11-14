/** Servicio: FinanceService - Registrar ingresos y egresos */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MovimientoFinanciero,
  OrigenMovimiento,
  TipoMovimientoFinanciero,
} from './entities/movimiento-financiero.entity';
import { CreateIngresoFinancieroDto } from './dto/create-ingreso-financiero.dto';
import { CreateEgresoFinancieroDto } from './dto/create-egreso-financiero.dto';
import { CATEGORIAS_INGRESO, errorMonto, fechaInexistente, hoyColombia, ZONA_HORARIA } from './ingresos';
import { CATEGORIAS_EGRESO } from './egresos';

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

export interface EgresoFinanciero {
  id_movimiento: number;
  fecha_hora: Date;
  concepto: string;
  categoria: string;
  monto: number;
  medio_pago: string;
  observaciones: string | null;
  registrado_por: string | null;
}

// Interfaz original de tu compañero (INTACTA)
export interface ListaIngresos {
  desde: string;
  hasta: string;
  total: number;
  ingresos: IngresoFinanciero[];
}

// Nueva interfaz para egresos (basada en la misma estructura)
export interface ListaEgresos {
  desde: string;
  hasta: string;
  total: number;
  egresos: EgresoFinanciero[];
}

// ==========================================================
// HU-7.3 Historial de ingresos y egresos
// ==========================================================
export interface MovimientoHistorial {
  id_movimiento: number;
  fecha_hora: Date;
  tipo_movimiento: TipoMovimientoFinanciero;
  origen: OrigenMovimiento;
  concepto: string;
  monto: number;
  medio_pago: string;
  id_pedido: number | null;
  registrado_por: string | null;
}

export interface TotalesFinancieros {
  ingresos: number;
  egresos: number;
  /** Ingresos - Egresos */
  saldo: number;
}

export interface HistorialFinanciero {
  resumen: TotalesFinancieros;
  /** Saldo por medio de pago, para cuadrar la caja (efectivo) y las cuentas */
  por_medio: (TotalesFinancieros & { medio_pago: string })[];
  movimientos: MovimientoHistorial[];
}

/** Concepto de un cobro de pedido: "Venta · Pedido #12 · Mesa 3" */
function conceptoVenta(m: MovimientoFinanciero): string {
  const mesa = m.pedido?.numero_mesa;
  return `Venta · Pedido #${m.id_pedido}${mesa ? ` · Mesa ${mesa}` : ' · Para llevar'}`;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(MovimientoFinanciero)
    private readonly movimientosRepo: Repository<MovimientoFinanciero>,
  ) {}

  // ==========================================================
  // MÓDULO DE INGRESOS (Código original de tu compañero)
  // ==========================================================
  async registrarIngreso(dto: CreateIngresoFinancieroDto, idUsuario: number): Promise<IngresoFinanciero> {
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
        id_pedido: null,
        tipo_movimiento: TipoMovimientoFinanciero.INGRESO,
        origen: OrigenMovimiento.MANUAL,
        monto: dto.monto,
        medio_pago: dto.medio_pago,
        concepto: dto.concepto.trim(),
        categoria: dto.categoria,
        observaciones: dto.observaciones?.trim() || null,
        fecha_hora: fecha === hoy ? new Date() : new Date(`${fecha}T12:00:00-05:00`),
      }),
    );

    return this.aIngreso(guardado, null);
  }

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
      .addSelect(['u.id_usuario', 'u.nombre_completo'])
      .where('m.origen = :origen', { origen: OrigenMovimiento.MANUAL })
      .andWhere('m.tipo_movimiento = :tipo', { tipo: TipoMovimientoFinanciero.INGRESO })
      .andWhere(`(m.fecha_hora AT TIME ZONE '${ZONA_HORARIA}')::date BETWEEN :desde AND :hasta`, { desde: d, hasta: h })
      .orderBy('m.fecha_hora', 'DESC')
      .addOrderBy('m.id_movimiento', 'DESC')
      .getMany();

    const ingresos = filas.map((m) => this.aIngreso(m, m.usuario?.nombre_completo ?? null));
    return { desde: d, hasta: h, total: ingresos.reduce((s, i) => s + i.monto, 0), ingresos };
  }

  // ==========================================================
  // MÓDULO DE EGRESOS (HU-7.1)
  // ==========================================================
  async registrarEgreso(dto: CreateEgresoFinancieroDto, idUsuario: number): Promise<EgresoFinanciero> {
    if (!dto.monto || dto.monto <= 0) throw new BadRequestException('El monto debe ser mayor a 0');
    if (!dto.concepto?.trim()) throw new BadRequestException('El concepto es obligatorio');
    
    if (dto.categoria && !(dto.categoria in CATEGORIAS_EGRESO)) {
      throw new BadRequestException('La categoría del egreso no es válida');
    }

    const guardado = await this.movimientosRepo.save(
      this.movimientosRepo.create({
        id_usuario: idUsuario,
        id_pedido: null,
        tipo_movimiento: TipoMovimientoFinanciero.EGRESO,
        origen: OrigenMovimiento.MANUAL,
        monto: dto.monto,
        medio_pago: dto.medio_pago,
        concepto: dto.concepto.trim(),
        categoria: dto.categoria || null,
        observaciones: dto.observaciones?.trim() || null,
        fecha_hora: new Date(),
      }),
    );

    return this.aEgreso(guardado, null);
  }

  async listarEgresos(desde?: string, hasta?: string): Promise<ListaEgresos> {
    const hoy = hoyColombia();
    const d = desde ?? `${hoy.slice(0, 8)}01`;
    const h = hasta ?? hoy;

    const filas = await this.movimientosRepo
      .createQueryBuilder('m')
      .leftJoin('m.usuario', 'u')
      .addSelect(['u.id_usuario', 'u.nombre_completo'])
      .where('m.origen = :origen', { origen: OrigenMovimiento.MANUAL })
      .andWhere('m.tipo_movimiento = :tipo', { tipo: TipoMovimientoFinanciero.EGRESO })
      .andWhere(`(m.fecha_hora AT TIME ZONE '${ZONA_HORARIA}')::date BETWEEN :desde AND :hasta`, { desde: d, hasta: h })
      .orderBy('m.fecha_hora', 'DESC')
      .addOrderBy('m.id_movimiento', 'DESC')
      .getMany();

    const egresos = filas.map((m) => this.aEgreso(m, m.usuario?.nombre_completo ?? null));
    return { desde: d, hasta: h, total: egresos.reduce((s, i) => s + i.monto, 0), egresos };
  }

  // ==========================================================
  // HU-7.3 HISTORIAL DE INGRESOS Y EGRESOS
  // ==========================================================
  /**
   * Lista todos los movimientos (cobros de pedidos, ingresos manuales y egresos)
   * y calcula el saldo neto actual: Ingresos - Egresos.
   */
  async historial(): Promise<HistorialFinanciero> {
    const filas = await this.movimientosRepo
      .createQueryBuilder('m')
      .leftJoin('m.usuario', 'u')
      .addSelect(['u.id_usuario', 'u.nombre_completo']) // nunca el password_hash
      .leftJoin('m.pedido', 'p')
      .addSelect(['p.id_pedido', 'p.numero_mesa'])
      .orderBy('m.fecha_hora', 'DESC')
      .addOrderBy('m.id_movimiento', 'DESC')
      .getMany();

    const movimientos = filas.map<MovimientoHistorial>((m) => ({
      id_movimiento: m.id_movimiento,
      fecha_hora: m.fecha_hora,
      tipo_movimiento: m.tipo_movimiento,
      origen: m.origen ?? (m.id_pedido ? OrigenMovimiento.VENTA : OrigenMovimiento.MANUAL),
      concepto: m.concepto?.trim() || (m.id_pedido ? conceptoVenta(m) : 'Sin concepto'),
      monto: Number(m.monto),
      medio_pago: m.medio_pago,
      id_pedido: m.id_pedido ?? null,
      registrado_por: m.usuario?.nombre_completo ?? null,
    }));

    const vacio = (): TotalesFinancieros => ({ ingresos: 0, egresos: 0, saldo: 0 });
    const resumen = vacio();
    const porMedio = new Map<string, TotalesFinancieros>();
    for (const m of movimientos) {
      const medio = porMedio.get(m.medio_pago) ?? vacio();
      porMedio.set(m.medio_pago, medio);
      for (const t of [resumen, medio]) {
        if (m.tipo_movimiento === TipoMovimientoFinanciero.EGRESO) t.egresos += m.monto;
        else t.ingresos += m.monto;
        t.saldo = t.ingresos - t.egresos;
      }
    }

    return {
      resumen,
      por_medio: [...porMedio].map(([medio_pago, t]) => ({ medio_pago, ...t })),
      movimientos,
    };
  }

  // --- Métodos de mapeo ---
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

  private aEgreso(m: MovimientoFinanciero, registradoPor: string | null): EgresoFinanciero {
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