/**
 * Pruebas del diseño principal (menú lateral).
 * HU-2.1 · SCRUM-125
 */
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MainLayout } from './main-layout';

describe('MainLayout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MainLayout],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('muestra el nombre del negocio y la opción Productos', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.marca')?.textContent).toContain('Chori Company');
    expect(html.textContent).toContain('Productos');
  });
});
