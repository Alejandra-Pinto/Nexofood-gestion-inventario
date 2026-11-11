/**
 * Pruebas unitarias: QueriesReportsController
 * HU-5.1, HU-5.2 y HU-6.1
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { QueriesReportsController } from './queries-reports.controller';
import { QueriesReportsService } from './queries-reports.service';
import { FiltrosHistorialDto } from './dto/filtros-historial.dto';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../users/entities/user.entity';

describe('QueriesReportsController', () => {
  let controller: QueriesReportsController;
  const service = { historial: jest.fn(), reporteInventario: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueriesReportsController],
      providers: [{ provide: QueriesReportsService, useValue: service }],
    }).compile();
    controller = module.get(QueriesReportsController);
  });

  it('delega los filtros al servicio', async () => {
    service.historial.mockResolvedValue({ pedidos: [] });
    await controller.historial({ fecha: '2026-11-04', id_item: 5 });
    expect(service.historial).toHaveBeenCalledWith({ fecha: '2026-11-04', id_item: 5 });
  });

  it('delega el reporte de inventario al servicio', async () => {
    service.reporteInventario.mockResolvedValue({ items: [], resumen: {} });
    await controller.reporteInventario();
    expect(service.reporteInventario).toHaveBeenCalled();
  });

  it('solo el Administrador puede consultar el historial y reportes', () => {
    expect(Reflect.getMetadata(ROLES_KEY, QueriesReportsController)).toEqual([RolUsuario.ADMINISTRADOR]);
  });

  // El ValidationPipe global (main.ts) convierte y valida los query params
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (query: Partial<Record<string, string>>) =>
    pipe.transform(query, { type: 'query', metatype: FiltrosHistorialDto });

  it('convierte id_item a número', async () => {
    await expect(validar({ id_item: '5', fecha: '2026-11-04' })).resolves.toEqual({ id_item: 5, fecha: '2026-11-04' });
  });

  it.each([{ fecha: '04/11/2026' }, { id_item: 'abc' }, { id_item: '0' }, { estado: 'INVALIDO' }])(
    'rechaza el filtro %j',
    async (query) => {
      await expect(validar(query)).rejects.toThrow();
    },
  );
});
