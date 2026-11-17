/** Pruebas unitarias: reporte de productos más vendidos (HU-6.3 · SCRUM-223) */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  construirReporteProductosMasVendidos,
  FilaProductoVendido,
  ReporteProductosMasVendidos,
} from './reportes';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { Pedido } from '../orders/entities/pedido.entity';
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';

const filasEjemplo: FilaProductoVendido[] = [
  { id_item: '1', nombre: 'Choripán Clásico', unidades_vendidas: '10', total_recaudado: '120000' },
  { id_item: '2', nombre: 'Choripán Especial', unidades_vendidas: '5', total_recaudado: '70000' },
  { id_item: '3', nombre: 'Gaseosa Postobón', unidades_vendidas: '5', total_recaudado: '25000' },
  { id_item: '4', nombre: 'Arepa de Choclo', unidades_vendidas: '2', total_recaudado: '16000' },
  { id_item: '5', nombre: 'Agua Manantial', unidades_vendidas: '2', total_recaudado: '16000' },
];

describe('Reportes · cálculo de productos más vendidos (HU-6.3)', () => {
  it('calcula el total de unidades y el total recaudado del período', () => {
    const r = construirReporteProductosMasVendidos('2026-11-01', '2026-11-06', filasEjemplo);
    expect(r.sin_ventas).toBe(false);
    expect(r.total_unidades).toBe(24);
    expect(r.total_recaudado).toBe(247000);
    expect(r.productos).toHaveLength(5);
  });

  it('asigna las posiciones correlativas iniciando en 1', () => {
    const r = construirReporteProductosMasVendidos('2026-11-01', '2026-11-06', filasEjemplo);
    expect(r.productos.map((p) => p.posicion)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ordena de mayor a menor por unidades vendidas', () => {
    const r = construirReporteProductosMasVendidos('2026-11-01', '2026-11-06', [
      { id_item: '10', nombre: 'Producto Menos Vendido', unidades_vendidas: '1', total_recaudado: '10000' },
      { id_item: '20', nombre: 'Producto Más Vendido', unidades_vendidas: '20', total_recaudado: '50000' },
    ]);
    expect(r.productos[0].id_item).toBe(20);
    expect(r.productos[0].unidades_vendidas).toBe(20);
    expect(r.productos[1].id_item).toBe(10);
  });

  it('desempate 1: a igual cantidad de unidades vendidas, ordena por mayor total recaudado (DESC)', () => {
    const r = construirReporteProductosMasVendidos('2026-11-01', '2026-11-06', [
      { id_item: '3', nombre: 'Gaseosa', unidades_vendidas: '5', total_recaudado: '25000' },
      { id_item: '2', nombre: 'Choripán', unidades_vendidas: '5', total_recaudado: '70000' },
    ]);
    expect(r.productos[0].id_item).toBe(2);
    expect(r.productos[0].total_recaudado).toBe(70000);
    expect(r.productos[1].id_item).toBe(3);
  });

  it('desempate 2: a igual unidades y recaudado, ordena alfabéticamente por nombre (ASC)', () => {
    const r = construirReporteProductosMasVendidos('2026-11-01', '2026-11-06', [
      { id_item: '5', nombre: 'Zumo de Mora', unidades_vendidas: '2', total_recaudado: '16000' },
      { id_item: '4', nombre: 'Agua Cristal', unidades_vendidas: '2', total_recaudado: '16000' },
    ]);
    expect(r.productos[0].nombre).toBe('Agua Cristal');
    expect(r.productos[1].nombre).toBe('Zumo de Mora');
  });

  it('convierte cadenas numéricas en enteros limpios', () => {
    const r = construirReporteProductosMasVendidos('2026-11-01', '2026-11-06', [
      { id_item: '99', nombre: 'Chori', unidades_vendidas: '3.00', total_recaudado: '45000.00' },
    ]);
    expect(r.productos[0].id_item).toBe(99);
    expect(r.productos[0].unidades_vendidas).toBe(3);
    expect(r.productos[0].total_recaudado).toBe(45000);
  });

  it('período sin productos vendidos retorna sin_ventas en true y lista vacía', () => {
    const r = construirReporteProductosMasVendidos('2026-10-01', '2026-10-31', []);
    expect(r.sin_ventas).toBe(true);
    expect(r.total_unidades).toBe(0);
    expect(r.total_recaudado).toBe(0);
    expect(r.productos).toEqual([]);
  });
});

describe('ReportesService · productosMasVendidos', () => {
  let service: ReportesService;
  const condiciones: { sql: string; params?: Record<string, unknown> }[] = [];
  const innerJoins: unknown[][] = [];
  const leftJoins: unknown[][] = [];
  const qb: Record<string, jest.Mock> = {};

  const guardar = jest.fn((sql: string, params?: Record<string, unknown>) => {
    condiciones.push({ sql, params });
    return qb;
  });

  Object.assign(qb, {
    innerJoin: jest.fn((...args: unknown[]) => {
      innerJoins.push(args);
      return qb;
    }),
    leftJoin: jest.fn((...args: unknown[]) => {
      leftJoins.push(args);
      return qb;
    }),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    groupBy: jest.fn(() => qb),
    addGroupBy: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    where: guardar,
    andWhere: guardar,
    getRawMany: jest.fn(() => Promise.resolve(filasEjemplo)),
  });

  beforeEach(async () => {
    condiciones.length = 0;
    innerJoins.length = 0;
    leftJoins.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: getRepositoryToken(Pedido), useValue: { createQueryBuilder: () => qb } },
        { provide: getRepositoryToken(MovimientoFinanciero), useValue: { createQueryBuilder: () => qb } },
      ],
    }).compile();

    service = module.get(ReportesService);
  });

  it('solo consulta pedidos PAGADOS dentro del rango por fecha de venta', async () => {
    const r = await service.productosMasVendidos('2026-11-01', '2026-11-06');
    expect(condiciones.find((c) => c.params?.pagado)?.params).toEqual({ pagado: 'PAGADO' });
    const periodo = condiciones.find((c) => c.params?.desde);
    expect(periodo?.sql).toContain('COALESCE(mf.fecha_hora, p.fecha_hora)');
    expect(periodo?.params).toEqual({ desde: '2026-11-01', hasta: '2026-11-06' });
    expect(r.total_unidades).toBe(24);
  });

  it('une detalles de pedido, ítem de inventario y movimiento financiero', async () => {
    await service.productosMasVendidos('2026-11-01', '2026-11-06');
    expect(innerJoins.some((j) => j[0] === 'p.detalles' && j[1] === 'd')).toBe(true);
    expect(innerJoins.some((j) => j[0] === 'd.item' && j[1] === 'item')).toBe(true);
    expect(leftJoins.some((j) => j[0] === MovimientoFinanciero)).toBe(true);
  });

  it('rechaza un período con fechas invertidas', async () => {
    await expect(service.productosMasVendidos('2026-11-06', '2026-11-01')).rejects.toThrow('posterior');
  });
});

