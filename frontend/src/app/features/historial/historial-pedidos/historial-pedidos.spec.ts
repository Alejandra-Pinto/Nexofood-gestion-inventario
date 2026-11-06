/**
 * Pruebas unitarias: HistorialPedidos
 * HU-5.2 · SCRUM-205 Pruebas de filtros
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { HistorialPedidos, MSJ_SIN_RESULTADOS } from './historial-pedidos';
import { ResultadoHistorial } from '../../../core/models/historial.model';
import { environment } from '../../../../environments/environment';

describe('HistorialPedidos', () => {
  let http: HttpTestingController;
  const api = environment.apiUrl;
  const esHistorial = (r: { url: string }) => r.url === `${api}/queries-reports/historial`;

  const resultado = (pedidos: ResultadoHistorial['pedidos'], filtros: Partial<ResultadoHistorial['filtros']> = {}): ResultadoHistorial => ({
    filtros: { fecha: null, desde: null, hasta: null, producto: null, ...filtros },
    resumen: { pedidos: pedidos.length, ventas: pedidos.filter((p) => p.estado_pedido === 'PAGADO').length, total_vendido: 36000 },
    pedidos,
  });
  const pedidos: ResultadoHistorial['pedidos'] = [
    { id_pedido: 2, fecha_hora: '2026-11-04T15:00:00.000Z', numero_mesa: 3, estado_pedido: 'PAGADO', total_calculado: 36000, mesero: 'Mesero QA',
      productos: [{ id_item: 5, nombre: 'Choripán Pampero', cantidad: 2 }] },
    { id_pedido: 1, fecha_hora: '2026-11-03T18:00:00.000Z', numero_mesa: null, estado_pedido: 'PENDIENTE', total_calculado: 4000, mesero: 'Mesero QA',
      productos: [{ id_item: 9, nombre: 'Gaseosa', cantidad: 1 }] },
  ];

  /** Crea la pantalla y responde las peticiones iniciales (productos + historial sin filtros) */
  const crear = async () => {
    const fixture = TestBed.createComponent(HistorialPedidos);
    http.expectOne(`${api}/products?tipo=PRODUCTO`).flush([
      { id_item: 5, id_categoria: 1, nombre: 'Choripán Pampero', tipo_item: 'PRODUCTO', cantidad_stock: 10, stock_minimo: 1, costo_fabricacion: 0, precio_venta: 18000, estado_activo: true },
    ]);
    const inicial = http.expectOne(esHistorial);
    expect(inicial.request.params.keys()).toEqual([]);
    inicial.flush(resultado(pedidos));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };
  const responder = async (fixture: { whenStable: () => Promise<unknown>; detectChanges: () => void }, req: TestRequest, r: ResultadoHistorial) => {
    req.flush(r);
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HistorialPedidos],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('al entrar lista todos los pedidos con id, fecha, hora, estado y total', async () => {
    const { html } = await crear();
    const filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('#2');
    expect(filas[0].textContent).toContain('04/11/2026');
    expect(filas[0].textContent).toContain('Pagado');
    expect(filas[0].textContent!.replace(/\D/g, '')).toContain('36000');
  });

  it('#1 BUSCAR por fecha envía solo esa fecha', async () => {
    const { cmp } = await crear();
    cmp.fecha.set('2026-11-04');
    cmp.buscar();
    const req = http.expectOne(esHistorial);
    expect(req.request.params.get('fecha')).toBe('2026-11-04');
    expect(req.request.params.keys()).toEqual(['fecha']);
    req.flush(resultado([pedidos[0]], { fecha: '2026-11-04' }));
  });

  it('#2 BUSCAR por rango envía la fecha inicial y la final', async () => {
    const { cmp } = await crear();
    cmp.cambiarModo('rango');
    cmp.desde.set('2026-11-01');
    cmp.hasta.set('2026-11-04');
    cmp.buscar();
    const req = http.expectOne(esHistorial);
    expect(req.request.params.get('desde')).toBe('2026-11-01');
    expect(req.request.params.get('hasta')).toBe('2026-11-04');
    req.flush(resultado(pedidos, { desde: '2026-11-01', hasta: '2026-11-04' }));
  });

  it('#3 y #4 combina producto y rango, y resalta el producto en la tabla', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.cambiarModo('rango');
    cmp.desde.set('2026-11-01');
    cmp.hasta.set('2026-11-04');
    cmp.idItem.set('5');
    cmp.buscar();
    const req = http.expectOne(esHistorial);
    expect(req.request.params.keys().sort()).toEqual(['desde', 'hasta', 'id_item']);
    expect(req.request.params.get('id_item')).toBe('5');
    await responder(fixture, req, resultado([pedidos[0]], { desde: '2026-11-01', hasta: '2026-11-04', producto: { id_item: 5, nombre: 'Choripán Pampero' } }));
    expect(html.querySelector('[data-test=filtros-aplicados]')?.textContent).toContain('del 01/11/2026 al 04/11/2026 · Choripán Pampero');
    expect(html.querySelector('.resaltado')?.textContent).toContain('Choripán Pampero');
  });

  it('#5 sin resultados informa que no existen operaciones', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.fecha.set('2025-01-01');
    cmp.buscar();
    await responder(fixture, http.expectOne(esHistorial), resultado([], { fecha: '2025-01-01' }));
    expect(html.querySelector('[data-test=sin-resultados]')?.textContent).toContain(MSJ_SIN_RESULTADOS);
    expect(html.querySelectorAll('tbody tr').length).toBe(0);
  });

  it('rango incompleto o invertido: avisa y no consulta', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.cambiarModo('rango');
    cmp.desde.set('2026-11-05');
    cmp.buscar();
    expect(cmp.errorFiltro()).toContain('fecha inicial y la fecha final');
    cmp.hasta.set('2026-11-01');
    cmp.buscar();
    fixture.detectChanges();
    expect(html.querySelector('.error-txt')?.textContent).toContain('no puede ser posterior');
    http.expectNone(esHistorial);
  });

  it('muestra el mensaje del backend ante un error 404', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.idItem.set('999');
    cmp.buscar();
    http.expectOne(esHistorial).flush({ message: 'El producto seleccionado no existe' }, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(html.querySelector('.alerta-error')?.textContent).toContain('El producto seleccionado no existe');
  });

  it('LIMPIAR quita los filtros y vuelve a listar todo', async () => {
    const { cmp } = await crear();
    cmp.fecha.set('2026-11-04');
    cmp.idItem.set('5');
    cmp.limpiar();
    const req = http.expectOne(esHistorial);
    expect(req.request.params.keys()).toEqual([]);
    req.flush(resultado(pedidos));
    expect(cmp.fecha()).toBe('');
  });
});
