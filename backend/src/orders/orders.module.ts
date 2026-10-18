import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Pedido } from './entities/pedido.entity';
import { DetallePedido } from './entities/detalle-pedido.entity';
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';

// HU-3.1 Registrar nuevo pedido · HU-3.5 Registrar método de pago
@Module({
  imports: [TypeOrmModule.forFeature([Pedido, DetallePedido, ItemInventario, MovimientoFinanciero])],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
