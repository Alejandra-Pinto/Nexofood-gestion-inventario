/**
 * Controlador: ReportesController
 * ------------------------------------------------------------------
 * Endpoints (solo Administrador):
 *   GET /queries-reports/resumen?desde=&hasta=  -> HU-6.7 resumen de operaciones por período
 *   GET /queries-reports/ventas?desde=&hasta=   -> HU-6.2 reporte general de ventas
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { ReporteVentas, ResumenPeriodo } from './reportes';
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

  /** HU-6.2 · 200 con las ventas finalizadas del período (sin_ventas = true si no hubo) · 400 período inválido */
  @Get('ventas')
  ventas(@Query() f: FiltrosPeriodoDto): Promise<ReporteVentas> {
    return this.reportes.ventas(f.desde, f.hasta);
  }
}
