/**
 * Servicio: OrdersService
 * ------------------------------------------------------------------
 * Lógica de negocio del módulo Orders (pedidos).
 *  Implementar registro de pedido con ID único y estado Pendiente
 *  Validar stock, cantidad inválida y pedido vacío
 * Implementar selección y registro del método de pago
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { ItemInventario, TipoItem } from '../products/entities/item-inventario.entity';
import { CANTIDAD_MAXIMA, CreatePedidoDto } from './dto/create-pedido.dto';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { ESTADOS_PEDIDO_ACTIVO, MesaResumen, TOTAL_MESAS } from './mesas';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import {
  MedioPago,
  MovimientoFinanciero,
  TipoMovimientoFinanciero,
} from '../finance/entities/movimiento-financiero.entity';

/** Respuesta del cobro: el pedido pagado, el ingreso registrado y el cambio */
export interface ResultadoPago {
  pedido: Pedido;
  movimiento: MovimientoFinanciero;
  cambio: number;
}

/** Máximo valor de una columna INTEGER de PostgreSQL */
const INT_MAX = 2_147_483_647;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Registra un pedido nuevo 
   *
   * - El ID único lo genera la BD (SERIAL id_pedido).
   * - El pedido inicia en estado PENDIENTE.
   * - El precio de cada línea se toma del precio de venta actual del producto.
   * - El total se calcula aquí (no se confía en el valor del frontend).
   * - Si trae mesa, la mesa no puede tener otro pedido activo.
   *
   * Todo va en una transacción: si falla un detalle, no queda un pedido a medias.
   *
   * @param dto       Productos y cantidades
   * @param idMesero  Id del usuario autenticado (viene del JWT, no del body)
   */
  async crear(dto: CreatePedidoDto, idMesero: number): Promise<Pedido> {
    const lineas = this.agruparLineas(dto);

    const mesa = dto.numero_mesa ?? null;
    if (mesa !== null && (!Number.isInteger(mesa) || mesa < 1 || mesa > TOTAL_MESAS)) {
      throw new BadRequestException(`La mesa debe estar entre 1 y ${TOTAL_MESAS}`);
    }

    const idPedido = await this.dataSource.transaction(async (manager) => {
      // 0. La mesa debe estar libre (un pedido activo por mesa)
      if (mesa !== null) {
        const activo = await manager.findOne(Pedido, {
          where: { numero_mesa: mesa, estado_pedido: In(ESTADOS_PEDIDO_ACTIVO) },
        });
        if (activo) {
          throw new ConflictException(
            `La mesa ${mesa} ya tiene el pedido #${activo.id_pedido} activo`,
          );
        }
      }

      // 1. Productos solicitados (bloqueados para que el stock no cambie mientras se valida)
      const ids = lineas.map((l) => l.id_item);
      const productos = await manager.find(ItemInventario, {
        where: { id_item: In(ids) },
        lock: { mode: 'pessimistic_read' },
      });

      // 2. Validaciones de existencia, tipo y stock (SCRUM-149)
      let total = 0;
      const detalles = lineas.map((l) => {
        const producto = productos.find((p) => p.id_item === l.id_item);
        if (!producto) {
          throw new NotFoundException(`El producto con id ${l.id_item} no existe`);
        }
        if (producto.tipo_item !== TipoItem.PRODUCTO) {
          throw new BadRequestException(
            `"${producto.nombre}" es un insumo y no se puede vender en un pedido`,
          );
        }
        if (!producto.estado_activo) {
          throw new BadRequestException(`"${producto.nombre}" no está disponible`);
        }
        if (producto.cantidad_stock < l.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.cantidad_stock}, solicitado: ${l.cantidad}`,
          );
        }

        total += l.cantidad * producto.precio_venta;
        return { id_item: l.id_item, cantidad: l.cantidad, precio_unitario: producto.precio_venta };
      });

      if (total > INT_MAX) {
        throw new BadRequestException('El total del pedido supera el máximo permitido');
      }

      // 3. Cabecera del pedido (ID único + estado PENDIENTE)
      const pedido = await manager.save(
        manager.create(Pedido, {
          id_mesero: idMesero,
          numero_mesa: mesa,
          estado_pedido: EstadoPedido.PENDIENTE,
          total_calculado: total,
        }),
      );

      // 4. Detalles (productos del pedido)
      await manager.save(
        detalles.map((d) => manager.create(DetallePedido, { ...d, id_pedido: pedido.id_pedido })),
      );

      return pedido.id_pedido;
    }).catch((e: unknown) => {
      // Dos meseros enviaron pedido a la misma mesa al mismo tiempo:
      // lo frena el índice único ux_pedido_mesa_activa
      if (e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException(`La mesa ${mesa} ya tiene un pedido activo`);
      }
      throw e;
    });

    return this.buscarPorId(idPedido);
  }

  /**
   * GET /orders/mesas -> estado de las mesas para la pantalla "Mis mesas".
   * LIBRE sin pedido activo · PENDIENTE pedido enviado a caja ·
   * OCUPADA pedido en preparación, listo o entregado (aún sin pagar).
   */
  async mesas(): Promise<MesaResumen[]> {
    const activos = await this.pedidosRepo.find({
      where: { estado_pedido: In(ESTADOS_PEDIDO_ACTIVO) },
      order: { fecha_hora: 'DESC' },
    });

    return Array.from({ length: TOTAL_MESAS }, (_, i) => {
      const numero = i + 1;
      const pedido = activos.find((p) => p.numero_mesa === numero);
      if (!pedido) return { numero, estado: 'LIBRE', id_pedido: null, total: 0 };
      return {
        numero,
        estado: pedido.estado_pedido === EstadoPedido.PENDIENTE ? 'PENDIENTE' : 'OCUPADA',
        id_pedido: pedido.id_pedido,
        total: Number(pedido.total_calculado),
      };
    });
  }

  /**
   * Registra el pago de un pedido .
   *
   * En una transacción:
   *   1. Valida que el pedido exista, no esté anulado ni pagado.
   *   2. Valida el monto recibido en efectivo y calcula el cambio.
   *   3. INSERT movimiento_financiero (INGRESO, total del pedido, medio de pago).
   *   4. UPDATE pedido.estado_pedido = PAGADO.
   *
   * El índice único ux_movfin_pago_pedido evita un segundo cobro aunque
   * llegan dos peticiones al mismo tiempo (doble clic).
   *
   * @param idPedido  Pedido que se cobra
   * @param dto       Medio de pago y monto recibido (efectivo)
   * @param idUsuario Cajero o administrador (viene del JWT)
   */
  async registrarPago(
    idPedido: number,
    dto: RegistrarPagoDto,
    idUsuario: number,
  ): Promise<ResultadoPago> {
    if (!Object.values(MedioPago).includes(dto?.medio_pago)) {
      throw new BadRequestException('Seleccione un medio de pago válido');
    }

    const { movimiento, cambio } = await this.dataSource.transaction(async (manager) => {
      // 1. Pedido (bloqueado para que no se cobre dos veces a la vez)
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido: idPedido },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pedido) {
        throw new NotFoundException(`El pedido #${idPedido} no existe`);
      }
      if (pedido.estado_pedido === EstadoPedido.ANULADO) {
        throw new BadRequestException(`El pedido #${idPedido} está anulado y no se puede cobrar`);
      }

      // Evitar pagos duplicados
      const pagoPrevio = await manager.findOne(MovimientoFinanciero, {
        where: { id_pedido: idPedido, tipo_movimiento: TipoMovimientoFinanciero.INGRESO },
      });
      if (pedido.estado_pedido === EstadoPedido.PAGADO || pagoPrevio) {
        throw new ConflictException(`El pedido #${idPedido} ya fue pagado`);
      }
      if (pedido.total_calculado <= 0) {
        throw new BadRequestException(`El pedido #${idPedido} no tiene valor a cobrar`);
      }

      // 2. Efectivo: lo recibido debe cubrir el total -> cambio
      let cambio = 0;
      if (dto.medio_pago === MedioPago.EFECTIVO) {
        const recibido = dto.monto_recibido ?? pedido.total_calculado;
        if (recibido < pedido.total_calculado) {
          throw new BadRequestException(
            `El monto recibido ($${recibido}) es menor al total del pedido ($${pedido.total_calculado})`,
          );
        }
        cambio = recibido - pedido.total_calculado;
      }

      // 3. Ingreso con su medio de pago
      const movimiento = await manager.save(
        manager.create(MovimientoFinanciero, {
          id_usuario: idUsuario,
          id_pedido: idPedido,
          tipo_movimiento: TipoMovimientoFinanciero.INGRESO,
          monto: pedido.total_calculado,
          medio_pago: dto.medio_pago,
        }),
      );

      // 4. El pedido queda pagado
      await manager.update(Pedido, { id_pedido: idPedido }, { estado_pedido: EstadoPedido.PAGADO });

      return { movimiento, cambio };
    });

    return { pedido: await this.buscarPorId(idPedido), movimiento, cambio };
  }

  /** GET /orders?estado= -> pedidos más recientes primero (con sus productos) */
  listar(estado?: EstadoPedido): Promise<Pedido[]> {
    return this.pedidosRepo.find({
      where: estado ? { estado_pedido: estado } : {},
      relations: { detalles: { item: true } },
      order: { fecha_hora: 'DESC' },
      take: 100,
    });
  }

  /** GET /orders/:id -> un pedido con sus productos */
  async buscarPorId(id: number): Promise<Pedido> {
    const pedido = await this.pedidosRepo.findOne({
      where: { id_pedido: id },
      relations: { detalles: { item: true } },
    });
    if (!pedido) {
      throw new NotFoundException(`El pedido #${id} no existe`);
    }
    return pedido;
  }

  /**
   * valida el pedido sin tocar la BD y une las líneas repetidas
   * (si el mismo producto viene dos veces se suman las cantidades, para
   * validar el stock con la cantidad total pedida).
   * El DTO ya valida esto en el endpoint; aquí se repite para que el
   * servicio sea seguro aunque lo llame otro módulo.
   */
  private agruparLineas(dto: CreatePedidoDto): { id_item: number; cantidad: number }[] {
    if (!dto?.detalles?.length) {
      throw new BadRequestException('El pedido debe tener al menos un producto');
    }

    const porProducto = new Map<number, number>();
    for (const d of dto.detalles) {
      if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) {
        throw new BadRequestException('La cantidad debe ser un número entero mayor a 0');
      }
      porProducto.set(d.id_item, (porProducto.get(d.id_item) ?? 0) + d.cantidad);
    }

    const lineas = [...porProducto].map(([id_item, cantidad]) => ({ id_item, cantidad }));
    const excedida = lineas.find((l) => l.cantidad > CANTIDAD_MAXIMA);
    if (excedida) {
      throw new BadRequestException(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA}`);
    }
    return lineas;
  }
}
