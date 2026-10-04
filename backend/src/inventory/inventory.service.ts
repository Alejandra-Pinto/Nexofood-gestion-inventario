/**
 * Servicio: InventoryService
 * ------------------------------------------------------------------
 * Lógica de negocio del módulo Inventory.
 *
 * HU-2.3 · SCRUM-128 Sumar cantidad ingresada al stock
 *        · SCRUM-129 Registrar fecha y tipo de movimiento
 * HU-2.4 · SCRUM-132 Implementar resta de stock y tipo de movimiento
 *        · SCRUM-133 Validar cantidad superior al stock disponible
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ItemInventario } from '../products/entities/item-inventario.entity';
import {
  MotivoMovimiento,
  MovimientoInventario,
  TipoMovimiento,
} from './entities/movimiento-inventario.entity';
import { CreateSalidaDto } from './dto/create-salida.dto';
import { CreateIngresoDto, MotivoIngreso } from './dto/create-ingreso.dto';
import { Proveedor } from './entities/proveedor.entity';

/** Máximo valor de una columna INTEGER de PostgreSQL */
const INT_MAX = 2_147_483_647;

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(MovimientoInventario)
    private readonly movimientosRepo: Repository<MovimientoInventario>,
    @InjectRepository(ItemInventario)
    private readonly itemsRepo: Repository<ItemInventario>,
    @InjectRepository(Proveedor)
    private readonly proveedoresRepo: Repository<Proveedor>,
    private readonly dataSource: DataSource,
  ) {}

  /** Proveedores activos para el selector del formulario de ingresos */
  listarProveedores(): Promise<Proveedor[]> {
    return this.proveedoresRepo.find({
      where: { estado_activo: true },
      order: { nombre: 'ASC' },
    });
  }

  /**
   * Registra un ingreso de inventario (compra a proveedor o producción propia).
   *
   * Una sola transacción con 2 escrituras (si una falla, se revierten ambas):
   *   1. UPDATE item_inventario.cantidad_stock  = stock + cantidad  (SCRUM-128)
   *   2. INSERT movimiento_inventario (ENTRADA + motivo, fecha, costo, total,
   *      proveedor, usuario, observaciones)                         (SCRUM-129)
   *
   * Se bloquea la fila del ítem (pessimistic_write) para que dos ingresos
   * simultáneos del mismo ítem no se pisen el stock.
   *
   * @param dto       Datos del ingreso
   * @param idUsuario Id del usuario autenticado (viene del JWT, no del body)
   */
  async registrarIngreso(
    dto: CreateIngresoDto,
    idUsuario: number,
  ): Promise<MovimientoInventario> {
    // Validaciones que no necesitan base de datos: se hacen antes de abrir la transacción
    this.validarReglasIngreso(dto);
    const fechaHora = this.resolverFechaHora(dto.fecha_ingreso, new Date());

    return this.dataSource.transaction(async (manager) => {
      // 1. Ítem (con bloqueo)
      const item = await manager.findOne(ItemInventario, {
        where: { id_item: dto.id_item },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException(`El ítem con id ${dto.id_item} no existe`);
      }
      if (!item.estado_activo) {
        throw new BadRequestException(
          `El ítem "${item.nombre}" está inactivo y no admite movimientos`,
        );
      }

      // 2. Proveedor (solo en compras)
      const esCompra = dto.motivo === MotivoIngreso.COMPRA;
      if (esCompra) {
        const proveedor = await manager.findOne(Proveedor, {
          where: { id_proveedor: dto.id_proveedor },
        });
        if (!proveedor) {
          throw new NotFoundException(
            `El proveedor con id ${dto.id_proveedor} no existe`,
          );
        }
        if (!proveedor.estado_activo) {
          throw new BadRequestException(
            `El proveedor "${proveedor.nombre}" está inactivo`,
          );
        }
      }

      // 3. Costo y total. En producción sin costo se usa el costo de fabricación del ítem.
      const costoUnitario = dto.costo_unitario ?? item.costo_fabricacion;
      const total = dto.cantidad * costoUnitario;
      const stockAnterior = item.cantidad_stock;
      const stockNuevo = stockAnterior + dto.cantidad;

      if (total > INT_MAX || stockNuevo > INT_MAX) {
        throw new BadRequestException(
          'La cantidad o el costo ingresado supera el máximo permitido',
        );
      }

      // 4. Sumar al stock (SCRUM-128)
      await manager.update(
        ItemInventario,
        { id_item: dto.id_item },
        { cantidad_stock: stockNuevo },
      );

      // 5. Registrar el movimiento en el kardex (SCRUM-129)
      const movimiento = manager.create(MovimientoInventario, {
        id_item: dto.id_item,
        id_usuario: idUsuario,
        tipo_movimiento: TipoMovimiento.ENTRADA,
        motivo: esCompra ? MotivoMovimiento.COMPRA : MotivoMovimiento.PRODUCCION,
        cantidad: dto.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        costo_unitario: costoUnitario,
        total,
        id_proveedor: esCompra ? dto.id_proveedor : null,
        observaciones: dto.observaciones?.trim() || null,
        fecha_hora: fechaHora,
      });

      return manager.save(movimiento);
    });
  }

  /**
   * Reglas de negocio que no dependen de la BD. El DTO ya las valida en el
   * endpoint; aquí se repiten para que el service sea seguro aunque lo llame
   * otro módulo (ej: Kitchen al registrar producción) sin pasar por el pipe.
   */
  private validarReglasIngreso(dto: CreateIngresoDto): void {
    if (!Number.isInteger(dto.cantidad) || dto.cantidad <= 0) {
      throw new BadRequestException('La cantidad debe ser un entero mayor a 0');
    }

    const hayCosto = dto.costo_unitario !== undefined && dto.costo_unitario !== null;
    if (hayCosto && (!Number.isInteger(dto.costo_unitario) || (dto.costo_unitario as number) <= 0)) {
      throw new BadRequestException('El costo unitario debe ser un entero mayor a 0');
    }

    const hayProveedor = dto.id_proveedor !== undefined && dto.id_proveedor !== null;
    if (dto.motivo === MotivoIngreso.COMPRA) {
      if (!hayProveedor) {
        throw new BadRequestException('Una compra requiere indicar el proveedor');
      }
      if (!hayCosto) {
        throw new BadRequestException('Una compra requiere indicar el costo unitario');
      }
    } else if (dto.motivo === MotivoIngreso.PRODUCCION) {
      if (hayProveedor) {
        throw new BadRequestException(
          'Un ingreso por producción propia no admite proveedor',
        );
      }
    } else {
      throw new BadRequestException('El tipo de ingreso debe ser COMPRA o PRODUCCION');
    }
  }

  /**
   * Convierte la fecha del formulario (YYYY-MM-DD) en el timestamp del kardex.
   *  - Sin fecha, o fecha de hoy -> momento actual.
   *  - Fecha pasada -> ese día con la hora actual (la BD guarda TIMESTAMPTZ).
   *  - Fecha futura o inexistente (ej. 2026-02-30) -> 400.
   */
  private resolverFechaHora(fecha: string | undefined, ahora: Date): Date {
    if (!fecha) return ahora;

    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
    if (!partes) {
      throw new BadRequestException('La fecha de ingreso debe tener el formato AAAA-MM-DD');
    }
    const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];

    const elegida = new Date(anio, mes - 1, dia);
    if (elegida.getFullYear() !== anio || elegida.getMonth() !== mes - 1 || elegida.getDate() !== dia) {
      throw new BadRequestException('La fecha de ingreso no es una fecha válida');
    }

    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    if (elegida.getTime() > hoy.getTime()) {
      throw new BadRequestException('La fecha de ingreso no puede ser futura');
    }
    if (elegida.getTime() === hoy.getTime()) return ahora;

    return new Date(anio, mes - 1, dia, ahora.getHours(), ahora.getMinutes(), ahora.getSeconds());
  }

  /**
   * Registra una salida manual de inventario (merma o consumo interno).
   *
   * Se ejecuta dentro de una transacción porque hace 2 escrituras:
   *   1. INSERT en movimiento_inventario (kardex)
   *   2. UPDATE en item_inventario.cantidad_stock
   *
   * Si una falla, la otra se revierte (atomicidad). Sin transacción,
   * podrías quedar con un movimiento registrado pero stock sin descontar
   * (o al revés), lo cual corrompe la auditoría.
   *
   * @param dto       Datos de la salida (item, motivo, cantidad, obs.)
   * @param idUsuario Id del usuario autenticado (obtenido del JWT)
   */
  async registrarSalida(
    dto: CreateSalidaDto,
    idUsuario: number,
  ): Promise<MovimientoInventario> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Bloqueo pesimista del ítem para evitar condiciones de carrera
      const item = await manager.findOne(ItemInventario, {
        where: { id_item: dto.id_item },
        lock: { mode: 'pessimistic_write' },
      });

      if (!item) {
        throw new NotFoundException(
          `El ítem con id ${dto.id_item} no existe`,
        );
      }

      if (!item.estado_activo) {
        throw new BadRequestException(
          `El ítem "${item.nombre}" está inactivo y no admite movimientos`,
        );
      }

      // 2. Validación de stock suficiente (SCRUM-133)
      if (item.cantidad_stock < dto.cantidad) {
        throw new BadRequestException(
          `Stock insuficiente para "${item.nombre}". Disponible: ${item.cantidad_stock}, solicitado: ${dto.cantidad}`,
        );
      }

      // 3. Cálculo del nuevo stock
      const stockAnterior = item.cantidad_stock;
      const stockNuevo = stockAnterior - dto.cantidad;

      // 4. Actualizar el stock del ítem
      await manager.update(
        ItemInventario,
        { id_item: dto.id_item },
        { cantidad_stock: stockNuevo },
      );

      // 5. Crear el registro del movimiento (kardex)
      const movimiento = manager.create(MovimientoInventario, {
        id_item: dto.id_item,
        id_usuario: idUsuario,
        tipo_movimiento: TipoMovimiento.SALIDA,
        motivo: dto.motivo as unknown as MotivoMovimiento,
        cantidad: dto.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        observaciones: dto.observaciones ?? null,
      });

      return manager.save(movimiento);
    });
  }
}