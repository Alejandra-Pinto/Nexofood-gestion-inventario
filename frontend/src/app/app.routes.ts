import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';

export const routes: Routes = [
  // Pantallas sin menú lateral (HU-1.1 / HU-1.3)
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },

  // Pantallas internas: usan el diseño con menú lateral.
  // Cuando el usuario entra a "/", se muestra el layout y su hijo
  // por defecto redirige a /productos (que ya existe desde HU-2.1).
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      { path: '', redirectTo: 'productos', pathMatch: 'full' },

      {
        // HU-2.1 Registrar insumos y productos en inventario
        path: 'productos',
        loadComponent: () =>
          import('./features/productos/items-lista/items-lista').then(
            (m) => m.ItemsLista,
          ),
      },
      {
        // Módulo Inventario: /inventario abre Ingresos; el menú lateral queda
        // activo en cualquiera de sus pantallas.
        path: 'inventario',
        children: [
          { path: '', redirectTo: 'ingresos', pathMatch: 'full' },
          {
            // HU-2.3 Ajuste de stock: registrar ingresos (compra / producción)
            path: 'ingresos',
            loadComponent: () =>
              import('./features/inventario/ingreso-form/ingreso-form').then(
                (m) => m.IngresoForm,
              ),
          },
          {
            // HU-2.4 Registrar salidas manuales de inventario
            path: 'salidas',
            loadComponent: () =>
              import('./features/inventario/salida-form/salida-form').then(
                (m) => m.SalidaForm,
              ),
          },
        ],
      },
      {
        // HU-1.4 Modificar permisos de usuarios
        path: 'usuarios',
        loadComponent: () =>
          import('./features/usuarios/permisos-usuarios/permisos-usuarios').then(
            (m) => m.PermisosUsuarios,
          ),
      },
    ],
  },

  // Cualquier ruta desconocida vuelve al login
  { path: '**', redirectTo: 'login' },
];