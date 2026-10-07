import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginUserDto } from '../users/dto/login-user.dto';
import { permisosEfectivos } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async login(loginDto: LoginUserDto) {
    // 1. Buscar si el usuario existe
    const user = await this.usersService.findByCredencial(loginDto.credencial);
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Comparar la contraseña ingresada con el hash de la base de datos
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 3. Generar el JWT (Payload incluye el rol para que el Frontend decida qué menú mostrar)
    const payload = { sub: user.id_usuario, rol: user.rol, nombre: user.nombre_completo };
    
    return {
      access_token: await this.jwtService.signAsync(payload),
      usuario: {
        nombre: user.nombre_completo,
        rol: user.rol,
        permisos: permisosEfectivos(user), // HU-1.4: el menú muestra solo estas funcionalidades
      }
    };
  }
}