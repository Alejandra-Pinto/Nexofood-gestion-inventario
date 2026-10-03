/**
 * Servicio: ProductsService
 * ------------------------------------------------------------------
 * Contiene la LÓGICA DE NEGOCIO del módulo Products:
 * consultar, buscar y registrar productos e insumos.
 * HU-2.1 · SCRUM-123 Implementar creación de ítem e inicialización de stock
 *        · SCRUM-124 Validar duplicados y campos obligatorios
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from './entities/categoria.entity';
import { ItemInventario, TipoItem } from './entities/item-inventario.entity';
import { CreateItemDto } from './dto/create-item.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ItemInventario)
    private readonly itemsRepo: Repository<ItemInventario>,
    @InjectRepository(Categoria)
    private readonly categoriasRepo: Repository<Categoria>,
  ) {}

  /**
   * Lista los ítems del inventario ordenados por nombre.
   * @param tipo (opcional) 'PRODUCTO' o 'INSUMO' para filtrar
   */
  findAll(tipo?: TipoItem): Promise<ItemInventario[]> {
    return this.itemsRepo.find({
      where: tipo ? { tipo_item: tipo } : {},
      order: { nombre: 'ASC' },
    });
  }

  /**
   * Busca un ítem por su id.
   * Si no existe responde 404 (Not Found).
   */
  async findOne(id: number): Promise<ItemInventario> {
    const item = await this.itemsRepo.findOne({ where: { id_item: id } });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    return item;
  }

  /** Lista las categorías para llenar el selector del formulario */
  findCategorias(): Promise<Categoria[]> {
    return this.categoriasRepo.find({ order: { nombre: 'ASC' } });
  }

  /**
   * Registra un nuevo producto o insumo con su stock inicial.
   *
   * Pasos:
   *  1. Verifica que la categoría exista            -> si no, 400 (Bad Request)
   *  2. Verifica que el nombre no esté repetido     -> si sí, 409 (Conflict)  
   *  3. Si es INSUMO, el precio de venta se guarda en 0
   *  4. Guarda el ítem con cantidad_stock = stock inicial  
   */
  async create(dto: CreateItemDto): Promise<ItemInventario> {
    // 1. La categoría debe existir en la tabla categoria
    const categoria = await this.categoriasRepo.findOne({ where: { id_categoria: dto.id_categoria } });
    if (!categoria) throw new BadRequestException('La categoría seleccionada no existe');

    // 2. Nombre duplicado: se compara sin importar mayúsculas ni espacios
    //    ("Choripán Clásico" = " choripán clásico ")
    const duplicado = await this.itemsRepo
      .createQueryBuilder('i')
      .where('LOWER(TRIM(i.nombre)) = LOWER(TRIM(:nombre))', { nombre: dto.nombre })
      .getOne();
    if (duplicado) throw new ConflictException(`Ya existe un ítem llamado "${duplicado.nombre}"`);

    // 3 y 4. Se arma el registro y se guarda en la base de datos
    const item = this.itemsRepo.create({
      ...dto,
      precio_venta: dto.tipo_item === TipoItem.INSUMO ? 0 : dto.precio_venta,
      estado_activo: dto.estado_activo ?? true, // por defecto queda activo
    });
    return this.itemsRepo.save(item);
  }
}
