/**
 * Pruebas unitarias: FiltrosReportes (HU-6.5 · SCRUM-228)
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { FiltrosReportes } from './filtros-reportes';
import { environment } from '../../../../environments/environment';
import { FiltrosReporteData } from '../../../core/models/reportes.model';

describe('FiltrosReportes (SCRUM-228)', () => {
  let fixture: ComponentFixture<FiltrosReportes>;
  let component: FiltrosReportes;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  const productosMock = [
    {
      id_item: 1,
      id_categoria: 1,
      nombre: 'Choripán Clásico',
      tipo_item: 'PRODUCTO' as const,
      cantidad_stock: 20,
      stock_minimo: 5,
      precio_venta: 12000,
      estado_activo: true,
    },
    {
      id_item: 2,
      id_categoria: 1,
      nombre: 'Choripán Especial',
      tipo_item: 'PRODUCTO' as const,
      cantidad_stock: 15,
      stock_minimo: 3,
      precio_venta: 16000,
      estado_activo: true,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltrosReportes],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FiltrosReportes);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    http.verify();
  });

  it('se crea y carga los productos del catálogo por defecto', () => {
    fixture.detectChanges();
    const req = http.expectOne(`${api}/products?tipo=PRODUCTO`);
    req.flush(productosMock);

    expect(component).toBeTruthy();
    expect(component['productos']().length).toBe(2);
    expect(component['productos']()[0].nombre).toBe('Choripán Clásico');
  });

  it('valida que no se permita aplicar si faltan fechas', () => {
    fixture.detectChanges();
    http.expectOne(`${api}/products?tipo=PRODUCTO`).flush(productosMock);

    let emitido: FiltrosReporteData | undefined;
    component.aplicarFiltro.subscribe((data) => (emitido = data));

    component.aplicar();
    expect(emitido).toBeUndefined();
    expect(component['errorFiltro']()).toBe('Indique la fecha inicial y la fecha final.');
  });

  it('valida que la fecha inicial no sea posterior a la final', () => {
    fixture.detectChanges();
    http.expectOne(`${api}/products?tipo=PRODUCTO`).flush(productosMock);

    component.desde.set('2026-11-20');
    component.hasta.set('2026-11-10');

    let emitido: FiltrosReporteData | undefined;
    component.aplicarFiltro.subscribe((data) => (emitido = data));

    component.aplicar();
    expect(emitido).toBeUndefined();
    expect(component['errorFiltro']()).toBe('La fecha inicial no puede ser posterior a la fecha final.');
  });

  it('emite FiltrosReporteData con fechas e ítem cuando los datos son válidos', () => {
    fixture.detectChanges();
    http.expectOne(`${api}/products?tipo=PRODUCTO`).flush(productosMock);

    component.desde.set('2026-11-01');
    component.hasta.set('2026-11-15');
    component.idItem.set(2);

    let emitido: FiltrosReporteData | undefined;
    component.aplicarFiltro.subscribe((data) => (emitido = data));

    component.aplicar();
    expect(component['errorFiltro']()).toBeNull();
    expect(emitido).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-15',
      id_item: 2,
    });
  });

  it('emite id_item como undefined cuando se selecciona "Todos los productos"', () => {
    fixture.detectChanges();
    http.expectOne(`${api}/products?tipo=PRODUCTO`).flush(productosMock);

    component.desde.set('2026-11-01');
    component.hasta.set('2026-11-15');
    component.idItem.set('');

    let emitido: FiltrosReporteData | undefined;
    component.aplicarFiltro.subscribe((data) => (emitido = data));

    component.aplicar();
    expect(emitido).toEqual({
      desde: '2026-11-01',
      hasta: '2026-11-15',
      id_item: undefined,
    });
  });

  it('respeta la propiedad mostrarItem=false ocultando el selector de ítem en el DOM', () => {
    fixture.componentRef.setInput('mostrarItem', false);
    fixture.detectChanges();
    http.expectOne(`${api}/products?tipo=PRODUCTO`).flush(productosMock);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#filtro-item')).toBeNull();
  });
});
