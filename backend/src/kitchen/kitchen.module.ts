import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { Comanda } from './entities/comanda.entity';
import { Pedido } from '../orders/entities/pedido.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Comanda, Pedido])],
  controllers: [KitchenController],
  providers: [KitchenService],
  exports: [KitchenService],
})
export class KitchenModule {}
