import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TicketComandaComponent } from './ticket-comanda';

describe('TicketComandaComponent', () => {
  let component: TicketComandaComponent;
  let fixture: ComponentFixture<TicketComandaComponent>;

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
});