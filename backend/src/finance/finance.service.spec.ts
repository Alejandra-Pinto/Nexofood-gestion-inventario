/**
 * Pruebas unitarias: FinanceService
 * HU-7.2 · SCRUM-248 Pruebas de ingresos no provenientes de ventas
 */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FinanceService } from './finance.service';
import {
  MedioPago,
  MovimientoFinanciero,
  OrigenMovimiento,
  TipoMovimientoFinanciero,
} from './entities/movimiento-financiero.entity';
import { CreateIngresoFinancieroDto } from './dto/create-ingreso-financiero.dto';
import { hoyColombia } from './ingresos';

describe('FinanceService · HU-7.2 ingresos no provenientes de ventas', () => {
  let service: FinanceService;
  let filas: unknown[];

  const condiciones: { sql: string; params?: Record<string, unknown> }[] = [];
  const qb: Record<string, jest.Mock> = {
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    where: jest.fn((sql: string, params?: Record<string, unknown>): unknown => {
      condiciones.push({ sql, params });
      return qb;
    }),
    andWhere: jest.fn((sql: string, params?: Record<string, unknown>): unknown => {
      condiciones.push({ sql, params });
      return qb;
    }),
    getMany: jest.fn(() => Promise.resolve(filas)),
  };
  const repo = {
    create: jest.fn((datos: Partial<MovimientoFinanciero>) => datos),
    save: jest.fn((m: Partial<MovimientoFinanciero>) => Promise.resolve({ id_movimiento: 10, ...m })),
    createQueryBuilder: jest.fn(() => qb),
  };

  const dto = (cambios: Partial<CreateIngresoFinancieroDto> = {}): CreateIngresoFinancieroDto => ({
    concepto: 'Aporte de socios para la base de caja',
    categoria: 'APORTE_SOCIOS',
    monto: 200000,
    medio_pago: MedioPago.EFECTIVO,
    ...cambios,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    condiciones.length = 0;
    filas = [];
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinanceService, { provide: getRepositoryToken(MovimientoFinanciero), useValue: repo }],
    }).compile();
    service = module.get(FinanceService);
  });

  it('SCRUM-246 registra el ingreso como MANUAL, sin pedido, para no afectar las ventas', async () => {
    const r = await service.registrarIngreso(dto({ observaciones: '  Recibo #12  ' }), 7);
    const guardado = repo.save.mock.calls[0][0];
    expect(guardado).toMatchObject({
      id_usuario: 7,
      id_pedido: null,
      tipo_movimiento: TipoMovimientoFinanciero.INGRESO,
      origen: OrigenMovimiento.MANUAL,
      monto: 200000,
      categoria: 'APORTE_SOCIOS',
      observaciones: 'Recibo #12',
    });
    expect(r.id_movimiento).toBe(10);
    expect(r.monto).toBe(200000);
  });

  it('SCRUM-246 con una fecha pasada guarda ese día', async () => {
    await service.registrarIngreso(dto({ fecha: '2026-01-15' }), 7);
    const fecha = repo.save.mock.calls[0][0].fecha_hora as Date;
    expect(fecha.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it.each([
    ['cero', 0],
    ['negativo', -5000],
    ['decimal', 1500.5],
    ['mayor al máximo', 100_000_001],
    ['vacío', undefined],
    ['texto', 'abc'],
  ])('SCRUM-247 rechaza el monto %s y no guarda nada', async (_caso, monto) => {
    await expect(service.registrarIngreso(dto({ monto: monto as number }), 7)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza una fecha futura', async () => {
    const [a, m, d] = hoyColombia().split('-').map(Number);
    const manana = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
    await expect(service.registrarIngreso(dto({ fecha: manana }), 7)).rejects.toThrow('posterior a hoy');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rechaza concepto vacío o categoría inexistente', async () => {
    await expect(service.registrarIngreso(dto({ concepto: '   ' }), 7)).rejects.toThrow('concepto');
    await expect(service.registrarIngreso(dto({ categoria: 'VENTA' as never }), 7)).rejects.toThrow('categoría');
  });

  it('lista solo ingresos MANUALES del período y suma el total', async () => {
    filas = [
      { id_movimiento: 2, monto: '50000', concepto: 'Préstamo', categoria: 'PRESTAMO', medio_pago: 'NEQUI', usuario: { nombre_completo: 'Admin' } },
      { id_movimiento: 1, monto: '20000', concepto: 'Base', categoria: 'BASE_CAJA', medio_pago: 'EFECTIVO' },
    ];
    const r = await service.listarIngresos('2026-11-01', '2026-11-06');
    expect(condiciones.find((c) => c.params?.origen)?.params).toEqual({ origen: OrigenMovimiento.MANUAL });
    expect(condiciones.find((c) => c.params?.desde)?.params).toEqual({ desde: '2026-11-01', hasta: '2026-11-06' });
    expect(r.total).toBe(70000);
    expect(r.ingresos[0].registrado_por).toBe('Admin');
  });

  it('rechaza un rango con la fecha inicial posterior a la final', async () => {
    await expect(service.listarIngresos('2026-11-06', '2026-11-01')).rejects.toThrow('posterior');
  });
});
