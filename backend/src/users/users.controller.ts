import {
  Controller, Post, Get, Patch, Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePermisosDto } from './dto/update-permisos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolUsuario } from './entities/user.entity';
import type { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  /** GET /users -> lista para la pantalla de permisos (solo Administrador) */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  findAll() {
    return this.usersService.findAll();
  }

  /** PATCH /users/:id/permisos -> HU-1.4 (solo Administrador) */
  @Patch(':id/permisos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  updatePermisos(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermisosDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ) {
    return this.usersService.updatePermisos(id, dto, usuario.id_usuario);
  }
}