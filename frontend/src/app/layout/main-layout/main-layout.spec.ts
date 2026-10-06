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

  afterEach(() => localStorage.removeItem('usuario'));

  it('HU-1.4: muestra solo las funcionalidades habilitadas al usuario en sesión', async () => {
    localStorage.setItem('usuario', JSON.stringify({ nombre: 'Pepe', rol: 'Mesero', permisos: ['ventas'] }));
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.menu')?.textContent).toContain('Ventas');
    expect(html.querySelector('.menu')?.textContent).not.toContain('Productos');
    expect(html.querySelector('.menu')?.textContent).not.toContain('Usuarios');
  });

  it('muestra el nombre del negocio y la opción Productos', async () => {
    const fixture = TestBed.createComponent(MainLayout);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('.marca')?.textContent).toContain('Chori Company');
    expect(html.textContent).toContain('Productos');
  });
});
