import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PedidoDetalleComponent } from './pedido-detalle';

describe('PedidoDetalleComponent', () => {
  let component: PedidoDetalleComponent;
  let fixture: ComponentFixture<PedidoDetalleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PedidoDetalleComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PedidoDetalleComponent);
    component = fixture.componentInstance;
    // No hacemos fixture.detectChanges() aquí porque el componente 
    // intenta hacer una petición HTTP en el ngOnInit.
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});