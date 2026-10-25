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
 * Implementar creación de ítem e inicialización de stock
 */
import { Body, Controller, Get, Param, ParseEnumPipe, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateItemDto } from './dto/create-item.dto';
import { TipoItem } from './entities/item-inventario.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../users/entities/user.entity';

// @Controller() sin prefijo para poder exponer /products y /categories
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMINISTRADOR, RolUsuario.CAJERO, RolUsuario.MESERO)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('alerts')
  alertas() {
    return this.productsService.alertasStock();
  }

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
   * Solo el Administrador puede crear productos e insumos.
   */
  @Post('products')
  @Roles(RolUsuario.ADMINISTRADOR)
  create(@Body() dto: CreateItemDto) {
    return this.productsService.create(dto);
  }

  /** GET /categories  -> opciones del selector "Categoría" del formulario */
  @Get('categories')
  findCategorias() {
    return this.productsService.findCategorias();
  }
}
