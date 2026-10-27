/**
 * Pruebas unitarias: reglas de una línea configurada (HU-3.2)
 * ------------------------------------------------------------------
 * SCRUM-152 precio con adicionales · SCRUM-153 combos
 * SCRUM-154 notas para cocina · SCRUM-155 stock de insumos
 */
import {
  calcularPrecioUnitario,
  calcularSubtotal,
  claveLinea,
  componerNota,
  esLineaConfigurada,
  faltanteStock,
  formatearNotaCocina,
  lineasCocina,
  precioConPromocion,
} from './configuracion-linea';

describe('configuracion-linea (HU-3.2)', () => {
  const combo = { tipo: 'COMBO' as const, precio_final: null, recargo: 3000, porcentaje_descuento: 0 };

  it('SCRUM-152: Subtotal = (precio base + Σ adicionales) × cantidad', () => {
    const unitario = calcularPrecioUnitario(16000, [{ precio_unitario: 1500, cantidad: 1 }]);
    expect(unitario).toBe(17500);
    expect(calcularSubtotal(unitario, 2)).toBe(35000);
  });

  it('SCRUM-153: Individual $16.000 -> Combo con papa $19.000', () => {
    expect(precioConPromocion(16000, null)).toBe(16000);
    expect(precioConPromocion(16000, combo)).toBe(19000);
    expect(calcularPrecioUnitario(16000, [{ precio_unitario: 1500, cantidad: 1 }], combo)).toBe(20500);
  });

  it('SCRUM-153: descuento porcentual y precio fijo', () => {
    expect(precioConPromocion(20000, { tipo: 'DESCUENTO', precio_final: null, recargo: 0, porcentaje_descuento: 15 })).toBe(17000);
    expect(precioConPromocion(20000, { ...combo, precio_final: 18000 })).toBe(18000);
  });

  it('SCRUM-154: une notas rápidas y texto libre, y la formatea para cocina', () => {
    const nota = componerNota(['Sin cebolla'], '  término   medio ');
    expect(nota).toBe('Sin cebolla, término medio');
    expect(formatearNotaCocina(nota)).toBe('** SIN CEBOLLA, TERMINO MEDIO **');
    expect(componerNota([], '   ')).toBeNull();
    expect(formatearNotaCocina(null)).toBeNull();
  });

  it('comanda: adicionales y combo con "+", nota resaltada (prototipo 14)', () => {
    expect(
      lineasCocina({
        cantidad: 2,
        item: { nombre: 'Choripán Pampero' },
        adicionales: [{ nombre_adicional: 'Chimi Rojo', cantidad: 1 }],
        promocion_aplicada: 'Combo con papa',
        notas_especiales: 'sin cebolla',
      }),
    ).toEqual(['2x CHORIPAN PAMPERO', '+ Chimi Rojo', '+ Combo con papa', '** SIN CEBOLLA **']);
  });

  it('la clave de línea coincide con la del backend (orden y mayúsculas no importan)', () => {
    expect(claveLinea(1, [{ id_adicional: 3 }, { id_adicional: 1, cantidad: 1 }], 2, 'Sin Cebolla')).toBe(
      '1|1x1,3x1|2|sin cebolla',
    );
    expect(claveLinea(9)).toBe('9|||');
  });

  it('una línea con adicionales o promoción es configurada', () => {
    expect(esLineaConfigurada({ adicionales: [{}] })).toBe(true);
    expect(esLineaConfigurada({ promocion_aplicada: 'Combo con papa' })).toBe(true);
    expect(esLineaConfigurada({ adicionales: [], promocion_aplicada: null })).toBe(false);
  });

  describe('SCRUM-155: stock de insumos', () => {
    const chimi = {
      nombre: 'Chimi Rojo',
      id_insumo: 101,
      insumo: 'Chimichurri rojo',
      cantidad_insumo: 1,
      stock_disponible: 5,
    };

    it('suma lo que piden todas las líneas y avisa si no alcanza', () => {
      expect(faltanteStock([{ cantidad: 5, consumidores: [chimi] }])).toBeNull();
      expect(
        faltanteStock([
          { cantidad: 3, consumidores: [chimi] },
          { cantidad: 5, consumidores: [chimi] },
        ]),
      ).toEqual({ id_insumo: 101, insumo: 'Chimichurri rojo', disponible: 5, requerido: 8, usado_por: ['Chimi Rojo'] });
    });

    it('ignora adicionales sin control de stock', () => {
      expect(
        faltanteStock([{ cantidad: 50, consumidores: [{ ...chimi, id_insumo: null, stock_disponible: null }] }]),
      ).toBeNull();
    });
  });
});
