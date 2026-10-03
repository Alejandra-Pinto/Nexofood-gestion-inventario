/**
 * Controlador: ProductsController
 * ------------------------------------------------------------------
 * Define las RUTAS HTTP (endpoints) del módulo Products.
 * Recibe la petición del frontend, valida los parámetros
 * y delega el trabajo al ProductsService.
 *
 * Endpoints:
 *   GET  /products              -> lista todos los ítems (filtro opcional ?tipo=PRODUCTO|INSUMO)
 *   GET  /products/:id          -> consulta un ítem por id
 *   POST /products              -> registra un producto o insumo (HU-2.1)
 *   GET  /categories            -> lista las categorías
 *
 * HU-2.1 · SCRUM-123 Implementar creación de ítem e inicialización de stock
 */
import { Body, Controller, Get, Param, ParseEnumPipe, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateItemDto } from './dto/create-item.dto';
import { TipoItem } from './entities/item-inventario.entity';

// @Controller() sin prefijo para poder exponer /products y /categories
@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /** GET /products?tipo=PRODUCTO|INSUMO  (si ?tipo no es válido responde 400) */
  @Get('products')
  findAll(@Query('tipo', new ParseEnumPipe(TipoItem, { optional: true })) tipo?: TipoItem) {
    return this.productsService.findAll(tipo);
  }

  /** GET /products/:id  (ParseIntPipe convierte el id a número; si no es número responde 400) */
  @Get('products/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  /**
   * POST /products  -> HU-2.1 registrar producto o insumo
   * El body se valida automáticamente con CreateItemDto (ver main.ts -> ValidationPipe).
   * Responde 201 con el ítem creado.
   */
  @Post('products')
  create(@Body() dto: CreateItemDto) {
    return this.productsService.create(dto);
  }

  /** GET /categories  -> opciones del selector "Categoría" del formulario */
  @Get('categories')
  findCategorias() {
    return this.productsService.findCategorias();
  }
}
