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
import { RolUsuario } from '../users/entities/user.entity';
import { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';

describe('InventoryController', () => {
  let controller: InventoryController;

  const serviceMock = {
    registrarSalida: jest.fn(),
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
});