import { Module } from '@nestjs/common';
import { QueriesReportsController } from './queries-reports.controller';
import { QueriesReportsService } from './queries-reports.service';

@Module({
  controllers: [QueriesReportsController],
  providers: [QueriesReportsService]
})
export class QueriesReportsModule {}
