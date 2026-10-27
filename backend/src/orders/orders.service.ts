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
  CambioComanda,
  calcularCambios,
  etiquetaLineaConfigurada,
  resumirLineaConfigurada,
  resumirLineas,
} from './cambios-comanda';
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
/** HU-4.3 · SCRUM-183 */
export const CODIGO_PEDIDO_NO_MODIFICABLE = 'PEDIDO_NO_MODIFICABLE';

/** HU-4.3 · SCRUM-183: estados en los que el pedido ya no se puede modificar */
export const ESTADOS_NO_MODIFICABLES: EstadoPedido[] = [
  EstadoPedido.LISTO,
  EstadoPedido.ENTREGADO,
  EstadoPedido.PAGADO,
  EstadoPedido.ANULADO,
];

const ETIQUETA_ESTADO_PEDIDO: Record<EstadoPedido, string> = {
  [EstadoPedido.PENDIENTE]: 'Pendiente',
  [EstadoPedido.EN_PREPARACION]: 'En preparación',
  [EstadoPedido.LISTO]: 'Listo para entrega',
  [EstadoPedido.ENTREGADO]: 'Entregado',
  [EstadoPedido.PAGADO]: 'Pagado',
  [EstadoPedido.ANULADO]: 'Anulado',
};

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
          version: 1, // HU-4.3: primera versión de la comanda
          cambios: [],
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
  // HU-4.3 ACTUALIZAR COMANDA ANTE MODIFICACIONES (SCRUM-181 / 182 / 183)
  // =========================================================================

  /**
   * SCRUM-183: un pedido listo, entregado, pagado o anulado ya no se modifica.
   * Responde 422 con codigo PEDIDO_NO_MODIFICABLE para que el frontend
   * deshabilite la edición y explique el motivo.
   */
  private asegurarModificable(pedido: Pedido): void {
    if (!ESTADOS_NO_MODIFICABLES.includes(pedido.estado_pedido)) return;
    throw new UnprocessableEntityException({
      statusCode: 422,
      error: 'Unprocessable Entity',
      codigo: CODIGO_PEDIDO_NO_MODIFICABLE,
      estado_pedido: pedido.estado_pedido,
      message: `El pedido #${pedido.id_pedido} está ${ETIQUETA_ESTADO_PEDIDO[pedido.estado_pedido]} y ya no admite modificaciones.`,
    });
  }

  /**
   * Modifica el pedido. Todas las líneas son editables:
   *   - Líneas simples: se agrupan por producto (cantidad total + nota).
   *   - Líneas con adicionales, combo o promoción (HU-3.2): se identifican por
   *     id_detalle. Se cambia su cantidad, su nota y, si se envían
   *     `adicionales` / `id_promocion`, su configuración: se sincroniza
   *     pedido_item_adicional (se borran los desmarcados y se insertan los
   *     nuevos) y se recalcula el precio unitario con el catálogo actual.
   *   - Líneas nuevas con adicionales o combo (sin id_detalle): se crean como
   *     en "Nuevo choripán".
   *
   *   PENDIENTE      -> agregar, quitar, cambiar cantidades, notas y adicionales.
   *   EN_PREPARACION -> agregar, aumentar, cambiar notas y adicionales/formato
   *                     (no se reducen las unidades ya enviadas a cocina).
   * HU-4.3: si hubo cambios, se genera la comanda vN+1 (PENDIENTE) con el pedido
   * completo y la lista de cambios; la versión anterior sin imprimir queda REEMPLAZADA.
   */
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
      // El bloqueo del pedido serializa las modificaciones: dos versiones no chocan
      const pedido = await manager.findOne(Pedido, {
        where: { id_pedido: idPedido },
        lock: { mode: 'pessimistic_write' },
      });
      if (!pedido) throw new NotFoundException(`El pedido #${idPedido} no existe`);

      // SCRUM-183: se valida ANTES de leer o escribir cualquier otra cosa
      this.asegurarModificable(pedido);

      const todosLosDetalles = await manager.find(DetallePedido, {
        where: { id_pedido: idPedido },
        relations: { item: true, adicionales: true },
        order: { id_detalle: 'ASC' },
      });

      const configuradas = todosLosDetalles.filter((d) => esLineaConfigurada(d));
      const editables = todosLosDetalles.filter((d) => !esLineaConfigurada(d));
      const antes = [...resumirLineas(editables), ...configuradas.map((d) => resumirLineaConfigurada(d))];

      // -----------------------------------------------------------------------
      // 1. Clasificar lo solicitado
      // -----------------------------------------------------------------------
      type Seleccion = { id_adicional: number; cantidad: number };
      const solicitadas = new Map<number, { cantidad: number; nota: string | null }>();
      const configSolicitadas = new Map<
        number,
        { cantidad: number; nota: string | null; adicionales?: Seleccion[]; id_promocion?: number | null }
      >();
      const nuevasSolicitadas: {
        id_item: number;
        cantidad: number;
        nota: string | null;
        adicionales: Seleccion[];
        id_promocion: number | null;
      }[] = [];

      for (const d of dto.detalles) {
        if (!Number.isInteger(d.cantidad) || d.cantidad <= 0) {
          throw new BadRequestException('La cantidad debe ser un número entero mayor a 0');
        }
        if (d.cantidad > CANTIDAD_MAXIMA) {
          throw new BadRequestException(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA}`);
        }
        const nota = normalizarNota(d.notas_especiales);
        if (nota && nota.length > MAX_NOTA) {
          throw new BadRequestException(`Las notas especiales admiten máximo ${MAX_NOTA} caracteres`);
        }
        const traeConfig = d.adicionales !== undefined || d.id_promocion !== undefined;
        if (d.id_promocion !== undefined && d.id_promocion !== null && (!Number.isInteger(d.id_promocion) || d.id_promocion <= 0)) {
          throw new BadRequestException('El id de la promoción no es válido');
        }

        if (d.id_detalle !== undefined && d.id_detalle !== null) {
          const fila = todosLosDetalles.find((x) => x.id_detalle === d.id_detalle);
          if (!fila) throw new NotFoundException(`La línea #${d.id_detalle} no pertenece al pedido #${idPedido}`);
          if (fila.id_item !== d.id_item) {
            throw new BadRequestException(`La línea #${d.id_detalle} no corresponde al producto ${d.id_item}`);
          }
          if (esLineaConfigurada(fila)) {
            if (configSolicitadas.has(d.id_detalle)) {
              throw new BadRequestException(`La línea #${d.id_detalle} viene repetida`);
            }
            configSolicitadas.set(d.id_detalle, {
              cantidad: d.cantidad,
              nota,
              ...(d.adicionales !== undefined ? { adicionales: this.unificarAdicionales(d.adicionales) } : {}),
              ...(d.id_promocion !== undefined ? { id_promocion: d.id_promocion } : {}),
            });
            continue;
          }
          if (traeConfig) {
            throw new BadRequestException(
              `La línea #${d.id_detalle} no tiene adicionales: para agregárselos envíela como línea nueva (sin id_detalle)`,
            );
          }
        }

        // Línea nueva con adicionales o combo
        if ((d.adicionales?.length ?? 0) > 0 || (d.id_promocion ?? null) !== null) {
          nuevasSolicitadas.push({
            id_item: d.id_item,
            cantidad: d.cantidad,
            nota,
            adicionales: this.unificarAdicionales(d.adicionales),
            id_promocion: d.id_promocion ?? null,
          });
          continue;
        }

        if (d.promocion_aplicada?.trim()) {
          throw new BadRequestException(
            'Las promociones y combos se aplican desde "Nuevo choripán" para validar su vigencia',
          );
        }
        const actual = solicitadas.get(d.id_item);
        const cantidad = (actual?.cantidad ?? 0) + d.cantidad;
        if (cantidad > CANTIDAD_MAXIMA) {
          throw new BadRequestException(`La cantidad máxima por producto es ${CANTIDAD_MAXIMA}`);
        }
        solicitadas.set(d.id_item, { cantidad, nota: nota ?? actual?.nota ?? null });
      }

      // -----------------------------------------------------------------------
      // 2. Catálogo de adicionales y promociones involucrados
      // -----------------------------------------------------------------------
      const seleccionActual = (f: DetallePedido): Seleccion[] =>
        (f.adicionales ?? []).map((a) => ({ id_adicional: a.id_adicional, cantidad: Number(a.cantidad ?? 1) }));

      const idsAdicionales = new Set<number>();
      const idsPromociones = new Set<number>();
      const nombresPromo = new Set<string>();
      for (const f of configuradas) {
        const req = configSolicitadas.get(f.id_detalle);
        if (!req) continue;
        for (const a of req.adicionales ?? seleccionActual(f)) idsAdicionales.add(a.id_adicional);
        if (typeof req.id_promocion === 'number') idsPromociones.add(req.id_promocion);
        if (f.promocion_aplicada) nombresPromo.add(f.promocion_aplicada);
      }
      for (const n of nuevasSolicitadas) {
        for (const a of n.adicionales) idsAdicionales.add(a.id_adicional);
        if (n.id_promocion !== null) idsPromociones.add(n.id_promocion);
      }

      const adicionalesCatalogo = idsAdicionales.size
        ? await manager.find(Adicional, { where: { id_adicional: In([...idsAdicionales]) } })
        : [];
      const promosPorId = idsPromociones.size
        ? await manager.find(Promocion, { where: { id_promocion: In([...idsPromociones]) } })
        : [];
      const promosPorNombre = nombresPromo.size
        ? await manager.find(Promocion, { where: { nombre: In([...nombresPromo]) } })
        : [];
      const buscarPromo = (id: number) => {
        const p = promosPorId.find((x) => x.id_promocion === id);
        if (!p) throw new NotFoundException(`La promoción con id ${id} no existe`);
        return p;
      };

      // Estado final de cada línea configurada (existente o nueva)
      interface ConfigFinal {
        fila?: DetallePedido;
        id_item: number;
        cantidad: number;
        nota: string | null;
        seleccion: Seleccion[];
        promo: Promocion | null;
        /** Nombre de la promoción (se conserva aunque ya no esté en el catálogo) */
        promoNombre: string | null;
        adicionalesNuevos: Set<number>;
        promoCambia: boolean;
        configCambia: boolean;
        sube: boolean;
        nueva: boolean;
      }
      const mismaSeleccion = (a: Seleccion[], b: Seleccion[]) =>
        a.length === b.length &&
        a.every((x) => b.some((y) => y.id_adicional === x.id_adicional && y.cantidad === x.cantidad));

      const configFinales: ConfigFinal[] = [];
      for (const f of configuradas) {
        const req = configSolicitadas.get(f.id_detalle);
        if (!req) continue;
        const actual = seleccionActual(f);
        const seleccion = req.adicionales ?? actual;
        const promoActual = promosPorNombre.find((p) => p.nombre === f.promocion_aplicada) ?? null;
        let promo = promoActual;
        let promoNombre = f.promocion_aplicada ?? null;
        let promoCambia = false;
        if (req.id_promocion === null) {
          promoCambia = !!f.promocion_aplicada;
          promo = null;
          promoNombre = null;
        } else if (typeof req.id_promocion === 'number') {
          promo = buscarPromo(req.id_promocion);
          promoCambia = promo.nombre !== f.promocion_aplicada;
          promoNombre = promo.nombre;
        }
        configFinales.push({
          fila: f,
          id_item: f.id_item,
          cantidad: req.cantidad,
          nota: req.nota,
          seleccion,
          promo,
          promoNombre,
          adicionalesNuevos: new Set(
            seleccion.filter((s) => !actual.some((a) => a.id_adicional === s.id_adicional)).map((s) => s.id_adicional),
          ),
          promoCambia,
          configCambia: promoCambia || !mismaSeleccion(seleccion, actual),
          sube: req.cantidad > Number(f.cantidad),
          nueva: false,
        });
      }
      for (const n of nuevasSolicitadas) {
        const promo = n.id_promocion !== null ? buscarPromo(n.id_promocion) : null;
        configFinales.push({
          id_item: n.id_item,
          cantidad: n.cantidad,
          nota: n.nota,
          seleccion: n.adicionales,
          promo,
          promoNombre: promo?.nombre ?? null,
          adicionalesNuevos: new Set(n.adicionales.map((a) => a.id_adicional)),
          promoCambia: promo !== null,
          configCambia: true,
          sube: true,
          nueva: true,
        });
      }

      // -----------------------------------------------------------------------
      // 3. En preparación no se reduce lo que ya está en cocina
      // -----------------------------------------------------------------------
      if (pedido.estado_pedido === EstadoPedido.EN_PREPARACION) {
        for (const f of configuradas) {
          const req = configSolicitadas.get(f.id_detalle);
          if (!req || req.cantidad < Number(f.cantidad)) {
            throw new BadRequestException(
              `El pedido está En preparación. No se pueden eliminar ni reducir productos ya enviados a cocina ("${etiquetaLineaConfigurada(f)}").`,
            );
          }
        }
        // Líneas simples: las unidades del producto pueden pasar a una línea con
        // adicionales (reconfigurar), pero el total del producto no puede bajar
        for (const a of resumirLineas(editables)) {
          const simples = solicitadas.get(a.id_item)?.cantidad ?? 0;
          const comoNuevas = nuevasSolicitadas
            .filter((n) => n.id_item === a.id_item)
            .reduce((s, n) => s + n.cantidad, 0);
          if (simples + comoNuevas < a.cantidad) {
            throw new BadRequestException(
              `El pedido está En preparación. No se pueden eliminar ni reducir productos ya enviados a cocina ("${a.producto}").`,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // 4. Productos e insumos (una sola consulta, bloqueados)
      // -----------------------------------------------------------------------
      const idsInsumos = [
        ...adicionalesCatalogo.map((a) => a.id_insumo),
        ...promosPorId.map((p) => p.id_insumo),
        ...promosPorNombre.map((p) => p.id_insumo),
      ].filter((id): id is number => typeof id === 'number');
      const productos = await manager.find(ItemInventario, {
        where: {
          id_item: In([
            ...new Set([...solicitadas.keys(), ...configFinales.map((c) => c.id_item), ...idsInsumos]),
          ]),
        },
        lock: { mode: 'pessimistic_read' },
      });

      for (const idItem of solicitadas.keys()) {
        const prod = productos.find((p) => p.id_item === idItem);
        if (!prod) throw new NotFoundException(`El producto con id ${idItem} no existe`);
        if (prod.tipo_item !== TipoItem.PRODUCTO) {
          throw new BadRequestException(`"${prod.nombre}" es un insumo y no se puede vender en un pedido`);
        }
        if (!prod.estado_activo) throw new BadRequestException(`"${prod.nombre}" no está disponible`);
      }

      // Validar y poner precio a las líneas configuradas que cambian o son nuevas
      const ahora = new Date();
      const precios = new Map<ConfigFinal, { precio: number; adicionales: AdicionalLinea[] }>();
      for (const c of configFinales) {
        const prod = productos.find((p) => p.id_item === c.id_item);
        if (!prod) throw new NotFoundException(`El producto con id ${c.id_item} no existe`);
        if ((c.nueva || c.sube || c.configCambia) && (!prod.estado_activo || prod.tipo_item !== TipoItem.PRODUCTO)) {
          throw new BadRequestException(`"${prod.nombre}" no está disponible`);
        }
        if (c.configCambia) {
          precios.set(c, this.configurarLinea(prod, c.seleccion, c.promo, adicionalesCatalogo, c.adicionalesNuevos, c.promoCambia, ahora));
        }
      }

      // Stock del producto: todas sus líneas juntas (simples + configuradas)
      const unidades = (lineas: { id_item: number; cantidad: number }[]) => {
        const m = new Map<number, number>();
        for (const l of lineas) m.set(l.id_item, (m.get(l.id_item) ?? 0) + l.cantidad);
        return m;
      };
      const unidadesAntes = unidades(antes);
      const unidadesDespues = unidades([
        ...[...solicitadas].map(([id_item, l]) => ({ id_item, cantidad: l.cantidad })),
        ...configFinales.map((c) => ({ id_item: c.id_item, cantidad: c.cantidad })),
      ]);
      for (const [idItem, total] of unidadesDespues) {
        const prod = productos.find((p) => p.id_item === idItem);
        if (!prod) continue;
        const aumenta = total > (unidadesAntes.get(idItem) ?? 0);
        if ((solicitadas.has(idItem) || aumenta) && Number(prod.cantidad_stock) < total) {
          throw new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            codigo: CODIGO_STOCK_INSUFICIENTE,
            id_item: idItem,
            insumo: prod.nombre,
            disponible: Number(prod.cantidad_stock),
            requerido: total,
            message: `Stock insuficiente para "${prod.nombre}". Disponible: ${prod.cantidad_stock}, solicitado: ${total}`,
          });
        }
      }

      // Stock de insumos: lo que piden TODAS las líneas configuradas; se valida
      // el insumo si alguna línea que lo usa es nueva, aumenta o cambió su configuración
      const requerido = new Map<number, { requerido: number; usos: Set<string> }>();
      const insumosAValidar = new Set<number>();
      for (const c of configFinales) {
        const validar = c.nueva || c.sube || c.configCambia;
        const sumar = (idInsumo: number | null | undefined, cantidad: number, uso: string) => {
          if (idInsumo === null || idInsumo === undefined) return;
          const r = requerido.get(idInsumo) ?? { requerido: 0, usos: new Set<string>() };
          r.requerido += cantidad;
          r.usos.add(uso);
          requerido.set(idInsumo, r);
          if (validar) insumosAValidar.add(idInsumo);
        };
        for (const sel of c.seleccion) {
          const cat = adicionalesCatalogo.find((x) => x.id_adicional === sel.id_adicional);
          if (cat) sumar(cat.id_insumo, Number(cat.cantidad_insumo) * sel.cantidad * c.cantidad, cat.nombre);
        }
        if (c.promo) sumar(c.promo.id_insumo, Number(c.promo.cantidad_insumo) * c.cantidad, c.promo.nombre);
      }
      for (const idInsumo of insumosAValidar) {
        const r = requerido.get(idInsumo)!;
        const insumo = productos.find((p) => p.id_item === idInsumo);
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
              `y el pedido requiere ${formatoCantidad(r.requerido)}. No se puede guardar el cambio.`,
          });
        }
      }

      // -----------------------------------------------------------------------
      // 5. SCRUM-182: ¿qué cambió? (si nada cambió no se escribe ni se genera comanda)
      // -----------------------------------------------------------------------
      const nombreAdicional = (sel: Seleccion, f?: DetallePedido) =>
        adicionalesCatalogo.find((a) => a.id_adicional === sel.id_adicional)?.nombre ??
        f?.adicionales?.find((a) => a.id_adicional === sel.id_adicional)?.nombre_adicional ??
        `Adicional #${sel.id_adicional}`;
      const resumenFinal = (c: ConfigFinal, indice: number) => ({
        ...resumirLineaConfigurada({
          id_detalle: c.fila?.id_detalle ?? 0,
          id_item: c.id_item,
          cantidad: c.cantidad,
          notas_especiales: c.nota,
          item: productos.find((p) => p.id_item === c.id_item),
          promocion_aplicada: c.promoNombre,
          adicionales: c.seleccion.map((s) => ({ nombre_adicional: nombreAdicional(s, c.fila), cantidad: s.cantidad })),
        }),
        ...(c.nueva ? { clave: `nuevo:${indice}`, id_detalle: undefined } : {}),
      });
      const despues = [
        ...[...solicitadas].map(([idItem, l]) => ({
          id_item: idItem,
          producto: productos.find((p) => p.id_item === idItem)!.nombre,
          cantidad: l.cantidad,
          nota: l.nota,
        })),
        ...configFinales.map((c, i) => resumenFinal(c, i)),
      ];
      const cambios = calcularCambios(antes, despues);
      if (cambios.length === 0) return;

      // 6. SCRUM-181: nueva versión de la comanda con el pedido completo
      const comanda = await this.nuevaVersionComanda(manager, pedido.id_pedido, cambios);

      const aEliminar: number[] = [];
      const finales: { cantidad: number; precio: number }[] = [];

      // -----------------------------------------------------------------------
      // 7a. Líneas configuradas existentes: misma fila; se sincronizan sus adicionales
      // -----------------------------------------------------------------------
      for (const f of configuradas) {
        if (!configSolicitadas.has(f.id_detalle)) {
          // Solo en PENDIENTE (en preparación ya se rechazó arriba). ON DELETE CASCADE
          // borra sus registros de pedido_item_adicional.
          aEliminar.push(f.id_detalle);
        }
      }
      for (const c of configFinales.filter((x) => !x.nueva)) {
        const f = c.fila!;
        const cambiosFila: Partial<DetallePedido> = {};
        if (c.cantidad !== Number(f.cantidad)) cambiosFila.cantidad = c.cantidad;
        if (c.nota !== normalizarNota(f.notas_especiales)) cambiosFila.notas_especiales = c.nota;

        let precio = Number(f.precio_unitario);
        const nuevoPrecio = precios.get(c);
        if (nuevoPrecio) {
          precio = nuevoPrecio.precio;
          cambiosFila.precio_unitario = precio;
          cambiosFila.promocion_aplicada = c.promoNombre;
          await this.sincronizarAdicionales(manager, f, nuevoPrecio.adicionales);
        }

        if (Object.keys(cambiosFila).length > 0) {
          await manager.update(DetallePedido, { id_detalle: f.id_detalle }, cambiosFila);
        }
        finales.push({ cantidad: c.cantidad, precio });
      }

      // 7b. Líneas nuevas con adicionales o combo
      for (const c of configFinales.filter((x) => x.nueva)) {
        const conf = precios.get(c)!;
        const detalle = await manager.save(
          manager.create(DetallePedido, {
            id_pedido: pedido.id_pedido,
            id_item: c.id_item,
            cantidad: c.cantidad,
            precio_unitario: conf.precio,
            notas_especiales: c.nota,
            promocion_aplicada: c.promoNombre,
            id_comanda: comanda.id_comanda,
          }),
        );
        if (conf.adicionales.length > 0) {
          await manager.save(
            conf.adicionales.map((a) =>
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
        finales.push({ cantidad: c.cantidad, precio: conf.precio });
      }

      // -----------------------------------------------------------------------
      // 7c. Líneas simples, agrupadas por producto
      // -----------------------------------------------------------------------
      const filasPorItem = new Map<number, DetallePedido[]>();
      for (const d of editables) filasPorItem.set(d.id_item, [...(filasPorItem.get(d.id_item) ?? []), d]);

      // Productos que ya no están como línea simple
      for (const [idItem, filas] of filasPorItem) {
        if (!solicitadas.has(idItem)) aEliminar.push(...filas.map((f) => f.id_detalle));
      }

      for (const [idItem, l] of solicitadas) {
        const prod = productos.find((p) => p.id_item === idItem)!;
        const filas = filasPorItem.get(idItem) ?? [];
        const existente = filas.reduce((s, f) => s + Number(f.cantidad), 0);
        const notaCambio = !filas.every((f) => (normalizarNota(f.notas_especiales) ?? null) === l.nota);
        const modificadas = new Set<DetallePedido>();

        // Menos unidades: se descuentan de las filas más recientes
        let sobran = existente - l.cantidad;
        for (const f of [...filas].reverse()) {
          if (sobran <= 0) break;
          const cant = Number(f.cantidad);
          if (cant <= sobran) {
            aEliminar.push(f.id_detalle);
            sobran -= cant;
            f.cantidad = 0;
          } else {
            f.cantidad = cant - sobran;
            sobran = 0;
            modificadas.add(f);
          }
        }

        // La nota es del producto: aplica a todas sus unidades
        if (notaCambio) {
          for (const f of filas) {
            if (Number(f.cantidad) === 0) continue;
            f.notas_especiales = l.nota;
            modificadas.add(f);
          }
        }
        for (const f of modificadas) await manager.save(f);
        for (const f of filas) {
          if (Number(f.cantidad) > 0) finales.push({ cantidad: Number(f.cantidad), precio: Number(f.precio_unitario) });
        }

        // Más unidades: fila nueva al precio actual, ligada a la nueva versión
        if (l.cantidad > existente) {
          const nueva = l.cantidad - existente;
          await manager.save(
            manager.create(DetallePedido, {
              id_pedido: pedido.id_pedido,
              id_item: idItem,
              cantidad: nueva,
              precio_unitario: prod.precio_venta,
              notas_especiales: l.nota,
              promocion_aplicada: null,
              id_comanda: comanda.id_comanda,
            }),
          );
          finales.push({ cantidad: nueva, precio: Number(prod.precio_venta) });
        }
      }

      if (aEliminar.length > 0) {
        await manager.delete(DetallePedido, { id_detalle: In(aEliminar) });
      }

      const total = finales.reduce((s, f) => s + f.cantidad * f.precio, 0);
      if (total > INT_MAX) throw new BadRequestException('El total del pedido supera el máximo permitido');

      pedido.total_calculado = total;
      await manager.save(pedido);
    });

    return this.buscarPorId(idPedido);
  }

  /**
   * Valida los adicionales y la promoción de una línea y calcula su precio
   * unitario con el catálogo actual (mismas reglas que "Nuevo choripán").
   *   adicionalesNuevos: solo a estos se les exige estar activos (los que la
   *                      línea ya tenía se pueden conservar aunque se desactiven).
   *   validarPromo:      solo si la promoción se acaba de elegir (422 si no está vigente).
   */
  private configurarLinea(
    producto: ItemInventario,
    seleccion: { id_adicional: number; cantidad: number }[],
    promo: Promocion | null,
    catalogo: Adicional[],
    adicionalesNuevos: Set<number>,
    validarPromo: boolean,
    ahora: Date,
  ): { precio: number; adicionales: AdicionalLinea[] } {
    let panes = 0;
    const adicionales = seleccion.map<AdicionalLinea>((sel) => {
      const a = catalogo.find((x) => x.id_adicional === sel.id_adicional);
      if (!a) throw new NotFoundException(`El adicional con id ${sel.id_adicional} no existe`);
      if (adicionalesNuevos.has(a.id_adicional) && !a.estado_activo) {
        throw new BadRequestException(`El adicional "${a.nombre}" no está disponible`);
      }
      if (a.id_categoria !== null && a.id_categoria !== undefined && a.id_categoria !== producto.id_categoria) {
        throw new BadRequestException(`El adicional "${a.nombre}" no aplica a "${producto.nombre}"`);
      }
      if (a.tipo === TipoAdicional.PAN && ++panes > 1) {
        throw new BadRequestException(`Solo se puede elegir un tipo de pan para "${producto.nombre}"`);
      }
      return { id_adicional: a.id_adicional, nombre: a.nombre, cantidad: sel.cantidad, precio_unitario: Number(a.precio_adicional) };
    });

    if (promo && validarPromo) {
      if (!promocionVigente(promo, ahora)) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'Unprocessable Entity',
          codigo: CODIGO_PROMOCION_NO_VIGENTE,
          id_promocion: promo.id_promocion,
          promocion: promo.nombre,
          message: `La promoción "${promo.nombre}" no está vigente y no se aplicó al pedido`,
        });
      }
      if (promo.id_categoria !== null && promo.id_categoria !== undefined && promo.id_categoria !== producto.id_categoria) {
        throw new BadRequestException(`La promoción "${promo.nombre}" no aplica a "${producto.nombre}"`);
      }
    }

    return {
      precio: calcularPrecioUnitario(Number(producto.precio_venta), adicionales, promo),
      adicionales,
    };
  }

  /**
   * Sincroniza pedido_item_adicional de una línea: borra los desmarcados,
   * actualiza cantidad/precio de los que siguen e inserta los nuevos.
   */
  private async sincronizarAdicionales(
    manager: EntityManager,
    fila: DetallePedido,
    finales: AdicionalLinea[],
  ): Promise<void> {
    const actuales = fila.adicionales ?? [];
    const quitar = actuales.filter((a) => !finales.some((f) => f.id_adicional === a.id_adicional));
    if (quitar.length > 0) {
      await manager.delete(PedidoItemAdicional, {
        id_pedido_item_adicional: In(quitar.map((a) => a.id_pedido_item_adicional)),
      });
    }

    for (const f of finales) {
      const existente = actuales.find((a) => a.id_adicional === f.id_adicional);
      if (!existente) {
        await manager.save(
          manager.create(PedidoItemAdicional, {
            id_detalle: fila.id_detalle,
            id_adicional: f.id_adicional,
            cantidad: f.cantidad,
            precio_unitario: f.precio_unitario,
            nombre_adicional: f.nombre,
          }),
        );
      } else if (
        Number(existente.cantidad) !== f.cantidad ||
        Number(existente.precio_unitario) !== f.precio_unitario ||
        existente.nombre_adicional !== f.nombre
      ) {
        await manager.update(
          PedidoItemAdicional,
          { id_pedido_item_adicional: existente.id_pedido_item_adicional },
          { cantidad: f.cantidad, precio_unitario: f.precio_unitario, nombre_adicional: f.nombre },
        );
      }
    }
  }

  /**
   * HU-4.3 · SCRUM-181/182: crea la comanda vN+1 en PENDIENTE con sus cambios.
   * Las versiones anteriores que seguían PENDIENTES quedan REEMPLAZADAS para que
   * el agente de impresión solo imprima la versión vigente.
   */
  private async nuevaVersionComanda(
    manager: EntityManager,
    idPedido: number,
    cambios: CambioComanda[],
  ): Promise<Comanda> {
    const ultima = await manager.findOne(Comanda, {
      where: { id_pedido: idPedido },
      order: { version: 'DESC' },
    });

    await manager.update(
      Comanda,
      { id_pedido: idPedido, estado_impresion: EstadoImpresionComanda.PENDIENTE },
      { estado_impresion: EstadoImpresionComanda.REEMPLAZADA },
    );

    return manager.save(
      manager.create(Comanda, {
        id_pedido: idPedido,
        version: (ultima?.version ?? 0) + 1,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
        cambios,
      }),
    );
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
