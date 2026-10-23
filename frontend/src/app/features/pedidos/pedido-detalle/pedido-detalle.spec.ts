import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PedidoDetalle } from './pedido-detalle';

describe('PedidoDetalle', () => {
  let component: PedidoDetalle;
  let fixture: ComponentFixture<PedidoDetalle>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PedidoDetalle],
    }).compileComponents();

    fixture = TestBed.createComponent(PedidoDetalle);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
