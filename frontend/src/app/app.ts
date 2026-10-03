import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** Opción del menú lateral */
interface OpcionMenu {
  texto: string;
  ruta?: string;  
  icono: string;  
}

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  /**
   * Menú del administrador según el prototipo.
   * Solo "Productos" está implementado (HU-2.1); las demás opciones
   * se habilitan agregando su `ruta` cuando se desarrollen.
   */
  protected readonly menu: OpcionMenu[] = [
    { texto: 'Inicio', icono: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z' },
    { texto: 'Ventas', icono: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01' },
    { texto: 'Productos', ruta: '/productos', icono: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8' },
    { texto: 'Inventario', icono: 'M12 3 2 8l10 5 10-5zM2 12.5l10 5 10-5M2 17l10 5 10-5' },
    { texto: 'Usuarios', icono: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.2a3.5 3.5 0 0 1 0 6.6' },
    { texto: 'Reportes', icono: 'M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6' },
    { texto: 'Financiero', icono: 'M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M6 9h.01M18 15h.01' },
    { texto: 'Configuración', icono: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1' },
  ];
}
