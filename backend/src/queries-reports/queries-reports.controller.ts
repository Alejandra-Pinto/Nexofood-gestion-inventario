/**
 * Controlador: QueriesReportsController
 * ------------------------------------------------------------------
 * Endpoints:
 *   GET /queries-reports/historial  -> HU-5.2 historial de pedidos y ventas con filtros
 *       ?fecha=AAAA-MM-DD | ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD | ?id_item=N (combinables)
 *
 * Solo el Administrador consulta el historial: los demás roles reciben 403.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { QueriesReportsService, ResultadoHistorial } from './queries-reports.service';
import { FiltrosHistorialDto } from './dto/filtros-historial.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../users/entities/user.entity';

@Controller('queries-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMINISTRADOR)
export class QueriesReportsController {
  constructor(private readonly service: QueriesReportsService) {}

  @Get('historial')
  historial(@Query() filtros: FiltrosHistorialDto): Promise<ResultadoHistorial> {
    return this.service.historial(filtros);
  }
}
