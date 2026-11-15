import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueriesReportsController } from './queries-reports.controller';
import { QueriesReportsService } from './queries-reports.service';
import { Pedido } from '../orders/entities/pedido.entity';
import { ItemInventario } from '../products/entities/item-inventario.entity';
import { MovimientoFinanciero } from '../finance/entities/movimiento-financiero.entity';
import { MovimientoInventario } from '../inventory/entities/movimiento-inventario.entity';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pedido, ItemInventario, MovimientoFinanciero, MovimientoInventario])],
  // HU-5.2 historial · HU-6.2, HU-6.3, HU-6.4 y HU-6.7 reportes
  controllers: [QueriesReportsController, ReportesController],
  providers: [QueriesReportsService, ReportesService],
})
export class QueriesReportsModule {}
