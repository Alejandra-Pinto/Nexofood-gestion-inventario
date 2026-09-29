import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum RolUsuario {
  ADMINISTRADOR = 'Administrador',
  CAJERO = 'Cajero',
  MESERO = 'Mesero',
}

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
}