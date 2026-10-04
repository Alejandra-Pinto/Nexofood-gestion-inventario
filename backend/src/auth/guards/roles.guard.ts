/**
 * Guard de autorización por rol.
 * Verifica que el usuario autenticado tenga uno de los roles
 * declarados con @Roles(...) en el endpoint.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolUsuario } from '../../users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UsuarioAutenticado } from '../strategies/jwt.strategy';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolUsuario[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const usuario: UsuarioAutenticado | undefined = request.user;

    if (!usuario) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    if (!rolesRequeridos.includes(usuario.rol)) {
      throw new ForbiddenException(
        `Acceso denegado. Se requiere uno de los roles: ${rolesRequeridos.join(', ')}`,
      );
    }

    return true;
  }
}