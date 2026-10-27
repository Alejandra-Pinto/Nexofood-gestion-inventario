import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PedidoDetalleComponent } from './pedido-detalle';

describe('PedidoDetalleComponent', () => {
  let component: PedidoDetalleComponent;
  let fixture: ComponentFixture<PedidoDetalleComponent>;
  let httpMock: HttpTestingController;

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
    fixture = TestBed.createComponent(PedidoDetalleComponent);
    component = fixture.componentInstance;
    // No hacemos fixture.detectChanges() aquí porque el componente 
    // intenta hacer una petición HTTP en el ngOnInit.
  });

  afterEach(() => {
    httpMock?.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});