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
import { MedioPago, MovimientoFinanciero, TipoMovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { Comanda, EstadoImpresionComanda } from '../kitchen/entities/comanda.entity';

export interface ResultadoPago {
  pedido: Pedido;
  movimiento: MovimientoFinanciero;
  cambio: number;
}

const INT_MAX = 2_147_483_647;

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
    private readonly dataSource: DataSource,
  ) {}

  async crear(dto: CreatePedidoDto, idMesero: number): Promise<Pedido> {
    const lineas = this.agruparLineas(dto);
    const mesa = dto.numero_mesa ?? null;
    
    if (mesa !== null && (!Number.isInteger(mesa) || mesa < 1 || mesa > TOTAL_MESAS)) {
      throw new BadRequestException(`La mesa debe estar entre 1 y ${TOTAL_MESAS}`);
    }

    const idPedido = await this.dataSource.transaction(async (manager) => {
      if (mesa !== null) {
        const activo = await manager.findOne(Pedido, {
          where: { numero_mesa: mesa, estado_pedido: In(ESTADOS_PEDIDO_ACTIVO) },
        });
        if (activo) throw new ConflictException(`La mesa ${mesa} ya tiene el pedido #${activo.id_pedido} activo`);
      }

      const ids = lineas.map((l) => l.id_item);
      const productos = await manager.find(ItemInventario, {
        where: { id_item: In(ids) },
        lock: { mode: 'pessimistic_read' },
      });

      let total = 0;
      const detalles = lineas.map((l) => {
        const producto = productos.find((p) => p.id_item === l.id_item);
        if (!producto) throw new NotFoundException(`El producto con id ${l.id_item} no existe`);
        if (producto.tipo_item !== TipoItem.PRODUCTO) throw new BadRequestException(`"${producto.nombre}" es un insumo y no se puede vender en un pedido`);
        if (!producto.estado_activo) throw new BadRequestException(`"${producto.nombre}" no está disponible`);
        if (producto.cantidad_stock < l.cantidad) throw new BadRequestException(`Stock insuficiente para "${producto.nombre}". Disponible: ${producto.cantidad_stock}, solicitado: ${l.cantidad}`);

        total += l.cantidad * producto.precio_venta;
        return { id_item: l.id_item, cantidad: l.cantidad, precio_unitario: producto.precio_venta };
      });

      if (total > INT_MAX) throw new BadRequestException('El total del pedido supera el máximo permitido');

      const pedido = await manager.save(
        manager.create(Pedido, {
          id_mesero: idMesero,
          numero_mesa: mesa,
          estado_pedido: EstadoPedido.PENDIENTE,
          total_calculado: total,
        }),
      );

      await manager.save(detalles.map((d) => manager.create(DetallePedido, { ...d, id_pedido: pedido.id_pedido })));

      // --- AQUÍ SE GENERA LA COMANDA AUTOMÁTICAMENTE AL CREAR EL PEDIDO ---
      const nuevaComanda = manager.create(Comanda, {
        id_pedido: pedido.id_pedido,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
      });
      await manager.save(nuevaComanda);
      // --------------------------------------------------------------------

      return pedido.id_pedido;
    }).catch((e: unknown) => {
      if (e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException(`La mesa ${mesa} ya tiene un pedido activo`);
      }
      throw e;
    });

    return this.buscarPorId(idPedido);
  }

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
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
        total: Number(pedido.total_calculado),
      };
    });
  }

  async registrarPago(idPedido: number, dto: RegistrarPagoDto, idUsuario: number): Promise<ResultadoPago> {
    if (!Object.values(MedioPago).includes(dto?.medio_pago)) {
      throw new BadRequestException('Seleccione un medio de pago válido');
    }

    const { movimiento, cambio } = await this.dataSource.transaction(async (manager) => {
      const pedido = await manager.findOne(Pedido, { where: { id_pedido: idPedido }, lock: { mode: 'pessimistic_write' } });
      if (!pedido) throw new NotFoundException(`El pedido #${idPedido} no existe`);
      if (pedido.estado_pedido === EstadoPedido.ANULADO) throw new BadRequestException(`El pedido #${idPedido} está anulado y no se puede cobrar`);

      const pagoPrevio = await manager.findOne(MovimientoFinanciero, { where: { id_pedido: idPedido, tipo_movimiento: TipoMovimientoFinanciero.INGRESO } });
      if (pedido.estado_pedido === EstadoPedido.PAGADO || pagoPrevio) throw new ConflictException(`El pedido #${idPedido} ya fue pagado`);
      if (pedido.total_calculado <= 0) throw new BadRequestException(`El pedido #${idPedido} no tiene valor a cobrar`);

      let cambio = 0;
      if (dto.medio_pago === MedioPago.EFECTIVO) {
        const recibido = dto.monto_recibido ?? pedido.total_calculado;
        if (recibido < pedido.total_calculado) throw new BadRequestException(`El monto recibido ($${recibido}) es menor al total del pedido ($${pedido.total_calculado})`);
        cambio = recibido - pedido.total_calculado;
      }

      const movimiento = await manager.save(
        manager.create(MovimientoFinanciero, {
          id_usuario: idUsuario,
          id_pedido: idPedido,
          tipo_movimiento: TipoMovimientoFinanciero.INGRESO,
          monto: pedido.total_calculado,
          medio_pago: dto.medio_pago,
        }),
      );

      await manager.update(Pedido, { id_pedido: idPedido }, { estado_pedido: EstadoPedido.PAGADO });
      return { movimiento, cambio };
    });

    return { pedido: await this.buscarPorId(idPedido), movimiento, cambio };
  }

  listar(estado?: EstadoPedido): Promise<Pedido[]> {
    return this.pedidosRepo.find({
      where: estado ? { estado_pedido: estado } : {},
      relations: { detalles: { item: true } },
      order: { fecha_hora: 'DESC' },
      take: 100,
    });
  }

  async buscarPorId(id: number): Promise<Pedido> {
    const pedido = await this.pedidosRepo.findOne({
      where: { id_pedido: id },
      relations: { detalles: { item: true }, mesero: true }, 
    });
    if (!pedido) throw new NotFoundException(`El pedido #${id} no existe`);
    return pedido;
  }

  // --- MÁQUINA DE ESTADOS (AHORA SIN GENERAR COMANDA, SOLO CAMBIA ESTADO) ---
  async cambiarEstado(id_pedido: number, dto: UpdateEstadoDto): Promise<Pedido> {
    await this.dataSource.transaction(async (manager) => {
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido },
        lock: { mode: 'pessimistic_write' },
      });

      if (!pedido) throw new NotFoundException(`El pedido con id ${id_pedido} no existe`);

      this.validarTransicion(pedido.estado_pedido, dto.estado_pedido);
      pedido.estado_pedido = dto.estado_pedido;
      
      await manager.save(pedido);
    });

    return this.buscarPorId(id_pedido);
  }

  private validarTransicion(estadoActual: EstadoPedido, nuevoEstado: EstadoPedido) {
    if (estadoActual === nuevoEstado) return;

    const transicionesValidas: Record<EstadoPedido, EstadoPedido[]> = {
      [EstadoPedido.PENDIENTE]: [EstadoPedido.PAGADO, EstadoPedido.ANULADO],
      [EstadoPedido.EN_PREPARACION]: [EstadoPedido.LISTO, EstadoPedido.ANULADO],
      [EstadoPedido.LISTO]: [EstadoPedido.ENTREGADO],
      [EstadoPedido.ENTREGADO]: [EstadoPedido.PAGADO],
      [EstadoPedido.PAGADO]: [], 
      [EstadoPedido.ANULADO]: [], 
    };

    const permitidos = transicionesValidas[estadoActual];

    if (!permitidos.includes(nuevoEstado)) {
      throw new BadRequestException(
        `Transición inválida: No se puede pasar de ${estadoActual} a ${nuevoEstado}.`
      );
    }
  }

  private agruparLineas(dto: CreatePedidoDto): { id_item: number; cantidad: number }[] {
    if (!dto?.detalles?.length) throw new BadRequestException('El pedido debe tener al menos un producto');
    const porProducto = new Map<number, number>();
    for (const d of dto.detalles) {
      if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) throw new BadRequestException('La cantidad debe ser un número entero mayor a 0');
      porProducto.set(d.id_item, (porProducto.get(d.id_item) ?? 0) + d.cantidad);
    }
    const lineas = [...porProducto].map(([id_item, cantidad]) => ({ id_item, cantidad }));
    const excedida = lineas.find((l) => l.cantidad > CANTIDAD_MAXIMA);
    if (excedida) throw new BadRequestException(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA}`);
    return lineas;
  }
}
