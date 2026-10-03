import { IsString, IsEmail, MinLength, IsEnum, IsNotEmpty } from 'class-validator';
import { RolUsuario } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  nombre_completo: string;

  @IsEmail()
  @IsNotEmpty()
  credencial: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(RolUsuario)
  @IsNotEmpty()
  rol: RolUsuario;
}