/** Pruebas unitarias: IngresoFinanciero - Pruebas de ingresos no provenientes de ventas */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IngresoFinanciero } from './ingreso-financiero';
import { ListaIngresos } from '../../../core/models/finanzas.model';
import { environment } from '../../../../environments/environment';

describe('IngresoFinanciero', () => {
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/finance/ingresos`;
  const vacia: ListaIngresos = { desde: '2026-11-01', hasta: '2026-11-06', total: 0, ingresos: [] };

  const crear = async (lista: ListaIngresos = vacia) => {
    const fixture = TestBed.createComponent(IngresoFinanciero);
    http.expectOne((r) => r.method === 'GET' && r.url === url).flush(lista);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };

  const llenar = (cmp: any, monto: string) => {
    cmp.concepto.set('Aporte de socios');
    cmp.monto.set(monto);
    cmp.medio.set('EFECTIVO');
    cmp.categoria.set('APORTE_SOCIOS');
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [IngresoFinanciero],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('muestra el estado vacío cuando no hay ingresos en el mes', async () => {
    const { html } = await crear();
    expect(html.textContent).toContain('Aún no hay ingresos este mes');
  });

  it('no envía nada si faltan campos obligatorios', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.registrar();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'POST');
    expect(html.textContent).toContain('El concepto es obligatorio');
    expect(html.textContent).toContain('El monto es obligatorio');
  });

  it.each([
    ['0', 'Debe ser mayor a cero'],
    ['-5000', 'Debe ser mayor a cero'],
    ['1500.5', 'sin decimales'],
    ['200000000', 'máximo permitido'],
  ])('SCRUM-247 bloquea el monto inválido %s', async (monto, mensaje) => {
    const { fixture, cmp, html } = await crear();
    llenar(cmp, monto);
    cmp.registrar();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'POST');
    expect(html.textContent).toContain(mensaje);
  });

  it('envía el ingreso válido y recarga la lista', async () => {
    const { cmp } = await crear();
    llenar(cmp, '200000');
    cmp.registrar();
    const req = http.expectOne((r) => r.method === 'POST' && r.url === url);
    expect(req.request.body).toMatchObject({ concepto: 'Aporte de socios', monto: 200000, medio_pago: 'EFECTIVO', categoria: 'APORTE_SOCIOS' });
    req.flush({ id_movimiento: 1, monto: 200000, concepto: 'Aporte de socios', categoria: 'APORTE_SOCIOS', medio_pago: 'EFECTIVO', fecha_hora: '2026-11-06T15:00:00Z', observaciones: null, registrado_por: null });
    http.expectOne((r) => r.method === 'GET' && r.url === url).flush({ ...vacia, total: 200000, ingresos: [] });
    expect(cmp.monto()).toBe('');
  });
});
