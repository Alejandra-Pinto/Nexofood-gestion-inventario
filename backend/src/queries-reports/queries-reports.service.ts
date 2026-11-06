/**
 * Servicio: QueriesReportsService
 * ------------------------------------------------------------------
 * HU-5.2 · Historial de pedidos y ventas con filtros (solo Administrador).
 *
 * Criterios de aceptación:
 *   #1 Filtrar por fecha      -> solo los pedidos de ese día
 *   #2 Filtrar por rango      -> los pedidos entre la fecha inicial y la final (incluidas)
 *   #3 Filtrar por producto   -> los pedidos que incluyen ese producto
 *   #4 Combinar filtros       -> producto + fecha o producto + rango
 *   #5 Sin resultados         -> lista vacía; el frontend informa que no hay operaciones
 *
 * Una "venta" es un pedido en estado PAGADO. El resumen trae cuántas hubo y su total.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoPedido, Pedido } from '../orders/entities/pedido.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';
import { FiltrosHistorialDto } from './dto/filtros-historial.dto';

/** Las fechas del negocio se cuentan en la hora de Colombia */
export const ZONA_HORARIA = 'America/Bogota';

export interface ProductoHistorial {
  id_item: number;
  nombre: string;
  cantidad: number;
}

export interface PedidoHistorial {
  id_pedido: number;
  fecha_hora: Date;
  numero_mesa: number | null;
  estado_pedido: EstadoPedido;
  total_calculado: number;
  mesero: string | null;
  productos: ProductoHistorial[];
}

export interface ResultadoHistorial {
  filtros: {
    fecha: string | null;
    desde: string | null;
    hasta: string | null;
    producto: { id_item: number; nombre: string } | null;
  };
  resumen: { pedidos: number; ventas: number; total_vendido: number };
  pedidos: PedidoHistorial[];
}

/** true si la fecha no existe en el calendario (p. ej. 2026-02-30) */
function fechaInexistente(valor: string): boolean {
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d;
}

@Injectable()
export class QueriesReportsService {
  constructor(
    @InjectRepository(Pedido)
    private readonly pedidosRepo: Repository<Pedido>,
    @InjectRepository(ItemInventario)
    private readonly itemsRepo: Repository<ItemInventario>,
  ) {}

  async historial(filtros: FiltrosHistorialDto = {}): Promise<ResultadoHistorial> {
    const { fecha, desde, hasta, id_item } = filtros;

    // ---------- Validaciones de los filtros ----------
    if (fecha && (desde || hasta)) {
      throw new BadRequestException('Use una fecha o un rango de fechas, no ambos a la vez');
    }
    if (!!desde !== !!hasta) {
      throw new BadRequestException('Para filtrar por rango indique la fecha inicial y la fecha final');
    }
    const fechas: [string | undefined, string][] = [[fecha, 'La fecha'], [desde, 'La fecha inicial'], [hasta, 'La fecha final']];
    for (const [valor, nombre] of fechas) {
      if (valor && fechaInexistente(valor)) throw new BadRequestException(`${nombre} no es válida`);
    }
    if (desde && hasta && desde > hasta) {
      throw new BadRequestException('La fecha inicial no puede ser posterior a la fecha final');
    }

    let producto: ItemInventario | null = null;
    if (id_item !== undefined && id_item !== null) {
      producto = await this.itemsRepo.findOne({ where: { id_item } });
      if (!producto) throw new NotFoundException('El producto seleccionado no existe');
    }

    // ---------- Consulta ----------
    const q = this.pedidosRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.detalles', 'd')
      .leftJoinAndSelect('d.item', 'i')
      .leftJoin('p.mesero', 'm')
      .addSelect(['m.id_usuario', 'm.nombre_completo']) // nunca el password_hash
      .orderBy('p.fecha_hora', 'DESC')
      .addOrderBy('p.id_pedido', 'DESC')
      .addOrderBy('d.id_detalle', 'ASC');

    const dia = `(p.fecha_hora AT TIME ZONE '${ZONA_HORARIA}')::date`;
    if (fecha) q.andWhere(`${dia} = :fecha`, { fecha });
    if (desde && hasta) q.andWhere(`${dia} BETWEEN :desde AND :hasta`, { desde, hasta });
    // EXISTS en vez de filtrar el JOIN: así el pedido se muestra con todos sus productos
    if (producto) {
      q.andWhere(
        'EXISTS (SELECT 1 FROM detalles_pedido dp WHERE dp.id_pedido = p.id_pedido AND dp.id_item = :idItem)',
        { idItem: producto.id_item },
      );
    }

    const pedidos = await q.getMany();

    const lista = pedidos.map<PedidoHistorial>((p) => {
      // Un mismo producto puede venir en varias líneas (p. ej. con adicionales distintos)
      const porProducto = new Map<number, ProductoHistorial>();
      for (const d of p.detalles ?? []) {
        const actual = porProducto.get(d.id_item);
        if (actual) actual.cantidad += Number(d.cantidad);
        else porProducto.set(d.id_item, { id_item: d.id_item, nombre: d.item?.nombre ?? `Producto #${d.id_item}`, cantidad: Number(d.cantidad) });
      }
      return {
        id_pedido: p.id_pedido,
        fecha_hora: p.fecha_hora,
        numero_mesa: p.numero_mesa ?? null,
        estado_pedido: p.estado_pedido,
        total_calculado: Number(p.total_calculado),
        mesero: p.mesero?.nombre_completo ?? null,
        productos: [...porProducto.values()],
      };
    });

    const ventas = lista.filter((p) => p.estado_pedido === EstadoPedido.PAGADO);
    return {
      filtros: {
        fecha: fecha ?? null,
        desde: desde ?? null,
        hasta: hasta ?? null,
        producto: producto ? { id_item: producto.id_item, nombre: producto.nombre } : null,
      },
      resumen: {
        pedidos: lista.length,
        ventas: ventas.length,
        total_vendido: ventas.reduce((s, p) => s + p.total_calculado, 0),
      },
      pedidos: lista,
    };
  }
}
