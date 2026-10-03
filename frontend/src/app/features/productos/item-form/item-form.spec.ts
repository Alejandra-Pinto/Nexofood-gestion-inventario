import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ItemForm } from './item-form';
import { environment } from '../../../../environments/environment';

/**
 * Pruebas unitarias: ItemForm (formulario "Nuevo producto")
 * ------------------------------------------------------------------
 * HU-2.1 · SCRUM-125 Pruebas de registro de ítems
 *
 * El backend se simula con HttpTestingController: las peticiones HTTP
 * no salen a la red, y cada prueba decide qué responde el "servidor".
 *
 * Ejecutar:  cd frontend  ->  ng test
 */
describe('ItemForm', () => {
  let http: HttpTestingController;
  const api = environment.apiUrl;

  /** Crea el componente y responde la petición de categorías */
  const crear = async () => {
    const fixture = TestBed.createComponent(ItemForm);
    http.expectOne(`${api}/categories`).flush([{ id_categoria: 1, nombre: 'Choripanes' }]);
    await fixture.whenStable();
    // Acceso a miembros protegidos solo para la prueba
    const cmp = fixture.componentInstance as any;
    return { fixture, cmp };
  };

  /** Llena el formulario con datos válidos (se pueden cambiar algunos) */
  const llenar = (cmp: any, cambios: Record<string, unknown> = {}) =>
    cmp.form.patchValue({
      nombre: '  Choripán   clásico ',
      tipo_item: 'PRODUCTO',
      id_categoria: 1,
      cantidad_stock: 20,
      stock_minimo: 5,
      costo_fabricacion: 5500,
      precio_venta: 12000,
      ...cambios,
    });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ItemForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  // Verifica que no queden peticiones HTTP sin responder
  afterEach(() => http.verify());

  it('no envía nada si faltan campos obligatorios', async () => {
    const { cmp } = await crear();
    cmp.guardar();

    expect(cmp.form.invalid).toBe(true);
    expect(cmp.form.controls.nombre.hasError('required')).toBe(true);
    expect(cmp.form.controls.id_categoria.invalid).toBe(true);
    http.expectNone(`${api}/products`);
  });

  it('rechaza un nombre con solo espacios y stock negativo', async () => {
    const { cmp } = await crear();
    llenar(cmp, { nombre: '    ', cantidad_stock: -3 });

    expect(cmp.form.controls.nombre.invalid).toBe(true);
    expect(cmp.form.controls.cantidad_stock.invalid).toBe(true);
  });

  it('envía el producto con stock inicial y nombre limpio', async () => {
    const { cmp } = await crear();
    llenar(cmp);
    cmp.guardar();

    const req = http.expectOne(`${api}/products`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      nombre: 'Choripán clásico',
      tipo_item: 'PRODUCTO',
      id_categoria: 1,
      cantidad_stock: 20,
      stock_minimo: 5,
      costo_fabricacion: 5500,
      precio_venta: 12000,
    });
    req.flush({ ...req.request.body, id_item: 1, estado_activo: true }, { status: 201, statusText: 'Created' });
    expect(cmp.exito()).toContain('20 unidades');
  });

  it('para insumos no pide precio y lo envía en 0', async () => {
    const { cmp } = await crear();
    llenar(cmp, { tipo_item: 'INSUMO', nombre: 'Pan baguette' });

    expect(cmp.form.controls.precio_venta.disabled).toBe(true);
    cmp.guardar();

    const req = http.expectOne(`${api}/products`);
    expect(req.request.body.precio_venta).toBe(0);
    req.flush({ ...req.request.body, id_item: 2, estado_activo: true });
  });

  it('muestra el error de duplicado que responde el backend (409)', async () => {
    const { cmp } = await crear();
    llenar(cmp);
    cmp.guardar();

    http
      .expectOne(`${api}/products`)
      .flush({ message: 'Ya existe un ítem llamado "Choripán clásico"' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.form.controls.nombre.getError('duplicado')).toContain('Ya existe');
    expect(cmp.guardando()).toBe(false);
  });

  it('el botón Cancelar avisa a la pantalla para cerrar el formulario', async () => {
    const { fixture, cmp } = await crear();
    let cancelado = false;
    cmp.cancelado.subscribe(() => (cancelado = true));

    const boton = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.trim() === 'Cancelar')!;
    boton.click();

    expect(cancelado).toBe(true);
    http.expectNone(`${api}/products`);
  });

  it('cambia a Insumo con los botones de tipo', async () => {
    const { fixture, cmp } = await crear();
    const boton = Array.from(fixture.nativeElement.querySelectorAll('button.tipo') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.trim() === 'Insumo')!;
    boton.click();

    expect(cmp.form.controls.tipo_item.value).toBe('INSUMO');
    expect(cmp.form.controls.precio_venta.disabled).toBe(true);
  });
});
