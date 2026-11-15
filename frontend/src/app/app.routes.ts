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
        path: 'productos',
        loadComponent: () =>
          import('./features/productos/items-lista/items-lista').then(
            (m) => m.ItemsLista,
          ),
      },
      {
        path: 'inventario',
        canActivate: [permisoGuard('inventario')],
        children: [
          { path: '', redirectTo: 'ingresos', pathMatch: 'full' },
          {
            path: 'ingresos',
            loadComponent: () =>
              import('./features/inventario/ingreso-form/ingreso-form').then(
                (m) => m.IngresoForm,
              ),
          },
          {
            path: 'salidas',
            loadComponent: () =>
              import('./features/inventario/salida-form/salida-form').then(
                (m) => m.SalidaForm,
              ),
          },
        ],
      },
      {
        path: 'ventas',
        canActivate: [permisoGuard('ventas')],
        children: [
          { path: '', redirectTo: 'mesas', pathMatch: 'full' },
          {
            path: 'mesas',
            loadComponent: () =>
              import('./features/ventas/mis-mesas/mis-mesas').then((m) => m.MisMesas),
          },
          {
            path: 'mesa/:numero',
            loadComponent: () =>
              import('./features/ventas/nuevo-pedido/nuevo-pedido').then(
                (m) => m.NuevoPedido,
              ),
          },
          {
            path: 'nuevo-pedido',
            loadComponent: () =>
              import('./features/ventas/nuevo-pedido/nuevo-pedido').then(
                (m) => m.NuevoPedido,
              ),
          },
          {
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
        path: 'usuarios',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/usuarios/permisos-usuarios/permisos-usuarios').then(
            (m) => m.PermisosUsuarios,
          ),
      },
      {
        path: 'historial',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/historial/historial-pedidos/historial-pedidos').then(
            (m) => m.HistorialPedidos,
          ),
      },
      {
        path: 'reportes/inventario',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/reportes/reporte-inventario/reporte-inventario').then(
            (m) => m.ReporteInventario,
          ),
      },
      {
        path: 'reportes',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/reportes/reportes/reportes').then((m) => m.Reportes),
      },
      
      // ==========================================================
      // MÓDULO FINANCIERO (Padre con Rutas Anidadas)
      // ==========================================================
      {
        path: 'financiero',
        canActivate: [adminGuard],
        children: [
          { path: '', redirectTo: 'ingresos', pathMatch: 'full' },
          {
            // HU-7.2 Registrar ingresos
            path: 'ingresos',
            loadComponent: () =>
              import('./features/financiero/ingreso-financiero/ingreso-financiero').then(
                (m) => m.IngresoFinanciero,
              ),
          },
          {
            // HU-7.1 Registrar egresos
            path: 'egresos',
            loadComponent: () =>
              import('./features/financiero/egreso-form/egreso-form').then(
                (m) => m.EgresoFormComponent,
              ),
          },
        ],
      },

      {
        path: 'pedidos/:id',
        loadComponent: () =>
          import('./features/pedidos/pedido-detalle/pedido-detalle').then(
            (m) => m.PedidoDetalleComponent,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'login' },
];