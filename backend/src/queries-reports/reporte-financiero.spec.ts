/** Pruebas unitarias: reporte financiero de ingresos y egresos (HU-6.4 · SCRUM-227) */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import {
  aNumero,
  construirReporteFinanciero,
  FilaComprasInventario,
  FilaConsumoInterno,
  FilaEgresoAgrupado,
  FilaIngresoAgrupado,
  FilaMovimiento,
  MAX_MOVIMIENTOS,
  ReporteFinanciero,
} from './reporte-financiero';
import { ReportesService } from './reportes.service';
import { diaColombia } from './reportes';
import { Pedido } from '../orders/entities/pedido.entity';
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';

// ---------------------------------------------------------------------------
// Datos de un período con de todo un poco (como los devuelve `pg`: strings)
// ---------------------------------------------------------------------------
const ingresosEjemplo: FilaIngresoAgrupado[] = [
  { origen: 'VENTA', medio_pago: 'EFECTIVO', total: '49000', cantidad: '2' }, // 30.000 + 19.000
  { origen: 'VENTA', medio_pago: 'TRANSFERENCIA', total: '31000', cantidad: '1' },
  { origen: 'VENTA', medio_pago: 'NEQUI', total: '12000', cantidad: '1' },
  { origen: 'MANUAL', medio_pago: 'EFECTIVO', total: '100000', cantidad: '1' },
];
const egresosEjemplo: FilaEgresoAgrupado[] = [
  { categoria: 'servicios', total: '18400', cantidad: '1' },
  { categoria: 'compra_proveedores', total: '42000', cantidad: '1' },
];
const consumoEjemplo: FilaConsumoInterno[] = [
  { id_item: '1', nombre: 'Choripán Pampero', costo_fabricacion: 5500, unidades: '2', total_valorizado: '11000' },
  { id_item: '7', nombre: 'Gaseosa', costo_fabricacion: 0, unidades: '3', total_valorizado: '0' },
];
const comprasEjemplo: FilaComprasInventario = { total: '50000', cantidad: '1' };
const movimientosEjemplo: FilaMovimiento[] = [
  { id_movimiento: '9', fecha_hora: '2026-11-19T20:00:00.000Z', tipo_movimiento: 'INGRESO', origen: 'VENTA', medio_pago: 'EFECTIVO', monto: '30000', concepto: null, categoria: null, id_pedido: '24' },
  { id_movimiento: '8', fecha_hora: '2026-11-19T18:00:00.000Z', tipo_movimiento: 'EGRESO', origen: 'MANUAL', medio_pago: 'TRANSFERENCIA', monto: '42000', concepto: 'Compra proveedor Carnes del Sur', categoria: 'compra_proveedores', id_pedido: null },
];

const construirEjemplo = () =>
  construirReporteFinanciero('2026-11-01', '2026-11-30', {
    ingresos: ingresosEjemplo,
    egresos: egresosEjemplo,
    consumo: consumoEjemplo,
    compras: comprasEjemplo,
    movimientos: movimientosEjemplo,
  });

/** Invariantes que deben cumplirse en cualquier reporte */
function verificarInvariantes(r: ReporteFinanciero) {
  expect(r.ingresos.por_medio_pago.reduce((s, m) => s + m.total, 0)).toBe(r.ingresos.total);
  expect(r.ingresos.ventas + r.ingresos.manuales).toBe(r.ingresos.total);
  expect(r.ingresos.efectivo + r.ingresos.no_efectivo).toBe(r.ingresos.total);
  expect(r.saldo_neto).toBe(r.ingresos.total - r.egresos.total);
}

