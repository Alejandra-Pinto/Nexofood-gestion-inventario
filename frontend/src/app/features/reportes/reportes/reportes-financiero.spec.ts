/** Pruebas unitarias: pestaña Financiero de Reportes (HU-6.4 · SCRUM-224 / SCRUM-227) */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Reportes } from './reportes';
import {
  formatoCop,
  MSJ_SIN_MOVIMIENTOS_FINANCIEROS,
  rangoDe,
  ReporteFinanciero,
  ResumenPeriodo,
} from '../../../core/models/reportes.model';
import { descargarReporteFinancieroCsv } from '../../../core/utils/reporte-pdf.util';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';

const reporteFinanciero = (cambios: Partial<ReporteFinanciero> = {}): ReporteFinanciero => ({
  desde: '2026-11-01',
  hasta: '2026-11-30',
  sin_movimientos: false,
  ingresos: {
    total: 192000,
    cantidad: 5,
    ventas: 92000,
    manuales: 100000,
    por_medio_pago: [
      { medio_pago: 'EFECTIVO', total: 149000, cantidad: 3 },
      { medio_pago: 'TRANSFERENCIA', total: 31000, cantidad: 1 },
      { medio_pago: 'NEQUI', total: 12000, cantidad: 1 },
      { medio_pago: 'DAVIPLATA', total: 0, cantidad: 0 },
      { medio_pago: 'TARJETA', total: 0, cantidad: 0 },
    ],
    efectivo: 149000,
    no_efectivo: 43000,
  },
  egresos: {
    total: 60400,
    cantidad: 2,
    por_categoria: [
      { categoria: 'compra_proveedores', etiqueta: 'Compra a proveedores', total: 42000, cantidad: 1 },
      { categoria: 'servicios', etiqueta: 'Servicios públicos', total: 18400, cantidad: 1 },
    ],
  },
  saldo_neto: 131600,
  consumo_interno: {
    total_valorizado: 11000,
    unidades: 5,
    items_sin_costo: 1,
    afecta_saldo: false,
    criterio: 'Cantidad consumida × costo de fabricación actual del ítem (estimado)',
    por_item: [],
  },
  compras_inventario: { total: 50000, cantidad: 1, egresos_compra_proveedores: 42000, incluido_en_egresos: false },
  movimientos: [
    { id_movimiento: 9, fecha_hora: '2026-11-19T20:00:00.000Z', concepto: 'Venta pedido #24', tipo: 'INGRESO', origen: 'VENTA', medio_pago: 'EFECTIVO', monto: 30000 },
    { id_movimiento: 8, fecha_hora: '2026-11-19T15:00:00.000Z', concepto: 'Compra proveedor Carnes del Sur', tipo: 'EGRESO', origen: 'MANUAL', medio_pago: 'TRANSFERENCIA', monto: 42000 },
  ],
  total_movimientos: 2,
  movimientos_truncados: false,
  ...cambios,
});

const resumenVacio: ResumenPeriodo = {
  desde: '2026-11-01',
  hasta: '2026-11-30',
  sin_operaciones: true,
  pedidos: { total: 0, en_curso: 0 },
  ventas: { cantidad: 0, total: 0, ticket_promedio: 0 },
  anulados: { cantidad: 0, total: 0 },
  otros_ingresos: { cantidad: 0, total: 0 },
  por_dia: [],
};

/** Quita espacios (incluido el no separable) para comparar montos */
const plano = (t: string | null | undefined) => (t ?? '').replace(/\s/g, '');

