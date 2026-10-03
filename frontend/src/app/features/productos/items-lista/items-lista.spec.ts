/**
 * Pruebas unitarias: ItemsLista (pantalla "Productos")
 * ------------------------------------------------------------------
 * HU-2.1 · SCRUM-125 Pruebas de registro de ítems
 * Verifica el estado vacío, la tabla con etiquetas Bajo/OK y los filtros.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ItemsLista } from './items-lista';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { environment } from '../../../../environments/environment';

describe('ItemsLista', () => {
  let http: HttpTestingController;
  const api = environment.apiUrl;

  // Ítems de ejemplo: uno con stock normal y otro con stock bajo
  const items: ItemInventario[] = [
    { id_item: 1, id_categoria: 1, nombre: 'Choripán Pampero', tipo_item: 'PRODUCTO', cantidad_stock: 20, stock_minimo: 5, costo_fabricacion: 5500, precio_venta: 16000, estado_activo: true },
    { id_item: 2, id_categoria: 2, nombre: 'Chorizo artesanal', tipo_item: 'INSUMO', cantidad_stock: 3, stock_minimo: 10, costo_fabricacion: 3000, precio_venta: 0, estado_activo: true },
  ];

  /** Crea la pantalla y responde las peticiones de ítems y categorías */
  const crear = async (lista: ItemInventario[]) => {
    const fixture = TestBed.createComponent(ItemsLista);
    http.expectOne(`${api}/products`).flush(lista);
    http.expectOne(`${api}/categories`).flush([
      { id_categoria: 1, nombre: 'Choripanes' },
      { id_categoria: 2, nombre: 'Insumos cárnicos' },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ItemsLista],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('muestra el estado vacío cuando no hay productos', async () => {
    const { html } = await crear([]);
    expect(html.textContent).toContain('Aún no hay productos');
  });

  it('muestra la tabla con las etiquetas OK y Bajo', async () => {
    const { html } = await crear(items);
    const filas = html.querySelectorAll('tbody tr');

    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('OK');   // 20 > 5
    expect(filas[1].textContent).toContain('Bajo'); // 3 <= 10
    expect(html.textContent).toContain('Choripanes');
  });

  it('filtra por tipo y por nombre', async () => {
    const { cmp } = await crear(items);

    cmp.filtroTipo.set('INSUMO');
    expect(cmp.filtrados().map((i: ItemInventario) => i.nombre)).toEqual(['Chorizo artesanal']);

    cmp.filtroTipo.set('');
    cmp.busqueda.set('pampero');
    expect(cmp.filtrados().length).toBe(1);
  });

  it('agrega a la tabla el ítem recién registrado', async () => {
    const { cmp } = await crear(items);
    cmp.agregar({ ...items[0], id_item: 3, nombre: 'Agua' });

    expect(cmp.items().length).toBe(3);
    expect(cmp.items()[0].nombre).toBe('Agua'); // queda en orden alfabético
  });
});
