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
import { ModificarPedidoDto } from './dto/modificar-pedido.dto';
import { AnularPedidoDto } from './dto/anular-pedido.dto';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { ESTADOS_PEDIDO_ACTIVO, MesaResumen, TOTAL_MESAS } from './mesas';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { MedioPago, MovimientoFinanciero, TipoMovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';
import { UpdateEstadoDto } from './dto/update-estado.dto';
import { Comanda, EstadoImpresionComanda } from '../kitchen/entities/comanda.entity';
import { RolUsuario } from '../users/entities/user.entity';

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

      // Comanda inicial generada con el pedido
      const nuevaComanda = manager.create(Comanda, {
        id_pedido: pedido.id_pedido,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
      });
      const comandaGuardada = await manager.save(nuevaComanda);

      await manager.save(
        detalles.map((d) =>
          manager.create(DetallePedido, {
            ...d,
            id_pedido: pedido.id_pedido,
            id_comanda: comandaGuardada.id_comanda,
          }),
        ),
      );

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
      relations: { detalles: { item: true }, mesero: true, usuario_anulacion: true },
      order: { fecha_hora: 'DESC' },
      take: 100,
    });
  }

  async buscarPorId(id: number): Promise<Pedido> {
    const pedido = await this.pedidosRepo.findOne({
      where: { id_pedido: id },
      relations: {
        detalles: { item: true },
        mesero: true,
        usuario_anulacion: true,
      },
    });
    if (!pedido) throw new NotFoundException(`El pedido #${id} no existe`);
    return pedido;
  }

  // =========================================================================
  // HU-3.3 MODIFICACIÓN DE PEDIDO EXISTENTE
  // =========================================================================
  async modificar(
    idPedido: number,
    dto: ModificarPedidoDto,
    _idUsuario: number,
    _rolUsuario: RolUsuario,
  ): Promise<Pedido> {
    if (!dto?.detalles?.length) {
      throw new BadRequestException('El pedido debe tener al menos un producto');
    }

    await this.dataSource.transaction(async (manager) => {
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido: idPedido },
        lock: { mode: 'pessimistic_write' },
      });

      if (!pedido) {
        throw new NotFoundException(`El pedido #${idPedido} no existe`);
      }

      pedido.detalles = await manager.find(DetallePedido, {
        where: { id_pedido: idPedido },
        relations: { item: true },
        order: { id_detalle: 'ASC' },
      });

      if (pedido.estado_pedido === EstadoPedido.PAGADO || pedido.estado_pedido === EstadoPedido.ENTREGADO) {
        throw new BadRequestException(
          `El pedido #${idPedido} se encuentra en estado ${pedido.estado_pedido} y ya no puede modificarse.`,
        );
      }

      if (pedido.estado_pedido === EstadoPedido.ANULADO) {
        throw new BadRequestException(`El pedido #${idPedido} está anulado y no admite modificaciones.`);
      }

      if (pedido.estado_pedido === EstadoPedido.LISTO) {
        throw new BadRequestException(`El pedido #${idPedido} está listo para entrega y no puede modificarse.`);
      }

      // Validar y agrupar detalles solicitados
      const lineasSolicitadas = new Map<number, { cantidad: number; notas_especiales?: string; promocion_aplicada?: string }>();
      for (const d of dto.detalles) {
        if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) {
          throw new BadRequestException('La cantidad debe ser un número entero mayor a 0');
        }
        const actual = lineasSolicitadas.get(d.id_item);
        const nuevaCant = (actual?.cantidad ?? 0) + d.cantidad;
        if (nuevaCant > CANTIDAD_MAXIMA) {
          throw new BadRequestException(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA}`);
        }
        lineasSolicitadas.set(d.id_item, {
          cantidad: nuevaCant,
          notas_especiales: d.notas_especiales ?? actual?.notas_especiales,
          promocion_aplicada: d.promocion_aplicada ?? actual?.promocion_aplicada,
        });
      }

      const idsItems = Array.from(lineasSolicitadas.keys());
      const productos = await manager.find(ItemInventario, {
        where: { id_item: In(idsItems) },
        lock: { mode: 'pessimistic_read' },
      });

      for (const [idItem, l] of lineasSolicitadas) {
        const prod = productos.find((p) => p.id_item === idItem);
        if (!prod) throw new NotFoundException(`El producto con id ${idItem} no existe`);
        if (prod.tipo_item !== TipoItem.PRODUCTO) {
          throw new BadRequestException(`"${prod.nombre}" es un insumo y no se puede vender en un pedido`);
        }
        if (!prod.estado_activo) {
          throw new BadRequestException(`"${prod.nombre}" no está disponible`);
        }
        if (prod.cantidad_stock < l.cantidad) {
          throw new BadRequestException(
            `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.cantidad_stock}, solicitado: ${l.cantidad}`,
          );
        }
      }

      if (pedido.estado_pedido === EstadoPedido.PENDIENTE) {
        // En PENDIENTE: modificación completa (agregar, editar cantidades/notas, eliminar)
        const idsAEliminar = pedido.detalles
          .filter((d) => !lineasSolicitadas.has(d.id_item))
          .map((d) => d.id_detalle);

        if (idsAEliminar.length > 0) {
          await manager.delete(DetallePedido, { id_detalle: In(idsAEliminar) });
        }

        let totalCalculado = 0;

        for (const [idItem, l] of lineasSolicitadas) {
          const prod = productos.find((p) => p.id_item === idItem)!;
          const detalleExistente = pedido.detalles.find((d) => d.id_item === idItem);
          const precioUnitario = detalleExistente ? detalleExistente.precio_unitario : prod.precio_venta;
          totalCalculado += l.cantidad * precioUnitario;

          if (detalleExistente) {
            detalleExistente.cantidad = l.cantidad;
            detalleExistente.notas_especiales = l.notas_especiales?.trim() || null;
            detalleExistente.promocion_aplicada = l.promocion_aplicada?.trim() || null;
            await manager.save(detalleExistente);
          } else {
            const nuevoDetalle = manager.create(DetallePedido, {
              id_pedido: pedido.id_pedido,
              id_item: idItem,
              cantidad: l.cantidad,
              precio_unitario: precioUnitario,
              notas_especiales: l.notas_especiales?.trim() || null,
              promocion_aplicada: l.promocion_aplicada?.trim() || null,
            });
            await manager.save(nuevoDetalle);
          }
        }

        if (totalCalculado > INT_MAX) {
          throw new BadRequestException('El total del pedido supera el máximo permitido');
        }

        pedido.total_calculado = totalCalculado;
        await manager.save(pedido);

      } else if (pedido.estado_pedido === EstadoPedido.EN_PREPARACION) {
        // En EN_PREPARACION: solo adición de productos o aumento de cantidad.
        // No se permite eliminar ni reducir ítems ya enviados a cocina.
        const existenciasPorItem = new Map<number, number>();
        for (const d of pedido.detalles) {
          existenciasPorItem.set(d.id_item, (existenciasPorItem.get(d.id_item) ?? 0) + Number(d.cantidad));
        }

        for (const [idItem, cantidadExistente] of existenciasPorItem) {
          const nuevaLinea = lineasSolicitadas.get(idItem);
          if (!nuevaLinea || nuevaLinea.cantidad < cantidadExistente) {
            const prod = productos.find((p) => p.id_item === idItem);
            throw new BadRequestException(
              `El pedido está En preparación. No se pueden eliminar ni reducir productos ya enviados a cocina ("${prod?.nombre ?? idItem}").`,
            );
          }
        }

        const adicionesParaComanda: { id_item: number; cantidad: number; precio_unitario: number; notas?: string; promo?: string }[] = [];
        let totalCalculado = 0;

        for (const [idItem, l] of lineasSolicitadas) {
          const prod = productos.find((p) => p.id_item === idItem)!;
          const cantidadExistente = existenciasPorItem.get(idItem) ?? 0;
          const cantidadAdicional = l.cantidad - cantidadExistente;

          totalCalculado += l.cantidad * prod.precio_venta;

          if (cantidadAdicional > 0) {
            adicionesParaComanda.push({
              id_item: idItem,
              cantidad: cantidadAdicional,
              precio_unitario: prod.precio_venta,
              notas: l.notas_especiales,
              promo: l.promocion_aplicada,
            });
          }
        }

        if (totalCalculado > INT_MAX) {
          throw new BadRequestException('El total del pedido supera el máximo permitido');
        }

        pedido.total_calculado = totalCalculado;
        await manager.save(pedido);

        // Si hay productos recién agregados o cantidades incrementadas,
        // generar comanda de adición para cocina con solo los ítems adicionales
        if (adicionesParaComanda.length > 0) {
          const comandaAdicion = await manager.save(
            manager.create(Comanda, {
              id_pedido: pedido.id_pedido,
              estado_impresion: EstadoImpresionComanda.PENDIENTE,
            }),
          );

          for (const adic of adicionesParaComanda) {
            const nuevoDetalle = manager.create(DetallePedido, {
              id_pedido: pedido.id_pedido,
              id_item: adic.id_item,
              cantidad: adic.cantidad,
              precio_unitario: adic.precio_unitario,
              notas_especiales: adic.notas?.trim() || null,
              promocion_aplicada: adic.promo?.trim() || null,
              id_comanda: comandaAdicion.id_comanda,
            });
            await manager.save(nuevoDetalle);
          }
        }
      }
    });

    return this.buscarPorId(idPedido);
  }

  // =========================================================================
  // HU-3.6 ANULACIÓN / CANCELACIÓN DE PEDIDO
  // =========================================================================
  async anular(
    idPedido: number,
    dto: AnularPedidoDto,
    idUsuario: number,
  ): Promise<Pedido> {
    const motivoLimpio = dto.motivo?.trim();
    if (!motivoLimpio) {
      throw new BadRequestException('El motivo de anulación es obligatorio y no puede consistir únicamente de espacios.');
    }

    await this.dataSource.transaction(async (manager) => {
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido: idPedido },
        lock: { mode: 'pessimistic_write' },
      });

      if (!pedido) {
        throw new NotFoundException(`El pedido #${idPedido} no existe`);
      }

      if (pedido.estado_pedido === EstadoPedido.ANULADO) {
        throw new BadRequestException(`El pedido #${idPedido} ya se encuentra anulado.`);
      }

      if (pedido.estado_pedido === EstadoPedido.PAGADO) {
        throw new BadRequestException(
          `El pedido #${idPedido} ya fue pagado. La anulación ordinaria está bloqueada para preservar la integridad de los movimientos financieros.`,
        );
      }

      const pagoExistente = await manager.findOne(MovimientoFinanciero, {
        where: { id_pedido: idPedido, tipo_movimiento: TipoMovimientoFinanciero.INGRESO },
      });
      if (pagoExistente) {
        throw new BadRequestException(
          `El pedido #${idPedido} tiene movimientos de pago registrados y no admite anulación ordinaria.`,
        );
      }

      const ahora = new Date();
      pedido.estado_pedido = EstadoPedido.ANULADO;
      pedido.motivo_anulacion = motivoLimpio;
      pedido.id_usuario_anulacion = idUsuario;
      pedido.fecha_anulacion = ahora;
      await manager.save(pedido);

      await manager.query(
        `INSERT INTO pedidos_anulaciones (id_pedido, id_usuario, motivo, fecha_hora)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id_pedido) DO NOTHING`,
        [idPedido, idUsuario, motivoLimpio, ahora],
      );
    });

    return this.buscarPorId(idPedido);
  }

  // --- MÁQUINA DE ESTADOS ---
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
      [EstadoPedido.PENDIENTE]: [EstadoPedido.EN_PREPARACION, EstadoPedido.PAGADO, EstadoPedido.ANULADO],
      [EstadoPedido.EN_PREPARACION]: [EstadoPedido.LISTO, EstadoPedido.ANULADO],
      [EstadoPedido.LISTO]: [EstadoPedido.ENTREGADO, EstadoPedido.ANULADO],
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
