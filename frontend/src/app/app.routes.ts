/**
 * Rutas de la aplicación.
 * Cada ruta carga su pantalla solo cuando se visita (lazy loading).
 */
import { Routes } from '@angular/router';

export const routes: Routes = [
  // Por ahora la pantalla inicial es Productos
  { path: '', pathMatch: 'full', redirectTo: 'productos' },
  {
    // HU-2.1 Registrar insumos y productos en inventario
    path: 'productos',
    loadComponent: () =>
      import('./features/productos/items-lista/items-lista').then((m) => m.ItemsLista),
  },
  // Cualquier ruta desconocida vuelve a Productos
  { path: '**', redirectTo: 'productos' },
];
