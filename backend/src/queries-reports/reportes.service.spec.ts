/** Pruebas unitarias: ReportesService - Pruebas del resumen */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportesService } from './reportes.service';
import { Pedido } from '../orders/entities/pedido.entity';
import { MovimientoFinanciero, OrigenMovimiento } from '../finance/entities/movimiento-financiero.entity';

/** QueryBuilder simulado que guarda las condiciones y devuelve `datos` */
function qbSimulado(datos: () => unknown[], condiciones: { sql: string; params?: Record<string, unknown> }[]) {
  const qb: Record<string, jest.Mock> = {};
  const guardar = jest.fn((sql: string, params?: Record<string, unknown>) => {
    condiciones.push({ sql, params });
    return qb;
  });
  Object.assign(qb, {
    select: jest.fn(() => qb),
    addSelect: jest.fn(() => qb),
    leftJoin: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    where: guardar,
    andWhere: guardar,
    getMany: jest.fn(() => Promise.resolve(datos())),
    getRawMany: jest.fn(() => Promise.resolve(datos())),
  });
  return qb;
}

describe('ReportesService', () => {
  let service: ReportesService;
  let pedidos: unknown[];
  let ingresos: unknown[];
  const condPedidos: { sql: string; params?: Record<string, unknown> }[] = [];
  const condIngresos: { sql: string; params?: Record<string, unknown> }[] = [];

  beforeEach(async () => {
    condPedidos.length = 0;
    condIngresos.length = 0;
    pedidos = [{ fecha_hora: new Date('2026-11-03T15:00:00Z'), estado_pedido: 'PAGADO', total_calculado: 36000 }];
    ingresos = [{ monto: 100000 }];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: getRepositoryToken(Pedido), useValue: { createQueryBuilder: () => qbSimulado(() => pedidos, condPedidos) } },
        { provide: getRepositoryToken(MovimientoFinanciero), useValue: { createQueryBuilder: () => qbSimulado(() => ingresos, condIngresos) } },
      ],
    }).compile();
    service = module.get(ReportesService);
  });

  it('consulta los pedidos del período en la hora de Colombia', async () => {
    await service.resumen('2026-11-01', '2026-11-05');
    expect(condPedidos[0].sql).toContain("AT TIME ZONE 'America/Bogota'");
    expect(condPedidos[0].params).toEqual({ desde: '2026-11-01', hasta: '2026-11-05' });
  });

  it('solo toma como "otros ingresos" los movimientos MANUALES', async () => {
    const r = await service.resumen('2026-11-01', '2026-11-05');
    expect(condIngresos.find((c) => c.params?.origen)?.params).toEqual({ origen: OrigenMovimiento.MANUAL });
    expect(r.ventas.total).toBe(36000);
    expect(r.otros_ingresos.total).toBe(100000);
  });

  it('sin pedidos ni ingresos responde sin_operaciones', async () => {
    pedidos = [];
    ingresos = [];
    const r = await service.resumen('2026-10-01', '2026-10-31');
    expect(r.sin_operaciones).toBe(true);
  });

  it('rechaza el período inválido sin consultar la base de datos', async () => {
    await expect(service.resumen('2026-11-05', '2026-11-01')).rejects.toThrow('posterior');
    expect(condPedidos).toHaveLength(0);
  });
});
