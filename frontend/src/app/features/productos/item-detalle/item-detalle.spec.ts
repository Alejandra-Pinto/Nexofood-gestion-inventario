/**
 * Pruebas unitarias: ItemDetalle (tarjeta "VER DETALLES" · Prototipo 12)
 * ------------------------------------------------------------------
 * HU-2.2 · SCRUM-196 Pruebas de visibilidad por rol (lado Angular)
 *
 * Valida que el bloque "COSTO (SOLO ADMIN)":
 *   - aparece para el Administrador con el valor real (incluido $0 si es real);
 *   - NO existe en el DOM para Cajero ni Mesero (ni "$0", ni "—", ni "oculto");
 *   - tampoco aparece si un no-admin recibiera el campo por error;
 *   - no rompe la pantalla (NaN) si el Administrador no lo recibe.
 *
 * Ejecutar:  cd frontend  ->  npm test
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ItemDetalle } from './item-detalle';
import { AuthService } from '../../../core/services/auth.service';
import { RolUsuario } from '../../../core/models/usuario.model';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { environment } from '../../../../environments/environment';

describe('ItemDetalle · HU-2.2 costo de fabricación', () => {
  let fixture: ComponentFixture<ItemDetalle>;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  /** Respuesta de GET /products/1 para el Administrador */
  const conCosto: ItemInventario = {
    id_item: 1,
    id_categoria: 1,
    nombre: 'Choripán Pampero',
    tipo_item: 'PRODUCTO',
    cantidad_stock: 20,
    stock_minimo: 5,
    costo_fabricacion: 5500,
    precio_venta: 16000,
    estado_activo: true,
  };

  /** Respuesta de GET /products/1 para Cajero / Mesero (el backend ya quitó el campo) */
  const { costo_fabricacion: _omitido, ...sinCosto } = conCosto;

  const renderizar = async (rol: RolUsuario, respuesta: object) => {
    TestBed.inject(AuthService).usuarioActual.set({ nombre: 'Prueba', rol, permisos: [] });
    fixture = TestBed.createComponent(ItemDetalle);
    fixture.componentRef.setInput('idItem', 1);
    fixture.componentRef.setInput('categoria', 'Choripanes');
    fixture.detectChanges();
    http.expectOne(`${api}/products/1`).flush(respuesta);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ItemDetalle],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('Administrador: muestra el bloque COSTO (SOLO ADMIN) con el valor real', async () => {
    const html = await renderizar('Administrador', conCosto);

    const bloque = html.querySelector('[data-testid="costo-fabricacion"]');
    expect(bloque).not.toBeNull();
    expect(bloque!.textContent).toMatch(/costo \(solo admin\)/i);
    expect(bloque!.textContent).toContain('5,500');
  });

  it('Administrador: un costo real de $0 se muestra (no se confunde con "sin costo")', async () => {
    const html = await renderizar('Administrador', { ...conCosto, costo_fabricacion: 0 });
    expect(html.querySelector('[data-testid="costo-fabricacion"]')).not.toBeNull();
  });

  it.each<RolUsuario>(['Cajero', 'Mesero'])(
    '%s: el bloque de costo NO se renderiza y el resto del detalle sí',
    async (rol) => {
      const html = await renderizar(rol, sinCosto);
      const texto = html.textContent ?? '';

      expect(html.querySelector('[data-testid="costo-fabricacion"]')).toBeNull();
      expect(texto).not.toMatch(/costo/i);
      expect(texto).not.toMatch(/oculto|N\/A|NaN/);
      // El resto de la información sí está
      expect(texto).toContain('Choripán Pampero');
      expect(texto).toContain('Choripanes');
      expect(texto).toContain('16,000');
    },
  );

  it('Cajero: aunque el campo llegara por error, el bloque no se renderiza', async () => {
    const html = await renderizar('Cajero', conCosto);
    expect(html.querySelector('[data-testid="costo-fabricacion"]')).toBeNull();
    expect(html.textContent).not.toContain('5,500');
  });

  it('Administrador sin el campo en la respuesta: no muestra el bloque ni NaN', async () => {
    const html = await renderizar('Administrador', sinCosto);
    expect(html.querySelector('[data-testid="costo-fabricacion"]')).toBeNull();
    expect(html.textContent).not.toContain('NaN');
  });
});
