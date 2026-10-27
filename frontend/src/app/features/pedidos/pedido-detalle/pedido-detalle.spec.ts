/**
 * Pruebas unitarias: PedidoDetalleComponent
 * ------------------------------------------------------------------
 * HU-4.3 · SCRUM-184 Actualizar comanda ante modificaciones (prototipo 14):
 *   - Aviso "Pedido modificado" con el cambio y la hora.
 *   - Historial de impresión ("Comanda v1 · OK").
 *   - Vista previa de la comanda con la versión ("Impreso … · v2") y sus cambios.
 *   - Pedido finalizado: edición deshabilitada con el motivo.
 *   - Al guardar cambios se consulta la nueva versión de la comanda.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PedidoDetalleComponent } from './pedido-detalle';
import { AuthService } from '../../../core/services/auth.service';
import { ResumenComandas } from '../../../core/services/kitchen.service';
import { EstadoPedido, OpcionesPedido, Pedido } from '../../../core/models/pedido.model';
import { ItemInventario } from '../../../core/models/item-inventario.model';
import { environment } from '../../../../environments/environment';

describe('PedidoDetalleComponent', () => {
  let component: PedidoDetalleComponent;
  let fixture: ComponentFixture<PedidoDetalleComponent>;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  const item = (id_item: number, nombre: string, precio_venta: number) =>
    ({ id_item, nombre, precio_venta, cantidad_stock: 30, tipo_item: 'PRODUCTO', estado_activo: true }) as ItemInventario;

  const pedido = (estado: EstadoPedido = 'EN_PREPARACION'): Pedido => ({
    id_pedido: 24,
    id_mesero: 3,
    numero_mesa: 4,
    fecha_hora: '2026-10-27T17:45:00Z',
    estado_pedido: estado,
    total_calculado: 37000,
    mesero: { nombre_completo: 'Juan S.' },
    detalles: [
      { id_detalle: 1, id_pedido: 24, id_item: 1, cantidad: 2, precio_unitario: 16000, notas_especiales: null, promocion_aplicada: null, id_comanda: 1, item: item(1, 'Choripán Pampero', 16000), adicionales: [] },
      { id_detalle: 2, id_pedido: 24, id_item: 9, cantidad: 1, precio_unitario: 5000, notas_especiales: null, promocion_aplicada: null, id_comanda: 1, item: item(9, 'Cerveza', 5000), adicionales: [] },
    ],
  });

  const cambio = { tipo: 'CANTIDAD_AUMENTADA' as const, id_item: 9, producto: 'Cerveza', cantidad: 1, texto: 'Se agregó 1x Cerveza' };

  const resumen = (cambios: Partial<ResumenComandas> = {}): ResumenComandas => ({
    id_pedido: 24,
    version_actual: 2,
    estado_impresion_actual: 'PENDIENTE',
    requiere_reimpresion: true,
    ultima_modificacion: { version: 2, fecha: '2026-10-27T17:48:00Z', cambios: [cambio] },
    versiones: [
      { id_comanda: 1, version: 1, estado_impresion: 'IMPRESA', fecha_creacion: '2026-10-27T17:45:22Z', fecha_impresion: '2026-10-27T17:45:22Z', cambios: [] },
      { id_comanda: 7, version: 2, estado_impresion: 'PENDIENTE', fecha_creacion: '2026-10-27T17:48:00Z', fecha_impresion: '2026-10-27T17:48:00Z', cambios: [cambio] },
    ],
    historial: [
      { id_impresion: 1, id_pedido: 24, id_comanda: 1, tipo: 'COMANDA', version: 1, resultado: 'OK', fecha_hora: '2026-10-27T17:45:22Z' },
    ],
    ...cambios,
  });

  const texto = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  /** Entra a edición y responde el catálogo de productos y las opciones (stock de insumos) */
  const entrarAEdicion = (opciones: OpcionesPedido = { adicionales: [], promociones: [] }) => {
    component.iniciarEdicion();
    httpMock.expectOne((r) => r.url === `${api}/products`).flush([item(1, 'Choripán Pampero', 16000), item(9, 'Cerveza', 5000)]);
    httpMock.expectOne(`${api}/orders/opciones`).flush(opciones);
    fixture.detectChanges();
  };
  const $ = (sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel);

  /** Carga el pedido #24 y responde las dos peticiones (pedido + versiones de comanda) */
  const cargar = async (p: Pedido = pedido(), r: ResumenComandas | null = resumen()) => {
    component.cargarPedido(24);
    httpMock.expectOne(`${api}/orders/24`).flush(p);
    const req = httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`);
    if (r) req.flush(r);
    else req.flush({ message: 'Error' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PedidoDetalleComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Suple ActivatedRoute/Router/RouterLink que usa el componente
        provideRouter([]),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    // Rol que modifica pedidos (HU-3.3)
    TestBed.inject(AuthService).usuarioActual.set({ nombre: 'Juan S.', rol: 'Mesero', permisos: ['ventas'] });
    fixture = TestBed.createComponent(PedidoDetalleComponent);
    component = fixture.componentInstance;
    // Sin :id en la ruta, ngOnInit no hace peticiones; cada prueba llama a cargar()
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock?.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('HU-4.3 · aviso "Pedido modificado"', () => {
    it('muestra qué cambió, a qué hora y pide reimprimir la comanda', async () => {
      await cargar();

      const aviso = $('[data-test="aviso-modificado"]');
      expect(aviso).toBeTruthy();
      expect(aviso!.textContent).toContain('Pedido modificado');
      expect(aviso!.textContent).toMatch(/Se agregó 1x Cerveza a las \d{2}:\d{2}\./);
      expect(aviso!.textContent).toContain('Vuelve a imprimir la comanda para que cocina reciba la versión actualizada.');
      expect(aviso!.querySelector('button')?.textContent).toContain('Imprimir comanda v2');
    });

    it('cuando la v2 ya se imprimió, informa que cocina la recibió y no pide reimprimir', async () => {
      await cargar(pedido(), resumen({ requiere_reimpresion: false, estado_impresion_actual: 'IMPRESA' }));

      const aviso = $('[data-test="aviso-modificado"]')!;
      expect(aviso.textContent).toContain('Cocina ya recibió la comanda v2.');
      expect(aviso.querySelector('button')).toBeNull();
    });

    it('si la impresión falló lo indica', async () => {
      await cargar(pedido(), resumen({ estado_impresion_actual: 'ERROR' }));
      expect($('[data-test="aviso-modificado"]')!.textContent).toContain('La impresión de la comanda v2 falló');
    });

    it('un pedido sin modificaciones no muestra el aviso', async () => {
      await cargar(pedido(), resumen({ version_actual: 1, ultima_modificacion: null, requiere_reimpresion: false }));
      expect($('[data-test="aviso-modificado"]')).toBeNull();
    });

    it('si no se pueden leer las versiones, la pantalla funciona sin aviso ni historial', async () => {
      await cargar(pedido(), null);
      expect(texto()).toContain('Pedido #24');
      expect($('[data-test="aviso-modificado"]')).toBeNull();
      expect($('[data-test="historial"]')).toBeNull();
    });
  });

  describe('HU-4.3 · historial de impresión', () => {
    it('lista cada impresión con hora, versión y resultado, y la versión en cola', async () => {
      await cargar();

      const items = Array.from($('[data-test="historial"]')!.querySelectorAll('li')).map((li) => li.textContent?.trim());
      expect(items[0]).toMatch(/^\d{2}:\d{2}:\d{2} · Comanda v1 · OK$/);
      expect(items[1]).toBe('Comanda v2 · en cola de impresión');
    });
  });

  describe('HU-4.3 · vista previa de la comanda', () => {
    it('el pie muestra la versión vigente y la comanda trae los cambios', async () => {
      await cargar();
      component.mostrarTicket.set(true);
      fixture.detectChanges();

      const ticket = $('#ticket-print')!;
      expect(ticket.querySelector('.pie-version')?.textContent).toMatch(/^Impreso \d{2}:\d{2}:\d{2} · v2$/);
      expect(ticket.textContent).toContain('*** CAMBIOS v2 ***');
      expect(ticket.textContent).toContain('Se agregó 1x Cerveza');
    });
  });

  describe('HU-4.3 · SCRUM-183 pedido finalizado', () => {
    it('deshabilita la edición y explica el motivo', async () => {
      await cargar(pedido('ENTREGADO'), resumen({ requiere_reimpresion: false }));

      expect($('[data-test="bloqueo"]')!.textContent).toContain('ya fue entregado y ya no admite modificaciones');
      const boton = $('[data-test="modificar-bloqueado"]') as HTMLButtonElement;
      expect(boton.disabled).toBe(true);

      component.iniciarEdicion();
      expect(component.modoEdicion()).toBe(false);
    });

    it('en un pedido en preparación sí se puede modificar', async () => {
      await cargar();
      expect(component.puedeModificar()).toBe(true);
      expect($('[data-test="modificar-bloqueado"]')).toBeNull();
    });
  });

  describe('HU-4.3 · SCRUM-181 guardar modificación', () => {
    const editar = () => entrarAEdicion();

    it('al guardar consulta la nueva versión y muestra la comanda v2', async () => {
      await cargar(pedido(), resumen({ version_actual: 1, ultima_modificacion: null, requiere_reimpresion: false }));
      editar();
      component.adicionarProducto(item(9, 'Cerveza', 5000)); // 1 -> 2 cervezas
      component.guardarModificacion();

      const patch = httpMock.expectOne(`${api}/orders/24`);
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body.detalles).toContainEqual({ id_item: 9, cantidad: 2 });
      patch.flush(pedido());
      httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`).flush(resumen());
      fixture.detectChanges();

      expect(component.modoEdicion()).toBe(false);
      expect(component.versionComanda()).toBe(2);
      expect(component.mostrarTicket()).toBe(true);
      expect($('[data-test="aviso-modificado"]')).toBeTruthy();
    });

    it('si el pedido se finalizó mientras se editaba (422) sale de edición y recarga', async () => {
      await cargar(pedido(), resumen({ version_actual: 1, ultima_modificacion: null, requiere_reimpresion: false }));
      editar();
      component.guardarModificacion();

      httpMock.expectOne(`${api}/orders/24`).flush(
        { codigo: 'PEDIDO_NO_MODIFICABLE', estado_pedido: 'ENTREGADO', message: 'El pedido #24 está Entregado y ya no admite modificaciones.' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      expect(component.modoEdicion()).toBe(false);

      // Recarga el pedido ya finalizado
      httpMock.expectOne(`${api}/orders/24`).flush(pedido('ENTREGADO'));
      httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`).flush(resumen({ requiere_reimpresion: false }));
      fixture.detectChanges();
      expect(component.pedidoFinalizado()).toBe(true);
    });
  });

  // ===========================================================================
  // Líneas con adicionales o combo: editables (cantidad y notas)
  // ===========================================================================
  describe('Modificar líneas con adicionales o combo', () => {
    /** Pedido #13 de la captura: 1x choripan clasico + Orégano + Combo con papa ($13.000) */
    const pedidoConCombo = (estado: EstadoPedido = 'EN_PREPARACION'): Pedido => {
      const p = pedido(estado);
      p.detalles = [
        {
          id_detalle: 5, id_pedido: 24, id_item: 1, cantidad: 1, precio_unitario: 13000, notas_especiales: null,
          promocion_aplicada: 'Combo con papa', id_comanda: 1, item: item(1, 'choripan clasico', 10000),
          adicionales: [{ id_pedido_item_adicional: 70, id_adicional: 3, cantidad: 1, precio_unitario: 0, nombre_adicional: 'Orégano' }],
        },
        p.detalles[1],
      ];
      return p;
    };

    const opciones = (stockOregano: number): OpcionesPedido => ({
      adicionales: [{
        id_adicional: 3, nombre: 'Orégano', tipo: 'PAN', descripcion: null, precio_adicional: 0, id_categoria: 1,
        id_insumo: 100, insumo: 'Pan de orégano', cantidad_insumo: 1, stock_disponible: stockOregano, disponible: stockOregano > 0,
      }],
      promociones: [],
    });

    const filaCombo = () => (fixture.nativeElement as HTMLElement).querySelector('[data-clave="det:5"]') as HTMLElement;
    const sinVersion = () => resumen({ version_actual: 1, ultima_modificacion: null, requiere_reimpresion: false });

    it('aparece en la tabla editable con sus adicionales (ya no hay caja de solo lectura)', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opciones(40));

      expect(texto()).not.toContain('se conservan sin cambios');
      const fila = filaCombo();
      expect(fila).toBeTruthy();
      expect(fila.textContent).toContain('+ Orégano');
      expect(fila.textContent).toContain('+ Combo con papa');
      expect(fila.textContent).toContain('En cocina (mín. 1)');
      expect(fila.querySelector('input.campo-nota')).toBeTruthy();
    });

    it('aumentar su cantidad usa el precio con adicionales y viaja con su id_detalle', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opciones(40));

      const linea = component.lineasEdicion().find((l) => l.clave === 'det:5')!;
      component.cambiarCantidadLinea(linea, 1);
      // (precio base o combo + Σ adicionales) × nueva cantidad + cerveza
      expect(component.totalEdicion()).toBe(2 * 13000 + 5000);

      component.lineasEdicion().find((l) => l.clave === 'det:5')!.notas_especiales = 'sin cebolla';
      component.guardarModificacion();

      const patch = httpMock.expectOne(`${api}/orders/24`);
      expect(patch.request.body.detalles).toContainEqual({ id_detalle: 5, id_item: 1, cantidad: 2, notas_especiales: 'sin cebolla' });
      // La línea simple no lleva id_detalle ni se envía la promoción como texto
      expect(patch.request.body.detalles).toContainEqual({ id_item: 9, cantidad: 1, notas_especiales: undefined });
      patch.flush(pedidoConCombo());
      httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`).flush(resumen());
    });

    it('no deja reducir por debajo de lo enviado a cocina', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opciones(40));

      const restar = filaCombo().querySelectorAll<HTMLButtonElement>('.btn-circulo')[0];
      expect(restar.disabled).toBe(true);
      component.cambiarCantidadLinea(component.lineasEdicion().find((l) => l.clave === 'det:5')!, -1);
      expect(component.lineasEdicion().find((l) => l.clave === 'det:5')!.cantidad).toBe(1);
    });

    it('respeta el stock del insumo de sus adicionales', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opciones(1)); // solo queda 1 pan de orégano

      component.cambiarCantidadLinea(component.lineasEdicion().find((l) => l.clave === 'det:5')!, 1);
      expect(component.lineasEdicion().find((l) => l.clave === 'det:5')!.cantidad).toBe(1);
    });

    it('agregar el mismo producto desde el catálogo crea una línea simple aparte', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opciones(40));

      component.adicionarProducto(item(1, 'choripan clasico', 10000));
      const filas = component.lineasEdicion().filter((l) => l.id_item === 1);
      expect(filas.map((l) => l.clave)).toEqual(['det:5', 'item:1']);
      expect(filas.find((l) => l.clave === 'det:5')!.cantidad).toBe(1);
    });
  });

  // ===========================================================================
  // Editar adicionales y formato de una línea que ya está en el pedido
  // ===========================================================================
  describe('Editar adicionales / formato de una línea existente', () => {
    /** 1x choripan clasico + Orégano + Combo con papa ($13.000) y 1x Cerveza */
    const pedidoConCombo = (): Pedido => {
      const p = pedido('EN_PREPARACION');
      p.detalles = [
        {
          id_detalle: 5, id_pedido: 24, id_item: 1, cantidad: 1, precio_unitario: 13000, notas_especiales: null,
          promocion_aplicada: 'Combo con papa', id_comanda: 1, item: item(1, 'choripan clasico', 10000),
          adicionales: [{ id_pedido_item_adicional: 70, id_adicional: 3, cantidad: 1, precio_unitario: 0, nombre_adicional: 'Orégano' }],
        },
        p.detalles[1],
      ];
      return p;
    };

    const opcionesCompletas: OpcionesPedido = {
      adicionales: [
        { id_adicional: 3, nombre: 'Orégano', tipo: 'PAN', descripcion: null, precio_adicional: 0, id_categoria: null, id_insumo: 100, insumo: 'Pan de orégano', cantidad_insumo: 1, stock_disponible: 40, disponible: true },
        { id_adicional: 4, nombre: 'Queso fundido', tipo: 'EXTRA', descripcion: null, precio_adicional: 2500, id_categoria: null, id_insumo: 103, insumo: 'Queso', cantidad_insumo: 1, stock_disponible: 20, disponible: true },
      ],
      promociones: [
        { id_promocion: 1, nombre: 'Combo con papa', descripcion: null, tipo: 'COMBO', precio_final: null, recargo: 3000, porcentaje_descuento: 0, id_categoria: null, id_insumo: 102, insumo: 'Papas', cantidad_insumo: 1, stock_disponible: 50, disponible: true, vigente_hasta: '2027-10-27T00:00:00Z' },
      ],
    };

    const sinVersion = () => resumen({ version_actual: 1, ultima_modificacion: null, requiere_reimpresion: false });
    const boton = (clave: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-test="editar-adicionales-${clave}"]`);
    const modal = () => (fixture.nativeElement as HTMLElement).querySelector('app-editar-adicionales') as HTMLElement | null;
    const linea = (clave: string) => component.lineasEdicion().find((l) => l.clave === clave)!;

    it('cada fila tiene "Adicionales / formato" y el modal abre con lo que la línea tiene hoy', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opcionesCompletas);

      expect(boton('det:5')).toBeTruthy();
      expect(boton('item:9')).toBeTruthy();

      boton('det:5')!.click();
      fixture.detectChanges();

      expect(modal()).toBeTruthy();
      const orégano = Array.from(modal()!.querySelectorAll('.chip-opcion')).find((b) => b.textContent?.includes('Orégano'))!;
      expect(orégano.classList).toContain('activa');
      const comboBtn = Array.from(modal()!.querySelectorAll('.formato button')).find((b) => b.textContent?.includes('Combo con papa'))!;
      expect(comboBtn.classList).toContain('activo');
    });

    it('agregar + Queso fundido actualiza el precio de la fila y el total, y se envía con id_detalle', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opcionesCompletas);
      boton('det:5')!.click();
      fixture.detectChanges();

      const queso = Array.from(modal()!.querySelectorAll('.extra')).find((l) => l.textContent?.includes('Queso fundido'))!;
      (queso.querySelector('input') as HTMLInputElement).click();
      fixture.detectChanges();
      (modal()!.querySelector('[data-test="aplicar-adicionales"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(modal()).toBeNull();
      // base 10.000 + combo 3.000 + Orégano 0 + Queso 2.500
      expect(linea('det:5').precio_unitario).toBe(15500);
      expect(linea('det:5').extras).toEqual(['+ Orégano', '+ Queso fundido', '+ Combo con papa']);
      expect(component.totalEdicion()).toBe(15500 + 5000);
      expect(texto()).toContain('Configuración modificada');

      component.guardarModificacion();
      const patch = httpMock.expectOne(`${api}/orders/24`);
      expect(patch.request.body.detalles).toContainEqual({
        id_detalle: 5, id_item: 1, cantidad: 1, notas_especiales: undefined,
        adicionales: [{ id_adicional: 3 }, { id_adicional: 4 }], id_promocion: 1,
      });
      patch.flush(pedidoConCombo());
      httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`).flush(resumen());
    });

    it('cambiar a Individual y quitar el pan envía la lista vacía e id_promocion null', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opcionesCompletas);
      component.abrirAdicionales(linea('det:5'));
      component.aplicarAdicionales({ adicionales: [], promocion: null, mantenerPromocion: false, precioUnitario: 10000 });

      expect(linea('det:5').precio_unitario).toBe(10000);
      expect(component.totalEdicion()).toBe(10000 + 5000);

      component.guardarModificacion();
      const patch = httpMock.expectOne(`${api}/orders/24`);
      expect(patch.request.body.detalles).toContainEqual({
        id_detalle: 5, id_item: 1, cantidad: 1, notas_especiales: undefined, adicionales: [], id_promocion: null,
      });
      patch.flush(pedidoConCombo());
      httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`).flush(resumen());
    });

    it('si no se cambió nada, la línea no se marca ni se reenvía su configuración', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opcionesCompletas);
      component.abrirAdicionales(linea('det:5'));
      component.aplicarAdicionales({
        adicionales: [{ id_adicional: 3, cantidad: 1, nombre: 'Orégano', precio: 0, consumidor: null }],
        promocion: opcionesCompletas.promociones[0], mantenerPromocion: false, precioUnitario: 13000,
      });
      expect(linea('det:5').configCambiada).toBe(false);
    });

    it('a un producto simple se le pueden agregar adicionales: pasa a ser una línea nueva', async () => {
      await cargar(pedidoConCombo(), sinVersion());
      entrarAEdicion(opcionesCompletas);
      component.adicionarProducto(item(1, 'choripan clasico', 10000)); // fila simple item:1
      component.abrirAdicionales(linea('item:1'));
      component.aplicarAdicionales({
        adicionales: [{ id_adicional: 4, cantidad: 1, nombre: 'Queso fundido', precio: 2500, consumidor: null }],
        promocion: null, mantenerPromocion: false, precioUnitario: 12500,
      });

      const nueva = component.lineasEdicion().find((l) => l.clave.startsWith('nuevo:'))!;
      expect(nueva).toMatchObject({ configurada: true, precio_unitario: 12500, extras: ['+ Queso fundido'] });
      expect(component.lineasEdicion().some((l) => l.clave === 'item:1')).toBe(false);

      component.guardarModificacion();
      const patch = httpMock.expectOne(`${api}/orders/24`);
      expect(patch.request.body.detalles).toContainEqual({
        id_item: 1, cantidad: 1, notas_especiales: undefined, adicionales: [{ id_adicional: 4 }], id_promocion: null,
      });
      patch.flush(pedidoConCombo());
      httpMock.expectOne(`${api}/kitchen/pedidos/24/comandas`).flush(resumen());
    });
  });
});
