/**
 * Pruebas unitarias: ProductsController
 * ------------------------------------------------------------------
 * HU-2.1 · SCRUM-125 Pruebas de registro de ítems
 * Verifica que el controlador entregue los datos al servicio.
 * El servicio se reemplaza por un mock.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TipoItem } from './entities/item-inventario.entity';

describe('ProductsController', () => {
  let controller: ProductsController;
  const service = { create: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), findCategorias: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    controller = module.get(ProductsController);
  });

  it('POST /products delega el registro en el servicio', async () => {
    const dto = {
      nombre: 'Pan baguette',
      tipo_item: TipoItem.INSUMO,
      id_categoria: 5,
      cantidad_stock: 30,
      stock_minimo: 10,
      costo_fabricacion: 900,
    };
    service.create.mockResolvedValue({ id_item: 3, ...dto });

    await expect(controller.create(dto)).resolves.toMatchObject({ id_item: 3 });
    expect(service.create).toHaveBeenCalledWith(dto);
  });
});
