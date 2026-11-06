/**
 * Pruebas unitarias: Reportes (pantalla)
 * HU-6.7 · SCRUM-239 Pruebas del resumen
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Reportes } from './reportes';
import { MSJ_SIN_OPERACIONES, rangoDe, ResumenPeriodo } from '../../../core/models/reportes.model';
import { environment } from '../../../../environments/environment';

describe('Reportes · resumen por período', () => {
  let http: HttpTestingController;
  const urlResumen = `${environment.apiUrl}/queries-reports/resumen`;

  const resumen = (cambios: Partial<ResumenPeriodo> = {}): ResumenPeriodo => ({
    desde: '2026-11-01',
    hasta: '2026-11-06',
    sin_operaciones: false,
    pedidos: { total: 4, en_curso: 1 },
    ventas: { cantidad: 2, total: 60000, ticket_promedio: 30000 },
    anulados: { cantidad: 1, total: 18000 },
    otros_ingresos: { cantidad: 0, total: 0 },
    por_dia: [{ fecha: '2026-11-03', pedidos: 3, ventas: 2, total_vendido: 60000, anulados: 1 }],
    ...cambios,
  });

  /** Crea la pantalla y responde la consulta inicial (este mes) */
  const crear = async (r: ResumenPeriodo) => {
    const fixture = TestBed.createComponent(Reportes);
    const req = http.expectOne((x) => x.url === urlResumen);
    expect(req.request.params.get('desde')).toBe(rangoDe('mes').desde);
    req.flush(r);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Reportes],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('SCRUM-236 muestra pedidos, ventas acumuladas, anulados y el detalle por día', async () => {
    const { html } = await crear(resumen());
    const texto = html.textContent!;
    expect(texto).toContain('Ventas acumuladas');
    expect(texto.replace(/\D/g, '')).toContain('60000');
    expect(texto).toContain('Pedidos anulados');
    expect(html.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('SCRUM-238 período sin operaciones muestra el mensaje y no las cifras', async () => {
    const { html } = await crear(resumen({ sin_operaciones: true, pedidos: { total: 0, en_curso: 0 }, por_dia: [] }));
    expect(html.textContent).toContain(MSJ_SIN_OPERACIONES);
    expect(html.textContent).not.toContain('Ventas acumuladas');
  });

  it('"Hoy" consulta solo el día de hoy', async () => {
    const { cmp } = await crear(resumen());
    cmp.elegirPeriodo('hoy');
    const req = http.expectOne((x) => x.url === urlResumen);
    expect(req.request.params.get('desde')).toBe(req.request.params.get('hasta'));
    req.flush(resumen());
  });

  it('rango personalizado inválido no consulta', async () => {
    const { cmp } = await crear(resumen());
    cmp.elegirPeriodo('personalizado');
    cmp.desde.set('2026-11-06');
    cmp.hasta.set('2026-11-01');
    cmp.consultar();
    http.expectNone((x) => x.url === urlResumen);
    expect(cmp.errorPeriodo()).toContain('posterior');
  });
});
