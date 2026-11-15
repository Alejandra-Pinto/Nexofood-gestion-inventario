import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EgresoFormComponent } from './egreso-form';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('EgresoFormComponent', () => {
  let component: EgresoFormComponent;
  let fixture: ComponentFixture<EgresoFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EgresoFormComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EgresoFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});