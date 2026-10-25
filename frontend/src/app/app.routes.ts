import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login/login';
import { RegisterComponent } from './auth/register/register';
import { adminGuard, authGuard, guestGuard, permisoGuard, rolGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  // HU-1.1 y Sección 5.2: Registro exclusivo para Administrador autenticado
  { path: 'register', component: RegisterComponent, canActivate: [adminGuard] },

  // Pantallas internas: usan el diseño con menú lateral.
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      { path: '', redirectTo: 'productos', pathMatch: 'full' },

      {
        // HU-2.1 Catálogo de productos e insumos (consulta permitida a roles autorizados)
        path: 'productos',
        loadComponent: () =>
          import('./features/productos/items-lista/items-lista').then(
            (m) => m.ItemsLista,
          ),
      },
      {
        // Módulo Inventario: solo usuarios con permiso o Administrador
        path: 'inventario',
        canActivate: [permisoGuard('inventario')],
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
        // Módulo Ventas: solo usuarios con permiso ventas o Administrador
        path: 'ventas',
        canActivate: [permisoGuard('ventas')],
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
            // HU-3.5 Registrar método de pago (solo Cajero o Administrador)
            path: 'cobrar',
            canActivate: [rolGuard(['Administrador', 'Cajero'])],
            loadComponent: () =>
              import('./features/ventas/cobrar-pedido/cobrar-pedido').then(
                (m) => m.CobrarPedido,
              ),
          },
        ],
      },
      {
        // HU-1.4 Modificar permisos de usuarios (exclusivo Administrador)
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/usuarios/permisos-usuarios/permisos-usuarios').then(
            (m) => m.PermisosUsuarios,
          ),
      },
      {
        // HU-3.3, HU-3.4, HU-3.6 Detalle, modificación y anulación del pedido
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