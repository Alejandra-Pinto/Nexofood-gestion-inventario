
/**
 * Estrategia JWT de Passport
 * ------------------------------------------------------------------
 * Valida el token Bearer enviado por el frontend y expone en req.user
 * un objeto limpio con el usuario autenticado.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { RolUsuario } from '../../users/entities/user.entity';

interface JwtPayload {
  sub: number;
  rol: RolUsuario;
  nombre: string;
}

export interface UsuarioAutenticado {
  id_usuario: number;
  rol: RolUsuario;
  nombre: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<UsuarioAutenticado> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    return {
      id_usuario: payload.sub,
      rol: payload.rol,
      nombre: payload.nombre,
    };
  }
}
