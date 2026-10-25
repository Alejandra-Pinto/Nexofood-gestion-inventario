import { Test, TestingModule } from '@nestjs/testing';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { EstadoImpresionComanda } from './entities/comanda.entity';

describe('KitchenController', () => {
  let controller: KitchenController;

  const mockKitchenService = {
    listarPendientes: jest.fn(),
    obtenerPorIdPedido: jest.fn(),
    actualizarEstado: jest.fn(),
    solicitarImpresion: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KitchenController],
      providers: [
        {
          provide: KitchenService,
          useValue: mockKitchenService,
        },
      ],
    }).compile();

    controller = module.get<KitchenController>(KitchenController);
  });

  it('debe estar definido', () => {
    expect(controller).toBeDefined();
  });

  it('listarPendientes delega al servicio', async () => {
    mockKitchenService.listarPendientes.mockResolvedValue([]);
    await controller.listarPendientes();
    expect(mockKitchenService.listarPendientes).toHaveBeenCalled();
  });

  it('obtenerPorIdPedido delega al servicio con el id recibido', async () => {
    mockKitchenService.obtenerPorIdPedido.mockResolvedValue({ id_comanda: 1 });
    await controller.obtenerPorIdPedido(10);
    expect(mockKitchenService.obtenerPorIdPedido).toHaveBeenCalledWith(10);
  });

  it('actualizarEstado delega al servicio', async () => {
    const dto = { estado_impresion: EstadoImpresionComanda.IMPRESA };
    mockKitchenService.actualizarEstado.mockResolvedValue({ id_comanda: 1, ...dto });
    await controller.actualizarEstado(1, dto);
    expect(mockKitchenService.actualizarEstado).toHaveBeenCalledWith(1, dto);
  });

  it('solicitarImpresion delega al servicio', async () => {
    mockKitchenService.solicitarImpresion.mockResolvedValue({ id_comanda: 1 });
    await controller.solicitarImpresion(5);
    expect(mockKitchenService.solicitarImpresion).toHaveBeenCalledWith(5);
  });
});
