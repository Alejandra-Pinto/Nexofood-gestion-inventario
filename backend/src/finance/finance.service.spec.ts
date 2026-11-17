/** Pruebas unitarias: FinanceService - Pruebas de ingresos no provenientes de ventas */
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
import { CreateEgresoFinancieroDto } from './dto/create-egreso-financiero.dto';
import { hoyColombia } from './ingresos';

describe('FinanceService', () => {
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

  const dtoIngreso = (cambios: Partial<CreateIngresoFinancieroDto> = {}): CreateIngresoFinancieroDto => ({
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

  // ==========================================
  // PRUEBAS DE INGRESOS (Existentes)
  // ==========================================
  describe('Módulo de Ingresos', () => {
    it('registra el ingreso como MANUAL, sin pedido, para no afectar las ventas', async () => {
      const r = await service.registrarIngreso(dtoIngreso({ observaciones: '  Recibo #12  ' }), 7);
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

    it('con una fecha pasada guarda ese día', async () => {
      await service.registrarIngreso(dtoIngreso({ fecha: '2026-01-15' }), 7);
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
      await expect(service.registrarIngreso(dtoIngreso({ monto: monto as number }), 7)).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza una fecha futura', async () => {
      const [a, m, d] = hoyColombia().split('-').map(Number);
      const manana = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
      await expect(service.registrarIngreso(dtoIngreso({ fecha: manana }), 7)).rejects.toThrow('posterior a hoy');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza concepto vacío o categoría inexistente', async () => {
      await expect(service.registrarIngreso(dtoIngreso({ concepto: '   ' }), 7)).rejects.toThrow('concepto');
      await expect(service.registrarIngreso(dtoIngreso({ categoria: 'VENTA' as never }), 7)).rejects.toThrow('categoría');
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

  // ==========================================
  // PRUEBAS DE EGRESOS (HU-7.1)
  // ==========================================
  describe('Módulo de Egresos', () => {
    const dtoEgreso = (cambios: Partial<CreateEgresoFinancieroDto> = {}): CreateEgresoFinancieroDto => ({
      concepto: 'Pago de servicios públicos',
      categoria: 'servicios',
      monto: 150000,
      medio_pago: MedioPago.TRANSFERENCIA,
      ...cambios,
    });

    it('registra un egreso correctamente como MANUAL', async () => {
      const r = await service.registrarEgreso(dtoEgreso({ observaciones: '  Factura 123  ' }), 8);
      const guardado = repo.save.mock.calls[0][0];
      
      expect(guardado).toMatchObject({
        id_usuario: 8,
        id_pedido: null,
        tipo_movimiento: TipoMovimientoFinanciero.EGRESO,
        origen: OrigenMovimiento.MANUAL,
        monto: 150000,
        categoria: 'servicios',
        observaciones: 'Factura 123',
      });
      expect(r.id_movimiento).toBe(10);
      expect(r.monto).toBe(150000);
    });

    it('rechaza un egreso con monto cero o negativo', async () => {
      await expect(service.registrarEgreso(dtoEgreso({ monto: 0 }), 8)).rejects.toThrow('monto debe ser mayor a 0');
      await expect(service.registrarEgreso(dtoEgreso({ monto: -100 }), 8)).rejects.toThrow('monto debe ser mayor a 0');
    });

    it('rechaza un egreso sin concepto', async () => {
      await expect(service.registrarEgreso(dtoEgreso({ concepto: '   ' }), 8)).rejects.toThrow('concepto es obligatorio');
    });

    it('rechaza un egreso con categoría inválida', async () => {
      await expect(service.registrarEgreso(dtoEgreso({ categoria: 'NO_EXISTE' }), 8)).rejects.toThrow('categoría del egreso no es válida');
    });

    it('lista los egresos del período y suma el total', async () => {
      filas = [
        { id_movimiento: 2, monto: '50000', concepto: 'Luz', categoria: 'servicios', medio_pago: 'EFECTIVO', usuario: { nombre_completo: 'Admin' } },
      ];
      const r = await service.listarEgresos('2026-11-01', '2026-11-06');
      expect(condiciones.find((c) => c.params?.tipo)?.params).toEqual({ tipo: TipoMovimientoFinanciero.EGRESO });
      expect(r.total).toBe(50000);
      expect(r.egresos[0].registrado_por).toBe('Admin');
    });
  });

  // ==========================================
  // HU-7.3 · SCRUM-252 Pruebas del historial financiero
  // ==========================================
  describe('Historial de ingresos y egresos (HU-7.3)', () => {
    const mov = (datos: Partial<MovimientoFinanciero>) => ({
      fecha_hora: new Date('2026-11-12T15:00:00Z'),
      id_pedido: null,
      origen: OrigenMovimiento.MANUAL,
      concepto: null,
      usuario: { nombre_completo: 'Cajero QA' },
      ...datos,
    });

    beforeEach(() => {
      filas = [
        mov({ id_movimiento: 4, tipo_movimiento: TipoMovimientoFinanciero.EGRESO, monto: 30000, medio_pago: MedioPago.EFECTIVO, concepto: 'Compra de pan' }),
        mov({ id_movimiento: 3, tipo_movimiento: TipoMovimientoFinanciero.INGRESO, monto: 100000, medio_pago: MedioPago.EFECTIVO, concepto: 'Base de caja' }),
        mov({ id_movimiento: 2, tipo_movimiento: TipoMovimientoFinanciero.INGRESO, monto: '18000' as unknown as number, medio_pago: MedioPago.NEQUI,
          id_pedido: 12, origen: OrigenMovimiento.VENTA, pedido: { numero_mesa: 3 } as never }),
        mov({ id_movimiento: 1, tipo_movimiento: TipoMovimientoFinanciero.INGRESO, monto: 4000, medio_pago: MedioPago.TRANSFERENCIA,
          id_pedido: 9, origen: OrigenMovimiento.VENTA, pedido: { numero_mesa: null } as never }),
      ];
    });

    it('#1 lista cada movimiento con concepto, monto y medio de pago', async () => {
      const r = await service.historial();
      expect(r.movimientos.map((m) => [m.concepto, m.monto, m.medio_pago])).toEqual([
        ['Compra de pan', 30000, 'EFECTIVO'],
        ['Base de caja', 100000, 'EFECTIVO'],
        ['Venta · Pedido #12 · Mesa 3', 18000, 'NEQUI'],
        ['Venta · Pedido #9 · Para llevar', 4000, 'TRANSFERENCIA'],
      ]);
      expect(r.movimientos[0]).toMatchObject({ tipo_movimiento: 'EGRESO', registrado_por: 'Cajero QA' });
    });

    it('#2 calcula el saldo neto actual (Ingresos - Egresos)', async () => {
      const r = await service.historial();
      expect(r.resumen).toEqual({ ingresos: 122000, egresos: 30000, saldo: 92000 });
    });

    it('#2 calcula el saldo por medio de pago para el cuadre de caja', async () => {
      const r = await service.historial();
      expect(r.por_medio).toEqual(expect.arrayContaining([
        { medio_pago: 'EFECTIVO', ingresos: 100000, egresos: 30000, saldo: 70000 },
        { medio_pago: 'NEQUI', ingresos: 18000, egresos: 0, saldo: 18000 },
      ]));
    });

    it('el saldo puede quedar negativo si hay más egresos que ingresos', async () => {
      filas = [mov({ id_movimiento: 1, tipo_movimiento: TipoMovimientoFinanciero.EGRESO, monto: 5000, medio_pago: MedioPago.EFECTIVO, concepto: 'Gas' })];
      expect((await service.historial()).resumen).toEqual({ ingresos: 0, egresos: 5000, saldo: -5000 });
    });

    it('sin movimientos devuelve la lista vacía y el saldo en cero', async () => {
      filas = [];
      const r = await service.historial();
      expect(r).toEqual({ resumen: { ingresos: 0, egresos: 0, saldo: 0 }, por_medio: [], movimientos: [] });
    });

    it('nunca selecciona la contraseña del usuario y ordena del más reciente al más antiguo', async () => {
      await service.historial();
      const columnas = qb.addSelect.mock.calls.flat(2) as string[];
      expect(columnas.some((c) => c.includes('password'))).toBe(false);
      expect(qb.orderBy).toHaveBeenCalledWith('m.fecha_hora', 'DESC');
    });
  });
});