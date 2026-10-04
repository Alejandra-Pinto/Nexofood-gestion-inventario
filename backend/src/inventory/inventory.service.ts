/**
 * Servicio: InventoryService
 * ------------------------------------------------------------------
 * Lógica de negocio del módulo Inventory.
 *
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

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(MovimientoInventario)
    private readonly movimientosRepo: Repository<MovimientoInventario>,
    @InjectRepository(ItemInventario)
    private readonly itemsRepo: Repository<ItemInventario>,
    private readonly dataSource: DataSource,
  ) {}

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