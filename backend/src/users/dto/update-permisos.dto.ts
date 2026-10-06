/**
 * DTO: UpdatePermisosDto
 * HU-1.4 · Modificar permisos de usuarios
 */
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PermisoUsuario, RolUsuario } from '../entities/user.entity';

export class UpdatePermisosDto {
  @IsEnum(RolUsuario, {
    message: 'El rol debe ser Administrador, Cajero o Mesero',
  })
  rol: RolUsuario;

  @IsOptional()
  @IsBoolean({ message: 'El estado debe ser verdadero o falso' })
  estado_activo?: boolean;

  @IsOptional()
  @IsArray({ message: 'Los permisos deben enviarse como una lista' })
  @ArrayUnique({ message: 'Hay permisos repetidos' })
  @IsEnum(PermisoUsuario, {
    each: true,
    message: 'Permiso inválido. Valores permitidos: productos, inventario, ventas, reportes, financiero',
  })
  permisos?: PermisoUsuario[];
}
