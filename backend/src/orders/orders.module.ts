import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Pedido } from './entities/pedido.entity';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';

// HU-3.1 Registrar nuevo pedido
@Module({
  imports: [TypeOrmModule.forFeature([Pedido, DetallePedido, ItemInventario])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
