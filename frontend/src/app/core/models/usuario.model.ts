export type RolUsuario = 'Administrador' | 'Cajero' | 'Mesero';

/** HU-1.4 · Funcionalidades (módulos) que se habilitan por usuario */
export type PermisoUsuario = 'productos' | 'inventario' | 'ventas' | 'reportes' | 'financiero';

export interface Usuario {
  id_usuario: number;
  nombre_completo: string;
  credencial: string;
  rol: RolUsuario;
  estado_activo: boolean;
  permisos: PermisoUsuario[];
}

export interface ActualizarPermisos {
  rol: RolUsuario;
  estado_activo: boolean;
  permisos: PermisoUsuario[];
}

/** Catálogo que se muestra en la pantalla de permisos */
export const PERMISOS: { clave: PermisoUsuario; nombre: string; descripcion: string }[] = [
  { clave: 'productos', nombre: 'Productos', descripcion: 'Registrar y editar productos e insumos' },
  { clave: 'inventario', nombre: 'Inventario', descripcion: 'Registrar ingresos y salidas de stock' },
  { clave: 'ventas', nombre: 'Ventas', descripcion: 'Tomar pedidos y registrar ventas' },
  { clave: 'reportes', nombre: 'Reportes', descripcion: 'Consultar reportes del negocio' },
  { clave: 'financiero', nombre: 'Financiero', descripcion: 'Ver ingresos, costos y cierres de caja' },
];
