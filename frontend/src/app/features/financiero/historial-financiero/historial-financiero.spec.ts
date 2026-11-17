/**
 * Pruebas unitarias: HistorialFinanciero
 * HU-7.3 · SCRUM-252 Pruebas del historial financiero
 */
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { HistorialFinanciero, MSJ_SIN_MOVIMIENTOS } from './historial-financiero';
import { HistorialFinanciero as Historial } from '../../../core/models/finanzas.model';
import { AuthService } from '../../../core/services/auth.service';
import { environment } from '../../../../environments/environment';

describe('HistorialFinanciero', () => {
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/finance/movimientos`;
  const usuario = signal<{ rol: string } | null>({ rol: 'Administrador' });

  const historial: Historial = {
    resumen: { ingresos: 122000, egresos: 30000, saldo: 92000 },
    por_medio: [
      { medio_pago: 'EFECTIVO', ingresos: 100000, egresos: 30000, saldo: 70000 },
      { medio_pago: 'NEQUI', ingresos: 22000, egresos: 0, saldo: 22000 },
    ],
    movimientos: [
      { id_movimiento: 3, fecha_hora: '2026-11-12T15:00:00.000Z', tipo_movimiento: 'EGRESO', origen: 'MANUAL', concepto: 'Compra de pan',
        monto: 30000, medio_pago: 'EFECTIVO', id_pedido: null, registrado_por: 'Admin QA' },
      { id_movimiento: 2, fecha_hora: '2026-11-12T14:00:00.000Z', tipo_movimiento: 'INGRESO', origen: 'MANUAL', concepto: 'Base de caja',
        monto: 100000, medio_pago: 'EFECTIVO', id_pedido: null, registrado_por: 'Admin QA' },
      { id_movimiento: 1, fecha_hora: '2026-11-11T18:00:00.000Z', tipo_movimiento: 'INGRESO', origen: 'VENTA', concepto: 'Venta · Pedido #12 · Mesa 3',
        monto: 22000, medio_pago: 'NEQUI', id_pedido: 12, registrado_por: 'Cajero QA' },
    ],
  };

  const crear = async (respuesta: Historial = historial) => {
    const fixture = TestBed.createComponent(HistorialFinanciero);
    http.expectOne(url).flush(respuesta);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };
  const texto = (html: HTMLElement, sel: string) => html.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const digitos = (s: string) => s.replace(/\D/g, '');

  beforeEach(() => {
    usuario.set({ rol: 'Administrador' });
    TestBed.configureTestingModule({
      imports: [HistorialFinanciero],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { usuarioActual: usuario } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('#1 al cargar lista los movimientos con concepto, monto y medio de pago', async () => {
    const { html } = await crear();
    const filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(3);
    expect(filas[0].textContent).toContain('Compra de pan');
    expect(filas[0].textContent).toContain('Efectivo');
    expect(filas[0].textContent).toContain('Egreso');
    expect(digitos(filas[0].querySelector('.monto')!.textContent!)).toBe('30000');
    expect(filas[2].textContent).toContain('Venta · Pedido #12 · Mesa 3');
    expect(filas[2].textContent).toContain('Nequi');
  });

  it('#2 muestra el saldo neto actual (Ingresos - Egresos) y los totales', async () => {
    const { html } = await crear();
    expect(digitos(texto(html, '[data-test=total-ingresos]'))).toBe('122000');
    expect(digitos(texto(html, '[data-test=total-egresos]'))).toBe('30000');
    expect(digitos(texto(html, '[data-test=saldo]'))).toBe('92000');
    expect(html.querySelectorAll('[data-test=saldo-medio]').length).toBe(2);
  });

  it('marca el saldo en rojo cuando es negativo', async () => {
    const { html } = await crear({ ...historial, resumen: { ingresos: 0, egresos: 5000, saldo: -5000 } });
    expect(html.querySelector('.total-saldo')?.classList).toContain('negativo');
  });

  it('las pestañas filtran ingresos y egresos', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.vista.set('EGRESO');
    fixture.detectChanges();
    expect(html.querySelectorAll('tbody tr').length).toBe(1);
    cmp.vista.set('INGRESO');
    fixture.detectChanges();
    expect(html.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('sin movimientos informa que no hay registros y el saldo queda en cero', async () => {
    const { html } = await crear({ resumen: { ingresos: 0, egresos: 0, saldo: 0 }, por_medio: [], movimientos: [] });
    expect(texto(html, '[data-test=sin-movimientos]')).toContain(MSJ_SIN_MOVIMIENTOS);
    expect(digitos(texto(html, '[data-test=saldo]'))).toBe('0');
  });

  it('el Administrador ve los accesos para registrar ingresos y egresos', async () => {
    const { html } = await crear();
    expect(html.querySelector('[data-test=ir-ingreso]')).not.toBeNull();
    expect(html.querySelector('[data-test=ir-egreso]')).not.toBeNull();
  });

  it('el Cajero consulta el historial pero no ve los accesos de registro', async () => {
    usuario.set({ rol: 'Cajero' });
    const { html } = await crear();
    expect(html.querySelectorAll('tbody tr').length).toBe(3);
    expect(html.querySelector('[data-test=ir-ingreso]')).toBeNull();
    expect(html.querySelector('[data-test=ir-egreso]')).toBeNull();
  });

  it('muestra un mensaje cuando el usuario no tiene permisos (403)', async () => {
    const fixture = TestBed.createComponent(HistorialFinanciero);
    http.expectOne(url).flush({ message: 'Acceso denegado' }, { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(fixture.nativeElement, '.alerta-error')).toContain('No tiene permisos suficientes');
  });
});
