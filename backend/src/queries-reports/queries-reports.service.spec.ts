/**
 * Pruebas unitarias: QueriesReportsService
 * HU-5.2 · SCRUM-205 Pruebas de filtros
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueriesReportsService } from './queries-reports.service';
import { EstadoPedido, Pedido } from '../orders/entities/pedido.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';

describe('QueriesReportsService · historial con filtros', () => {
  let service: QueriesReportsService;
  let pedidos: unknown[];
  let producto: Partial<ItemInventario> | null;

  // QueryBuilder simulado: guarda cada condición para revisarla en las pruebas
  const condiciones: { sql: string; params?: Record<string, unknown> }[] = [];
  const qb: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>): unknown => {
      condiciones.push({ sql, params });
      return qb;
    }),
    getMany: jest.fn(() => Promise.resolve(pedidos)),
  };
  const pedidosRepo = { createQueryBuilder: jest.fn(() => qb) };
  const itemsRepo = { findOne: jest.fn(() => Promise.resolve(producto)) };

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueriesReportsService,
        { provide: getRepositoryToken(Pedido), useValue: pedidosRepo },
        { provide: getRepositoryToken(ItemInventario), useValue: itemsRepo },
      ],
    }).compile();
    service = module.get(QueriesReportsService);
  });

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
    expect(qb.leftJoinAndSelect).not.toHaveBeenCalledWith('p.mesero', expect.anything());
    expect(qb.addSelect).toHaveBeenCalledWith(['m.id_usuario', 'm.nombre_completo']);
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
    expect(qb.getMany).not.toHaveBeenCalled();
  });

  it('producto inexistente: 404 y no consulta pedidos', async () => {
    producto = null;
    await expect(service.historial({ id_item: 999 })).rejects.toBeInstanceOf(NotFoundException);
    expect(qb.getMany).not.toHaveBeenCalled();
  });
});