describe('Reporte financiero · cálculo (HU-6.4)', () => {
  it('calcula ingresos, egresos, saldo neto y consumo interno del período', () => {
    const r = construirEjemplo();
    expect(r.ingresos.total).toBe(192000);
    expect(r.ingresos.ventas).toBe(92000);
    expect(r.ingresos.manuales).toBe(100000);
    expect(r.ingresos.cantidad).toBe(5);
    expect(r.egresos.total).toBe(60400);
    expect(r.egresos.cantidad).toBe(2);
    expect(r.saldo_neto).toBe(131600);
    expect(r.consumo_interno.total_valorizado).toBe(11000);
    expect(r.consumo_interno.unidades).toBe(5);
    expect(r.sin_movimientos).toBe(false);
    verificarInvariantes(r);
  });

  it('desglosa los ingresos por los 5 medios de pago, con subtotales efectivo / no efectivo (SCRUM-226)', () => {
    const r = construirEjemplo();
    expect(r.ingresos.por_medio_pago).toEqual([
      { medio_pago: 'EFECTIVO', total: 149000, cantidad: 3 },
      { medio_pago: 'TRANSFERENCIA', total: 31000, cantidad: 1 },
      { medio_pago: 'NEQUI', total: 12000, cantidad: 1 },
      { medio_pago: 'DAVIPLATA', total: 0, cantidad: 0 },
      { medio_pago: 'TARJETA', total: 0, cantidad: 0 },
    ]);
    expect(r.ingresos.efectivo).toBe(149000);
    expect(r.ingresos.no_efectivo).toBe(43000);
  });

  it('regresión: una venta con origen VENTA SÍ entra en ingresos.total', () => {
    const r = construirReporteFinanciero('2026-11-01', '2026-11-30', {
      ingresos: [{ origen: 'VENTA', medio_pago: 'EFECTIVO', total: '28000', cantidad: '1' }],
      egresos: [],
      consumo: [],
      compras: undefined,
      movimientos: [],
    });
    expect(r.ingresos.total).toBe(28000);
    expect(r.ingresos.ventas).toBe(28000);
    expect(r.ingresos.manuales).toBe(0);
  });

  it('suma los SUM() que llegan como string en vez de concatenarlos', () => {
    const r = construirReporteFinanciero('2026-11-01', '2026-11-30', {
      ingresos: [
        { origen: 'VENTA', medio_pago: 'EFECTIVO', total: '30000', cantidad: '1' },
        { origen: 'MANUAL', medio_pago: 'EFECTIVO', total: '19000', cantidad: '1' },
      ],
      egresos: [
        { categoria: 'servicios', total: '1000', cantidad: '1' },
        { categoria: 'arriendo', total: '2000', cantidad: '1' },
      ],
      consumo: [],
      compras: undefined,
      movimientos: [],
    });
    expect(r.ingresos.total).toBe(49000); // concatenado sería "3000019000"
    expect(typeof r.ingresos.total).toBe('number');
    expect(r.ingresos.por_medio_pago[0].total).toBe(49000);
    expect(r.egresos.total).toBe(3000);
    expect(r.saldo_neto).toBe(46000);
    verificarInvariantes(r);
  });

  it('período vacío: todo en 0, sin NaN ni null', () => {
    const r = construirReporteFinanciero('2026-10-01', '2026-10-31', {
      ingresos: [],
      egresos: [],
      consumo: [],
      compras: { total: null, cantidad: '0' }, // SUM sin filas devuelve NULL
      movimientos: [],
    });
    expect(r.sin_movimientos).toBe(true);
    const numeros = [
      r.ingresos.total, r.ingresos.ventas, r.ingresos.manuales, r.ingresos.efectivo, r.ingresos.no_efectivo,
      r.egresos.total, r.saldo_neto, r.consumo_interno.total_valorizado, r.consumo_interno.unidades,
      r.compras_inventario.total, r.compras_inventario.cantidad, r.total_movimientos,
      ...r.ingresos.por_medio_pago.map((m) => m.total),
    ];
    for (const n of numeros) {
      expect(n).toBe(0);
    }
    expect(JSON.stringify(r)).not.toMatch(/NaN|null/);
    verificarInvariantes(r);
  });

  it('saldo negativo cuando los egresos superan a los ingresos (sin valor absoluto)', () => {
    const r = construirReporteFinanciero('2026-11-01', '2026-11-30', {
      ingresos: [{ origen: 'VENTA', medio_pago: 'EFECTIVO', total: '10000', cantidad: '1' }],
      egresos: [{ categoria: 'arriendo', total: '50000', cantidad: '1' }],
      consumo: [],
      compras: undefined,
      movimientos: [],
    });
    expect(r.saldo_neto).toBe(-40000);
  });

  it('consumo interno: cantidad × costo actual, no resta del saldo y cuenta los ítems con costo 0', () => {
    const r = construirEjemplo();
    expect(r.consumo_interno.afecta_saldo).toBe(false);
    expect(r.saldo_neto).toBe(r.ingresos.total - r.egresos.total); // no se le resta 11.000
    expect(r.consumo_interno.items_sin_costo).toBe(1);
    const gaseosa = r.consumo_interno.por_item.find((i) => i.nombre === 'Gaseosa');
    expect(gaseosa).toEqual({ id_item: 7, nombre: 'Gaseosa', unidades: 3, costo_fabricacion: 0, total_valorizado: 0 });
    expect(r.consumo_interno.por_item[0].nombre).toBe('Choripán Pampero');
  });

  it('las compras de inventario son informativas: no suman a egresos ni al saldo', () => {
    const r = construirEjemplo();
    expect(r.compras_inventario).toEqual({
      total: 50000,
      cantidad: 1,
      egresos_compra_proveedores: 42000,
      incluido_en_egresos: false,
    });
    expect(r.egresos.total).toBe(60400);
  });

  it('genera el concepto "Venta pedido #id" para las ventas y conserva el de los manuales', () => {
    const r = construirEjemplo();
    expect(r.movimientos[0]).toEqual({
      id_movimiento: 9,
      fecha_hora: '2026-11-19T20:00:00.000Z',
      concepto: 'Venta pedido #24',
      tipo: 'INGRESO',
      origen: 'VENTA',
      medio_pago: 'EFECTIVO',
      monto: 30000,
    });
    expect(r.movimientos[1].concepto).toBe('Compra proveedor Carnes del Sur');
    expect(r.egresos.por_categoria[0]).toEqual({ categoria: 'compra_proveedores', etiqueta: 'Compra a proveedores', total: 42000, cantidad: 1 });
  });

  it('marca el listado como truncado si hay más movimientos que el límite', () => {
    const r = construirEjemplo();
    expect(r.total_movimientos).toBe(7);
    expect(r.movimientos_truncados).toBe(true); // 7 en los totales, 2 en el listado de ejemplo
    expect(MAX_MOVIMIENTOS).toBe(1000);
  });

  it('aNumero convierte bigint-string, NULL y vacíos sin producir NaN', () => {
    expect(aNumero('123456789012')).toBe(123456789012);
    expect(aNumero(null)).toBe(0);
    expect(aNumero(undefined)).toBe(0);
    expect(aNumero('')).toBe(0);
    expect(aNumero('abc')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Servicio: consultas SQL (QueryBuilder simulado)
// ---------------------------------------------------------------------------
type Condicion = { sql: string; params?: Record<string, unknown> };
interface Consulta {
  clave: string;
  selects: string[];
  condiciones: Condicion[];
  grupos: string[];
  limite?: number;
}

describe('ReportesService · financiero (HU-6.4)', () => {
  let service: ReportesService;
  let consultas: Consulta[];
  let datos: Record<string, unknown>;

  /** Cada QueryBuilder se identifica por el alias de su primer select */
  function qbSimulado(): Record<string, jest.Mock> {
    const c: Consulta = { clave: '', selects: [], condiciones: [], grupos: [] };
    consultas.push(c);
    const qb: Record<string, jest.Mock> = {};
    const sel = jest.fn((expr: string, alias?: string) => {
      if (!c.clave) c.clave = alias ?? expr;
      c.selects.push(expr);
      return qb;
    });
    const cond = jest.fn((sql: string, params?: Record<string, unknown>) => {
      c.condiciones.push({ sql, params });
      return qb;
    });
    const grp = jest.fn((g: string) => {
      c.grupos.push(g);
      return qb;
    });
    Object.assign(qb, {
      select: sel,
      addSelect: sel,
      where: cond,
      andWhere: cond,
      groupBy: grp,
      addGroupBy: grp,
      innerJoin: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      addOrderBy: jest.fn(() => qb),
      limit: jest.fn((n: number) => {
        c.limite = n;
        return qb;
      }),
      getRawMany: jest.fn(() => Promise.resolve(datos[c.clave] ?? [])),
      getRawOne: jest.fn(() => Promise.resolve(datos[c.clave])),
    });
    return qb;
  }

  const consulta = (clave: string) => consultas.find((c) => c.clave === clave)!;

  beforeEach(async () => {
    consultas = [];
    datos = {
      origen: ingresosEjemplo,
      categoria: egresosEjemplo,
      id_item: consumoEjemplo,
      total: comprasEjemplo,
      id_movimiento: movimientosEjemplo,
    };
    const repoMovimientos = {
      createQueryBuilder: () => qbSimulado(),
      manager: { getRepository: () => ({ createQueryBuilder: () => qbSimulado() }) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportesService,
        { provide: getRepositoryToken(Pedido), useValue: { createQueryBuilder: () => qbSimulado() } },
        { provide: getRepositoryToken(MovimientoFinanciero), useValue: repoMovimientos },
      ],
    }).compile();
    service = module.get(ReportesService);
  });

  afterEach(() => jest.useRealTimers());

  it('arma el reporte completo con los totales de las consultas agregadas', async () => {
    const r = await service.financiero('2026-11-01', '2026-11-30');
    expect(r.ingresos.total).toBe(192000);
    expect(r.egresos.total).toBe(60400);
    expect(r.saldo_neto).toBe(131600);
    expect(r.consumo_interno.total_valorizado).toBe(11000);
    expect(r.compras_inventario.total).toBe(50000);
    verificarInvariantes(r);
  });

  it('trampa: la consulta de ingresos NO filtra por origen (incluye las ventas)', async () => {
    await service.financiero('2026-11-01', '2026-11-30');
    const ingresos = consulta('origen');
    expect(ingresos.condiciones.some((c) => c.params && 'origen' in c.params)).toBe(false);
    expect(ingresos.condiciones[0].params).toEqual({ tipo: 'INGRESO' });
    expect(ingresos.grupos).toEqual(['m.origen', 'm.medio_pago']);
    expect(ingresos.selects).toContain('SUM(m.monto)');
  });

  it('filtra cada consulta por el día en hora de Colombia', async () => {
    await service.financiero('2026-11-01', '2026-11-30');
    for (const c of consultas) {
      const fecha = c.condiciones.find((x) => x.sql.includes('BETWEEN'));
      expect(fecha?.sql).toMatch(/\((m|mi)\.fecha_hora AT TIME ZONE 'America\/Bogota'\)::date BETWEEN :desde AND :hasta/);
      expect(fecha?.params).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' });
    }
  });

  it('borde de zona horaria: 23:30 del 30/11 en Bogotá (04:30 UTC del 01/12) pertenece a noviembre', () => {
    // Es la misma conversión que hace PostgreSQL con AT TIME ZONE 'America/Bogota'
    expect(diaColombia('2026-12-01T04:30:00Z')).toBe('2026-11-30');
    const dia = diaColombia('2026-12-01T04:30:00Z');
    expect(dia >= '2026-11-01' && dia <= '2026-11-30').toBe(true);
    expect(diaColombia('2026-12-01T05:00:00Z')).toBe('2026-12-01');
  });

  it('sin fechas usa el mes en curso en hora de Colombia', async () => {
    jest.useFakeTimers({ now: new Date('2026-12-01T03:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] }); // 30/11 22:00 en Bogotá
    const r = await service.financiero();
    expect(r.desde).toBe('2026-11-01');
    expect(r.hasta).toBe('2026-11-30');
  });

  it('consumo interno: solo SALIDA por CONSUMO_INTERNO (sin merma), valorizado con costo_fabricacion', async () => {
    await service.financiero('2026-11-01', '2026-11-30');
    const c = consulta('id_item');
    expect(c.condiciones.map((x) => x.params)).toEqual(
      expect.arrayContaining([{ salida: 'SALIDA' }, { motivo: 'CONSUMO_INTERNO' }]),
    );
    expect(JSON.stringify(c.condiciones)).not.toContain('MERMA');
    expect(c.selects).toContain('SUM(mi.cantidad::bigint * item.costo_fabricacion)');
  });

  it('las compras de inventario se consultan aparte (ENTRADA por COMPRA)', async () => {
    await service.financiero('2026-11-01', '2026-11-30');
    const c = consulta('total');
    expect(c.condiciones.map((x) => x.params)).toEqual(
      expect.arrayContaining([{ entrada: 'ENTRADA' }, { motivo: 'COMPRA' }]),
    );
  });

  it('el listado de movimientos está limitado', async () => {
    await service.financiero('2026-11-01', '2026-11-30');
    expect(consulta('id_movimiento').limite).toBe(MAX_MOVIMIENTOS);
  });

  it.each([
    ['2026-11-30', '2026-11-01', 'posterior'],
    ['2026-02-30', '2026-03-01', 'no es válida'],
    ['2026-11-01', undefined, 'Indique'],
  ])('rango inválido (%s → %s) → 400 sin consultar la base de datos', async (desde, hasta, mensaje) => {
    await expect(service.financiero(desde, hasta)).rejects.toThrow(BadRequestException);
    await expect(service.financiero(desde, hasta)).rejects.toThrow(mensaje);
    expect(consultas).toHaveLength(0);
  });
});
