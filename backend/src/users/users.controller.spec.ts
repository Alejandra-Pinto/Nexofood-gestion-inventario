/**
 * Pruebas unitarias: UsersController
 * HU-1.4 · Pruebas de modificación de permisos
 */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PermisoUsuario, RolUsuario } from './entities/user.entity';

describe('UsersController', () => {
  let controller: UsersController;

  const service = {
    create: jest.fn(),
    findAll: jest.fn(),
    updatePermisos: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('PATCH /users/:id/permisos envía el id del administrador que hace el cambio', async () => {
    const dto = { rol: RolUsuario.CAJERO, permisos: [PermisoUsuario.VENTAS] };
    service.updatePermisos.mockResolvedValue({ id_usuario: 2, ...dto });

    const res = await controller.updatePermisos(2, dto, {
      id_usuario: 1, rol: RolUsuario.ADMINISTRADOR, nombre: 'Ana',
    });

    expect(service.updatePermisos).toHaveBeenCalledWith(2, dto, 1);
    expect(res).toEqual({ id_usuario: 2, ...dto });
  });

  it('propaga el 404 cuando el usuario no existe', async () => {
    service.updatePermisos.mockRejectedValue(
      new NotFoundException('El usuario seleccionado no existe o no está disponible'),
    );

    await expect(
      controller.updatePermisos(99, { rol: RolUsuario.MESERO }, {
        id_usuario: 1, rol: RolUsuario.ADMINISTRADOR, nombre: 'Ana',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
