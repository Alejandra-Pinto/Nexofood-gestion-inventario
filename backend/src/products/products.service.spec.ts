import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Categoria } from './entities/categoria.entity';
import { ItemInventario, TipoItem } from './entities/item-inventario.entity';
import { CreateItemDto } from './dto/create-item.dto';

/**
 * Pruebas unitarias: ProductsService
 * ------------------------------------------------------------------
 * HU-2.1 · SCRUM-125 Pruebas de registro de ítems
 *
 * No se usa la base de datos real: los repositorios de TypeORM se
 * reemplazan por "mocks" (objetos falsos) para probar solo la lógica.
 *
 * Ejecutar:  cd backend  ->  npm test
 */
describe('ProductsService', () => {
  let service: ProductsService;
  // Ítem que "devuelve" la consulta de duplicados (null = no existe)
  let duplicado: ItemInventario | null;

  // Mock del createQueryBuilder usado para buscar nombres duplicados
  const queryBuilder = {
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(() => Promise.resolve(duplicado)),
  };
  // Mock del repositorio de item_inventario: save() devuelve el ítem con id 1
  const itemsRepo = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    create: jest.fn((datos: Partial<ItemInventario>) => datos),
    save: jest.fn((item: ItemInventario) => Promise.resolve({ ...item, id_item: 1 })),
    find: jest.fn(),
    findOne: jest.fn(),
  };
  // Mock del repositorio de categoria
  const categoriasRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  // Datos válidos de ejemplo
  const producto: CreateItemDto = {
    nombre: 'Choripán clásico',
    tipo_item: TipoItem.PRODUCTO,
    id_categoria: 1,
    cantidad_stock: 20,
    stock_minimo: 5,
    costo_fabricacion: 5500,
    precio_venta: 12000,
  };

  // Antes de cada prueba: se limpian los mocks y se crea el servicio
  beforeEach(async () => {
    jest.clearAllMocks();
    duplicado = null;
    categoriasRepo.findOne.mockResolvedValue({ id_categoria: 1, nombre: 'Choripanes' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(ItemInventario), useValue: itemsRepo },
        { provide: getRepositoryToken(Categoria), useValue: categoriasRepo },
      ],
    }).compile();

    service = module.get(ProductsService);
  });

  it('registra un producto con su stock inicial', async () => {
    const creado = await service.create(producto);

    expect(itemsRepo.save).toHaveBeenCalledTimes(1);
    expect(creado.id_item).toBe(1);
    expect(creado.cantidad_stock).toBe(20);
    expect(creado.precio_venta).toBe(12000);
    expect(creado.estado_activo).toBe(true);
  });

  it('registra un insumo y guarda el precio de venta en 0', async () => {
    const creado = await service.create({
      ...producto,
      nombre: 'Chorizo artesanal',
      tipo_item: TipoItem.INSUMO,
      precio_venta: 9999,
    });

    expect(creado.tipo_item).toBe(TipoItem.INSUMO);
    expect(creado.precio_venta).toBe(0);
  });

  it('rechaza un nombre duplicado con 409 y no guarda', async () => {
    duplicado = { id_item: 7, nombre: 'Choripán clásico' } as ItemInventario;

    await expect(service.create({ ...producto, nombre: 'choripán CLÁSICO' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(itemsRepo.save).not.toHaveBeenCalled();
  });

  it('rechaza una categoría que no existe', async () => {
    categoriasRepo.findOne.mockResolvedValue(null);

    await expect(service.create({ ...producto, id_categoria: 99 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(itemsRepo.save).not.toHaveBeenCalled();
  });
});
