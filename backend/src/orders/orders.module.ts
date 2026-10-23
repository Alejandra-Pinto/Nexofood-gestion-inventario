import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Pedido, DetallePedido } from './entities/pedido.entity';
import { Comanda } from '../kitchen/entities/comanda.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, DetallePedido, Comanda])],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}