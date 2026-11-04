import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueriesReportsController } from './queries-reports.controller';
import { QueriesReportsService } from './queries-reports.service';
import { Pedido } from '../orders/entities/pedido.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, ItemInventario])],
  controllers: [QueriesReportsController],
  providers: [QueriesReportsService],
})
export class QueriesReportsModule {}
