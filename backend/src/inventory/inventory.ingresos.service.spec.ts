/**
 * Pruebas unitarias: InventoryService · ingresos de stock
 * ------------------------------------------------------------------
 * HU-2.3 · SCRUM-130 Pruebas de ingresos de stock
 *
 * Valida:
 *   1. El stock aumenta tras un ingreso por compra o por producción (SCRUM-128).
 *   2. El movimiento queda con tipo, motivo, fecha y datos correctos (SCRUM-129).
 *   3. Los datos inválidos se rechazan SIN tocar la base de datos.
 *
 * Se mockean los repositorios y el DataSource: no se usa la BD real.
 * Ejecutar:  cd backend  ->  npm test
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
import { Proveedor } from './entities/proveedor.entity';
import {
  ItemInventario,
  TipoItem,
} from '../products/entities/item-inventario.entity';
import { CreateIngresoDto, MotivoIngreso } from './dto/create-ingreso.dto';

describe('InventoryService · ingresos', () => {
  let service: InventoryService;

  /** Lo que "devuelve" la BD simulada */
  let item: Partial<ItemInventario> | null;
  let proveedor: Partial<Proveedor> | null;

  const proveedoresRepo = { find: jest.fn() };

  /** EntityManager de la transacción: responde según la entidad consultada */
  const managerMock = {
    findOne: jest.fn((entidad: unknown) =>
      Promise.resolve(entidad === Proveedor ? proveedor : item),
    ),
    update: jest.fn(() => Promise.resolve({ affected: 1 })),
    create: jest.fn((_entidad: unknown, datos: unknown) => datos),
    save: jest.fn((datos: unknown) =>
      Promise.resolve(Object.assign({ id_movimiento: 1 }, datos as object)),
    ),
  };

  const dataSourceMock = {
    transaction: jest.fn((cb: (m: EntityManager) => unknown) =>
      cb(managerMock as unknown as EntityManager),
    ),
  };

  /** Compra de la maqueta: 120 u. x $18.000 = $2.160.000 */
  const compra: CreateIngresoDto = {
    id_item: 1,
    motivo: MotivoIngreso.COMPRA,
    id_proveedor: 2,
    cantidad: 120,
    costo_unitario: 18000,
    observaciones: 'Lote #458, factura #123',
  };

  const produccion: CreateIngresoDto = {
    id_item: 1,
    motivo: MotivoIngreso.PRODUCCION,
    cantidad: 30,
  };

  const con = (base: CreateIngresoDto, cambios: Partial<CreateIngresoDto>): CreateIngresoDto =>
    Object.assign({}, base, cambios);

  /** Verifica que NO se escribió nada en la BD */
  const noEscribio = () => {
    expect(managerMock.update).not.toHaveBeenCalled();
    expect(managerMock.save).not.toHaveBeenCalled();
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useRealTimers();

    item = {
      id_item: 1,
      nombre: 'Choripán Pampero',
      tipo_item: TipoItem.PRODUCTO,
      cantidad_stock: 10,
      stock_minimo: 2,
      costo_fabricacion: 8400,
      estado_activo: true,
    };
    proveedor = { id_proveedor: 2, nombre: 'Carnes del Sur', estado_activo: true };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(MovimientoInventario), useValue: {} },
        { provide: getRepositoryToken(ItemInventario), useValue: {} },
        { provide: getRepositoryToken(Proveedor), useValue: proveedoresRepo },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get(InventoryService);
  });

  afterEach(() => jest.useRealTimers());

  // ======================================================================
  // 1. Incremento correcto del stock (SCRUM-128)
  // ======================================================================
  describe('suma al stock', () => {
    it('una compra suma la cantidad al stock actual', async () => {
      await service.registrarIngreso(compra, 5);

      expect(managerMock.update).toHaveBeenCalledWith(
        ItemInventario,
        { id_item: 1 },
        { cantidad_stock: 130 }, // 10 + 120
      );
    });

    it('un ingreso por producción suma la cantidad al stock actual', async () => {
      await service.registrarIngreso(produccion, 5);

      expect(managerMock.update).toHaveBeenCalledWith(
        ItemInventario,
        { id_item: 1 },
        { cantidad_stock: 40 }, // 10 + 30
      );
    });

    it('suma sobre un stock en 0', async () => {
      item = Object.assign({}, item, { cantidad_stock: 0 });

      const mov = await service.registrarIngreso(produccion, 5);

      expect(mov).toMatchObject({ stock_anterior: 0, stock_nuevo: 30 });
    });

    it('bloquea la fila del ítem para evitar condiciones de carrera', async () => {
      await service.registrarIngreso(compra, 5);

      expect(managerMock.findOne).toHaveBeenCalledWith(
        ItemInventario,
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('ejecuta stock y kardex dentro de UNA sola transacción', async () => {
      await service.registrarIngreso(compra, 5);

      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
    });
  });

  // ======================================================================
  // 2. Registro del movimiento (SCRUM-129)
  // ======================================================================
  describe('registra el movimiento', () => {
    it('compra: ENTRADA + COMPRA con costo, total, proveedor y usuario', async () => {
      const mov = await service.registrarIngreso(compra, 5);

      expect(mov).toMatchObject({
        id_item: 1,
        id_usuario: 5,
        tipo_movimiento: TipoMovimiento.ENTRADA,
        motivo: MotivoMovimiento.COMPRA,
        cantidad: 120,
        stock_anterior: 10,
        stock_nuevo: 130,
        costo_unitario: 18000,
        total: 2160000,
        id_proveedor: 2,
        observaciones: 'Lote #458, factura #123',
      });
    });

    it('producción: ENTRADA + PRODUCCION sin proveedor', async () => {
      const mov = await service.registrarIngreso(produccion, 5);

      expect(mov).toMatchObject({
        tipo_movimiento: TipoMovimiento.ENTRADA,
        motivo: MotivoMovimiento.PRODUCCION,
        id_proveedor: null,
        observaciones: null,
      });
    });

    it('producción sin costo usa el costo de fabricación del ítem', async () => {
      const mov = await service.registrarIngreso(produccion, 5);

      expect(mov).toMatchObject({ costo_unitario: 8400, total: 252000 }); // 30 x 8.400
    });

    it('producción con costo explícito lo respeta', async () => {
      const mov = await service.registrarIngreso(con(produccion, { costo_unitario: 9000 }), 5);

      expect(mov).toMatchObject({ costo_unitario: 9000, total: 270000 });
    });

    it('guarda observaciones sin espacios y convierte vacío en null', async () => {
      const a = await service.registrarIngreso(con(compra, { observaciones: '  Lote 7  ' }), 5);
      const b = await service.registrarIngreso(con(compra, { observaciones: '   ' }), 5);

      expect(a.observaciones).toBe('Lote 7');
      expect(b.observaciones).toBeNull();
    });

    it('guarda el movimiento con el id del usuario recibido del JWT', async () => {
      await service.registrarIngreso(compra, 77);

      expect(managerMock.create).toHaveBeenCalledWith(
        MovimientoInventario,
        expect.objectContaining({ id_usuario: 77 }),
      );
    });

    describe('fecha del movimiento', () => {
      const AHORA = new Date(2026, 8, 19, 15, 30, 0); // 19/09/2026 15:30 (hora local)

      beforeEach(() => {
        // Solo se congela el reloj (Date); las promesas siguen funcionando normal
        jest.useFakeTimers({
          now: AHORA,
          doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'setTimeout', 'setInterval'],
        });
      });

      it('sin fecha usa el momento actual', async () => {
        const mov = await service.registrarIngreso(compra, 5);

        expect(mov.fecha_hora).toEqual(AHORA);
      });

      it('con la fecha de hoy usa el momento actual', async () => {
        const mov = await service.registrarIngreso(con(compra, { fecha_ingreso: '2026-09-19' }), 5);

        expect(mov.fecha_hora).toEqual(AHORA);
      });

      it('con una fecha pasada guarda ese día', async () => {
        const mov = await service.registrarIngreso(con(compra, { fecha_ingreso: '2026-09-15' }), 5);

        const fecha = mov.fecha_hora as Date;
        expect([fecha.getFullYear(), fecha.getMonth(), fecha.getDate()]).toEqual([2026, 8, 15]);
      });

      it('rechaza una fecha futura', async () => {
        await expect(
          service.registrarIngreso(con(compra, { fecha_ingreso: '2026-09-20' }), 5),
        ).rejects.toThrow('no puede ser futura');
        noEscribio();
      });

      it.each(['2026-02-30', '19/09/2026', 'ayer'])(
        'rechaza la fecha inválida "%s"',
        async (fecha) => {
          await expect(
            service.registrarIngreso(con(compra, { fecha_ingreso: fecha }), 5),
          ).rejects.toBeInstanceOf(BadRequestException);
          noEscribio();
        },
      );
    });
  });

  // ======================================================================
  // 3. Manejo de errores: no se escribe nada en la BD
  // ======================================================================
  describe('rechaza datos inválidos', () => {
    it.each([0, -1, -120, 2.5, NaN])(
      'cantidad inválida (%s) -> 400',
      async (cantidad) => {
        await expect(
          service.registrarIngreso(con(compra, { cantidad }), 5),
        ).rejects.toBeInstanceOf(BadRequestException);
        noEscribio();
        expect(dataSourceMock.transaction).not.toHaveBeenCalled();
      },
    );

    it('producto no encontrado -> 404', async () => {
      item = null;

      await expect(service.registrarIngreso(compra, 5)).rejects.toBeInstanceOf(NotFoundException);
      noEscribio();
    });

    it('producto inactivo -> 400', async () => {
      item = Object.assign({}, item, { estado_activo: false });

      await expect(service.registrarIngreso(compra, 5)).rejects.toThrow(/inactivo/);
      noEscribio();
    });

    it('compra sin proveedor -> 400', async () => {
      await expect(
        service.registrarIngreso(con(compra, { id_proveedor: undefined }), 5),
      ).rejects.toThrow(/proveedor/);
      noEscribio();
    });

    it('compra sin costo unitario -> 400', async () => {
      await expect(
        service.registrarIngreso(con(compra, { costo_unitario: undefined }), 5),
      ).rejects.toThrow(/costo unitario/);
      noEscribio();
    });

    it.each([0, -18000, 10.5])('costo unitario inválido (%s) -> 400', async (costo) => {
      await expect(
        service.registrarIngreso(con(compra, { costo_unitario: costo }), 5),
      ).rejects.toBeInstanceOf(BadRequestException);
      noEscribio();
    });

    it('proveedor no encontrado -> 404', async () => {
      proveedor = null;

      await expect(service.registrarIngreso(compra, 5)).rejects.toBeInstanceOf(NotFoundException);
      noEscribio();
    });

    it('proveedor inactivo -> 400', async () => {
      proveedor = Object.assign({}, proveedor, { estado_activo: false });

      await expect(service.registrarIngreso(compra, 5)).rejects.toThrow(/inactivo/);
      noEscribio();
    });

    it('producción con proveedor -> 400', async () => {
      await expect(
        service.registrarIngreso(con(produccion, { id_proveedor: 2 }), 5),
      ).rejects.toThrow(/no admite proveedor/);
      noEscribio();
    });

    it('tipo de ingreso desconocido -> 400', async () => {
      const dto = con(compra, { motivo: 'MERMA' as unknown as MotivoIngreso });

      await expect(service.registrarIngreso(dto, 5)).rejects.toBeInstanceOf(BadRequestException);
      noEscribio();
    });

    it('total que excede el máximo de la columna INTEGER -> 400', async () => {
      await expect(
        service.registrarIngreso(con(compra, { cantidad: 1_000_000, costo_unitario: 50_000 }), 5),
      ).rejects.toThrow(/máximo permitido/);
      noEscribio();
    });

    it('no registra movimiento si falla la escritura del stock (atomicidad)', async () => {
      managerMock.update.mockRejectedValueOnce(new Error('db caída'));

      await expect(service.registrarIngreso(compra, 5)).rejects.toThrow('db caída');
      expect(managerMock.save).not.toHaveBeenCalled();
    });

    it('propaga el error si falla el INSERT del kardex (la transacción revierte el stock)', async () => {
      managerMock.save.mockRejectedValueOnce(new Error('violación de constraint'));

      await expect(service.registrarIngreso(compra, 5)).rejects.toThrow('violación de constraint');
    });
  });

  // ======================================================================
  // Proveedores para el selector
  // ======================================================================
  describe('listarProveedores', () => {
    it('devuelve solo los activos ordenados por nombre', async () => {
      const lista = [{ id_proveedor: 2, nombre: 'Carnes del Sur', estado_activo: true }];
      proveedoresRepo.find.mockResolvedValue(lista);

      await expect(service.listarProveedores()).resolves.toEqual(lista);
      expect(proveedoresRepo.find).toHaveBeenCalledWith({
        where: { estado_activo: true },
        order: { nombre: 'ASC' },
      });
    });
  });
});
