/** Pruebas unitarias: FinanceController */
import { Test, TestingModule } from '@nestjs/testing';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { MedioPago } from './entities/movimiento-financiero.entity';
import { RolUsuario } from '../users/entities/user.entity';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('FinanceController', () => {
  let controller: FinanceController;
  const service = { registrarIngreso: jest.fn(), listarIngresos: jest.fn(), historial: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinanceController],
      providers: [{ provide: FinanceService, useValue: service }],
    }).compile();
    controller = module.get(FinanceController);
  });

  it('registra el ingreso con el usuario del token', async () => {
    const dto = { concepto: 'Aporte', categoria: 'APORTE_SOCIOS' as const, monto: 1000, medio_pago: MedioPago.EFECTIVO };
    await controller.registrarIngreso(dto, { id_usuario: 3, rol: RolUsuario.ADMINISTRADOR, nombre: 'Admin' });
    expect(service.registrarIngreso).toHaveBeenCalledWith(dto, 3);
  });

  it('lista los ingresos del período pedido', async () => {
    await controller.listarIngresos('2026-11-01', '2026-11-06');
    expect(service.listarIngresos).toHaveBeenCalledWith('2026-11-01', '2026-11-06');
  });

  // HU-7.3 · SCRUM-252
  it('el historial financiero delega en el servicio', async () => {
    await controller.historial();
    expect(service.historial).toHaveBeenCalled();
  });

  it('el historial lo consultan Administrador y Cajero; el registro sigue siendo solo del Administrador', () => {
    const roles = (metodo: keyof FinanceController) => Reflect.getMetadata(ROLES_KEY, FinanceController.prototype[metodo]) as RolUsuario[] | undefined;
    expect(roles('historial')).toEqual([RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO]);
    expect(roles('registrarEgreso')).toBeUndefined();
    expect(Reflect.getMetadata(ROLES_KEY, FinanceController)).toEqual([RolUsuario.ADMINISTRADOR]);
  });
});
