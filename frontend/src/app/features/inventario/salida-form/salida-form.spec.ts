/**
 * Pruebas unitarias: SalidaForm
 * ------------------------------------------------------------------
 * HU-2.4 · SCRUM-134 Pruebas de salidas manuales
 *
 * Se mockea el backend con HttpTestingController: las peticiones HTTP
 * no salen a la red, cada prueba decide qué responde el "servidor".
 *
 * Ejecutar:  cd frontend  ->  npm test
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { SalidaForm } from './salida-form';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { environment } from '../../../../environments/environment';

describe('SalidaForm', () => {
  let fixture: ComponentFixture<SalidaForm>;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  const items: ItemInventario[] = [
    {
      id_item: 1,
      id_categoria: 1,
      nombre: 'Choripán Pampero',
      tipo_item: 'PRODUCTO',
      cantidad_stock: 20,
      stock_minimo: 5,
      costo_fabricacion: 8400,
      precio_venta: 16000,
      estado_activo: true,
    },
    {
      id_item: 2,
      id_categoria: 2,
      nombre: 'Chorizo artesanal',
      tipo_item: 'INSUMO',
      cantidad_stock: 3,
      stock_minimo: 10,
      costo_fabricacion: 3000,
      precio_venta: 0,
      estado_activo: true,
    },
  ];

  /** Crea el componente y responde la petición de carga de ítems */
  const crear = async (lista: ItemInventario[] = items) => {
    fixture = TestBed.createComponent(SalidaForm);
    http.expectOne(`${api}/products`).flush(lista);
    await fixture.whenStable();
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    return { fixture, cmp, html: fixture.nativeElement as HTMLElement };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SalidaForm],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  // ---------- Carga inicial ----------

  it('crea el componente y carga los ítems', async () => {
    const { cmp } = await crear();
    expect(cmp).toBeTruthy();
    expect(cmp.items().length).toBe(2);
  });

  // ---------- Validación de cliente ----------

  it('no envía nada si el formulario es inválido (sin ítem seleccionado)', async () => {
    const { cmp } = await crear();
    cmp.registrar();

    expect(cmp.form.invalid).toBe(true);
    http.expectNone(`${api}/inventory/salidas`);
  });

  it('rechaza cantidad 0', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({ id_item: 1, cantidad: 0 });

    expect(cmp.form.controls.cantidad.invalid).toBe(true);
  });

  // ---------- Casos de éxito ----------

  it('envía la salida con motivo MERMA y muestra el resultado', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({
      id_item: 1,
      motivo: 'MERMA',
      cantidad: 3,
      observaciones: 'Se dañó en cocina',
    });
    cmp.registrar();

    const req = http.expectOne(`${api}/inventory/salidas`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      id_item: 1,
      motivo: 'MERMA',
      cantidad: 3,
      observaciones: 'Se dañó en cocina',
    });

    req.flush({
      id_movimiento: 1,
      id_item: 1,
      id_usuario: 1,
      tipo_movimiento: 'SALIDA',
      motivo: 'MERMA',
      cantidad: 3,
      stock_anterior: 20,
      stock_nuevo: 17,
      observaciones: 'Se dañó en cocina',
      fecha_hora: '2026-10-04T00:00:00Z',
    });

    // Tras el éxito, el componente recarga los ítems
    http.expectOne(`${api}/products`).flush(items);

    expect(cmp.exito()).not.toBeNull();
    expect(cmp.exito()?.stock_anterior).toBe(20);
    expect(cmp.exito()?.stock_nuevo).toBe(17);
  });

  it('envía la salida con motivo CONSUMO_INTERNO', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({
      id_item: 2,
      motivo: 'CONSUMO_INTERNO',
      cantidad: 1,
    });
    cmp.registrar();

    const req = http.expectOne(`${api}/inventory/salidas`);
    expect(req.request.body.motivo).toBe('CONSUMO_INTERNO');

    req.flush({
      id_movimiento: 2,
      id_item: 2,
      id_usuario: 1,
      tipo_movimiento: 'SALIDA',
      motivo: 'CONSUMO_INTERNO',
      cantidad: 1,
      stock_anterior: 3,
      stock_nuevo: 2,
      observaciones: null,
      fecha_hora: '2026-10-04T00:00:00Z',
    });
    http.expectOne(`${api}/products`).flush(items);
  });

  // ---------- Casos de error HTTP ----------

  it('muestra el error 400 (stock insuficiente) del backend', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({ id_item: 1, motivo: 'MERMA', cantidad: 100 });
    cmp.registrar();

    http.expectOne(`${api}/inventory/salidas`).flush(
      {
        message:
          'Stock insuficiente para "Choripán Pampero". Disponible: 20, solicitado: 100',
      },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(cmp.errorGeneral()).toContain('Stock insuficiente');
    expect(cmp.enviando()).toBe(false);
    expect(cmp.exito()).toBeNull();
  });

  it('muestra mensaje de sesión expirada ante 401', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({ id_item: 1, motivo: 'MERMA', cantidad: 1 });
    cmp.registrar();

    http
      .expectOne(`${api}/inventory/salidas`)
      .flush({ message: 'No autorizado' }, { status: 401, statusText: 'Unauthorized' });

    expect(cmp.errorGeneral()).toContain('Sesión expirada');
  });

  it('muestra mensaje de permisos ante 403', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({ id_item: 1, motivo: 'MERMA', cantidad: 1 });
    cmp.registrar();

    http
      .expectOne(`${api}/inventory/salidas`)
      .flush({ message: 'Acceso denegado' }, { status: 403, statusText: 'Forbidden' });

    expect(cmp.errorGeneral()).toContain('permisos');
  });

  it('muestra el mensaje de ítem inexistente (404)', async () => {
    const { cmp } = await crear();
    cmp.form.patchValue({ id_item: 999, motivo: 'MERMA', cantidad: 1 });
    cmp.registrar();

    http.expectOne(`${api}/inventory/salidas`).flush(
      { message: 'El ítem con id 999 no existe' },
      { status: 404, statusText: 'Not Found' },
    );

    expect(cmp.errorGeneral()).toContain('El ítem con id 999 no existe');
  });

  // ---------- Interacción con botones ----------

  it('permite cambiar el motivo entre MERMA y CONSUMO_INTERNO', async () => {
    const { cmp } = await crear();

    expect(cmp.form.controls.motivo.value).toBe('MERMA');
    cmp.form.controls.motivo.setValue('CONSUMO_INTERNO');
    expect(cmp.form.controls.motivo.value).toBe('CONSUMO_INTERNO');
  });
});