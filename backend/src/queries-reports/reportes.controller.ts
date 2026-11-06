/**
 * Controlador: ReportesController
 * ------------------------------------------------------------------
 * Endpoints (solo Administrador):
 *   GET /queries-reports/resumen?desde=&hasta=  -> HU-6.7 resumen de operaciones por período
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { ResumenPeriodo } from './reportes';
import { FiltrosPeriodoDto } from './dto/filtros-periodo.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolUsuario } from '../users/entities/user.entity';

@Controller('queries-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMINISTRADOR)
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

  /** HU-6.7 · 200 con el resumen (sin_operaciones = true si no hubo nada) · 400 período inválido */
  @Get('resumen')
  resumen(@Query() f: FiltrosPeriodoDto): Promise<ResumenPeriodo> {
    return this.reportes.resumen(f.desde, f.hasta);
  }
}