describe('ReportesController · productosMasVendidos', () => {
  let controller: ReportesController;
  let serviceMock: Partial<ReportesService>;

  beforeEach(async () => {
    serviceMock = {
      productosMasVendidos: jest.fn().mockResolvedValue({
        desde: '2026-11-01',
        hasta: '2026-11-06',
        sin_ventas: false,
        total_unidades: 10,
        total_recaudado: 120000,
        productos: [{ posicion: 1, id_item: 1, nombre: 'Choripán', unidades_vendidas: 10, total_recaudado: 120000 }],
      } as ReporteProductosMasVendidos),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportesController],
      providers: [{ provide: ReportesService, useValue: serviceMock }],
    }).compile();

    controller = module.get(ReportesController);
  });

  it('responde el ranking llamando al servicio con las fechas del filtro', async () => {
    const res = await controller.productosMasVendidos({ desde: '2026-11-01', hasta: '2026-11-06' });
    expect(serviceMock.productosMasVendidos).toHaveBeenCalledWith('2026-11-01', '2026-11-06');
    expect(res.productos[0].nombre).toBe('Choripán');
    expect(res.total_unidades).toBe(10);
  });

  it('HU-6.5: si se pasa id_item, delega el filtro por ítem al servicio', async () => {
    await controller.productosMasVendidos({ desde: '2026-11-01', hasta: '2026-11-06', id_item: 5 });
    expect(serviceMock.productosMasVendidos).toHaveBeenCalledWith('2026-11-01', '2026-11-06', 5);
  });
});
