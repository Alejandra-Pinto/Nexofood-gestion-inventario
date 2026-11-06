/** Pruebas unitarias: cálculos de los reportes - Pruebas del resumen */
import { BadRequestException } from '@nestjs/common';
import { calcularResumen, diaColombia, validarPeriodo } from './reportes';

describe('Reportes', () => {
  const pedidos = [
    { fecha_hora: '2026-11-03T15:00:00Z', estado_pedido: 'PAGADO', total_calculado: 36000 },
    { fecha_hora: '2026-11-03T20:00:00Z', estado_pedido: 'PAGADO', total_calculado: '24000' },
    { fecha_hora: '2026-11-04T16:00:00Z', estado_pedido: 'ANULADO', total_calculado: 18000 },
    { fecha_hora: '2026-11-04T17:00:00Z', estado_pedido: 'Pendiente', total_calculado: 5000 },
  ];

  it('cuenta pedidos, ventas acumuladas y anulados', () => {
    const r = calcularResumen('2026-11-01', '2026-11-05', pedidos);
    expect(r.pedidos).toEqual({ total: 4, en_curso: 1 });
    expect(r.ventas).toEqual({ cantidad: 2, total: 60000, ticket_promedio: 30000 });
    expect(r.anulados).toEqual({ cantidad: 1, total: 18000 });
    expect(r.sin_operaciones).toBe(false);
  });

  it('los ingresos que no son ventas (HU-7.2) se muestran aparte y no cambian las ventas', () => {
    const r = calcularResumen('2026-11-01', '2026-11-05', pedidos, [{ monto: 200000 }, { monto: '50000' }]);
    expect(r.ventas.total).toBe(60000);
    expect(r.otros_ingresos).toEqual({ cantidad: 2, total: 250000 });
  });

  it('agrupa por día en la hora de Colombia (incluye los días en cero)', () => {
    const r = calcularResumen('2026-11-01', '2026-11-05', pedidos);
    expect(r.por_dia).toHaveLength(5);
    expect(r.por_dia.find((d) => d.fecha === '2026-11-03')).toEqual({ fecha: '2026-11-03', pedidos: 2, ventas: 2, total_vendido: 60000, anulados: 0 });
    expect(r.por_dia.find((d) => d.fecha === '2026-11-01')?.pedidos).toBe(0);
    // 2 a.m. UTC del 5 de noviembre todavía es 4 de noviembre en Colombia
    expect(diaColombia('2026-11-05T02:00:00Z')).toBe('2026-11-04');
  });

  it('período sin operaciones: todo en cero y sin_operaciones = true', () => {
    const r = calcularResumen('2026-10-01', '2026-10-02', []);
    expect(r.sin_operaciones).toBe(true);
    expect(r.ventas).toEqual({ cantidad: 0, total: 0, ticket_promedio: 0 });
    expect(r.por_dia.every((d) => d.pedidos === 0)).toBe(true);
  });

  it.each([
    [undefined, '2026-11-05', 'fecha inicial y la fecha final'],
    ['2026-02-30', '2026-03-01', 'fecha inicial no es válida'],
    ['2026-11-05', '2026-11-01', 'posterior'],
    ['2024-01-01', '2026-01-01', 'mayor a un año'],
  ])('rechaza el período inválido %s – %s', (desde, hasta, mensaje) => {
    expect(() => validarPeriodo(desde, hasta)).toThrow(BadRequestException);
    expect(() => validarPeriodo(desde, hasta)).toThrow(mensaje);
  });
});
