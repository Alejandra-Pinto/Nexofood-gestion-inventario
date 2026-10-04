/**
 * Decorador @CurrentUser() — inyecta el usuario autenticado como
 * parámetro del método del controller.
 * Requiere que el endpoint esté protegido con JwtAuthGuard.
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UsuarioAutenticado } from '../strategies/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);