import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolUsuario } from '../users/entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    login: jest.fn().mockResolvedValue({
      access_token: 'fake_jwt_token',
      usuario: {
        nombre: 'Admin Test',
        rol: RolUsuario.ADMINISTRADOR,
        permisos: [],
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('debe delegar el inicio de sesión a AuthService', async () => {
    const dto = { credencial: 'admin@chori.com', password: 'password123' };
    const resultado = await controller.login(dto);

    expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    expect(resultado).toHaveProperty('access_token', 'fake_jwt_token');
    expect(resultado.usuario.nombre).toBe('Admin Test');
  });
});
