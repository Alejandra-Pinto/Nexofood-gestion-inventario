import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Pedido } from './entities/pedido.entity';
import { DetallePedido } from './entities/detalle-pedido.entity'; // Ruta del compañero
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';
import { Comanda } from '../kitchen/entities/comanda.entity'; // Nuestra entidad
import { Adicional } from './entities/adicional.entity';
import { Promocion } from './entities/promocion.entity';
import { PedidoItemAdicional } from './entities/pedido-item-adicional.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Pedido, 
      DetallePedido, 
      ItemInventario, 
      MovimientoFinanciero,
      Comanda, // <-- Agregamos la comanda
      // HU-3.2 adicionales, promociones y combos
      Adicional,
      Promocion,
      PedidoItemAdicional,
    ])
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService], // <-- Mantenemos el export por si otros módulos lo necesitan
})
export class OrdersModule {}