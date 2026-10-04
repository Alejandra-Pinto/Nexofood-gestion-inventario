/**
 * Pruebas unitarias: InventoryController
 * ------------------------------------------------------------------
 * HU-2.4 · SCRUM-134 Pruebas de salidas manuales
 *
 * Verifica que el controller delegue el trabajo al service,
 * pasando el id del usuario autenticado (obtenido del JWT).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { CreateSalidaDto, MotivoSalida } from './dto/create-salida.dto';
import { CreateIngresoDto, MotivoIngreso } from './dto/create-ingreso.dto';
import { RolUsuario } from '../users/entities/user.entity';
import { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';

describe('InventoryController', () => {
  let controller: InventoryController;

  const serviceMock = {
    registrarSalida: jest.fn(),
    registrarIngreso: jest.fn(),
    listarProveedores: jest.fn(),
  };

  const usuarioAutenticado: UsuarioAutenticado = {
    id_usuario: 5,
    rol: RolUsuario.CAJERO,
    nombre: 'María López',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [{ provide: InventoryService, useValue: serviceMock }],
    }).compile();

    controller = module.get(InventoryController);
  });

  it('delega el registro al service con el id del usuario del token', async () => {
    const dto: CreateSalidaDto = {
      id_item: 1,
      motivo: MotivoSalida.MERMA,
      cantidad: 3,
    };
    serviceMock.registrarSalida.mockResolvedValue(
      Object.assign({ id_movimiento: 1 }, dto),
    );

    const resultado = await controller.registrarSalida(
      dto,
      usuarioAutenticado,
    );

    expect(serviceMock.registrarSalida).toHaveBeenCalledWith(dto, 5);
    expect(resultado).toMatchObject({ id_movimiento: 1 });
  });

  // ---------- HU-2.3 · Ingresos (SCRUM-130) ----------

  it('registrarIngreso delega al service con el id del usuario del token', async () => {
    const dto: CreateIngresoDto = {
      id_item: 1,
      motivo: MotivoIngreso.COMPRA,
      id_proveedor: 2,
      cantidad: 120,
      costo_unitario: 18000,
    };
    serviceMock.registrarIngreso.mockResolvedValue(
      Object.assign({ id_movimiento: 9 }, dto),
    );

    const resultado = await controller.registrarIngreso(dto, usuarioAutenticado);

    expect(serviceMock.registrarIngreso).toHaveBeenCalledWith(dto, 5);
    expect(resultado).toMatchObject({ id_movimiento: 9 });
  });

  it('registrarIngreso propaga los errores del service', async () => {
    const dto: CreateIngresoDto = {
      id_item: 99,
      motivo: MotivoIngreso.PRODUCCION,
      cantidad: 5,
    };
    serviceMock.registrarIngreso.mockRejectedValue(new Error('boom'));

    await expect(
      controller.registrarIngreso(dto, usuarioAutenticado),
    ).rejects.toThrow('boom');
  });

  it('listarProveedores devuelve los proveedores del service', async () => {
    const proveedores = [{ id_proveedor: 1, nombre: 'Carnes del Sur', estado_activo: true }];
    serviceMock.listarProveedores.mockResolvedValue(proveedores);

    await expect(controller.listarProveedores()).resolves.toEqual(proveedores);
  });
});