/** Pruebas unitarias: reporte general de ventas - Pruebas del reporte de ventas */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { construirReporteVentas, FilaVenta } from './reportes';
import { ReportesService } from './reportes.service';
import { Pedido } from '../orders/entities/pedido.entity';
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';

const filas: FilaVenta[] = [
  { id_pedido: '3', fecha_venta: '2026-11-04T20:00:00Z', numero_mesa: '4', mesero: 'Mesero QA', medio_pago: 'EFECTIVO', total: '36000' },
  { id_pedido: '2', fecha_venta: '2026-11-04T18:00:00Z', numero_mesa: null, mesero: 'Cajero QA', medio_pago: 'NEQUI', total: '18000' },
  { id_pedido: '1', fecha_venta: '2026-11-03T15:00:00Z', numero_mesa: '2', mesero: 'Mesero QA', medio_pago: 'EFECTIVO', total: '6000' },
];

describe('Reportes', () => {
  it('suma el total vendido, cuenta las ventas y calcula el ticket promedio', () => {
    const r = construirReporteVentas('2026-11-01', '2026-11-06', filas);
    expect(r.resumen).toEqual({ ventas: 3, total_vendido: 60000, ticket_promedio: 20000 });
    expect(r.sin_ventas).toBe(false);
  });

  it('convierte los textos de la consulta en números y la mesa vacía en null', () => {
    const r = construirReporteVentas('2026-11-01', '2026-11-06', filas);
    expect(r.ventas[0]).toMatchObject({ id_pedido: 3, numero_mesa: 4, total: 36000, medio_pago: 'EFECTIVO' });
    expect(r.ventas[1].numero_mesa).toBeNull();
  });

  it('agrupa por medio de pago, de mayor a menor total', () => {
    const r = construirReporteVentas('2026-11-01', '2026-11-06', filas);
    expect(r.por_medio_pago).toEqual([
      { medio_pago: 'EFECTIVO', ventas: 2, total: 42000 },
      { medio_pago: 'NEQUI', ventas: 1, total: 18000 },
    ]);
  });

  it('una venta sin pago registrado aparece como SIN_REGISTRO', () => {
    const r = construirReporteVentas('2026-11-01', '2026-11-06', [{ ...filas[0], medio_pago: null }]);
    expect(r.ventas[0].medio_pago).toBe('SIN_REGISTRO');
  });

  it('sin ventas en el período: todo en cero y sin_ventas = true', () => {
    const r = construirReporteVentas('2026-10-01', '2026-10-31', []);
    expect(r.sin_ventas).toBe(true);
    expect(r.resumen).toEqual({ ventas: 0, total_vendido: 0, ticket_promedio: 0 });
    expect(r.por_medio_pago).toEqual([]);
  });
});

describe('ReportesService', () => {
  let service: ReportesService;
  const condiciones: { sql: string; params?: Record<string, unknown> }[] = [];
  const joins: unknown[][] = [];
  const qb: Record<string, jest.Mock> = {};
  const guardar = jest.fn((sql: string, params?: Record<string, unknown>) => {
    condiciones.push({ sql, params });
    return qb;
  });
  Object.assign(qb, {
    leftJoin: jest.fn((...args: unknown[]) => {
      joins.push(args);
      return qb;
    }),
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    where: guardar,
    andWhere: guardar,
    getRawMany: jest.fn(() => Promise.resolve(filas)),
  });

  beforeEach(async () => {
    condiciones.length = 0;
    joins.length = 0;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: getRepositoryToken(Pedido), useValue: { createQueryBuilder: () => qb } },
        { provide: getRepositoryToken(MovimientoFinanciero), useValue: { createQueryBuilder: () => qb } },
      ],
    }).compile();
    service = module.get(ReportesService);
  });

  it('solo consulta pedidos PAGADOS en el período, por la fecha del pago', async () => {
    const r = await service.ventas('2026-11-01', '2026-11-06');
    expect(condiciones.find((c) => c.params?.pagado)?.params).toEqual({ pagado: 'PAGADO' });
    const periodo = condiciones.find((c) => c.params?.desde);
    expect(periodo?.sql).toContain('COALESCE(mf.fecha_hora, p.fecha_hora)');
    expect(periodo?.params).toEqual({ desde: '2026-11-01', hasta: '2026-11-06' });
    expect(r.resumen.total_vendido).toBe(60000);
  });

  it('une el pago (INGRESO) del pedido para saber el medio de pago', async () => {
    await service.ventas('2026-11-01', '2026-11-06');
    const pago = joins.find((j) => j[0] === MovimientoFinanciero);
    expect(pago?.[2]).toContain('mf.id_pedido = p.id_pedido');
    expect(pago?.[3]).toEqual({ ingreso: 'INGRESO' });
  });

  it('rechaza un período inválido', async () => {
    await expect(service.ventas('2026-11-06', '2026-11-01')).rejects.toThrow('posterior');
  });
});
