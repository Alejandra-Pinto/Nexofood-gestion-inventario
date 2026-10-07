/**
 * Diseño principal: menú lateral + contenido de cada pantalla.
 * Se usa en las pantallas internas (ej: /productos). Login y registro no lo usan.
 */
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ToastContainer } from '../../shared/components/toast-container/toast-container';
import { PermisoUsuario, RolUsuario } from '../../core/models/usuario.model';

/** Opción del menú lateral */
interface OpcionMenu {
  texto: string;
  ruta?: string;
  icono: string;
  permiso?: PermisoUsuario; // HU-1.4: funcionalidad necesaria para verla
  soloAdmin?: boolean;
}

/** Usuario guardado por el login en localStorage */
interface UsuarioSesion {
  nombre: string;
  rol: RolUsuario;
  permisos?: PermisoUsuario[];
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainer],
  selector: 'app-main-layout',
  styleUrl: './main-layout.scss',
  templateUrl: './main-layout.html',
})
export class MainLayout {
  protected readonly usuario = leerUsuarioSesion();

  /**
   * Menú del administrador según el prototipo.
   * Solo "Productos" está implementado (HU-2.1); las demás opciones
   * se habilitan agregando su `ruta` cuando se desarrollen.
   */
  private readonly opciones: OpcionMenu[] = [
    { texto: 'Inicio', icono: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
    { texto: 'Ventas', permiso: 'ventas', icono: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01' },
    { texto: 'Productos', ruta: '/productos', permiso: 'productos', icono: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
    { texto: 'Inventario', ruta: '/inventario', permiso: 'inventario', icono: 'M12 3 2 8l105 10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5' },
    { texto: 'Usuarios', ruta: '/usuarios', soloAdmin: true, icono: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6' },
    { texto: 'Reportes', permiso: 'reportes', icono: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6' },
    { texto: 'Financiero', permiso: 'financiero', icono: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 9h.01M18 15h.01' },
    { texto: 'Configuración', soloAdmin: true, icono: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1' },

  ];

  /** HU-1.4: solo las opciones que el usuario en sesión tiene habilitadas */
  protected readonly menu = this.opciones.filter((op) => puedeVer(op, this.usuario));
}

function leerUsuarioSesion(): UsuarioSesion | null {
  try {
    const guardado = localStorage.getItem('usuario');
    return guardado ? (JSON.parse(guardado) as UsuarioSesion) : null;
  } catch {
    return null;
  }
}

function puedeVer(op: OpcionMenu, u: UsuarioSesion | null): boolean {
  // Sin sesión o sesión antigua (sin permisos): se muestra el menú completo como antes
  if (!u?.permisos || u.rol === 'Administrador') return true;
  if (op.soloAdmin) return false;
  return !op.permiso || u.permisos.includes(op.permiso);
}
