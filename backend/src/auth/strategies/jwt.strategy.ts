/**
 * Estrategia JWT de Passport
 * ------------------------------------------------------------------
 * Valida el token Bearer enviado por el frontend y expone en `req.user`
 * un objeto limpio con el usuario autenticado.
 *
 * El payload que firma AuthService.login() es:
 *   { sub: id_usuario, rol: RolUsuario, nombre: string }
 */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
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
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Debe coincidir con el secret de JwtModule.register() en auth.module.ts
      secretOrKey: 'super-_secret_key_nexofood',
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