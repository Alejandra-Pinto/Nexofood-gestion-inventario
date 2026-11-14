/** Pruebas unitarias: MisMesas - acceso "Cobrar" según el rol (O-03 del informe de integración) */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MisMesas } from './mis-mesas';
import { environment } from '../../../../environments/environment';

describe('MisMesas', () => {
  let http: HttpTestingController;

  const crear = async (rol: 'Mesero' | 'Cajero' | 'Administrador') => {
    localStorage.setItem('usuario', JSON.stringify({ nombre: 'QA', rol, permisos: ['ventas'] }));
    TestBed.configureTestingModule({
      imports: [MisMesas],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MisMesas);
    http.expectOne(`${environment.apiUrl}/orders/mesas`).flush([
      { numero: 1, estado: 'LIBRE', id_pedido: null, total: 0 },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('el mesero no ve el acceso "Cobrar"', async () => {
    const html = await crear('Mesero');
    expect(html.querySelector('a[href="/ventas/cobrar"]')).toBeNull();
  });

  it('el cajero sí ve el acceso "Cobrar"', async () => {
    const html = await crear('Cajero');
    expect(html.querySelector('a[href="/ventas/cobrar"]')).not.toBeNull();
  });
});
