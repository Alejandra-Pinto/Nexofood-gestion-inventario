import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { ItemInventario, TipoItem } from '../products/entities/item-inventario.entity';
import {
  AdicionalSeleccionadoDto,
  CANTIDAD_MAXIMA,
  CreatePedidoDto,
  DetallePedidoDto,
  MAX_CANTIDAD_ADICIONAL,
  MAX_NOTA,
} from './dto/create-pedido.dto';
import { CotizarPedidoDto } from './dto/cotizar-pedido.dto';
import { ModificarPedidoDto } from './dto/modificar-pedido.dto';
import { AnularPedidoDto } from './dto/anular-pedido.dto';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { Adicional, TipoAdicional } from './entities/adicional.entity';
import { Promocion, TipoPromocion } from './entities/promocion.entity';
import { PedidoItemAdicional } from './entities/pedido-item-adicional.entity';
import {
  calcularPrecioUnitario,
  calcularSubtotal,
  claveLinea,
  esLineaConfigurada,
  lineasCocina,
  normalizarNota,
  precioConPromocion,
  promocionVigente,
} from './configuracion-linea';
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

// ---------------------------------------------------------------------------
// HU-3.2 · Tipos de respuesta de GET /orders/opciones y POST /orders/cotizar
// ---------------------------------------------------------------------------

/** Códigos de error que el frontend usa para mostrar la tarjeta correcta */
export const CODIGO_STOCK_INSUFICIENTE = 'STOCK_INSUFICIENTE';
export const CODIGO_PROMOCION_NO_VIGENTE = 'PROMOCION_NO_VIGENTE';

export interface OpcionAdicional {
  id_adicional: number;
  nombre: string;
  tipo: TipoAdicional;
  descripcion: string | null;
  precio_adicional: number;
  id_categoria: number | null;
  id_insumo: number | null;
  insumo: string | null;
  cantidad_insumo: number;
  /** Unidades del insumo en stock (null = sin control de stock) */
  stock_disponible: number | null;
  disponible: boolean;
}

export interface OpcionPromocion {
  id_promocion: number;
  nombre: string;
  descripcion: string | null;
  tipo: TipoPromocion;
  precio_final: number | null;
  recargo: number;
  porcentaje_descuento: number;
  id_categoria: number | null;
  id_insumo: number | null;
  insumo: string | null;
  cantidad_insumo: number;
  stock_disponible: number | null;
  disponible: boolean;
  vigente_hasta: Date;
}

export interface OpcionesPedido {
  adicionales: OpcionAdicional[];
  /** Solo promociones activas y vigentes en este momento */
  promociones: OpcionPromocion[];
}

