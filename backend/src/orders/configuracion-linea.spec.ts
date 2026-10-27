/**
 * Pruebas unitarias: reglas de una línea configurada (HU-3.2)
 * ------------------------------------------------------------------
 * SCRUM-152 precio con adicionales · SCRUM-153 combos y promociones
 * SCRUM-154 formato de notas para cocina · SCRUM-155 vigencia
 * Funciones puras: no usan BD ni NestJS.
 */
import {
  calcularPrecioUnitario,
  calcularSubtotal,
  claveLinea,
  esLineaConfigurada,
  formatearNotaCocina,
  lineasCocina,
  normalizarNota,
  precioConPromocion,
  promocionVigente,
} from './configuracion-linea';
import { TipoPromocion } from './entities/promocion.entity';

describe('configuracion-linea (HU-3.2)', () => {
  const combo = {
    tipo: TipoPromocion.COMBO,
    recargo: 3000,
    precio_final: null,
    porcentaje_descuento: 0,
  };

  describe('SCRUM-152 · precio con adicionales', () => {
    it('Subtotal = (precio base + Σ adicionales) × cantidad', () => {
      const unitario = calcularPrecioUnitario(16000, [
        { precio_unitario: 1500, cantidad: 1 },
        { precio_unitario: 0, cantidad: 1 },
      ]);
      expect(unitario).toBe(17500);
      expect(calcularSubtotal(unitario, 2)).toBe(35000);
    });

    it('un adicional con cantidad 2 suma su precio dos veces', () => {
      expect(
        calcularPrecioUnitario(16000, [{ precio_unitario: 1500, cantidad: 2 }]),
      ).toBe(19000);
    });

    it('sin adicionales ni promoción el precio es el de venta', () => {
      expect(calcularPrecioUnitario(16000)).toBe(16000);
    });

    it('ignora precios negativos o no numéricos', () => {
      expect(
        calcularPrecioUnitario(16000, [{ precio_unitario: -500, cantidad: 1 }]),
      ).toBe(16000);
    });
  });

  describe('SCRUM-153 · combos y promociones', () => {
    it('Combo con papa: Individual $16.000 -> Combo $19.000', () => {
      expect(precioConPromocion(16000, combo)).toBe(19000);
    });

    it('combo + adicional extra = 19.000 + 1.500', () => {
      expect(
        calcularPrecioUnitario(
          16000,
          [{ precio_unitario: 1500, cantidad: 1 }],
          combo,
        ),
      ).toBe(20500);
    });

    it('precio_final fija el precio de la unidad', () => {
      expect(precioConPromocion(16000, { ...combo, precio_final: 18000 })).toBe(
        18000,
      );
    });

    it('DESCUENTO aplica el porcentaje y redondea al peso', () => {
      expect(
        precioConPromocion(15999, {
          tipo: TipoPromocion.DESCUENTO,
          porcentaje_descuento: '10.00',
        }),
      ).toBe(14399);
    });
  });

  describe('SCRUM-155 · vigencia de la promoción', () => {
    const ahora = new Date('2026-10-27T12:00:00Z');
    const base = {
      estado_activo: true,
      vigente_desde: new Date('2026-10-01T00:00:00Z'),
      vigente_hasta: new Date('2026-12-31T23:59:59Z'),
    };

    it('activa y dentro de las fechas -> vigente', () => {
      expect(promocionVigente(base, ahora)).toBe(true);
    });

    it('inactiva -> no vigente', () => {
      expect(promocionVigente({ ...base, estado_activo: false }, ahora)).toBe(
        false,
      );
    });

    it('vencida o futura -> no vigente', () => {
      expect(
        promocionVigente(
          { ...base, vigente_hasta: '2026-10-26T23:59:59Z' },
          ahora,
        ),
      ).toBe(false);
      expect(
        promocionVigente(
          { ...base, vigente_desde: '2026-11-01T00:00:00Z' },
          ahora,
        ),
      ).toBe(false);
    });
  });

  describe('SCRUM-154 · notas especiales', () => {
    it('limpia espacios y deja null si está vacía', () => {
      expect(normalizarNota('  sin   cebolla  ')).toBe('sin cebolla');
      expect(normalizarNota('   ')).toBeNull();
      expect(normalizarNota(undefined)).toBeNull();
    });

    it('formatea la nota para cocina: ** SIN CEBOLLA **', () => {
      expect(formatearNotaCocina('sin cebolla')).toBe('** SIN CEBOLLA **');
      expect(formatearNotaCocina('término medio, sin ají')).toBe(
        '** TERMINO MEDIO, SIN AJI **',
      );
      expect(formatearNotaCocina('')).toBeNull();
    });
  });

  describe('Comanda de cocina (prototipo 14)', () => {
    it('imprime producto, adicionales y combo con "+" y la nota resaltada', () => {
      expect(
        lineasCocina({
          cantidad: '2',
          item: { nombre: 'Choripán Pampero' },
          adicionales: [
            { cantidad: 1, nombre_adicional: 'Chimi Rojo' },
            { cantidad: 2, adicional: { nombre: 'Aderezo adicional extra' } },
          ],
          promocion_aplicada: 'Combo con papa',
          notas_especiales: 'sin cebolla',
        }),
      ).toEqual([
        '2x CHORIPAN PAMPERO',
        '+ Chimi Rojo',
        '+ Aderezo adicional extra x2',
        '+ Combo con papa',
        '** SIN CEBOLLA **',
      ]);
    });

    it('un producto simple solo imprime su línea', () => {
      expect(
        lineasCocina({ cantidad: 2, item: { nombre: 'Cerveza' } }),
      ).toEqual(['2x CERVEZA']);
    });
  });

  describe('Agrupación de líneas', () => {
    it('la clave no depende del orden de los adicionales ni de mayúsculas en la nota', () => {
      expect(
        claveLinea(
          1,
          [{ id_adicional: 3 }, { id_adicional: 1 }],
          2,
          'Sin Cebolla',
        ),
      ).toBe(
        claveLinea(
          1,
          [{ id_adicional: 1 }, { id_adicional: 3 }],
          2,
          'sin cebolla ',
        ),
      );
    });

    it('distinto adicional, promoción o nota -> líneas distintas', () => {
      const base = claveLinea(1, [{ id_adicional: 1 }], null, null);
      expect(claveLinea(1, [{ id_adicional: 2 }], null, null)).not.toBe(base);
      expect(claveLinea(1, [{ id_adicional: 1 }], 1, null)).not.toBe(base);
      expect(
        claveLinea(1, [{ id_adicional: 1 }], null, 'sin cebolla'),
      ).not.toBe(base);
    });

    it('una línea con adicionales o promoción es configurada', () => {
      expect(esLineaConfigurada({ adicionales: [{}] })).toBe(true);
      expect(esLineaConfigurada({ promocion_aplicada: 'Combo con papa' })).toBe(
        true,
      );
      expect(
        esLineaConfigurada({ adicionales: [], promocion_aplicada: null }),
      ).toBe(false);
    });
  });
});
