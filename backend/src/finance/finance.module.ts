import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { MovimientoFinanciero } from './entities/movimiento-financiero.entity';

// HU-7.2 Registrar ingresos no provenientes de ventas
@Module({
  imports: [TypeOrmModule.forFeature([MovimientoFinanciero])],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
