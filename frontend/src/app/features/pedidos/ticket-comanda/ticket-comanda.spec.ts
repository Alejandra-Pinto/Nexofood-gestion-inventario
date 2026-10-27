import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TicketComandaComponent } from './ticket-comanda';
import { Pedido } from '../../../core/models/pedido.model';
import { ItemInventario } from '../../../core/models/item-inventario.model';

describe('TicketComandaComponent', () => {
  let component: TicketComandaComponent;
  let fixture: ComponentFixture<TicketComandaComponent>;

  const item = (nombre: string) => ({ nombre }) as ItemInventario;

  /** Pedido #024 del prototipo 14 */
  const pedido: Pedido = {
    id_pedido: 24,
    id_mesero: 3,
    numero_mesa: 4,
    fecha_hora: '2026-10-27T12:45:00Z',
    estado_pedido: 'PENDIENTE',
    total_calculado: 57000,
    mesero: { nombre: 'Juan S.' },
    detalles: [
      {
        id_detalle: 1, id_pedido: 24, id_item: 1, cantidad: 2, precio_unitario: 19000,
        notas_especiales: null, promocion_aplicada: 'Combo con papa', item: item('Choripán Pampero'),
        adicionales: [{ id_adicional: 2, cantidad: 1, precio_unitario: 0, nombre_adicional: 'Chimi Rojo' }],
      },
      {
        id_detalle: 2, id_pedido: 24, id_item: 2, cantidad: 1, precio_unitario: 19000,
        notas_especiales: 'sin cebolla', promocion_aplicada: null, item: item('Choripán Azteca'),
      },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TicketComandaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TicketComandaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('HU-3.2: imprime adicionales y combos con "+" y la nota resaltada ** SIN CEBOLLA **', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const ticket = fixture.nativeElement as HTMLElement;
    const lineas = Array.from(ticket.querySelectorAll('[class^="linea-"]')).map((l) => l.textContent?.trim());

    expect(lineas).toEqual([
      '2x CHORIPAN PAMPERO',
      '+ Chimi Rojo',
      '+ Combo con papa',
      '1x CHORIPAN AZTECA',
      '** SIN CEBOLLA **',
    ]);
    expect(ticket.querySelector('.linea-nota')?.textContent).toBe('** SIN CEBOLLA **');
  });

  it('HU-4.3: el pie indica hora y versión (Impreso 12:45:22 · v2) y lista los cambios', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('version', 2);
    fixture.componentRef.setInput('fechaImpresion', '2026-10-27T17:48:10Z');
    fixture.componentRef.setInput('cambios', ['Se agregó 1x Cerveza (ahora 2)']);
    fixture.detectChanges();

    const ticket = fixture.nativeElement as HTMLElement;
    expect(ticket.querySelector('.pie-version')?.textContent).toMatch(/^Impreso \d{2}:\d{2}:\d{2} · v2$/);
    expect(ticket.querySelector('.cambios-version')?.textContent).toContain('*** CAMBIOS v2 ***');
    expect(ticket.querySelector('.cambios-version')?.textContent).toContain('Se agregó 1x Cerveza (ahora 2)');
  });

  it('HU-4.3: la v1 no muestra bloque de cambios', () => {
    fixture.componentRef.setInput('pedido', pedido);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('version', 1);
    fixture.detectChanges();

    const ticket = fixture.nativeElement as HTMLElement;
    expect(ticket.querySelector('.cambios-version')).toBeNull();
    expect(ticket.querySelector('.pie-version')?.textContent).toMatch(/· v1$/);
  });
});
