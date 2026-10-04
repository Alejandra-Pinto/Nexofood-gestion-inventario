import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { MovimientoInventario } from './entities/movimiento-inventario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoInventario])],
  controllers: [InventoryController],
  providers: [InventoryService],
})
export class InventoryModule {}