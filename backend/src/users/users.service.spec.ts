/**
 * Pruebas unitarias: UsersService · permisos
 * HU-1.4 · Pruebas de modificación de permisos
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import {
  PERMISOS_POR_ROL,
  PermisoUsuario,
  RolUsuario,
  TODOS_LOS_PERMISOS,
  User,
} from './entities/user.entity';

describe('UsersService · permisos', () => {
  let service: UsersService;
  let encontrado: Partial<User> | null;

  const repo = {
    findOne: jest.fn(() => Promise.resolve(encontrado)),
    save: jest.fn((u: unknown) => Promise.resolve(u)),
    find: jest.fn(() => Promise.resolve([])),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    encontrado = {
      id_usuario: 2,
      nombre_completo: 'Pepe',
      credencial: 'pepe@chori.com',
      password_hash: 'hash',
      rol: RolUsuario.MESERO,
      estado_activo: true,
      permisos: [PermisoUsuario.VENTAS],
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: getRepositoryToken(User), useValue: repo }],
    }).compile();
    service = module.get(UsersService);
  });

  it('cambia el rol de un usuario y no devuelve el hash', async () => {
    const res = await service.updatePermisos(2, { rol: RolUsuario.CAJERO }, 1);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ rol: RolUsuario.CAJERO }));
    expect(res.rol).toBe(RolUsuario.CAJERO);
    expect(res).not.toHaveProperty('password_hash');
  });

  it('puede desactivar a un usuario', async () => {
    const res = await service.updatePermisos(
      2, { rol: RolUsuario.MESERO, estado_activo: false }, 1,
    );
    expect(res.estado_activo).toBe(false);
  });

  it('actualiza las funcionalidades del usuario seleccionado', async () => {
    const res = await service.updatePermisos(
      2,
      { rol: RolUsuario.MESERO, permisos: [PermisoUsuario.VENTAS, PermisoUsuario.INVENTARIO] },
      1,
    );

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ permisos: [PermisoUsuario.VENTAS, PermisoUsuario.INVENTARIO] }),
    );
    expect(res.permisos).toEqual([PermisoUsuario.VENTAS, PermisoUsuario.INVENTARIO]);
  });

  it('permite dejar a un usuario sin funcionalidades', async () => {
    const res = await service.updatePermisos(2, { rol: RolUsuario.MESERO, permisos: [] }, 1);
    expect(res.permisos).toEqual([]);
  });

  it('si no se envían permisos conserva los que tenía', async () => {
    encontrado = { ...encontrado, permisos: [PermisoUsuario.REPORTES] };
    const res = await service.updatePermisos(2, { rol: RolUsuario.CAJERO }, 1);
    expect(res.permisos).toEqual([PermisoUsuario.REPORTES]);
  });

  it('el Administrador siempre queda con todas las funcionalidades', async () => {
    const res = await service.updatePermisos(
      2, { rol: RolUsuario.ADMINISTRADOR, permisos: [PermisoUsuario.VENTAS] }, 1,
    );
    expect(res.permisos).toEqual(TODOS_LOS_PERMISOS);
  });

  it('rechaza usuario inexistente (404), informa y no guarda', async () => {
    encontrado = null;
    const promesa = service.updatePermisos(
      99, { rol: RolUsuario.CAJERO, permisos: [PermisoUsuario.VENTAS] }, 1,
    );
    await expect(promesa).rejects.toBeInstanceOf(NotFoundException);
    await expect(promesa).rejects.toThrow('no existe o no está disponible');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('findAll devuelve los permisos por defecto del rol si el usuario no tiene propios', async () => {
    repo.find.mockResolvedValueOnce([
      { ...encontrado, rol: RolUsuario.CAJERO, permisos: null },
    ] as never);
    const [u] = await service.findAll();
    expect(u.permisos).toEqual(PERMISOS_POR_ROL[RolUsuario.CAJERO]);
  });

  it('un admin no puede quitarse su propio rol (400)', async () => {
    encontrado = { ...encontrado, id_usuario: 1, rol: RolUsuario.ADMINISTRADOR };
    await expect(
      service.updatePermisos(1, { rol: RolUsuario.MESERO }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('un admin no puede desactivarse a sí mismo (400)', async () => {
    encontrado = { ...encontrado, id_usuario: 1, rol: RolUsuario.ADMINISTRADOR };
    await expect(
      service.updatePermisos(1, { rol: RolUsuario.ADMINISTRADOR, estado_activo: false }, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersService · registro y consulta (HU-1.3)', () => {
  let service: UsersService;

  const repo = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('crea un usuario con contraseña hasheada y asignación de rol (HU-1.3)', async () => {
    const dto = {
      nombre_completo: 'Carlos Ruiz',
      credencial: 'carlos@chori.com',
      password: 'password123',
      rol: RolUsuario.CAJERO,
    };

    repo.create.mockReturnValue({
      ...dto,
      password_hash: '$2b$10$hashed',
      estado_activo: true,
      permisos: PERMISOS_POR_ROL[RolUsuario.CAJERO],
    });

    repo.save.mockResolvedValue({
      id_usuario: 10,
      ...dto,
      password_hash: '$2b$10$hashed',
      estado_activo: true,
      permisos: PERMISOS_POR_ROL[RolUsuario.CAJERO],
    });

    const resultado = await service.create(dto);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre_completo: 'Carlos Ruiz',
        credencial: 'carlos@chori.com',
        rol: RolUsuario.CAJERO,
      }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(resultado).not.toHaveProperty('password_hash');
    expect(resultado.id_usuario).toBe(10);
    expect(resultado.credencial).toBe('carlos@chori.com');
  });

  it('rechaza el registro con 409 si la credencial ya existe (código 23505)', async () => {
    const dto = {
      nombre_completo: 'Carlos Ruiz',
      credencial: 'duplicado@chori.com',
      password: 'password123',
      rol: RolUsuario.MESERO,
    };

    repo.create.mockReturnValue(dto);
    repo.save.mockRejectedValue({ code: '23505' });

    await expect(service.create(dto)).rejects.toThrow('La credencial ingresada ya está registrada');
  });

  it('busca un usuario por su credencial (findByCredencial)', async () => {
    const mockUser = { id_usuario: 5, credencial: 'test@chori.com' };
    repo.findOne.mockResolvedValue(mockUser);

    const resultado = await service.findByCredencial('test@chori.com');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { credencial: 'test@chori.com' } });
    expect(resultado).toEqual(mockUser);
  });
});