import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'register', component: RegisterComponent, canActivate: [guestGuard] },

  // Pantallas internas: usan el diseño con menú lateral.
  {
    path: '',
    canActivate: [authGuard],
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
        // Módulo Ventas: /ventas abre "Mis mesas"
        path: 'ventas',
        children: [
          { path: '', redirectTo: 'mesas', pathMatch: 'full' },
          {
            // HU-3.1 Mis mesas: el mesero elige la mesa
            path: 'mesas',
            loadComponent: () =>
              import('./features/ventas/mis-mesas/mis-mesas').then((m) => m.MisMesas),
          },
          {
            // HU-3.1 Pedido de una mesa (/ventas/mesa/4)
            path: 'mesa/:numero',
            loadComponent: () =>
              import('./features/ventas/nuevo-pedido/nuevo-pedido').then(
                (m) => m.NuevoPedido,
              ),
          },
          {
            // HU-3.1 Pedido sin mesa (para llevar / tomado en caja)
            path: 'nuevo-pedido',
            loadComponent: () =>
              import('./features/ventas/nuevo-pedido/nuevo-pedido').then(
                (m) => m.NuevoPedido,
              ),
          },
          {
            // HU-3.5 Registrar método de pago
            path: 'cobrar',
            loadComponent: () =>
              import('./features/ventas/cobrar-pedido/cobrar-pedido').then(
                (m) => m.CobrarPedido,
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
      {
        // HU-3.4 y HU-4.1 Detalle del pedido y generación de comanda
        path: 'pedidos/:id',
        loadComponent: () =>
          import('./features/pedidos/pedido-detalle/pedido-detalle').then(
            (m) => m.PedidoDetalleComponent,
          ),
      },
    ],
  },

  // Cualquier ruta desconocida vuelve al login
  { path: '**', redirectTo: 'login' },
];