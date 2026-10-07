import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum RolUsuario {
  ADMINISTRADOR = 'Administrador',
  CAJERO = 'Cajero',
  MESERO = 'Mesero',
}

/** HU-1.4 · Funcionalidades (módulos) que se pueden habilitar a cada usuario */
export enum PermisoUsuario {
  PRODUCTOS = 'productos',
  INVENTARIO = 'inventario',
  VENTAS = 'ventas',
  REPORTES = 'reportes',
  FINANCIERO = 'financiero',
}

export const TODOS_LOS_PERMISOS: PermisoUsuario[] = Object.values(PermisoUsuario);

/** Permisos por defecto de cada rol (se usan si el usuario no tiene permisos propios) */
export const PERMISOS_POR_ROL: Record<RolUsuario, PermisoUsuario[]> = {
  [RolUsuario.ADMINISTRADOR]: TODOS_LOS_PERMISOS,
  [RolUsuario.CAJERO]: [PermisoUsuario.VENTAS, PermisoUsuario.PRODUCTOS, PermisoUsuario.REPORTES],
  [RolUsuario.MESERO]: [PermisoUsuario.VENTAS],
};

@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn()
  id_usuario: number;

  @Column({ type: 'varchar', length: 150 })
  nombre_completo: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  credencial: string;

  @Column({ type: 'varchar' })
  password_hash: string;

  @Column({ type: 'enum', enum: RolUsuario, default: RolUsuario.MESERO })
  rol: RolUsuario;

  @Column({ type: 'boolean', default: true })
  estado_activo: boolean;

  /** HU-1.4 · null = usa los permisos por defecto de su rol */
  @Column({ type: 'text', array: true, nullable: true })
  permisos: PermisoUsuario[] | null;
}

/** Permisos que realmente tiene el usuario (el Administrador siempre tiene todos) */
export function permisosEfectivos(user: Pick<User, 'rol' | 'permisos'>): PermisoUsuario[] {
  if (user.rol === RolUsuario.ADMINISTRADOR) return [...TODOS_LOS_PERMISOS];
  return [...(user.permisos ?? PERMISOS_POR_ROL[user.rol] ?? [])];
}
