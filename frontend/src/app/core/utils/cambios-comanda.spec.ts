/**
 * Pruebas unitarias: texto del aviso "Pedido modificado" (HU-4.3 · SCRUM-182)
 */
import { resumirCambios } from './cambios-comanda';

describe('resumirCambios (HU-4.3)', () => {
  it('un cambio se muestra tal cual', () => {
    expect(resumirCambios(['Se agregó 1x Cerveza'])).toBe('Se agregó 1x Cerveza');
  });

  it('dos cambios se unen con "y"', () => {
    expect(resumirCambios(['Se agregó 1x Cerveza', 'Se modificó la nota de Choripán Pampero: "sin cebolla"'])).toBe(
      'Se agregó 1x Cerveza y se modificó la nota de Choripán Pampero: "sin cebolla"',
    );
  });

  it('tres o más cambios: "A, b y c"', () => {
    expect(resumirCambios(['Se agregó 1x Cerveza', 'Se quitó 1x Gaseosa', 'Se quitó la nota de Choripán Azteca'])).toBe(
      'Se agregó 1x Cerveza, se quitó 1x Gaseosa y se quitó la nota de Choripán Azteca',
    );
  });

  it('sin cambios devuelve un texto genérico', () => {
    expect(resumirCambios([])).toBe('Se modificó el pedido');
  });
});
