/**
 * Pruebas unitarias: identificación de cambios del pedido (HU-4.3 · SCRUM-182/184)
 * Funciones puras: no usan BD ni NestJS.
 */
import { calcularCambios, LineaResumen, resumirLineaConfigurada, resumirLineas } from './cambios-comanda';

describe('cambios-comanda (HU-4.3)', () => {
  const pampero = (cantidad: number, nota: string | null = null): LineaResumen => ({
    id_item: 1, producto: 'Choripán Pampero', cantidad, nota,
  });
  const cerveza = (cantidad: number, nota: string | null = null): LineaResumen => ({
    id_item: 9, producto: 'Cerveza', cantidad, nota,
  });

  it('sin cambios no hay diferencias (no se genera nueva versión)', () => {
    expect(calcularCambios([pampero(2), cerveza(1)], [pampero(2), cerveza(1)])).toEqual([]);
  });

  it('producto nuevo: "Se agregó 1x Cerveza"', () => {
    const [c] = calcularCambios([pampero(2)], [pampero(2), cerveza(1)]);
    expect(c).toMatchObject({ tipo: 'AGREGADO', producto: 'Cerveza', cantidad: 1, texto: 'Se agregó 1x Cerveza' });
  });

  it('producto nuevo con nota la menciona', () => {
    const [c] = calcularCambios([], [cerveza(2, 'sin hielo')]);
    expect(c.texto).toBe('Se agregó 2x Cerveza (sin hielo)');
  });

  it('más unidades: "Se agregó 1x Cerveza (ahora 3)"', () => {
    const [c] = calcularCambios([cerveza(2)], [cerveza(3)]);
    expect(c).toMatchObject({ tipo: 'CANTIDAD_AUMENTADA', cantidad: 1, antes: 2, despues: 3, texto: 'Se agregó 1x Cerveza (ahora 3)' });
  });

  it('menos unidades y producto quitado', () => {
    const cambios = calcularCambios([pampero(2), cerveza(3)], [cerveza(1)]);
    expect(cambios.map((c) => c.texto)).toEqual([
      'Se quitó 2x Cerveza (ahora 1)',
      'Se quitó 2x Choripán Pampero',
    ]);
    expect(cambios.map((c) => c.tipo)).toEqual(['CANTIDAD_REDUCIDA', 'QUITADO']);
  });

  describe('notas especiales', () => {
    it('nota nueva', () => {
      const [c] = calcularCambios([pampero(1)], [pampero(1, 'sin cebolla')]);
      expect(c).toMatchObject({ tipo: 'NOTA', antes: null, despues: 'sin cebolla', texto: 'Se agregó la nota "sin cebolla" en Choripán Pampero' });
    });

    it('nota modificada', () => {
      const [c] = calcularCambios([pampero(1, 'sin cebolla')], [pampero(1, 'sin cebolla, bien cocido')]);
      expect(c.texto).toBe('Se modificó la nota de Choripán Pampero: "sin cebolla, bien cocido"');
    });

    it('nota quitada', () => {
      const [c] = calcularCambios([pampero(1, 'sin cebolla')], [pampero(1)]);
      expect(c.texto).toBe('Se quitó la nota de Choripán Pampero');
    });

    it('espacios o mayúsculas distintas no cuentan como cambio', () => {
      expect(calcularCambios([pampero(1, 'Sin cebolla')], [pampero(1, '  sin   cebolla ')])).toEqual([]);
    });

    it('cantidad y nota a la vez generan dos cambios', () => {
      const cambios = calcularCambios([pampero(1)], [pampero(2, 'sin cebolla')]);
      expect(cambios.map((c) => c.tipo)).toEqual(['CANTIDAD_AUMENTADA', 'NOTA']);
    });
  });

  it('resumirLineas agrupa filas por producto, suma cantidades y une notas distintas', () => {
    expect(
      resumirLineas([
        { id_item: 9, cantidad: '2', notas_especiales: 'sin hielo', item: { nombre: 'Cerveza' } },
        { id_item: 9, cantidad: 1, notas_especiales: 'sin hielo', item: { nombre: 'Cerveza' } },
        { id_item: 1, cantidad: 1, notas_especiales: null, item: { nombre: 'Choripán Pampero' } },
        { id_item: 1, cantidad: 1, notas_especiales: 'sin cebolla', item: { nombre: 'Choripán Pampero' } },
      ]),
    ).toEqual([
      { id_item: 9, producto: 'Cerveza', cantidad: 3, nota: 'sin hielo' },
      { id_item: 1, producto: 'Choripán Pampero', cantidad: 2, nota: 'sin cebolla' },
    ]);
  });

  describe('líneas con adicionales o combo (se comparan por id_detalle)', () => {
    const linea = { id_detalle: 5, id_item: 1, cantidad: 1, notas_especiales: null, item: { nombre: 'choripan clasico' }, promocion_aplicada: 'Combo con papa', adicionales: [{ nombre_adicional: 'Orégano', cantidad: 1 }] };

    it('la etiqueta incluye sus adicionales y el combo', () => {
      expect(resumirLineaConfigurada(linea)).toEqual({
        clave: 'det:5', id_detalle: 5, id_item: 1, cantidad: 1, nota: null, configurada: true,
        producto: 'choripan clasico (+ Orégano, + Combo con papa)',
        nombre: 'choripan clasico', adicionales: ['Orégano'], formato: 'Combo con papa',
      });
    });

    it('"Se incrementó 1x choripan clasico (+ Orégano, + Combo con papa)"', () => {
      const antes = resumirLineaConfigurada(linea);
      const [c] = calcularCambios([antes], [{ ...antes, cantidad: 2 }]);
      expect(c).toMatchObject({ tipo: 'CANTIDAD_AUMENTADA', id_detalle: 5, texto: 'Se incrementó 1x choripan clasico (+ Orégano, + Combo con papa) (ahora 2)' });
    });

    it('no se confunde con una línea simple del mismo producto', () => {
      const config = resumirLineaConfigurada(linea);
      const simple = { id_item: 1, producto: 'choripan clasico', cantidad: 1, nota: null };
      const cambios = calcularCambios([config, simple], [config, { ...simple, cantidad: 2 }]);
      expect(cambios).toHaveLength(1);
      expect(cambios[0]).toMatchObject({ texto: 'Se agregó 1x choripan clasico (ahora 2)' });
      expect(cambios[0].id_detalle).toBeUndefined();
    });
  });

  describe('cambios de adicionales y formato en la misma línea', () => {
    const linea = { id_detalle: 5, id_item: 1, cantidad: 1, notas_especiales: null, item: { nombre: 'Choripán Pampero' }, promocion_aplicada: null as string | null, adicionales: [{ nombre_adicional: 'Chimi Rojo', cantidad: 1 }] };

    it('adicional agregado y quitado', () => {
      const antes = resumirLineaConfigurada(linea);
      const despues = resumirLineaConfigurada({ ...linea, adicionales: [{ nombre_adicional: 'Queso fundido', cantidad: 1 }] });
      expect(calcularCambios([antes], [despues]).map((c) => [c.tipo, c.texto])).toEqual([
        ['ADICIONAL_AGREGADO', 'Se agregó adicional + Queso fundido en Choripán Pampero'],
        ['ADICIONAL_QUITADO', 'Se quitó adicional + Chimi Rojo en Choripán Pampero'],
      ]);
    });

    it('cambio de formato Individual -> Combo y Combo -> Individual', () => {
      const individual = resumirLineaConfigurada(linea);
      const combo = resumirLineaConfigurada({ ...linea, promocion_aplicada: 'Combo con papa' });
      expect(calcularCambios([individual], [combo])[0]).toMatchObject({
        tipo: 'FORMATO', id_detalle: 5, antes: 'Individual', despues: 'Combo con papa',
        texto: 'Se cambió a formato Combo con papa en Choripán Pampero',
      });
      expect(calcularCambios([combo], [individual])[0].texto).toBe('Se cambió a formato Individual en Choripán Pampero');
    });

    it('la misma configuración no genera cambios', () => {
      const l = resumirLineaConfigurada(linea);
      expect(calcularCambios([l], [{ ...l }])).toEqual([]);
    });
  });
});
