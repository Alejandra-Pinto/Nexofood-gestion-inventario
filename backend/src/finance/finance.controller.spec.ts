/**
 * Pruebas unitarias: FinanceController
 * HU-7.2 · SCRUM-248
 */
import { Test, TestingModule } from '@nestjs/testing';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { MedioPago } from './entities/movimiento-financiero.entity';
import { RolUsuario } from '../users/entities/user.entity';

describe('FinanceController', () => {
  let controller: FinanceController;
  const service = { registrarIngreso: jest.fn(), listarIngresos: jest.fn() };

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
});
