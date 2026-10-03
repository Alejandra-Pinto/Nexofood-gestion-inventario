import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';

export const routes: Routes = [
  // Pantallas sin menú lateral (HU-1.1 / HU-1.3)
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // Pantallas internas: usan el diseño con menú lateral
  {
    path: '',
    loadComponent: () => import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        // HU-2.1 Registrar insumos y productos en inventario
        path: 'productos',
        loadComponent: () =>
          import('./features/productos/items-lista/items-lista').then((m) => m.ItemsLista),
      },
    ],
  },

  // Cualquier ruta desconocida vuelve al login
  { path: '**', redirectTo: 'login' },
];
