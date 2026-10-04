/**
 * Pruebas unitarias: IngresoForm
 * ------------------------------------------------------------------
 * HU-2.3 · SCRUM-130 Pruebas de ingresos de stock (lado Angular)
 *
 * Se mockea el backend con HttpTestingController: ninguna petición sale a la
 * red; cada prueba decide qué responde el "servidor".
 *
 * Ejecutar:  cd frontend  ->  npm test
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { IngresoForm } from './ingreso-form';
import { ToastService } from '../../../core/services/toast.service';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { Proveedor } from '../../../core/models/movimiento-inventario.model';
import { environment } from '../../../../environments/environment';

describe('IngresoForm', () => {
  let fixture: ComponentFixture<IngresoForm>;
  let http: HttpTestingController;
  let toast: ToastService;
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
    {
      id_item: 3,
      id_categoria: 2,
      nombre: 'Ítem descontinuado',
      tipo_item: 'INSUMO',
      cantidad_stock: 0,
      stock_minimo: 0,
      costo_fabricacion: 100,
      precio_venta: 0,
      estado_activo: false,
    },
  ];

  const proveedores: Proveedor[] = [
    { id_proveedor: 2, nombre: 'Carnes del Sur', estado_activo: true },
    { id_proveedor: 3, nombre: 'Panadería La Espiga', estado_activo: true },
  ];

  /** Respuesta del backend para un ingreso exitoso */
  const movimiento = {
    id_movimiento: 10,
    id_item: 1,
    id_usuario: 1,
    tipo_movimiento: 'ENTRADA',
    motivo: 'COMPRA',
    cantidad: 120,
    stock_anterior: 20,
    stock_nuevo: 140,
    costo_unitario: 18000,
    total: 2160000,
    id_proveedor: 2,
    observaciones: null,
    fecha_hora: '2026-10-04T00:00:00Z',
  };

  /** Crea el componente y responde las 2 peticiones de carga (productos y proveedores) */
  const crear = async () => {
    fixture = TestBed.createComponent(IngresoForm);
    http.expectOne(`${api}/products`).flush(items);
    http.expectOne(`${api}/inventory/proveedores`).flush(proveedores);
    await fixture.whenStable();
    fixture.detectChanges();
    const cmp = fixture.componentInstance as any;
    return { cmp, html: fixture.nativeElement as HTMLElement };
  };

  /** Refleja en el DOM los cambios hechos desde el código */
  const refrescar = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** Llena un formulario de compra válido (120 u. x $18.000) */
  const llenarCompra = (cmp: any) =>
    cmp.form.patchValue({
      motivo: 'COMPRA',
      id_proveedor: 2,
      id_item: 1,
      cantidad: 120,
      costo_unitario: 18000,
    });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IngresoForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => http.verify());

  // ======================================================================
  // Carga inicial y estructura (prototipo 13)
  // ======================================================================
  describe('carga inicial', () => {
    it('carga solo los ítems activos y los proveedores', async () => {
      const { cmp } = await crear();

      expect(cmp.items().map((i: ItemInventario) => i.id_item)).toEqual([1, 2]);
      expect(cmp.proveedores().length).toBe(2);
    });

    it('arranca en "Compra a proveedor", con la fecha de hoy y total en 0', async () => {
      const { cmp, html } = await crear();

      expect(cmp.form.controls.motivo.value).toBe('COMPRA');
      expect(cmp.form.controls.fecha_ingreso.value).toBe(cmp.hoy);
      expect(html.querySelector('#proveedor')).not.toBeNull();
      expect(cmp.total()).toBe(0);
    });

    it('muestra los 2 tipos de ingreso del prototipo', async () => {
      const { html } = await crear();
      const texto = html.textContent ?? '';

      expect(texto).toContain('Compra a proveedor');
      expect(texto).toContain('Producción propia');
      expect(texto).toContain('Datos del ingreso');
    });

    it('avisa con un toast si falla la carga de proveedores', async () => {
      fixture = TestBed.createComponent(IngresoForm);
      http.expectOne(`${api}/products`).flush(items);
      http
        .expectOne(`${api}/inventory/proveedores`)
        .flush({}, { status: 500, statusText: 'Server Error' });

      expect(toast.toasts().some((t) => t.tipo === 'error')).toBe(true);
    });
  });

  // ======================================================================
  // Cambio de campos según el tipo de ingreso
  // ======================================================================
  describe('tipo de ingreso', () => {
    it('COMPRA exige proveedor y costo unitario', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ id_item: 1, cantidad: 10 });

      expect(cmp.form.controls.id_proveedor.hasError('required')).toBe(true);
      expect(cmp.form.controls.costo_unitario.hasError('required')).toBe(true);
      expect(cmp.form.invalid).toBe(true);
    });

    it('PRODUCCION oculta el proveedor y ya no lo exige', async () => {
      const { cmp, html } = await crear();

      cmp.form.controls.motivo.setValue('PRODUCCION');
      await refrescar();

      expect(html.querySelector('#proveedor')).toBeNull();
      expect(cmp.form.controls.id_proveedor.valid).toBe(true);
    });

    it('PRODUCCION no exige costo unitario: basta con ítem y cantidad', async () => {
      const { cmp } = await crear();

      cmp.form.controls.motivo.setValue('PRODUCCION');
      cmp.form.patchValue({ id_item: 1, cantidad: 30 });

      expect(cmp.form.valid).toBe(true);
    });

    it('al cambiar a PRODUCCION se limpia el proveedor ya elegido', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ id_proveedor: 2 });

      cmp.form.controls.motivo.setValue('PRODUCCION');

      expect(cmp.form.controls.id_proveedor.value).toBeNull();
    });

    it('volver a COMPRA vuelve a mostrar y exigir el proveedor', async () => {
      const { cmp, html } = await crear();
      cmp.form.controls.motivo.setValue('PRODUCCION');
      cmp.form.controls.motivo.setValue('COMPRA');
      await refrescar();

      expect(html.querySelector('#proveedor')).not.toBeNull();
      expect(cmp.form.controls.id_proveedor.hasError('required')).toBe(true);
    });
  });

  // ======================================================================
  // Validaciones (datos inválidos)
  // ======================================================================
  describe('validaciones', () => {
    it.each([0, -5, 1.5])('rechaza la cantidad %s', async (cantidad) => {
      const { cmp } = await crear();
      cmp.form.patchValue({ cantidad });

      expect(cmp.form.controls.cantidad.invalid).toBe(true);
    });

    it('acepta una cantidad entera positiva', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ cantidad: 120 });

      expect(cmp.form.controls.cantidad.valid).toBe(true);
    });

    it.each([0, -18000, 10.5])('rechaza el costo unitario %s', async (costo) => {
      const { cmp } = await crear();
      cmp.form.patchValue({ costo_unitario: costo });

      expect(cmp.form.controls.costo_unitario.invalid).toBe(true);
    });

    it('rechaza una fecha de ingreso futura', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ fecha_ingreso: '2999-01-01' });

      expect(cmp.form.controls.fecha_ingreso.hasError('fechaFutura')).toBe(true);
    });

    it('acepta una fecha pasada', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ fecha_ingreso: '2026-01-15' });

      expect(cmp.form.controls.fecha_ingreso.valid).toBe(true);
    });

    it('rechaza observaciones de más de 255 caracteres', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ observaciones: 'x'.repeat(256) });

      expect(cmp.form.controls.observaciones.hasError('maxlength')).toBe(true);
    });

    it('no envía nada si el formulario es inválido y avisa con un toast', async () => {
      const { cmp } = await crear();

      cmp.registrar();

      http.expectNone(`${api}/inventory/ingresos`);
      expect(cmp.form.touched).toBe(true);
      expect(toast.toasts().some((t) => t.tipo === 'error')).toBe(true);
    });

    it('muestra los errores en pantalla al intentar enviar vacío', async () => {
      const { cmp, html } = await crear();

      cmp.registrar();
      await refrescar();

      expect(html.querySelectorAll('.error-txt').length).toBeGreaterThan(0);
    });
  });

  // ======================================================================
  // Total del ingreso
  // ======================================================================
  describe('total del ingreso', () => {
    it('es cantidad x costo unitario (120 x $18.000 = $2.160.000)', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);

      expect(cmp.total()).toBe(2160000);
    });

    it('se actualiza al cambiar la cantidad', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);
      cmp.form.patchValue({ cantidad: 10 });

      expect(cmp.total()).toBe(180000);
    });

    it('en COMPRA sin costo el total es 0', async () => {
      const { cmp } = await crear();
      cmp.form.patchValue({ id_item: 1, cantidad: 10 });

      expect(cmp.total()).toBe(0);
    });

    it('en PRODUCCION sin costo usa el costo de fabricación del ítem', async () => {
      const { cmp } = await crear();
      cmp.form.controls.motivo.setValue('PRODUCCION');
      cmp.form.patchValue({ id_item: 1, cantidad: 30 });

      expect(cmp.total()).toBe(252000); // 30 x 8.400
    });

    it('una cantidad negativa no genera total', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);
      cmp.form.patchValue({ cantidad: -3 });

      expect(cmp.total()).toBe(0);
    });
  });

  // ======================================================================
  // Envío exitoso
  // ======================================================================
  describe('envío exitoso', () => {
    it('COMPRA: envía el cuerpo correcto al endpoint', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);
      cmp.form.patchValue({ observaciones: '  Lote #458  ' });

      cmp.registrar();

      const req = http.expectOne(`${api}/inventory/ingresos`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        id_item: 1,
        motivo: 'COMPRA',
        id_proveedor: 2,
        cantidad: 120,
        costo_unitario: 18000,
        fecha_ingreso: cmp.hoy,
        observaciones: 'Lote #458',
      });
      req.flush(movimiento);
      http.expectOne(`${api}/products`).flush(items);
    });

    it('PRODUCCION: no envía proveedor ni costo si no se digitaron', async () => {
      const { cmp } = await crear();
      cmp.form.controls.motivo.setValue('PRODUCCION');
      cmp.form.patchValue({ id_item: 1, cantidad: 30 });

      cmp.registrar();

      const req = http.expectOne(`${api}/inventory/ingresos`);
      expect(req.request.body).toEqual({
        id_item: 1,
        motivo: 'PRODUCCION',
        cantidad: 30,
        fecha_ingreso: cmp.hoy,
      });
      req.flush({ ...movimiento, motivo: 'PRODUCCION', id_proveedor: null });
      http.expectOne(`${api}/products`).flush(items);
    });

    it('PRODUCCION con costo opcional lo envía', async () => {
      const { cmp } = await crear();
      cmp.form.controls.motivo.setValue('PRODUCCION');
      cmp.form.patchValue({ id_item: 1, cantidad: 30, costo_unitario: 9000 });

      cmp.registrar();

      const req = http.expectOne(`${api}/inventory/ingresos`);
      expect(req.request.body.costo_unitario).toBe(9000);
      expect(req.request.body.id_proveedor).toBeUndefined();
      req.flush({ ...movimiento, motivo: 'PRODUCCION' });
      http.expectOne(`${api}/products`).flush(items);
    });

    it('muestra un toast de éxito con el stock anterior y el nuevo', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);
      cmp.registrar();

      http.expectOne(`${api}/inventory/ingresos`).flush(movimiento);
      http.expectOne(`${api}/products`).flush(items);

      const exito = toast.toasts().find((t) => t.tipo === 'exito');
      expect(exito?.mensaje).toContain('Choripán Pampero');
      expect(exito?.mensaje).toContain('20');
      expect(exito?.mensaje).toContain('140');
    });

    it('limpia el formulario, conserva el tipo de ingreso y recarga el stock', async () => {
      const { cmp } = await crear();
      cmp.form.controls.motivo.setValue('PRODUCCION');
      cmp.form.patchValue({ id_item: 1, cantidad: 30 });
      cmp.registrar();

      http.expectOne(`${api}/inventory/ingresos`).flush({ ...movimiento, motivo: 'PRODUCCION' });
      // El componente vuelve a pedir los ítems para mostrar el stock actualizado
      http.expectOne(`${api}/products`).flush(items);

      expect(cmp.form.controls.id_item.value).toBeNull();
      expect(cmp.form.controls.cantidad.value).toBeNull();
      expect(cmp.form.controls.motivo.value).toBe('PRODUCCION');
      expect(cmp.form.pristine).toBe(true);
    });
  });

  // ======================================================================
  // Estado "enviando": botones deshabilitados
  // ======================================================================
  describe('durante la petición', () => {
    const botones = (html: HTMLElement) => ({
      registrar: html.querySelector('button[type="submit"]') as HTMLButtonElement,
      cancelar: html.querySelector('button[type="button"]') as HTMLButtonElement,
    });

    it('deshabilita ambos botones y cambia el texto mientras espera', async () => {
      const { cmp, html } = await crear();
      llenarCompra(cmp);
      cmp.registrar();
      await refrescar();

      const { registrar, cancelar } = botones(html);
      expect(cmp.enviando()).toBe(true);
      expect(registrar.disabled).toBe(true);
      expect(cancelar.disabled).toBe(true);
      expect(registrar.textContent).toContain('Registrando');

      http.expectOne(`${api}/inventory/ingresos`).flush(movimiento);
      http.expectOne(`${api}/products`).flush(items);
    });

    it('vuelve a habilitar los botones al terminar', async () => {
      const { cmp, html } = await crear();
      llenarCompra(cmp);
      cmp.registrar();

      http.expectOne(`${api}/inventory/ingresos`).flush(movimiento);
      http.expectOne(`${api}/products`).flush(items);
      await refrescar();

      const { registrar, cancelar } = botones(html);
      expect(registrar.disabled).toBe(false);
      expect(cancelar.disabled).toBe(false);
      expect(registrar.textContent).toContain('Registrar ingreso');
    });

    it('ignora un segundo envío mientras la petición sigue en curso', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);

      cmp.registrar();
      cmp.registrar();

      // expectOne falla si se hubiera enviado más de una petición
      const req = http.expectOne(`${api}/inventory/ingresos`);
      req.flush(movimiento);
      http.expectOne(`${api}/products`).flush(items);
    });

    it('Cancelar no hace nada mientras se envía', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);
      cmp.registrar();

      cmp.cancelar();

      expect(cmp.form.controls.cantidad.value).toBe(120);
      http.expectOne(`${api}/inventory/ingresos`).flush(movimiento);
      http.expectOne(`${api}/products`).flush(items);
    });
  });

  // ======================================================================
  // Errores del backend → toast de error
  // ======================================================================
  describe('errores del backend', () => {
    /** Envía un ingreso válido y hace que el servidor responda con el error indicado */
    const enviarYFallar = async (cuerpo: unknown, status: number, statusText: string) => {
      const ctx = await crear();
      llenarCompra(ctx.cmp);
      ctx.cmp.registrar();
      http.expectOne(`${api}/inventory/ingresos`).flush(cuerpo, { status, statusText });
      return ctx;
    };

    const ultimoError = () => toast.toasts().filter((t) => t.tipo === 'error').at(-1)?.mensaje;

    it('400: muestra el mensaje del backend', async () => {
      await enviarYFallar({ message: 'La fecha de ingreso no puede ser futura' }, 400, 'Bad Request');

      expect(ultimoError()).toContain('no puede ser futura');
    });

    it('400: une los mensajes cuando el backend envía una lista', async () => {
      await enviarYFallar(
        { message: ['La cantidad debe ser mayor a 0', 'Debe indicar el proveedor'] },
        400,
        'Bad Request',
      );

      expect(ultimoError()).toBe('La cantidad debe ser mayor a 0. Debe indicar el proveedor');
    });

    it('401: pide volver a iniciar sesión', async () => {
      await enviarYFallar({ message: 'Unauthorized' }, 401, 'Unauthorized');

      expect(ultimoError()).toContain('Sesión expirada');
    });

    it('403: informa que no tiene permisos', async () => {
      await enviarYFallar({ message: 'Acceso denegado' }, 403, 'Forbidden');

      expect(ultimoError()).toContain('permisos');
    });

    it('404: producto no encontrado', async () => {
      await enviarYFallar({ message: 'El ítem con id 1 no existe' }, 404, 'Not Found');

      expect(ultimoError()).toContain('El ítem con id 1 no existe');
    });

    it('500: mensaje genérico', async () => {
      await enviarYFallar({}, 500, 'Server Error');

      expect(ultimoError()).toContain('No se pudo registrar el ingreso');
    });

    it('sin conexión (status 0): sugiere revisar el backend', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);
      cmp.registrar();
      http.expectOne(`${api}/inventory/ingresos`).error(new ProgressEvent('error'));

      expect(ultimoError()).toContain('No hay conexión');
    });

    it('tras un error vuelve a habilitar el envío y conserva lo digitado', async () => {
      const { cmp } = await enviarYFallar({ message: 'Error' }, 400, 'Bad Request');

      expect(cmp.enviando()).toBe(false);
      expect(cmp.form.controls.cantidad.value).toBe(120);
      expect(toast.toasts().some((t) => t.tipo === 'exito')).toBe(false);
    });
  });

  // ======================================================================
  // Cancelar
  // ======================================================================
  describe('cancelar', () => {
    it('descarta lo digitado sin enviar nada', async () => {
      const { cmp } = await crear();
      llenarCompra(cmp);

      cmp.cancelar();

      expect(cmp.form.controls.cantidad.value).toBeNull();
      expect(cmp.form.controls.id_item.value).toBeNull();
      http.expectNone(`${api}/inventory/ingresos`);
    });
  });
});
