/**
 * Pruebas unitarias: NuevoPedido · HU-3.2 Adicionales, promociones, combos y notas
 * ------------------------------------------------------------------
 * Criterios de aceptación:
 *   1. Adicional agregado: actualiza el subtotal en pantalla (Signals).
 *   2. Combo aplicado: calcula su precio ($16.000 -> $19.000).
 *   3. Promoción no vigente: informa y NO la aplica al pedido.
 *   4. Nota especial: se envía en notas_especiales y se ve como ** SIN CEBOLLA **.
 *   5. Adicional sin stock: tarjeta del prototipo 21 y no se agrega.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NuevoPedido } from './nuevo-pedido';
import { ItemInventario, Categoria } from '../../../core/models/item-inventario.model';
import { OpcionesPedido, ResultadoCotizacion } from '../../../core/models/pedido.model';
import { environment } from '../../../../environments/environment';

describe('NuevoPedido · HU-3.2', () => {
  let http: HttpTestingController;
  const api = environment.apiUrl;

  const categorias: Categoria[] = [
    { id_categoria: 1, nombre: 'Choripanes' },
    { id_categoria: 2, nombre: 'Bebidas' },
  ];

  const productos: ItemInventario[] = [
    { id_item: 1, id_categoria: 1, nombre: 'Pampero', tipo_item: 'PRODUCTO', cantidad_stock: 20, stock_minimo: 5, costo_fabricacion: 5500, precio_venta: 16000, estado_activo: true },
    { id_item: 9, id_categoria: 2, nombre: 'Cerveza', tipo_item: 'PRODUCTO', cantidad_stock: 30, stock_minimo: 5, costo_fabricacion: 2000, precio_venta: 5000, estado_activo: true },
  ];

  const adicional = (id: number, nombre: string, tipo: 'PAN' | 'ADEREZO' | 'EXTRA', precio: number, id_insumo: number | null, stock: number | null) => ({
    id_adicional: id, nombre, tipo, descripcion: null, precio_adicional: precio, id_categoria: 1,
    id_insumo, insumo: id_insumo ? `Insumo ${nombre}` : null, cantidad_insumo: 1,
    stock_disponible: stock, disponible: stock === null || stock >= 1,
  });

  const opciones = (): OpcionesPedido => ({
    adicionales: [
      adicional(1, 'Ciabatta', 'PAN', 0, 100, 40),
      { ...adicional(2, 'Chimi Rojo', 'ADEREZO', 0, 101, 5), insumo: 'Chimichurri rojo' },
      adicional(3, 'Aderezo adicional extra', 'EXTRA', 1500, null, null),
    ],
    promociones: [
      {
        id_promocion: 1, nombre: 'Combo con papa', descripcion: null, tipo: 'COMBO', precio_final: null,
        recargo: 3000, porcentaje_descuento: 0, id_categoria: 1, id_insumo: 102, insumo: 'Papas',
        cantidad_insumo: 1, stock_disponible: 50, disponible: true, vigente_hasta: '2027-10-27T00:00:00Z',
      },
    ],
  });

  /** Solo dígitos: "$17,500" -> "17500" (independiente del locale) */
  const digitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '');

  const crear = async () => {
    const fixture = TestBed.createComponent(NuevoPedido);
    http.expectOne((r) => r.url === `${api}/products`).flush(productos);
    http.expectOne(`${api}/categories`).flush(categorias);
    http.expectOne(`${api}/orders/opciones`).flush(opciones());
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };

  /** Abre el wizard y llega al paso 3 con Pampero + Ciabatta */
  const irAlPaso3 = async () => {
    const r = await crear();
    r.cmp.abrirChoripan();
    r.cmp.elegirChori(productos[0]);
    r.cmp.siguiente(); // paso 2
    r.cmp.elegirPan(r.cmp.panes()[0]);
    r.cmp.siguiente(); // paso 3
    r.fixture.detectChanges();
    return r;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NuevoPedido],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http?.verify();
  });

  it('el wizard muestra los 3 pasos con su progreso (33% / 67% / 100%)', async () => {
    const { cmp, fixture, html } = await crear();
    cmp.abrirChoripan();
    fixture.detectChanges();
    expect(html.textContent).toContain('PASO 1 DE 3');
    expect(html.textContent).toContain('33% Completado');
    expect(html.textContent).toContain('Elegí tu chori');

    cmp.elegirChori(productos[0]);
    cmp.siguiente();
    fixture.detectChanges();
    expect(html.textContent).toContain('Paso 2: Pan base');
    expect(html.textContent).toContain('67% Completado');

    cmp.elegirPan(cmp.panes()[0]);
    cmp.siguiente();
    fixture.detectChanges();
    expect(html.textContent).toContain('100% Completado');
    expect(html.textContent).toContain('Elegí tu aderezo');
    expect(html.textContent).toContain('Agregar al pedido');
  });

  it('Criterio 1: marcar el adicional (+$1.500) actualiza el subtotal al instante', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    const subtotal = () => digitos(html.querySelector('[data-test="subtotal"]')?.textContent);
    expect(subtotal()).toBe('16000');

    const check = html.querySelector<HTMLInputElement>('.extra input')!;
    check.click();
    fixture.detectChanges();
    expect(cmp.adicionalesConfig().map((a: { nombre: string }) => a.nombre)).toContain('Aderezo adicional extra');
    expect(subtotal()).toBe('17500');

    cmp.cambiarChoriCantidad(2);
    fixture.detectChanges();
    expect(subtotal()).toBe('35000'); // (16.000 + 1.500) × 2

    check.click(); // desmarcar
    fixture.detectChanges();
    expect(subtotal()).toBe('32000');
  });

  it('Criterio 2: el formato Combo con papa cambia el precio a $19.000', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    const botones = Array.from(html.querySelectorAll<HTMLButtonElement>('.formato button'));
    expect(botones.map((b) => digitos(b.textContent))).toEqual(['16000', '19000']);

    botones[1].click();
    fixture.detectChanges();
    expect(cmp.promoSel()?.nombre).toBe('Combo con papa');
    expect(digitos(html.querySelector('[data-test="subtotal"]')?.textContent)).toBe('19000');
  });

  it('Agregar al pedido: el backend confirma el precio y la línea queda con adicionales, combo y nota', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    cmp.elegirAderezo(cmp.aderezos()[0]);
    cmp.alternarExtra(cmp.extras()[0]);
    cmp.elegirFormato(cmp.promociones()[0]);
    cmp.alternarNotaRapida('Sin cebolla');
    cmp.siguiente(); // "Agregar al pedido"

    const req = http.expectOne(`${api}/orders/cotizar`);
    const detalle = { id_item: 1, cantidad: 1, adicionales: [{ id_adicional: 1 }, { id_adicional: 2 }, { id_adicional: 3 }], id_promocion: 1, notas_especiales: 'Sin cebolla' };
    expect(req.request.body).toEqual({ detalles: [detalle] });
    const cotizacion: ResultadoCotizacion = {
      lineas: [{
        id_item: 1, nombre: 'Pampero', cantidad: 1, precio_base: 19000, precio_unitario: 20500, subtotal: 20500,
        id_promocion: 1, promocion_aplicada: 'Combo con papa', notas_especiales: 'Sin cebolla',
        adicionales: [
          { id_adicional: 1, nombre: 'Ciabatta', cantidad: 1, precio_unitario: 0 },
          { id_adicional: 2, nombre: 'Chimi Rojo', cantidad: 1, precio_unitario: 0 },
          { id_adicional: 3, nombre: 'Aderezo adicional extra', cantidad: 1, precio_unitario: 1500 },
        ],
        lineas_cocina: [],
      }],
      total: 20500,
    };
    req.flush(cotizacion);
    fixture.detectChanges();

    expect(cmp.vista()).toBe('pedido');
    expect(cmp.total()).toBe(20500);
    const tarjeta = html.querySelector('.tarjeta')!;
    expect(tarjeta.textContent).toContain('+ Chimi Rojo');
    expect(tarjeta.textContent).toContain('+ Combo con papa');
    expect(tarjeta.textContent).toContain('Sin cebolla');

    // Al enviar, el pedido lleva la configuración completa
    cmp.enviar();
    const envio = http.expectOne(`${api}/orders`);
    expect(envio.request.method).toBe('POST');
    expect(envio.request.body).toEqual({ detalles: [detalle] });
    envio.flush({ id_pedido: 24, id_mesero: 1, numero_mesa: null, fecha_hora: '2026-10-27T12:45:00Z', estado_pedido: 'PENDIENTE', total_calculado: 20500, detalles: [] });
    expect(cmp.lineas()).toEqual([]);
  });

  it('Criterio 3: promoción no vigente (422) informa y no la aplica al pedido', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    cmp.elegirFormato(cmp.promociones()[0]);
    cmp.siguiente();

    http.expectOne(`${api}/orders/cotizar`).flush(
      { codigo: 'PROMOCION_NO_VIGENTE', id_promocion: 1, message: 'La promoción "Combo con papa" no está vigente y no se aplicó al pedido' },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    fixture.detectChanges();

    expect(cmp.lineas()).toEqual([]); // no se agregó
    expect(cmp.vista()).toBe('choripan');
    expect(cmp.promoSel()).toBeNull(); // vuelve a Individual
    expect(cmp.promociones()).toEqual([]); // ya no se ofrece
    expect(html.textContent).toContain('no está vigente y no se aplicó al pedido');
  });

  it('Criterio 4: la nota se ve como ** SIN CEBOLLA ** antes de enviarla a cocina', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    const chip = Array.from(html.querySelectorAll<HTMLButtonElement>('.chip-nota')).find((b) =>
      b.textContent?.includes('Sin cebolla'),
    )!;
    chip.click();
    cmp.escribirNota('salsa aparte');
    fixture.detectChanges();

    expect(cmp.notaConfig()).toBe('Sin cebolla, salsa aparte');
    expect(html.querySelector('.nota-cocina')?.textContent).toBe('** SIN CEBOLLA, SALSA APARTE **');
  });

  it('Criterio 5: adicional sin stock muestra la tarjeta del prototipo 21 y no se agrega', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    cmp.cambiarChoriCantidad(8);
    cmp.elegirAderezo(cmp.aderezos()[0]); // Chimi Rojo: hay 5 y se necesitan 8
    fixture.detectChanges();

    expect(cmp.aderezoSel()).toBeNull();
    const tarjeta = html.querySelector('app-alerta-stock')!;
    expect(tarjeta.textContent).toContain('Chimichurri rojo sin existencias suficientes');
    expect(tarjeta.textContent).toContain('Quedan 5 unidades y el pedido requiere 8');

    const quitar = Array.from(tarjeta.querySelectorAll('button')).find((b) => b.textContent?.includes('Quitar producto'))!;
    quitar.click();
    fixture.detectChanges();
    expect(html.querySelector('app-alerta-stock')).toBeNull();
  });

  it('Criterio 5: si el backend responde STOCK_INSUFICIENTE no agrega la línea y muestra la tarjeta', async () => {
    const { cmp, fixture, html } = await irAlPaso3();
    cmp.siguiente();

    http.expectOne(`${api}/orders/cotizar`).flush(
      { codigo: 'STOCK_INSUFICIENTE', id_item: 100, insumo: 'Pan ciabatta', adicionales: ['Ciabatta'], disponible: 0, requerido: 1, message: 'Pan ciabatta sin existencias suficientes.' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(cmp.lineas()).toEqual([]);
    expect(html.querySelector('app-alerta-stock')?.textContent).toContain('Quedan 0 unidades y el pedido requiere 1');
    expect(cmp.panes()[0].disponible).toBe(false); // se actualiza el stock conocido
  });

  it('las bebidas siguen sumándose como línea simple', async () => {
    const { cmp } = await crear();
    cmp.sumar(productos[1]);
    cmp.sumar(productos[1]);
    expect(cmp.cantidadEnPedido(9)).toBe(2);
    expect(cmp.total()).toBe(10000);
  });
});
