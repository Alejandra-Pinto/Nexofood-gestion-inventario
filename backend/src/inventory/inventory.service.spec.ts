/**
 * Pruebas unitarias: InventoryService
 * ------------------------------------------------------------------
 * HU-2.4 · SCRUM-134 Pruebas de salidas manuales
 *
 * Se mockean los repositorios y el DataSource para probar SOLO la
 * lógica de negocio sin tocar la base de datos.
 *
 * Ejecutar:  npm test
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { InventoryService } from './inventory.service';
import {
  MotivoMovimiento,
  MovimientoInventario,
  TipoMovimiento,
} from './entities/movimiento-inventario.entity';
import {
  ItemInventario,
  TipoItem,
} from '../products/entities/item-inventario.entity';
import { CreateSalidaDto, MotivoSalida } from './dto/create-salida.dto';

describe('InventoryService', () => {
  let service: InventoryService;

  /** Ítem que "devuelve" el manager al buscar por id */
  let itemEncontrado: Partial<ItemInventario> | null;

  /** Mock del EntityManager: se usa dentro de la transacción */
  const managerMock = {
    findOne: jest.fn(() => Promise.resolve(itemEncontrado)),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    create: jest.fn((_entity: unknown, datos: unknown) => datos),
    save: jest.fn((datos: unknown) =>
      Promise.resolve(Object.assign({ id_movimiento: 1 }, datos as object)),
    ),
  };

  /** Mock del DataSource: ejecuta el callback con el manager mock */
  const dataSourceMock = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      cb(managerMock as unknown as EntityManager),
    ),
  };

  /** Repositorios inyectados por el módulo (no se usan en registrarSalida) */
  const movimientosRepo = {};
  const itemsRepo = {};

  const dtoValido: CreateSalidaDto = {
    id_item: 1,
    motivo: MotivoSalida.MERMA,
    cantidad: 3,
    observaciones: 'Se dañó en cocina',
  };

  /** Helper para clonar el DTO y sobreescribir campos sin usar spread */
  const clonarDto = (
    cambios: Partial<CreateSalidaDto> = {},
  ): CreateSalidaDto =>
    Object.assign({}, dtoValido, cambios) as CreateSalidaDto;

  beforeEach(async () => {
    jest.clearAllMocks();
    itemEncontrado = {
      id_item: 1,
      nombre: 'Choripán Pampero',
      tipo_item: TipoItem.PRODUCTO,
      cantidad_stock: 10,
      stock_minimo: 2,
      estado_activo: true,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        {
          provide: getRepositoryToken(MovimientoInventario),
          useValue: movimientosRepo,
        },
        {
          provide: getRepositoryToken(ItemInventario),
          useValue: itemsRepo,
        },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  // ---------- Casos de éxito ----------

  it('registra una salida por MERMA y descuenta el stock', async () => {
    const mov = await service.registrarSalida(dtoValido, 5);

    expect(managerMock.update).toHaveBeenCalledWith(
      ItemInventario,
      { id_item: 1 },
      { cantidad_stock: 7 },
    );
    expect(mov).toMatchObject({
      id_item: 1,
      id_usuario: 5,
      tipo_movimiento: TipoMovimiento.SALIDA,
      motivo: MotivoMovimiento.MERMA,
      cantidad: 3,
      stock_anterior: 10,
      stock_nuevo: 7,
    });
  });

  it('registra una salida por CONSUMO_INTERNO', async () => {
    const mov = await service.registrarSalida(
      clonarDto({ motivo: MotivoSalida.CONSUMO_INTERNO }),
      5,
    );

    expect(mov).toMatchObject({
      motivo: MotivoMovimiento.CONSUMO_INTERNO,
      tipo_movimiento: TipoMovimiento.SALIDA,
      stock_nuevo: 7,
    });
  });

  it('permite salida que deja el stock en 0', async () => {
    itemEncontrado = { ...itemEncontrado, cantidad_stock: 3 };

    const mov = await service.registrarSalida(dtoValido, 5);

    expect(mov).toMatchObject({ stock_anterior: 3, stock_nuevo: 0 });
  });

  // ---------- Casos de error ----------

  it('rechaza salida si el ítem no existe (404)', async () => {
    itemEncontrado = null;

    await expect(service.registrarSalida(dtoValido, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(managerMock.update).not.toHaveBeenCalled();
    expect(managerMock.save).not.toHaveBeenCalled();
  });

  it('rechaza salida si el ítem está inactivo', async () => {
    itemEncontrado = Object.assign({}, itemEncontrado, { estado_activo: false });

    await expect(service.registrarSalida(dtoValido, 5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(managerMock.update).not.toHaveBeenCalled();
  });

  it('rechaza salida cuando la cantidad supera el stock disponible (SCRUM-133)', async () => {
    itemEncontrado = Object.assign({}, itemEncontrado, { cantidad_stock: 2 });

    await expect(
      service.registrarSalida(clonarDto({ cantidad: 5 }), 5),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(managerMock.update).not.toHaveBeenCalled();
    expect(managerMock.save).not.toHaveBeenCalled();
  });

  it('el mensaje de stock insuficiente menciona el disponible y el solicitado', async () => {
    itemEncontrado = Object.assign({}, itemEncontrado, { cantidad_stock: 2 });

    await expect(
      service.registrarSalida(clonarDto({ cantidad: 5 }), 5),
    ).rejects.toThrow(/Disponible: 2, solicitado: 5/);
  });

  // ---------- Transacción ----------

  it('ejecuta la operación dentro de una transacción', async () => {
    await service.registrarSalida(dtoValido, 5);

    expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
  });
});