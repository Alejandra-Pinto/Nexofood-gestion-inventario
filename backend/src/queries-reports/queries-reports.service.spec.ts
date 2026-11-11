/**
 * Pruebas unitarias: QueriesReportsService
 * HU-5.1, HU-5.2 y HU-6.1
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueriesReportsService } from './queries-reports.service';
import { EstadoPedido, Pedido } from '../orders/entities/pedido.entity';
import { ItemInventario, TipoItem } from '../products/entities/item-inventario.entity';

describe('QueriesReportsService', () => {
  let service: QueriesReportsService;
  let pedidos: unknown[];
  let itemsInventario: unknown[];
  let producto: Partial<ItemInventario> | null;

  // QueryBuilder simulado para pedidos
  const condiciones: { sql: string; params?: Record<string, unknown> }[] = [];
  const qbPedidos: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>): unknown => {
      condiciones.push({ sql, params });
      return qbPedidos;
    }),
    getMany: jest.fn(() => Promise.resolve(pedidos)),
  };

  // QueryBuilder simulado para ítems de inventario
  const qbItems: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(() => Promise.resolve(itemsInventario)),
  };

  const pedidosRepo = { createQueryBuilder: jest.fn(() => qbPedidos) };
  const itemsRepo = {
    findOne: jest.fn(() => Promise.resolve(producto)),
    createQueryBuilder: jest.fn(() => qbItems),
  };

  const pedido = (id: number, estado: EstadoPedido, total: number, detalles: unknown[]) => ({
    id_pedido: id,
    fecha_hora: new Date('2026-11-04T15:00:00Z'),
    numero_mesa: 3,
    estado_pedido: estado,
    total_calculado: total,
    mesero: { id_usuario: 7, nombre_completo: 'Mesero QA' },
    detalles,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    condiciones.length = 0;
    producto = { id_item: 5, nombre: 'Choripán Pampero' };
    pedidos = [
      pedido(2, EstadoPedido.PAGADO, 36000, [
        { id_detalle: 1, id_item: 5, cantidad: '1', item: { nombre: 'Choripán Pampero' } },
        { id_detalle: 2, id_item: 5, cantidad: '1', item: { nombre: 'Choripán Pampero' } },
      ]),
      pedido(1, EstadoPedido.PENDIENTE, 4000, [{ id_detalle: 3, id_item: 9, cantidad: '1', item: { nombre: 'Gaseosa' } }]),
    ];
    itemsInventario = [
      {
        id_item: 1,
        nombre: 'Choripán Clásico',
        tipo_item: TipoItem.PRODUCTO,
        id_categoria: 10,
        categoria: { id_categoria: 10, nombre: 'Choripanes' },
        cantidad_stock: 15,
        stock_minimo: 5,
        precio_venta: 16000,
        estado_activo: true,
      },
      {
        id_item: 2,
        nombre: 'Pan Artesanal',
        tipo_item: TipoItem.INSUMO,
        id_categoria: 20,
        categoria: { id_categoria: 20, nombre: 'Panadería' },
        cantidad_stock: 4,
        stock_minimo: 10,
        precio_venta: 0,
        estado_activo: true,
      },
      {
        id_item: 3,
        nombre: 'Salsa Chimichurri',
        tipo_item: TipoItem.INSUMO,
        id_categoria: 30,
        categoria: null,
        cantidad_stock: 0,
        stock_minimo: 2,
        precio_venta: 0,
        estado_activo: true,
      },
    ];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueriesReportsService,
        { provide: getRepositoryToken(Pedido), useValue: pedidosRepo },
        { provide: getRepositoryToken(ItemInventario), useValue: itemsRepo },
      ],
    }).compile();
    service = module.get(QueriesReportsService);
  });

  describe('historial con filtros (HU-5.1, HU-5.2)', () => {
    it('#1 filtra por un día, en la hora de Colombia', async () => {
      await service.historial({ fecha: '2026-11-04' });
      const c = condiciones.find((x) => x.params?.fecha);
      expect(c?.sql).toContain("AT TIME ZONE 'America/Bogota'");
      expect(c?.params).toEqual({ fecha: '2026-11-04' });
    });

    it('#2 filtra por rango, con ambas fechas incluidas', async () => {
      await service.historial({ desde: '2026-11-01', hasta: '2026-11-04' });
      const c = condiciones.find((x) => x.params?.desde);
      expect(c?.sql).toContain('BETWEEN :desde AND :hasta');
      expect(c?.params).toEqual({ desde: '2026-11-01', hasta: '2026-11-04' });
    });

    it('#3 filtra por producto sin recortar los demás productos del pedido', async () => {
      const r = await service.historial({ id_item: 5 });
      const c = condiciones.find((x) => x.params?.idItem);
      expect(c?.sql).toContain('EXISTS');
      expect(c?.params).toEqual({ idItem: 5 });
      expect(r.filtros.producto).toEqual({ id_item: 5, nombre: 'Choripán Pampero' });
    });

    it('#4 combina producto y rango', async () => {
      await service.historial({ id_item: 5, desde: '2026-11-01', hasta: '2026-11-04' });
      expect(condiciones.map((c) => Object.keys(c.params ?? {})).flat()).toEqual(['desde', 'hasta', 'idItem']);
    });

    it('#5 sin resultados devuelve la lista vacía y el resumen en cero', async () => {
      pedidos = [];
      const r = await service.historial({ fecha: '2026-01-01' });
      expect(r.pedidos).toEqual([]);
      expect(r.resumen).toEqual({ pedidos: 0, ventas: 0, total_vendido: 0 });
    });

    it('agrupa el mismo producto y calcula ventas y total vendido', async () => {
      const r = await service.historial({});
      expect(r.pedidos[0].productos).toEqual([{ id_item: 5, nombre: 'Choripán Pampero', cantidad: 2 }]);
      expect(r.pedidos[0].mesero).toBe('Mesero QA');
      expect(r.resumen).toEqual({ pedidos: 2, ventas: 1, total_vendido: 36000 });
      expect(condiciones).toHaveLength(0);
    });

    it('nunca selecciona la contraseña del mesero', async () => {
      await service.historial({});
      expect(qbPedidos.leftJoinAndSelect).not.toHaveBeenCalledWith('p.mesero', expect.anything());
      expect(qbPedidos.addSelect).toHaveBeenCalledWith(['m.id_usuario', 'm.nombre_completo']);
    });

    it.each([
      [{ fecha: '2026-11-04', desde: '2026-11-01', hasta: '2026-11-04' }, 'no ambos'],
      [{ desde: '2026-11-01' }, 'fecha inicial y la fecha final'],
      [{ hasta: '2026-11-04' }, 'fecha inicial y la fecha final'],
      [{ desde: '2026-11-05', hasta: '2026-11-01' }, 'posterior'],
      [{ fecha: '2026-02-30' }, 'no es válida'],
    ])('rechaza filtros inválidos %j', async (filtros, mensaje) => {
      await expect(service.historial(filtros)).rejects.toThrow(BadRequestException);
      await expect(service.historial(filtros)).rejects.toThrow(mensaje);
      expect(qbPedidos.getMany).not.toHaveBeenCalled();
    });

    it('producto inexistente: 404 y no consulta pedidos', async () => {
      producto = null;
      await expect(service.historial({ id_item: 999 })).rejects.toBeInstanceOf(NotFoundException);
      expect(qbPedidos.getMany).not.toHaveBeenCalled();
    });
  });

  describe('filtrar pedidos por estado (HU-5.4, SCRUM-214)', () => {
    it('E1 filtra por estado válido y aplica la condición en la consulta', async () => {
      await service.historial({ estado: EstadoPedido.PENDIENTE });
      const c = condiciones.find((x) => x.params?.estado);
      expect(c?.sql).toContain('p.estado_pedido = :estado');
      expect(c?.params).toEqual({ estado: EstadoPedido.PENDIENTE });
    });

    it('E2 filtra por estado PAGADO y devuelve el filtro aplicado', async () => {
      const r = await service.historial({ estado: EstadoPedido.PAGADO });
      expect(condiciones.find((x) => x.params?.estado)?.params).toEqual({ estado: EstadoPedido.PAGADO });
      expect(r.filtros.estado).toBe(EstadoPedido.PAGADO);
    });

    it('E3 filtra por estado ANULADO y devuelve el filtro aplicado', async () => {
      const r = await service.historial({ estado: EstadoPedido.ANULADO });
      expect(condiciones.find((x) => x.params?.estado)?.params).toEqual({ estado: EstadoPedido.ANULADO });
      expect(r.filtros.estado).toBe(EstadoPedido.ANULADO);
    });

    it('combina filtro de estado con fecha y producto', async () => {
      await service.historial({ estado: EstadoPedido.PAGADO, fecha: '2026-11-04', id_item: 5 });
      const params = condiciones.map((c) => Object.keys(c.params ?? {})).flat();
      expect(params).toContain('estado');
      expect(params).toContain('fecha');
      expect(params).toContain('idItem');
    });

    it('E4 maneja estado sin resultados devolviendo lista vacía y filtros consistentes', async () => {
      pedidos = [];
      const r = await service.historial({ estado: EstadoPedido.ANULADO });
      expect(r.pedidos).toEqual([]);
      expect(r.resumen.pedidos).toBe(0);
      expect(r.filtros.estado).toBe(EstadoPedido.ANULADO);
    });
  });

  describe('reporte de inventario consolidado (HU-6.1)', () => {
    it('retorna existencias consolidadas y clasifica stock normal, bajo y agotado', async () => {
      const r = await service.reporteInventario();
      expect(r.items).toHaveLength(3);
      expect(r.items[0]).toEqual({
        id_item: 1,
        nombre: 'Choripán Clásico',
        tipo_item: TipoItem.PRODUCTO,
        id_categoria: 10,
        categoria: 'Choripanes',
        cantidad_stock: 15,
        stock_minimo: 5,
        precio_venta: 16000,
        estado_activo: true,
        estado_stock: 'NORMAL',
      });
      expect(r.items[1].estado_stock).toBe('BAJO');
      expect(r.items[2].estado_stock).toBe('AGOTADO');
      expect(r.items[2].categoria).toBe('Sin categoría');

      expect(r.resumen).toEqual({
        total_items: 3,
        total_productos: 1,
        total_insumos: 2,
        items_bajo_stock: 1,
        items_agotados: 1,
      });
      expect(r.fecha_generacion).toBeDefined();
    });

    it('maneja inventario vacío retornando lista vacía y métricas en cero', async () => {
      itemsInventario = [];
      const r = await service.reporteInventario();
      expect(r.items).toEqual([]);
      expect(r.resumen).toEqual({
        total_items: 0,
        total_productos: 0,
        total_insumos: 0,
        items_bajo_stock: 0,
        items_agotados: 0,
      });
    });
  });
});
