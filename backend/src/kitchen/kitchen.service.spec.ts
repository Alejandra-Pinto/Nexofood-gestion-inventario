import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { Comanda, EstadoImpresionComanda } from './entities/comanda.entity';
import { Pedido } from '../orders/entities/pedido.entity';
import {
  HistorialImpresion,
  ResultadoImpresion,
  TipoImpresion,
} from './entities/historial-impresion.entity';

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

  // HU-4.3: historial de impresión
  const mockHistorialRepo = {
    find: jest.fn(),
    save: jest.fn((h) => Promise.resolve(h)),
    create: jest.fn((h) => h),
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
        {
          provide: getRepositoryToken(HistorialImpresion),
          useValue: mockHistorialRepo,
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
            detalles: { item: true, adicionales: true },
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

  // ===========================================================================
  // HU-4.3 · SCRUM-184 Versionado e historial de impresión
  // ===========================================================================
  describe('HU-4.3 · historial de impresión', () => {
    it('al reportar IMPRESA registra "Comanda vN · OK" en el historial', async () => {
      mockComandaRepo.findOne.mockResolvedValue({
        id_comanda: 7, id_pedido: 24, version: 2, estado_impresion: EstadoImpresionComanda.PENDIENTE,
      });
      mockComandaRepo.save.mockImplementation((c) => Promise.resolve(c));

      await service.actualizarEstado(7, { estado_impresion: EstadoImpresionComanda.IMPRESA });

      expect(mockHistorialRepo.save).toHaveBeenCalledWith({
        id_pedido: 24, id_comanda: 7, tipo: TipoImpresion.COMANDA, version: 2, resultado: ResultadoImpresion.OK,
      });
    });

    it('al reportar ERROR también queda en el historial', async () => {
      mockComandaRepo.findOne.mockResolvedValue({ id_comanda: 7, id_pedido: 24, version: 2 });
      mockComandaRepo.save.mockImplementation((c) => Promise.resolve(c));

      await service.actualizarEstado(7, { estado_impresion: EstadoImpresionComanda.ERROR });
      expect(mockHistorialRepo.save).toHaveBeenCalledWith(expect.objectContaining({ resultado: ResultadoImpresion.ERROR }));
    });

    it('volver a PENDIENTE no es una impresión: no se registra', async () => {
      mockComandaRepo.findOne.mockResolvedValue({ id_comanda: 7, id_pedido: 24, version: 2 });
      mockComandaRepo.save.mockImplementation((c) => Promise.resolve(c));

      await service.actualizarEstado(7, { estado_impresion: EstadoImpresionComanda.PENDIENTE });
      expect(mockHistorialRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('HU-4.3 · resumen de versiones del pedido', () => {
    const cambio = { tipo: 'CANTIDAD_AUMENTADA', id_item: 9, producto: 'Cerveza', cantidad: 1, texto: 'Se agregó 1x Cerveza (ahora 2)' };
    const v1 = { id_comanda: 1, version: 1, estado_impresion: EstadoImpresionComanda.IMPRESA, cambios: [], fecha_creacion: new Date('2026-10-27T17:45:22Z'), fecha_impresion: new Date('2026-10-27T17:45:22Z') };
    const v2 = { id_comanda: 7, version: 2, estado_impresion: EstadoImpresionComanda.PENDIENTE, cambios: [cambio], fecha_creacion: new Date('2026-10-27T17:48:00Z'), fecha_impresion: new Date('2026-10-27T17:48:00Z') };

    it('devuelve la versión vigente, el último cambio y que falta reimprimir', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ id_pedido: 24 });
      mockComandaRepo.find.mockResolvedValue([v1, v2]);
      mockHistorialRepo.find.mockResolvedValue([{ id_impresion: 1, version: 1, resultado: 'OK' }]);

      const r = await service.resumenPorPedido(24);

      expect(mockComandaRepo.find).toHaveBeenCalledWith({ where: { id_pedido: 24 }, order: { version: 'ASC', id_comanda: 'ASC' } });
      expect(r).toMatchObject({
        id_pedido: 24,
        version_actual: 2,
        estado_impresion_actual: EstadoImpresionComanda.PENDIENTE,
        requiere_reimpresion: true,
        ultima_modificacion: { version: 2, fecha: v2.fecha_creacion, cambios: [cambio] },
      });
      expect(r.versiones).toHaveLength(2);
      expect(r.historial).toHaveLength(1);
    });

    it('cuando la v2 ya se imprimió no pide reimprimir, pero conserva el último cambio', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ id_pedido: 24 });
      mockComandaRepo.find.mockResolvedValue([v1, { ...v2, estado_impresion: EstadoImpresionComanda.IMPRESA }]);
      mockHistorialRepo.find.mockResolvedValue([]);

      const r = await service.resumenPorPedido(24);
      expect(r.requiere_reimpresion).toBe(false);
      expect(r.ultima_modificacion?.version).toBe(2);
    });

    it('un pedido sin modificaciones no tiene aviso', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ id_pedido: 24 });
      mockComandaRepo.find.mockResolvedValue([v1]);
      mockHistorialRepo.find.mockResolvedValue([]);

      const r = await service.resumenPorPedido(24);
      expect(r).toMatchObject({ version_actual: 1, ultima_modificacion: null, requiere_reimpresion: false });
    });

    it('pedido inexistente -> NotFoundException', async () => {
      mockPedidoRepo.findOne.mockResolvedValue(null);
      await expect(service.resumenPorPedido(999)).rejects.toThrow(NotFoundException);
    });

    it('reimprimir toma la versión vigente (la más alta)', async () => {
      mockPedidoRepo.findOne.mockResolvedValue({ id_pedido: 24 });
      mockComandaRepo.findOne.mockResolvedValue({ ...v2 });
      mockComandaRepo.save.mockImplementation((c) => Promise.resolve(c));

      const res = await service.solicitarImpresion(24);
      expect(mockComandaRepo.findOne).toHaveBeenCalledWith({
        where: { id_pedido: 24 },
        order: { version: 'DESC', id_comanda: 'DESC' },
      });
      expect(res).toMatchObject({ version: 2, estado_impresion: EstadoImpresionComanda.PENDIENTE });
    });
  });
});
