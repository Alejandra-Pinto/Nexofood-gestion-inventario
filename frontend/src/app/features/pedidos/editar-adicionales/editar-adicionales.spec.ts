/**
 * Pruebas unitarias: EditarAdicionales (modal)
 * ------------------------------------------------------------------
 * Editar adicionales y formato de una línea existente del pedido:
 *   - Abre con los adicionales y el combo que la línea tiene hoy.
 *   - Marcar/desmarcar adicionales y cambiar el formato recalcula el precio.
 *   - Stock insuficiente: tarjeta del prototipo 21 y no se aplica.
 *   - Combo actual ya no vigente: se puede conservar.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditarAdicionales, ResultadoAdicionales } from './editar-adicionales';
import { OpcionAdicional, OpcionPromocion, OpcionesPedido } from '../../../core/models/pedido.model';

describe('EditarAdicionales', () => {
  let fixture: ComponentFixture<EditarAdicionales>;
  let cmp: any;
  let html: HTMLElement;

  const adicional = (id: number, nombre: string, tipo: OpcionAdicional['tipo'], precio: number, id_insumo: number | null, stock: number | null): OpcionAdicional => ({
    id_adicional: id, nombre, tipo, descripcion: null, precio_adicional: precio, id_categoria: 1,
    id_insumo, insumo: id_insumo ? `Insumo de ${nombre}` : null, cantidad_insumo: 1,
    stock_disponible: stock, disponible: stock === null || stock > 0,
  });

  const combo: OpcionPromocion = {
    id_promocion: 1, nombre: 'Combo con papa', descripcion: null, tipo: 'COMBO', precio_final: null, recargo: 3000,
    porcentaje_descuento: 0, id_categoria: 1, id_insumo: 102, insumo: 'Papa a la francesa (porción)', cantidad_insumo: 1,
    stock_disponible: 3, disponible: true, vigente_hasta: '2027-10-27T00:00:00Z',
  };

  const opciones: OpcionesPedido = {
    adicionales: [
      adicional(3, 'Orégano', 'PAN', 0, 100, 40),
      adicional(7, 'Ciabatta', 'PAN', 0, 104, 40),
      adicional(2, 'Chimi Rojo', 'ADEREZO', 0, 101, 30),
      adicional(4, 'Queso fundido', 'EXTRA', 2500, 103, 20),
      adicional(6, 'Tocineta', 'EXTRA', 3000, null, null),
    ],
    promociones: [combo],
  };

  const montar = (config: { seleccion?: { id_adicional: number; cantidad: number; nombre: string }[]; promo?: string | null; cantidad?: number; otras?: unknown[] } = {}) => {
    fixture = TestBed.createComponent(EditarAdicionales);
    fixture.componentRef.setInput('producto', { nombre: 'Choripán Pampero', precio_venta: 16000, id_categoria: 1 });
    fixture.componentRef.setInput('opciones', opciones);
    fixture.componentRef.setInput('seleccionInicial', config.seleccion ?? [
      { id_adicional: 3, cantidad: 1, nombre: 'Orégano' },
      { id_adicional: 2, cantidad: 1, nombre: 'Chimi Rojo' },
    ]);
    fixture.componentRef.setInput('promocionInicial', config.promo === undefined ? 'Combo con papa' : config.promo);
    fixture.componentRef.setInput('cantidad', config.cantidad ?? 2);
    fixture.componentRef.setInput('otrasLineas', config.otras ?? []);
    fixture.detectChanges();
    cmp = fixture.componentInstance;
    html = fixture.nativeElement as HTMLElement;
  };

  const digitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');
  const subtotal = () => digitos(html.querySelector('[data-test="subtotal-adicionales"]')?.textContent);
  const chip = (texto: string) =>
    Array.from(html.querySelectorAll<HTMLButtonElement>('.chip-opcion')).find((b) => b.textContent?.includes(texto))!;
  const formato = (texto: string) =>
    Array.from(html.querySelectorAll<HTMLButtonElement>('.formato button')).find((b) => b.textContent?.includes(texto))!;
  const extra = (texto: string) =>
    Array.from(html.querySelectorAll<HTMLLabelElement>('.extra')).find((l) => l.textContent?.includes(texto))!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EditarAdicionales] }).compileComponents();
  });

  it('abre con los adicionales y el combo que la línea tiene hoy', () => {
    montar();
    expect(chip('Orégano').classList).toContain('activa');
    expect(chip('Chimi Rojo').classList).toContain('activa');
    expect(formato('Combo con papa').classList).toContain('activo');
    expect(extra('Queso fundido').querySelector('input')!.checked).toBe(false);
    // (16.000 + 3.000 combo) × 2
    expect(subtotal()).toBe('38000');
  });

  it('marcar y desmarcar un adicional recalcula el subtotal', () => {
    montar();
    extra('Queso fundido').querySelector('input')!.click();
    fixture.detectChanges();
    expect(subtotal()).toBe(String((16000 + 3000 + 2500) * 2));

    extra('Queso fundido').querySelector('input')!.click();
    fixture.detectChanges();
    expect(subtotal()).toBe('38000');
  });

  it('quitar el aderezo y cambiar el pan', () => {
    montar();
    chip('Chimi Rojo').click(); // tocar el elegido lo quita
    chip('Ciabatta').click();
    fixture.detectChanges();
    expect(cmp.seleccion().map((a: { nombre: string }) => a.nombre)).toEqual(['Ciabatta']);
  });

  it('cambiar a formato Individual quita el recargo del combo', () => {
    montar();
    formato('Individual').click();
    fixture.detectChanges();
    expect(formato('Individual').classList).toContain('activo');
    expect(subtotal()).toBe('32000');
  });

  it('si no hay papas para el combo muestra la tarjeta de stock y no lo aplica', () => {
    // Otra línea del pedido ya usa 2 de las 3 papas; esta línea pide 2 más
    const otras = [{ cantidad: 2, consumidores: [{ ...combo, cantidad: 1 }] }];
    montar({ promo: null, otras });
    formato('Combo con papa').click();
    fixture.detectChanges();

    expect(cmp.promoSel()).toBeNull();
    expect(html.querySelector('app-alerta-stock')?.textContent).toContain('Quedan 3 unidades y el pedido requiere 4');
  });

  it('un combo que ya no está vigente se puede conservar', () => {
    montar({ promo: 'Combo de verano' });
    expect(formato('Combo de verano (actual)').classList).toContain('activo');
    expect(html.textContent).toContain('ya no está vigente');

    let resultado: ResultadoAdicionales | undefined;
    cmp.aplicar.subscribe((r: ResultadoAdicionales) => (resultado = r));
    html.querySelector<HTMLButtonElement>('[data-test="aplicar-adicionales"]')!.click();
    expect(resultado).toMatchObject({ mantenerPromocion: true, promocion: null });
  });

  it('"Aplicar cambios" emite la selección y el precio unitario', () => {
    montar();
    extra('Tocineta').querySelector('input')!.click();
    fixture.detectChanges();

    let resultado: ResultadoAdicionales | undefined;
    cmp.aplicar.subscribe((r: ResultadoAdicionales) => (resultado = r));
    html.querySelector<HTMLButtonElement>('[data-test="aplicar-adicionales"]')!.click();

    expect(resultado!.adicionales.map((a) => a.nombre)).toEqual(['Orégano', 'Chimi Rojo', 'Tocineta']);
    expect(resultado!.promocion?.id_promocion).toBe(1);
    expect(resultado!.precioUnitario).toBe(16000 + 3000 + 3000);
  });

  it('un adicional que ya no está en el catálogo se muestra y se puede quitar', () => {
    montar({ seleccion: [{ id_adicional: 99, cantidad: 1, nombre: 'Salsa retirada' }] });
    expect(html.textContent).toContain('+ Salsa retirada');
    cmp.quitarNoDisponible(99);
    expect(cmp.seleccion()).toEqual([]);
  });
});
