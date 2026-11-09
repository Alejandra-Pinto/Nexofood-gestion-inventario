import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueriesReportsController } from './queries-reports.controller';
import { QueriesReportsService } from './queries-reports.service';
import { Pedido } from '../orders/entities/pedido.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, ItemInventario, MovimientoFinanciero])],
  // HU-5.2 historial · HU-6.2 y HU-6.7 reportes
  controllers: [QueriesReportsController, ReportesController],
  providers: [QueriesReportsService, ReportesService],
})
export class QueriesReportsModule {}
