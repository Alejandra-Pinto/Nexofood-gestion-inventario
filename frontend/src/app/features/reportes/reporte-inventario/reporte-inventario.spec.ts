/**
 * Pruebas unitarias: ReporteInventario
 * HU-6.1 · Generar reporte de inventario consolidado
 * HU-6.6 · Descargar y/o imprimir reportes
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ReporteInventario } from './reporte-inventario';
import { ReporteInventarioResultado } from '../../../core/models/reporte.model';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

describe('ReporteInventario (HU-6.1 y HU-6.6)', () => {
  let http: HttpTestingController;
  let toastMock: { exito: any; error: any; advertencia: any; info: any };
  const urlEndpoint = `${environment.apiUrl}/queries-reports/reportes/inventario`;

  const datosPrueba: ReporteInventarioResultado = {
    resumen: {
      total_items: 3,
      total_productos: 2,
      total_insumos: 1,
      items_bajo_stock: 1,
      items_agotados: 1,
    },
    items: [
      {
        id_item: 1,
        nombre: 'Choripán Pampero',
        tipo_item: 'PRODUCTO',
        id_categoria: 10,
        categoria: 'Choripanes',
        cantidad_stock: 15,
        stock_minimo: 5,
        precio_venta: 18000,
        estado_activo: true,
        estado_stock: 'NORMAL',
      },
      {
        id_item: 2,
        nombre: 'Pan Artesanal',
        tipo_item: 'INSUMO',
        id_categoria: 20,
        categoria: 'Panadería',
        cantidad_stock: 3,
        stock_minimo: 10,
        precio_venta: 0,
        estado_activo: true,
        estado_stock: 'BAJO',
      },
      {
        id_item: 3,
        nombre: 'Gaseosa Cola',
        tipo_item: 'PRODUCTO',
        id_categoria: 30,
        categoria: 'Bebidas',
        cantidad_stock: 0,
        stock_minimo: 4,
        precio_venta: 5000,
        estado_activo: true,
        estado_stock: 'AGOTADO',
      },
    ],
    fecha_generacion: '2026-11-06T03:00:00.000Z',
  };

  beforeEach(() => {
    toastMock = {
      exito: vi.fn(),
      error: vi.fn(),
      advertencia: vi.fn(),
      info: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ReporteInventario],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ToastService, useValue: toastMock },
      ],
    });

    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const inicializar = async (respuesta = datosPrueba) => {
    const fixture = TestBed.createComponent(ReporteInventario);
    const req = http.expectOne(urlEndpoint);
    expect(req.request.method).toBe('GET');
    req.flush(respuesta);
    await fixture.whenStable();
    fixture.detectChanges();
    return {
      fixture,
      cmp: fixture.componentInstance,
      html: fixture.nativeElement as HTMLElement,
    };
  };

  it('HU-6.1: carga y lista las existencias consolidadas con sus atributos y badges', async () => {
    const { html } = await inicializar();

    const filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(3);

    // Fila 1: Choripán Pampero (Producto, Stock Normal)
    expect(filas[0].textContent).toContain('Choripán Pampero');
    expect(filas[0].textContent).toContain('Producto');
    expect(filas[0].textContent).toContain('Choripanes');
    expect(filas[0].textContent).toContain('15');
    expect(filas[0].textContent).toContain('Normal');
    expect(filas[0].textContent!.replace(/\D/g, '')).toContain('18000');

    // Fila 2: Pan Artesanal (Insumo, Bajo stock)
    expect(filas[1].textContent).toContain('Pan Artesanal');
    expect(filas[1].textContent).toContain('Insumo');
    expect(filas[1].textContent).toContain('Bajo stock');

    // Fila 3: Gaseosa Cola (Agotado)
    expect(filas[2].textContent).toContain('Gaseosa Cola');
    expect(filas[2].textContent).toContain('Agotado');
  });

  it('HU-6.1: muestra las métricas cuantitativas consolidadas en el encabezado', async () => {
    const { html } = await inicializar();

    const valoresMetricas = Array.from(html.querySelectorAll('.metrica-valor')).map((el) => el.textContent?.trim());
    expect(valoresMetricas).toEqual(['3', '2', '1', '1', '1']);
  });

  it('HU-6.1: filtra por tipo (Productos, Insumos, Bajo stock, Agotados) y por texto', async () => {
    const { fixture, cmp, html } = await inicializar();

    // Filtro por Productos
    cmp.cambiarFiltro('PRODUCTO');
    fixture.detectChanges();
    let filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(2);

    // Filtro por Insumos
    cmp.cambiarFiltro('INSUMO');
    fixture.detectChanges();
    filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Pan Artesanal');

    // Filtro por Bajo stock
    cmp.cambiarFiltro('BAJO_STOCK');
    fixture.detectChanges();
    filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Pan Artesanal');

    // Búsqueda por texto
    cmp.cambiarFiltro('TODOS');
    cmp.actualizarBusqueda('Bebidas');
    fixture.detectChanges();
    filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain('Gaseosa Cola');
  });

  it('HU-6.1: maneja el caso de inventario vacío adecuadamente', async () => {
    const respuestaVacia: ReporteInventarioResultado = {
      resumen: {
        total_items: 0,
        total_productos: 0,
        total_insumos: 0,
        items_bajo_stock: 0,
        items_agotados: 0,
      },
      items: [],
      fecha_generacion: '2026-11-06T03:00:00.000Z',
    };

    const { html, cmp } = await inicializar(respuestaVacia);

    expect((cmp as any).inventarioVacio()).toBe(true);
    const vacio = html.querySelector('[data-test=inventario-vacio]');
    expect(vacio).not.toBeNull();
    expect(vacio?.textContent).toContain('No hay productos ni insumos registrados en el inventario');

    // Los botones de descarga e impresión deben estar deshabilitados
    const botones = html.querySelectorAll('.acciones-reporte button');
    botones.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
  });

  it('HU-6.6: ejecutar imprimir invoca window.print()', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { cmp } = await inicializar();

    cmp.imprimir();
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('HU-6.6: no permite imprimir ni descargar si el reporte está vacío', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const respuestaVacia: ReporteInventarioResultado = {
      resumen: { total_items: 0, total_productos: 0, total_insumos: 0, items_bajo_stock: 0, items_agotados: 0 },
      items: [],
      fecha_generacion: '2026-11-06T03:00:00.000Z',
    };
    const { cmp } = await inicializar(respuestaVacia);

    cmp.imprimir();
    expect(printSpy).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('No hay datos en el inventario para imprimir.');

    cmp.descargarPdf();
    expect(toastMock.error).toHaveBeenCalledWith('No hay datos en el reporte para exportar a PDF.');
    printSpy.mockRestore();
  });

  it('HU-6.6: descargarPdf respeta el filtro de solo insumos y exporta únicamente insumos', async () => {
    const { cmp } = await inicializar();

    // Filtro por INSUMO (debe haber 1 insumo en datosPrueba: Pan Artesanal)
    cmp.cambiarFiltro('INSUMO');

    const filtrados = (cmp as any).itemsFiltrados();
    expect(filtrados.length).toBe(1);
    expect(filtrados[0].tipo_item).toBe('INSUMO');
    expect(filtrados[0].nombre).toBe('Pan Artesanal');
    expect((cmp as any).descripcionFiltroActual()).toBe('Solo insumos');

    cmp.descargarPdf();
    expect(toastMock.exito).toHaveBeenCalledWith('Reporte de inventario descargado en PDF correctamente.');
  });

  it('HU-6.6: descargarPdf respeta el filtro de solo productos y exporta únicamente productos', async () => {
    const { cmp } = await inicializar();

    // Filtro por PRODUCTO (debe haber 2 productos en datosPrueba)
    cmp.cambiarFiltro('PRODUCTO');

    const filtrados = (cmp as any).itemsFiltrados();
    expect(filtrados.length).toBe(2);
    expect(filtrados.every((i: any) => i.tipo_item === 'PRODUCTO')).toBe(true);
    expect((cmp as any).descripcionFiltroActual()).toBe('Solo productos');

    cmp.descargarPdf();
    expect(toastMock.exito).toHaveBeenCalledWith('Reporte de inventario descargado en PDF correctamente.');
  });

  it('HU-6.6: descargarPdf respeta el término de búsqueda', async () => {
    const { cmp } = await inicializar();

    cmp.actualizarBusqueda('Pampero');

    const filtrados = (cmp as any).itemsFiltrados();
    expect(filtrados.length).toBe(1);
    expect(filtrados[0].nombre).toBe('Choripán Pampero');
    expect((cmp as any).descripcionFiltroActual()).toContain('Búsqueda: "Pampero"');

    cmp.descargarPdf();
    expect(toastMock.exito).toHaveBeenCalledWith('Reporte de inventario descargado en PDF correctamente.');
  });

  it('maneja errores HTTP del backend informando al usuario', async () => {
    const fixture = TestBed.createComponent(ReporteInventario);
    const req = http.expectOne(urlEndpoint);
    req.flush({ message: 'Error interno' }, { status: 500, statusText: 'Internal Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    const alerta = fixture.nativeElement.querySelector('.alerta-error');
    expect(alerta).not.toBeNull();
    expect(alerta.textContent).toContain('Error interno');
  });
});
