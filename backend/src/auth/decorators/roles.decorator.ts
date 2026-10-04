/**
 * Decorador @Roles(...) — marca un endpoint con los roles permitidos.
 * Se usa junto con RolesGuard para restringir el acceso.
 */
import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../../users/entities/user.entity';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);