describe('Reportes · pestaña Financiero (HU-6.4)', () => {
  let http: HttpTestingController;
  let toastMock: { exito: any; error: any; advertencia: any; info: any };
  const urlResumen = `${environment.apiUrl}/queries-reports/resumen`;
  const urlFinanciero = `${environment.apiUrl}/queries-reports/financiero`;

  beforeEach(() => {
    toastMock = { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Reportes],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: ToastService, useValue: toastMock }],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Abre la pantalla, cambia a Financiero y responde con `r` */
  const abrirFinanciero = async (r: ReporteFinanciero) => {
    const fixture = TestBed.createComponent(Reportes);
    http.expectOne((x) => x.url === urlResumen).flush(resumenVacio);
    await fixture.whenStable();
    const cmp = fixture.componentInstance as any;
    cmp.cambiarPestana('financiero');
    const req = http.expectOne((x) => x.url === urlFinanciero);
    expect(req.request.params.get('desde')).toBe(rangoDe('mes').desde);
    expect(req.request.params.get('hasta')).toBe(rangoDe('mes').hasta);
    req.flush(r);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp, html: fixture.nativeElement as HTMLElement };
  };

  it('existe la pestaña Financiero', async () => {
    const fixture = TestBed.createComponent(Reportes);
    http.expectOne((x) => x.url === urlResumen).flush(resumenVacio);
    await fixture.whenStable();
    fixture.detectChanges();
    const tabs = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.tabs .tab')].map((t) => t.textContent?.trim());
    expect(tabs).toContain('Financiero');
  });

  it('renderiza las 4 tarjetas con los totales del backend', async () => {
    const { html } = await abrirFinanciero(reporteFinanciero());
    const card = (id: string) => html.querySelector(`[data-testid="${id}"]`);
    expect(plano(card('fin-ingresos')?.textContent)).toContain('$192.000');
    expect(plano(card('fin-egresos')?.textContent)).toContain('$60.400');
    expect(plano(card('fin-saldo')?.textContent)).toContain('$131.600');
    expect(plano(card('fin-consumo')?.textContent)).toContain('$11.000');
    expect(card('fin-consumo')?.textContent).toContain('No afecta el saldo');
    expect(card('fin-consumo')?.classList).toContain('consumo');
    expect(card('fin-consumo')?.textContent).toContain('1 ítem sin costo registrado');
  });

  it('muestra el desglose por los 5 medios de pago con subtotales efectivo / no efectivo', async () => {
    const { html } = await abrirFinanciero(reporteFinanciero());
    const medios = html.querySelector('[data-testid="fin-medios"]')!;
    const filas = medios.querySelectorAll('.medios-lista li');
    expect(filas.length).toBe(5);
    expect(filas[0].textContent).toContain('Efectivo');
    expect(filas[1].textContent).toContain('Transferencia');
    expect(plano(html.querySelector('[data-testid="fin-efectivo"]')?.textContent)).toBe('$149.000');
    expect(plano(html.querySelector('[data-testid="fin-no-efectivo"]')?.textContent)).toBe('$43.000');
    expect(plano(html.querySelector('[data-testid="fin-compras"]')?.textContent)).toContain('$50.000');
  });

  it('lista los movimientos consolidados con concepto, tipo y medio', async () => {
    const { html } = await abrirFinanciero(reporteFinanciero());
    const filas = html.querySelectorAll('[data-testid="fin-movimientos"] tbody tr');
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('Venta pedido #24');
    expect(filas[0].textContent).toContain('Ingreso');
    expect(filas[1].textContent).toContain('Egreso');
    expect(filas[1].textContent).toContain('Transferencia');
  });

  it('pagina la tabla de movimientos de 10 en 10 sin volver a consultar', async () => {
    const movimientos = Array.from({ length: 23 }, (_, i) => ({
      id_movimiento: i + 1, fecha_hora: '2026-11-10T15:00:00.000Z', concepto: `Venta pedido #${i + 1}`,
      tipo: 'INGRESO', origen: 'VENTA', medio_pago: 'EFECTIVO', monto: 1000,
    }));
    const { fixture, cmp, html } = await abrirFinanciero(reporteFinanciero({ movimientos, total_movimientos: 23 }));
    expect(html.querySelectorAll('[data-testid="fin-movimientos"] tbody tr').length).toBe(10);
    cmp.irAPaginaMovimientos(3);
    fixture.detectChanges();
    expect(html.querySelectorAll('[data-testid="fin-movimientos"] tbody tr').length).toBe(3);
  });

  it('saldo negativo en rojo y con signo (sin valor absoluto)', async () => {
    const { html } = await abrirFinanciero(reporteFinanciero({ saldo_neto: -40000 }));
    const valor = html.querySelector('[data-testid="fin-saldo"] .cifra-valor')!;
    expect(plano(valor.textContent)).toBe('-$40.000');
    expect(valor.classList).toContain('rojo');
  });

  it('período sin datos: estado vacío explícito y sin tarjetas', async () => {
    const { html, cmp } = await abrirFinanciero(reporteFinanciero({ sin_movimientos: true }));
    expect(html.textContent).toContain(MSJ_SIN_MOVIMIENTOS_FINANCIEROS);
    expect(html.querySelector('[data-testid="fin-ingresos"]')).toBeNull();
    cmp.descargarExcel();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('muestra los botones Descargar Excel y Descargar PDF en la pestaña Financiero', async () => {
    const { html, cmp } = await abrirFinanciero(reporteFinanciero());
    const botones = [...html.querySelectorAll('.acciones-reporte button')].map((b) => b.textContent?.trim());
    expect(botones).toContain('Descargar Excel');
    expect(botones).toContain('Descargar PDF');
    cmp.descargarPdf();
    expect(toastMock.exito).toHaveBeenCalledWith('Reporte financiero descargado en PDF correctamente.');
  });
});

describe('Reporte financiero · utilidades', () => {
  it('formatoCop: sin decimales, separador de miles y signo negativo', () => {
    expect(formatoCop(131600)).toBe('$131.600');
    expect(formatoCop(-40000)).toBe('-$40.000');
    expect(formatoCop(0)).toBe('$0');
  });

  it('CSV para Excel: separador ";", egresos negativos y campos con ";" escapados', () => {
    const r = reporteFinanciero();
    r.movimientos[1].concepto = 'Compra; carnes "premium"';
    const csv = descargarReporteFinancieroCsv(r)!;
    const lineas = csv.split('\r\n');
    expect(lineas).toContain('Ingresos;192000');
    expect(lineas).toContain('Saldo neto;131600');
    expect(lineas).toContain('Fecha;Concepto;Tipo;Medio de pago;Monto');
    expect(csv).toContain('"Compra; carnes ""premium""";Egreso;Transferencia;-42000');
  });

  it('CSV: sin datos no genera archivo', () => {
    expect(descargarReporteFinancieroCsv(reporteFinanciero({ sin_movimientos: true }))).toBeNull();
  });
});
