/**
 * Pruebas unitarias: PermisosUsuarios
 * HU-1.4 · Pruebas de modificación de permisos
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PermisosUsuarios } from './permisos-usuarios';
import { ToastService } from '../../../core/services/toast.service';
import { Usuario } from '../../../core/models/usuario.model';
import { environment } from '../../../../environments/environment';

describe('PermisosUsuarios', () => {
  let http: HttpTestingController;
  let toast: ToastService;
  const api = environment.apiUrl;

  const usuarios: Usuario[] = [
    {
      id_usuario: 1, nombre_completo: 'Ana', credencial: 'ana@chori.com', rol: 'Administrador',
      estado_activo: true, permisos: ['productos', 'inventario', 'ventas', 'reportes', 'financiero'],
    },
    {
      id_usuario: 2, nombre_completo: 'Pepe', credencial: 'pepe@chori.com', rol: 'Mesero',
      estado_activo: true, permisos: ['ventas'],
    },
  ];

  const crear = async () => {
    const fixture = TestBed.createComponent(PermisosUsuarios);
    http.expectOne(`${api}/users`).flush(usuarios);
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance as any, html: fixture.nativeElement as HTMLElement };
  };

  const hayToast = (tipo: string, texto: string) =>
    toast.toasts().some((t) => t.tipo === tipo && t.mensaje.includes(texto));

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PermisosUsuarios],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => http.verify());

  it('muestra una fila por usuario con sus funcionalidades', async () => {
    const { html } = await crear();
    const filas = html.querySelectorAll('tbody tr');
    expect(filas.length).toBe(2);
    expect(filas[0].textContent).toContain('Todas');
    expect(filas[1].textContent).toContain('Ventas');
  });

  it('al seleccionar un usuario abre el panel con "Guardar cambios"', async () => {
    const { fixture, cmp, html } = await crear();
    cmp.seleccionar(usuarios[1]);
    fixture.detectChanges();

    expect(html.querySelector('.panel h2')?.textContent).toContain('Pepe');
    const boton = Array.from(html.querySelectorAll('.panel button')).find((b) =>
      b.textContent?.includes('Guardar cambios'),
    ) as HTMLButtonElement;
    expect(boton).toBeTruthy();
    expect(boton.disabled).toBe(true); // sin cambios todavía
  });

  it('no envía nada si no hay cambios', async () => {
    const { cmp } = await crear();
    cmp.seleccionar(usuarios[1]);
    cmp.guardarCambios();
    http.expectNone(`${api}/users/2/permisos`);
  });

  it('usuario existente: guarda los permisos y muestra confirmación', async () => {
    const { cmp } = await crear();
    cmp.seleccionar(usuarios[1]);
    cmp.alternarPermiso('inventario', true);
    cmp.alternarPermiso('ventas', false);
    cmp.guardarCambios();

    const req = http.expectOne(`${api}/users/2/permisos`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ rol: 'Mesero', estado_activo: true, permisos: ['inventario'] });
    req.flush({ ...usuarios[1], permisos: ['inventario'] });

    expect(cmp.usuarios()[1].permisos).toEqual(['inventario']);
    expect(cmp.seleccionado()).toBeNull();
    expect(hayToast('exito', 'Pepe')).toBe(true);
  });

  it('al elegir rol Administrador marca todas las funcionalidades', async () => {
    const { cmp } = await crear();
    cmp.seleccionar(usuarios[1]);
    cmp.cambiarRol('Administrador');
    expect(cmp.borrador().permisos.length).toBe(5);
    expect(cmp.esAdmin()).toBe(true);
  });

  it('usuario no existente (404): informa, no aplica cambios y recarga la lista', async () => {
    const { cmp } = await crear();
    cmp.seleccionar(usuarios[1]);
    cmp.alternarPermiso('reportes', true);
    cmp.guardarCambios();

    http.expectOne(`${api}/users/2/permisos`).flush(
      { message: 'El usuario seleccionado no existe o no está disponible' },
      { status: 404, statusText: 'Not Found' },
    );
    http.expectOne(`${api}/users`).flush([usuarios[0]]);

    expect(hayToast('error', 'no existe o no está disponible')).toBe(true);
    expect(hayToast('exito', '')).toBe(false);
    expect(cmp.seleccionado()).toBeNull();
    expect(cmp.usuarios().length).toBe(1);
  });

  it('403: informa que no tiene permisos', async () => {
    const { cmp } = await crear();
    cmp.seleccionar(usuarios[1]);
    cmp.cambiarActivo(false);
    cmp.guardarCambios();

    http.expectOne(`${api}/users/2/permisos`)
      .flush({ message: 'Acceso denegado' }, { status: 403, statusText: 'Forbidden' });

    expect(hayToast('error', 'permisos')).toBe(true);
  });

  it('cancelar descarta los cambios', async () => {
    const { cmp } = await crear();
    cmp.seleccionar(usuarios[1]);
    cmp.alternarPermiso('financiero', true);
    cmp.cancelar();
    expect(cmp.seleccionado()).toBeNull();
    expect(cmp.usuarios()[1].permisos).toEqual(['ventas']);
  });
});
