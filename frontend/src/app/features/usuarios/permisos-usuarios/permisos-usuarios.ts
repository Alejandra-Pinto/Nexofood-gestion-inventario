/**
 * Pantalla: PermisosUsuarios (opción "Usuarios" del menú)
 * HU-1.4 · Modificar permisos de usuarios
 *  1. El administrador selecciona un usuario de la tabla.
 *  2. Ajusta rol, estado y funcionalidades en el panel de edición.
 *  3. "Guardar cambios" -> PATCH /users/:id/permisos y mensaje de confirmación.
 *     Si el usuario ya no existe (404) se informa y no se realiza ningún cambio.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { UsuariosService } from '../../../core/services/usuarios.service';
import { ToastService } from '../../../core/services/toast.service';
import {
  ActualizarPermisos,
  PERMISOS,
  PermisoUsuario,
  RolUsuario,
  Usuario,
} from '../../../core/models/usuario.model';

const MSJ_NO_EXISTE = 'El usuario seleccionado no existe o no está disponible. No se realizaron cambios.';

@Component({
  selector: 'app-permisos-usuarios',
  templateUrl: './permisos-usuarios.html',
  styleUrl: './permisos-usuarios.scss',
})
export class PermisosUsuarios {
  private service = inject(UsuariosService);
  private toast = inject(ToastService);

  protected usuarios = signal<Usuario[]>([]);
  protected cargando = signal(true);
  protected error = signal(false);
  protected guardando = signal(false);

  /** Usuario elegido en la tabla y sus cambios sin guardar */
  protected seleccionado = signal<Usuario | null>(null);
  protected borrador = signal<ActualizarPermisos | null>(null);

  protected readonly roles: RolUsuario[] = ['Administrador', 'Cajero', 'Mesero'];
  protected readonly permisos = PERMISOS;

  /** El Administrador siempre tiene todas las funcionalidades */
  protected esAdmin = computed(() => this.borrador()?.rol === 'Administrador');

  protected hayCambios = computed(() => {
    const u = this.seleccionado();
    const b = this.borrador();
    if (!u || !b) return false;
    return (
      b.rol !== u.rol ||
      b.estado_activo !== u.estado_activo ||
      !mismosPermisos(b.permisos, u.permisos)
    );
  });

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    this.service.listar().subscribe({
      next: (lista) => {
        this.usuarios.set(lista);
        this.cargando.set(false);
        this.error.set(false);
      },
      error: () => {
        this.error.set(true);
        this.cargando.set(false);
      },
    });
  }

  protected seleccionar(u: Usuario): void {
    this.seleccionado.set(u);
    this.borrador.set({ rol: u.rol, estado_activo: u.estado_activo, permisos: [...u.permisos] });
  }

  protected cancelar(): void {
    this.seleccionado.set(null);
    this.borrador.set(null);
  }

  protected cambiarRol(rol: string): void {
    this.borrador.update((b) => b && {
      ...b,
      rol: rol as RolUsuario,
      permisos: rol === 'Administrador' ? PERMISOS.map((p) => p.clave) : b.permisos,
    });
  }

  protected cambiarActivo(activo: boolean): void {
    this.borrador.update((b) => b && { ...b, estado_activo: activo });
  }

  protected tienePermiso(p: PermisoUsuario): boolean {
    return this.borrador()?.permisos.includes(p) ?? false;
  }

  protected alternarPermiso(p: PermisoUsuario, marcado: boolean): void {
    this.borrador.update((b) => b && {
      ...b,
      permisos: marcado
        ? [...b.permisos.filter((x) => x !== p), p]
        : b.permisos.filter((x) => x !== p),
    });
  }

  /** Texto corto para la tabla: "Productos, Ventas" */
  protected nombresPermisos(u: Usuario): string {
    if (u.permisos.length === 0) return 'Sin funcionalidades';
    if (u.permisos.length === PERMISOS.length) return 'Todas';
    return PERMISOS.filter((p) => u.permisos.includes(p.clave)).map((p) => p.nombre).join(', ');
  }

  protected guardarCambios(): void {
    const u = this.seleccionado();
    const b = this.borrador();
    if (this.guardando() || !u || !b || !this.hayCambios()) return;

    this.guardando.set(true);
    this.service.actualizarPermisos(u.id_usuario, b).subscribe({
      next: (act) => {
        this.guardando.set(false);
        this.usuarios.update((l) => l.map((x) => (x.id_usuario === act.id_usuario ? { ...x, ...act } : x)));
        this.cancelar();
        this.toast.exito(`Permisos de "${act.nombre_completo}" actualizados correctamente.`);
      },
      error: (e: HttpErrorResponse) => {
        this.guardando.set(false);
        this.toast.error(this.mensajeDeError(e));
        if (e.status === 404) {
          this.cancelar();
          this.cargar(); // el usuario ya no existe: refrescar lista
        }
      },
    });
  }

  private mensajeDeError(e: HttpErrorResponse): string {
    const mensaje = e.error?.message;
    switch (e.status) {
      case 400:
        return Array.isArray(mensaje) ? mensaje.join('. ') : (mensaje ?? 'Datos inválidos.');
      case 401:
        return 'Sesión expirada. Vuelva a iniciar sesión.';
      case 403:
        return 'No tiene permisos para modificar usuarios.';
      case 404:
        return MSJ_NO_EXISTE;
      case 0:
        return 'No hay conexión con el servidor. ¿Está corriendo el backend?';
      default:
        return 'No se pudo actualizar el usuario. Intente de nuevo.';
    }
  }
}

function mismosPermisos(a: PermisoUsuario[], b: PermisoUsuario[]): boolean {
  return a.length === b.length && a.every((p) => b.includes(p));
}
