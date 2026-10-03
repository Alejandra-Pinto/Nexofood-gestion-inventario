/**
 * Módulo: ProductsModule
 * ------------------------------------------------------------------
 * Agrupa todo lo relacionado con productos e insumos:
 * entidades (tablas), controlador (rutas) y servicio (lógica).
 * Se registra en app.module.ts.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { Categoria } from './entities/categoria.entity';
import { ItemInventario } from './entities/item-inventario.entity';

@Module({
  // Habilita los repositorios de estas tablas dentro del módulo
  imports: [TypeOrmModule.forFeature([ItemInventario, Categoria])],
  controllers: [ProductsController],
  providers: [ProductsService],
  // Se exporta para que otros módulos (Inventory, Orders) puedan usarlo después
  exports: [ProductsService],
})
export class ProductsModule {}
