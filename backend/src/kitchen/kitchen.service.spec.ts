import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { Comanda, EstadoImpresionComanda } from './entities/comanda.entity';
import { Pedido } from '../orders/entities/pedido.entity';

describe('KitchenService', () => {
  let service: KitchenService;

  const mockComandaRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockPedidoRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        {
          provide: getRepositoryToken(Comanda),
          useValue: mockComandaRepo,
        },
        {
          provide: getRepositoryToken(Pedido),
          useValue: mockPedidoRepo,
        },
      ],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('listarPendientes', () => {
    it('debe retornar solo comandas en estado PENDIENTE', async () => {
      const pendientes = [
        { id_comanda: 1, id_pedido: 10, estado_impresion: EstadoImpresionComanda.PENDIENTE },
      ];
      mockComandaRepo.find.mockResolvedValue(pendientes);

      const res = await service.listarPendientes();
      expect(res).toEqual(pendientes);
      expect(mockComandaRepo.find).toHaveBeenCalledWith({
        where: { estado_impresion: EstadoImpresionComanda.PENDIENTE },
        relations: {
          pedido: {
            detalles: { item: true },
            mesero: true,
          },
        },
        order: { fecha_impresion: 'ASC' },
      });
    });
  });

  describe('obtenerPorIdPedido', () => {
    it('debe retornar la comanda correspondiente si existe', async () => {
      const comanda = { id_comanda: 1, id_pedido: 5 };
      mockComandaRepo.findOne.mockResolvedValue(comanda);

      const res = await service.obtenerPorIdPedido(5);
      expect(res).toEqual(comanda);
    });

    it('debe lanzar NotFoundException si no existe comanda para ese pedido', async () => {
      mockComandaRepo.findOne.mockResolvedValue(null);

      await expect(service.obtenerPorIdPedido(99)).rejects.toThrow(NotFoundException);
    });
  });

  describe('actualizarEstado', () => {
    it('debe actualizar el estado de la comanda', async () => {
      const comanda = {
        id_comanda: 1,
        estado_impresion: EstadoImpresionComanda.PENDIENTE,
        fecha_impresion: new Date(),
      };
      mockComandaRepo.findOne.mockResolvedValue(comanda);
      mockComandaRepo.save.mockImplementation((c) => Promise.resolve(c));

      const res = await service.actualizarEstado(1, {
        estado_impresion: EstadoImpresionComanda.IMPRESA,
      });

      expect(res.estado_impresion).toBe(EstadoImpresionComanda.IMPRESA);
      expect(mockComandaRepo.save).toHaveBeenCalled();
    });

    it('debe lanzar NotFoundException si la comanda no existe', async () => {
      mockComandaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.actualizarEstado(999, { estado_impresion: EstadoImpresionComanda.ERROR }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('solicitarImpresion', () => {
    it('debe encolar para impresión poniendo estado_impresion en PENDIENTE', async () => {
      const pedido = { id_pedido: 2 };
      const comandaExistente = {
        id_comanda: 1,
        id_pedido: 2,
        estado_impresion: EstadoImpresionComanda.IMPRESA,
      };

      mockPedidoRepo.findOne.mockResolvedValue(pedido);
      mockComandaRepo.findOne.mockResolvedValue(comandaExistente);
      mockComandaRepo.save.mockImplementation((c) => Promise.resolve(c));

      const res = await service.solicitarImpresion(2);
      expect(res.estado_impresion).toBe(EstadoImpresionComanda.PENDIENTE);
      expect(mockComandaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ estado_impresion: EstadoImpresionComanda.PENDIENTE }),
      );
    });

    it('debe lanzar NotFoundException si el pedido no existe', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(null);

      await expect(service.solicitarImpresion(999)).rejects.toThrow(NotFoundException);
    });
  });
});