export interface AdicionalLinea {
  id_adicional: number;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

export interface LineaCotizada {
  id_item: number;
  nombre: string;
  cantidad: number;
  precio_base: number;
  precio_unitario: number;
  subtotal: number;
  id_promocion: number | null;
  promocion_aplicada: string | null;
  notas_especiales: string | null;
  adicionales: AdicionalLinea[];
  lineas_cocina: string[];
}

export interface ResultadoCotizacion {
  lineas: LineaCotizada[];
  total: number;
}

/** Línea del pedido ya validada y con su precio calculado */
interface LineaPreparada {
  producto: ItemInventario;
  cantidad: number;
  precio_base: number;
  precio_unitario: number;
  subtotal: number;
  promocion: Promocion | null;
  notas_especiales: string | null;
  adicionales: AdicionalLinea[];
}

/** Línea pedida (agrupada por clave), antes de consultar la BD */
interface LineaSolicitada {
  id_item: number;
  cantidad: number;
  adicionales: { id_adicional: number; cantidad: number }[];
  id_promocion: number | null;
  notas: string | null;
}

const INT_MAX = 2_147_483_647;

/** 1.5 -> "1.5", 8 -> "8" (cantidades de insumo para los mensajes) */
const formatoCantidad = (n: number) => String(Math.round(n * 1000) / 1000);

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
    private readonly dataSource: DataSource,
  ) {}

  async crear(dto: CreatePedidoDto, idMesero: number): Promise<Pedido> {
    // SCRUM-149: pedido vacío se rechaza sin tocar la BD
    if (!dto?.detalles?.length) throw new BadRequestException('El pedido debe tener al menos un producto');
    this.agruparLineas(dto.detalles);

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

      // HU-3.2: valida productos, adicionales, promociones y stock; calcula precios
      const lineas = await this.prepararLineas(manager, dto.detalles, true);
      const total = lineas.reduce((s, l) => s + l.subtotal, 0);
      if (total > INT_MAX) throw new BadRequestException('El total del pedido supera el máximo permitido');

      const pedido = await manager.save(
        manager.create(Pedido, {
          id_mesero: idMesero,
          numero_mesa: mesa,
          estado_pedido: EstadoPedido.PENDIENTE,
          total_calculado: total,
        }),
      );

      // SCRUM-154: la comanda inicial SIEMPRE nace PENDIENTE (la imprime el agente Electron)
      const comanda = await manager.save(
        manager.create(Comanda, {
          id_pedido: pedido.id_pedido,
          estado_impresion: EstadoImpresionComanda.PENDIENTE,
        }),
      );

      for (const l of lineas) {
        const detalle = await manager.save(
          manager.create(DetallePedido, {
            id_pedido: pedido.id_pedido,
            id_item: l.producto.id_item,
            cantidad: l.cantidad,
            precio_unitario: l.precio_unitario,
            notas_especiales: l.notas_especiales,
            promocion_aplicada: l.promocion?.nombre ?? null,
            id_comanda: comanda.id_comanda,
          }),
        );

        // SCRUM-152: adicionales de la línea, con precio y nombre congelados
        if (l.adicionales.length > 0) {
          await manager.save(
            l.adicionales.map((a) =>
              manager.create(PedidoItemAdicional, {
                id_detalle: detalle.id_detalle,
                id_adicional: a.id_adicional,
                cantidad: a.cantidad,
                precio_unitario: a.precio_unitario,
                nombre_adicional: a.nombre,
              }),
            ),
          );
        }
      }

      return pedido.id_pedido;
    }).catch((e: unknown) => {
      if (e instanceof QueryFailedError && (e as QueryFailedError & { code?: string }).code === '23505') {
        throw new ConflictException(`La mesa ${mesa} ya tiene un pedido activo`);
      }
      throw e;
    });

    return this.buscarPorId(idPedido);
  }

  // =========================================================================
  // HU-3.2 ADICIONALES, PROMOCIONES, COMBOS Y NOTAS
  // =========================================================================

  /**
   * GET /orders/opciones · SCRUM-151
   * Catálogo para el wizard "Nuevo choripán": adicionales activos (con el stock
   * de su insumo) y SOLO las promociones vigentes en este momento.
   */
  async opciones(ahora: Date = new Date()): Promise<OpcionesPedido> {
    const manager = this.dataSource.manager;
    const [adicionales, promociones] = await Promise.all([
      manager.find(Adicional, {
        where: { estado_activo: true },
        relations: { insumo: true },
        order: { tipo: 'ASC', orden: 'ASC', nombre: 'ASC' },
      }),
      manager.find(Promocion, {
        where: { estado_activo: true },
        relations: { insumo: true },
        order: { nombre: 'ASC' },
      }),
    ]);

    const stockDe = (insumo?: ItemInventario | null) =>
      insumo ? (insumo.estado_activo ? Number(insumo.cantidad_stock) : 0) : null;

    return {
      adicionales: adicionales.map((a) => {
        const stock = stockDe(a.insumo);
        const cantidadInsumo = Number(a.cantidad_insumo);
        return {
          id_adicional: a.id_adicional,
          nombre: a.nombre,
          tipo: a.tipo,
          descripcion: a.descripcion ?? null,
          precio_adicional: Number(a.precio_adicional),
          id_categoria: a.id_categoria ?? null,
          id_insumo: a.id_insumo ?? null,
          insumo: a.insumo?.nombre ?? null,
          cantidad_insumo: cantidadInsumo,
          stock_disponible: stock,
          disponible: stock === null || stock >= cantidadInsumo,
        };
      }),
      promociones: promociones
        .filter((p) => promocionVigente(p, ahora))
        .map((p) => {
          const stock = stockDe(p.insumo);
          const cantidadInsumo = Number(p.cantidad_insumo);
          return {
            id_promocion: p.id_promocion,
            nombre: p.nombre,
            descripcion: p.descripcion ?? null,
            tipo: p.tipo,
            precio_final: p.precio_final === null || p.precio_final === undefined ? null : Number(p.precio_final),
            recargo: Number(p.recargo ?? 0),
            porcentaje_descuento: Number(p.porcentaje_descuento ?? 0),
            id_categoria: p.id_categoria ?? null,
            id_insumo: p.id_insumo ?? null,
            insumo: p.insumo?.nombre ?? null,
            cantidad_insumo: cantidadInsumo,
            stock_disponible: stock,
            disponible: stock === null || stock >= cantidadInsumo,
            vigente_hasta: p.vigente_hasta,
          };
        }),
    };
  }

  /**
   * POST /orders/cotizar · SCRUM-152 / SCRUM-155
   * Calcula el precio de cada línea con las MISMAS reglas que crear(), sin guardar.
   * Lanza 400 STOCK_INSUFICIENTE o 422 PROMOCION_NO_VIGENTE igual que crear().
   */
  async cotizar(dto: CotizarPedidoDto): Promise<ResultadoCotizacion> {
    if (!dto?.detalles?.length) throw new BadRequestException('Debe enviar al menos un producto para cotizar');
    const lineas = await this.prepararLineas(this.dataSource.manager, dto.detalles, false);

    const cotizadas = lineas.map<LineaCotizada>((l) => ({
      id_item: l.producto.id_item,
      nombre: l.producto.nombre,
      cantidad: l.cantidad,
      precio_base: l.precio_base,
      precio_unitario: l.precio_unitario,
      subtotal: l.subtotal,
      id_promocion: l.promocion?.id_promocion ?? null,
      promocion_aplicada: l.promocion?.nombre ?? null,
      notas_especiales: l.notas_especiales,
      adicionales: l.adicionales,
      lineas_cocina: lineasCocina({
        cantidad: l.cantidad,
        item: l.producto,
        notas_especiales: l.notas_especiales,
        promocion_aplicada: l.promocion?.nombre ?? null,
        adicionales: l.adicionales.map((a) => ({ cantidad: a.cantidad, nombre_adicional: a.nombre })),
      }),
    }));

    const total = cotizadas.reduce((s, l) => s + l.subtotal, 0);
    if (total > INT_MAX) throw new BadRequestException('El total del pedido supera el máximo permitido');
    return { lineas: cotizadas, total };
  }

  /**
   * Núcleo de HU-3.2: valida cada línea y calcula su precio.
   *   1. Producto vendible, activo y con stock (sumando todas sus líneas).
   *   2. Adicionales existentes, activos y aplicables a la categoría del producto.
   *   3. Promoción existente y VIGENTE (si no: 422 PROMOCION_NO_VIGENTE).
   *   4. Stock de los insumos que consumen adicionales y combos, sumando TODO
   *      el pedido (si no alcanza: 400 STOCK_INSUFICIENTE con disponible/requerido).
   *   5. Precio unitario = precio con promoción + Σ adicionales; subtotal = × cantidad.
   */
  private async prepararLineas(
    manager: EntityManager,
    detalles: DetallePedidoDto[],
    bloquear: boolean,
  ): Promise<LineaPreparada[]> {
    const solicitadas = this.agruparLineas(detalles);

    const idsAdicionales = [...new Set(solicitadas.flatMap((l) => l.adicionales.map((a) => a.id_adicional)))];
    const idsPromociones = [
      ...new Set(solicitadas.map((l) => l.id_promocion).filter((id): id is number => id !== null)),
    ];

    const adicionales = idsAdicionales.length
      ? await manager.find(Adicional, { where: { id_adicional: In(idsAdicionales) } })
      : [];
    const promociones = idsPromociones.length
      ? await manager.find(Promocion, { where: { id_promocion: In(idsPromociones) } })
      : [];

    // Productos + insumos de adicionales y combos en UNA consulta (bloqueados al crear)
    const idsItems = [
      ...new Set([
        ...solicitadas.map((l) => l.id_item),
        ...adicionales.map((a) => a.id_insumo),
        ...promociones.map((p) => p.id_insumo),
      ].filter((id): id is number => typeof id === 'number')),
    ];
    const items = await manager.find(ItemInventario, {
      where: { id_item: In(idsItems) },
      ...(bloquear ? { lock: { mode: 'pessimistic_read' as const } } : {}),
    });
    const itemPorId = new Map(items.map((i) => [i.id_item, i]));

    const ahora = new Date();
    const cantidadPorProducto = new Map<number, number>();
    const requeridoPorInsumo = new Map<number, { requerido: number; usos: Set<string> }>();
    const requerir = (idInsumo: number | null, cantidad: number, uso: string) => {
      if (idInsumo === null || idInsumo === undefined) return;
      const r = requeridoPorInsumo.get(idInsumo) ?? { requerido: 0, usos: new Set<string>() };
      r.requerido += cantidad;
      r.usos.add(uso);
      requeridoPorInsumo.set(idInsumo, r);
    };

    const preparadas = solicitadas.map<LineaPreparada>((l) => {
      // 1. Producto
      const producto = itemPorId.get(l.id_item);
      if (!producto) throw new NotFoundException(`El producto con id ${l.id_item} no existe`);
      if (producto.tipo_item !== TipoItem.PRODUCTO) {
        throw new BadRequestException(`"${producto.nombre}" es un insumo y no se puede vender en un pedido`);
      }
      if (!producto.estado_activo) throw new BadRequestException(`"${producto.nombre}" no está disponible`);
      cantidadPorProducto.set(producto.id_item, (cantidadPorProducto.get(producto.id_item) ?? 0) + l.cantidad);

      // 2. Adicionales
      let panes = 0;
      const adicionalesLinea = l.adicionales.map<AdicionalLinea>((sel) => {
        const a = adicionales.find((x) => x.id_adicional === sel.id_adicional);
        if (!a) throw new NotFoundException(`El adicional con id ${sel.id_adicional} no existe`);
        if (!a.estado_activo) throw new BadRequestException(`El adicional "${a.nombre}" no está disponible`);
        if (a.id_categoria !== null && a.id_categoria !== undefined && a.id_categoria !== producto.id_categoria) {
          throw new BadRequestException(`El adicional "${a.nombre}" no aplica a "${producto.nombre}"`);
        }
        if (a.tipo === TipoAdicional.PAN && ++panes > 1) {
          throw new BadRequestException(`Solo se puede elegir un tipo de pan para "${producto.nombre}"`);
        }
        requerir(a.id_insumo, Number(a.cantidad_insumo) * sel.cantidad * l.cantidad, a.nombre);
        return {
          id_adicional: a.id_adicional,
          nombre: a.nombre,
          cantidad: sel.cantidad,
          precio_unitario: Number(a.precio_adicional),
        };
      });

      // 3. Promoción / combo
      let promocion: Promocion | null = null;
      if (l.id_promocion !== null) {
        const p = promociones.find((x) => x.id_promocion === l.id_promocion);
        if (!p) throw new NotFoundException(`La promoción con id ${l.id_promocion} no existe`);
        if (!promocionVigente(p, ahora)) {
          throw new UnprocessableEntityException({
            statusCode: 422,
            error: 'Unprocessable Entity',
            codigo: CODIGO_PROMOCION_NO_VIGENTE,
            id_promocion: p.id_promocion,
            promocion: p.nombre,
            message: `La promoción "${p.nombre}" no está vigente y no se aplicó al pedido`,
          });
        }
        if (p.id_categoria !== null && p.id_categoria !== undefined && p.id_categoria !== producto.id_categoria) {
          throw new BadRequestException(`La promoción "${p.nombre}" no aplica a "${producto.nombre}"`);
        }
        requerir(p.id_insumo, Number(p.cantidad_insumo) * l.cantidad, p.nombre);
        promocion = p;
      }

      // 5. Precio
      const precioBase = Number(producto.precio_venta);
      const precioUnitario = calcularPrecioUnitario(precioBase, adicionalesLinea, promocion);
      return {
        producto,
        cantidad: l.cantidad,
        precio_base: precioConPromocion(precioBase, promocion),
        precio_unitario: precioUnitario,
        subtotal: calcularSubtotal(precioUnitario, l.cantidad),
        promocion,
        notas_especiales: l.notas,
        adicionales: adicionalesLinea,
      };
    });

    // 4. Stock del producto (todas sus líneas juntas)
    for (const [idItem, cantidad] of cantidadPorProducto) {
      const producto = itemPorId.get(idItem)!;
      const disponible = Number(producto.cantidad_stock);
      if (disponible < cantidad) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          codigo: CODIGO_STOCK_INSUFICIENTE,
          id_item: idItem,
          insumo: producto.nombre,
          disponible,
          requerido: cantidad,
          message: `Stock insuficiente para "${producto.nombre}". Disponible: ${disponible}, solicitado: ${cantidad}`,
        });
      }
    }

    // 4. Stock de insumos de adicionales y combos (SCRUM-155, prototipo 21)
    for (const [idInsumo, r] of requeridoPorInsumo) {
      const insumo = itemPorId.get(idInsumo);
      const disponible = insumo?.estado_activo ? Number(insumo.cantidad_stock) : 0;
      if (disponible < r.requerido) {
        const nombre = insumo?.nombre ?? `Insumo #${idInsumo}`;
        throw new BadRequestException({
          statusCode: 400,
          error: 'Bad Request',
          codigo: CODIGO_STOCK_INSUFICIENTE,
          id_item: idInsumo,
          insumo: nombre,
          adicionales: [...r.usos],
          disponible,
          requerido: r.requerido,
          message:
            `${nombre} sin existencias suficientes. Quedan ${formatoCantidad(disponible)} unidades ` +
            `y el pedido requiere ${formatoCantidad(r.requerido)}. No se puede agregar al pedido.`,
        });
      }
    }

    return preparadas;
  }

  /**
   * Agrupa las líneas pedidas: el mismo producto con los mismos adicionales,
   * promoción y nota se suma en una sola línea; si algo cambia, son líneas distintas.
   */
  private agruparLineas(detalles: DetallePedidoDto[]): LineaSolicitada[] {
    if (!detalles?.length) throw new BadRequestException('El pedido debe tener al menos un producto');

    const porClave = new Map<string, LineaSolicitada>();
    for (const d of detalles) {
      if (!Number.isInteger(d.id_item) || d.id_item <= 0) throw new BadRequestException('El id del producto es obligatorio');
      if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) {
        throw new BadRequestException('La cantidad debe ser un número entero mayor a 0');
      }

      const notas = normalizarNota(d.notas_especiales);
      if (notas && notas.length > MAX_NOTA) {
        throw new BadRequestException(`Las notas especiales admiten máximo ${MAX_NOTA} caracteres`);
      }

      const idPromocion = d.id_promocion ?? null;
      if (idPromocion !== null && (!Number.isInteger(idPromocion) || idPromocion <= 0)) {
        throw new BadRequestException('El id de la promoción no es válido');
      }

      const adicionales = this.unificarAdicionales(d.adicionales);
      const clave = claveLinea(d.id_item, adicionales, idPromocion, notas);
      const actual = porClave.get(clave);
      if (actual) actual.cantidad += d.cantidad;
      else porClave.set(clave, { id_item: d.id_item, cantidad: d.cantidad, adicionales, id_promocion: idPromocion, notas });
    }

    const lineas = [...porClave.values()];
    if (lineas.some((l) => l.cantidad > CANTIDAD_MAXIMA)) {
      throw new BadRequestException(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA}`);
    }
    return lineas;
  }

  /** Suma adicionales repetidos en la misma línea y valida sus cantidades */
  private unificarAdicionales(lista?: AdicionalSeleccionadoDto[]): { id_adicional: number; cantidad: number }[] {
    const porId = new Map<number, number>();
    for (const a of lista ?? []) {
      const cantidad = a.cantidad ?? 1;
      if (!Number.isInteger(a.id_adicional) || a.id_adicional <= 0) {
        throw new BadRequestException('El id del adicional es obligatorio');
      }
      if (!Number.isInteger(cantidad) || cantidad <= 0) {
        throw new BadRequestException('La cantidad del adicional debe ser un número entero mayor a 0');
      }
      porId.set(a.id_adicional, (porId.get(a.id_adicional) ?? 0) + cantidad);
    }
    const unificados = [...porId].map(([id_adicional, cantidad]) => ({ id_adicional, cantidad }));
    if (unificados.some((a) => a.cantidad > MAX_CANTIDAD_ADICIONAL)) {
      throw new BadRequestException(`La cantidad máxima de un adicional es ${MAX_CANTIDAD_ADICIONAL}`);
    }
    return unificados;
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
      relations: { detalles: { item: true, adicionales: true }, mesero: true, usuario_anulacion: true },
      order: { fecha_hora: 'DESC' },
      take: 100,
    });
  }

  async buscarPorId(id: number): Promise<Pedido> {
    const pedido = await this.pedidosRepo.findOne({
      where: { id_pedido: id },
      relations: {
        detalles: { item: true, adicionales: true },
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

      const todosLosDetalles = await manager.find(DetallePedido, {
        where: { id_pedido: idPedido },
        relations: { item: true, adicionales: true },
        order: { id_detalle: 'ASC' },
      });

      // HU-3.2: las líneas con adicionales o promoción se conservan tal cual
      // (precio congelado). Aquí solo se editan las líneas simples.
      const lineasConfiguradas = todosLosDetalles.filter((d) => esLineaConfigurada(d));
      const totalConfiguradas = lineasConfiguradas.reduce(
        (s, d) => s + Number(d.cantidad) * Number(d.precio_unitario),
        0,
      );
      pedido.detalles = todosLosDetalles.filter((d) => !esLineaConfigurada(d));

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

        let totalCalculado = totalConfiguradas;

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
        let totalCalculado = totalConfiguradas;

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
}
