import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { OrdersService } from './orders.service';
import { EstadoPedido, Pedido } from './entities/pedido.entity';
import { ItemInventario, TipoItem } from '../products/entities/item-inventario.entity';
import { CreatePedidoDto } from './dto/create-pedido.dto';
import { Comanda } from '../kitchen/entities/comanda.entity';
import { DetallePedido } from './entities/detalle-pedido.entity';

describe('OrdersService - HU-3.1 Concurrencia de pedidos por mesa', () => {
  let service: OrdersService;
  let dataSourceMock: { transaction: jest.Mock; manager: unknown; getRepository: jest.Mock };
  let pedidosRepoMock: { findOne: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    pedidosRepoMock = {
      findOne: jest.fn().mockImplementation((opts) => {
        const id = opts?.where?.id_pedido;
        return Promise.resolve({
          id_pedido: id ?? 101,
          numero_mesa: 6,
          estado_pedido: EstadoPedido.PENDIENTE,
          total_calculado: 15000,
          detalles: [],
        });
      }),
      find: jest.fn().mockResolvedValue([]),
    };

    dataSourceMock = {
      transaction: jest.fn(),
      manager: {},
      getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Pedido), useValue: pedidosRepoMock },
        { provide: DataSource, useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('Control de concurrencia al registrar pedidos en la misma mesa (CP-3.1-06 / DEF-005)', () => {
    const dtoMesa6: CreatePedidoDto = {
      numero_mesa: 6,
      detalles: [{ id_item: 1, cantidad: 1 }],
    };

    const productoValido: Partial<ItemInventario> = {
      id_item: 1,
      nombre: 'Choripán Clásico',
      tipo_item: TipoItem.PRODUCTO,
      precio_venta: 15000,
      cantidad_stock: 50,
      estado_activo: true,
    };

    it('debe permitir crear un pedido y solicitar pg_advisory_xact_lock para la mesa', async () => {
      const mockQuery = jest.fn().mockResolvedValue([]);
      let orderIdSeq = 100;

      const mockManager = {
        query: mockQuery,
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockResolvedValue([productoValido]),
        create: jest.fn((entity, data) => ({ ...data, __entity: entity })),
        save: jest.fn((obj) => {
          if (obj.__entity === Pedido) obj.id_pedido = ++orderIdSeq;
          if (obj.__entity === Comanda) obj.id_comanda = 1;
          if (obj.__entity === DetallePedido) obj.id_detalle = 1;
          return Promise.resolve(obj);
        }),
      } as unknown as EntityManager;

      dataSourceMock.transaction.mockImplementation(async (cb) => cb(mockManager));

      const pedido = await service.crear(dtoMesa6, 1);
      expect(pedido).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(31001, $1)', [6]);
    });

    it('dos solicitudes simultáneas para la misma mesa: una se aprueba y la otra se rechaza con 409 Conflict', async () => {
      // Simulación de base de datos con estado compartido de pedidos activos por mesa
      const pedidosActivosEnBD = new Map<number, Pedido>();
      let orderSeq = 100;

      dataSourceMock.transaction.mockImplementation(async (cb) => {
        // Simulamos un pequeño retraso de procesamiento para evaluar concurrencia real
        await new Promise((res) => setTimeout(res, 30));

        const mockManager = {
          query: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockImplementation((entity, opts) => {
            if (entity === Pedido) {
              const mesa = opts?.where?.numero_mesa;
              return Promise.resolve(pedidosActivosEnBD.get(mesa) ?? null);
            }
            return Promise.resolve(null);
          }),
          find: jest.fn().mockResolvedValue([productoValido]),
          create: jest.fn((entity, data) => ({ ...data, __entity: entity })),
          save: jest.fn((obj) => {
            if (obj.__entity === Pedido) {
              obj.id_pedido = ++orderSeq;
              pedidosActivosEnBD.set(obj.numero_mesa, obj as Pedido);
            }
            return Promise.resolve(obj);
          }),
        } as unknown as EntityManager;

        return cb(mockManager);
      });

      // Dos meseros intentan abrir pedido para la Mesa 6 en el mismo instante
      const promesaMesero1 = service.crear(dtoMesa6, 1);
      const promesaMesero2 = service.crear(dtoMesa6, 2);

      const resultados = await Promise.allSettled([promesaMesero1, promesaMesero2]);

      const exitosos = resultados.filter((r) => r.status === 'fulfilled');
      const fallidos = resultados.filter((r) => r.status === 'rejected');

      // Exactamente uno debe tener éxito y exactamente uno debe ser rechazado con ConflictException (409)
      expect(exitosos).toHaveLength(1);
      expect(fallidos).toHaveLength(1);

      const error = (fallidos[0] as PromiseRejectedResult).reason;
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('La mesa 6 ya tiene el pedido #101 activo');
    });

    it('dos solicitudes simultáneas para mesas DISTINTAS (Mesa 1 y Mesa 2) deben procesarse ambas con éxito', async () => {
      let orderSeq = 200;

      dataSourceMock.transaction.mockImplementation(async (cb) => {
        await new Promise((res) => setTimeout(res, 20));

        const mockManager = {
          query: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue(null),
          find: jest.fn().mockResolvedValue([productoValido]),
          create: jest.fn((entity, data) => ({ ...data, __entity: entity })),
          save: jest.fn((obj) => {
            if (obj.__entity === Pedido) obj.id_pedido = ++orderSeq;
            return Promise.resolve(obj);
          }),
        } as unknown as EntityManager;

        return cb(mockManager);
      });

      const dtoMesa1: CreatePedidoDto = { numero_mesa: 1, detalles: [{ id_item: 1, cantidad: 1 }] };
      const dtoMesa2: CreatePedidoDto = { numero_mesa: 2, detalles: [{ id_item: 1, cantidad: 1 }] };

      const [res1, res2] = await Promise.all([service.crear(dtoMesa1, 1), service.crear(dtoMesa2, 2)]);

      expect(res1).toBeDefined();
      expect(res2).toBeDefined();
    });

    it('debe capturar violación de índice único 23505 y retornar ConflictException con mensaje amigable', async () => {
      dataSourceMock.transaction.mockImplementation(async () => {
        const error: unknown = new QueryFailedError('query', [], new Error('duplicate key value'));
        (error as { code?: string }).code = '23505';
        throw error;
      });

      await expect(service.crear(dtoMesa6, 1)).rejects.toThrow(ConflictException);
      await expect(service.crear(dtoMesa6, 1)).rejects.toThrow('La mesa 6 ya tiene un pedido activo');
    });
  });
});
