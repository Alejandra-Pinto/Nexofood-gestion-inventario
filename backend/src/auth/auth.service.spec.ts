import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RolUsuario, User } from '../users/entities/user.entity';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  const mockUser: User = {
    id_usuario: 1,
    nombre_completo: 'Admin Test',
    credencial: 'admin@chori.com',
    password_hash: '$2b$10$hashedPassword',
    rol: RolUsuario.ADMINISTRADOR,
    estado_activo: true,
    permisos: null,
  };

  const mockUsersService = {
    findByCredencial: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('fake_jwt_token'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe iniciar sesión exitosamente con credenciales válidas', async () => {
    mockUsersService.findByCredencial.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login({
      credencial: 'admin@chori.com',
      password: 'password123',
    });

    expect(result).toHaveProperty('access_token', 'fake_jwt_token');
    expect(result.usuario.nombre).toBe('Admin Test');
    expect(result.usuario.rol).toBe(RolUsuario.ADMINISTRADOR);
  });

  it('debe rechazar el inicio de sesión si el usuario no existe (401)', async () => {
    mockUsersService.findByCredencial.mockResolvedValue(null);

    await expect(
      service.login({ credencial: 'noexiste@chori.com', password: 'password123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe rechazar el inicio de sesión si la contraseña no coincide (401)', async () => {
    mockUsersService.findByCredencial.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({ credencial: 'admin@chori.com', password: 'wrongPassword' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('debe rechazar el inicio de sesión si el usuario está inactivo (401)', async () => {
    mockUsersService.findByCredencial.mockResolvedValue({
      ...mockUser,
      estado_activo: false,
    });

    await expect(
      service.login({ credencial: 'admin@chori.com', password: 'password123' }),
    ).rejects.toThrow('El usuario se encuentra inactivo');
  });
});
