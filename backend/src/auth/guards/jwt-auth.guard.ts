/**
 * Guard que exige un token JWT válido (Bearer) en el header Authorization.
 * Si el token falta, expiró o es inválido, responde 401.
 *
 * Uso: @UseGuards(JwtAuthGuard) sobre el controller o el endpoint.
 */
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}