/** Controlador: ReportesController - Endpoints (solo Administrador) */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { ReporteProductosMasVendidos, ReporteVentas, ResumenPeriodo } from './reportes';
import { FiltrosPeriodoDto } from './dto/filtros-periodo.dto';
import { FiltrosPeriodoOpcionalDto } from './dto/filtros-periodo-opcional.dto';
import { ReporteFinanciero } from './reporte-financiero';
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
    return f.id_item
      ? this.reportes.ventas(f.desde, f.hasta, f.id_item)
      : this.reportes.ventas(f.desde, f.hasta);
  }

  /** HU-6.3 · 200 con el ranking de productos más vendidos del período (sin_ventas = true si no hubo) · 400 período inválido */
  @Get('productos-mas-vendidos')
  productosMasVendidos(@Query() f: FiltrosPeriodoDto): Promise<ReporteProductosMasVendidos> {
    return f.id_item
      ? this.reportes.productosMasVendidos(f.desde, f.hasta, f.id_item)
      : this.reportes.productosMasVendidos(f.desde, f.hasta);
  }

  /** HU-6.4 · 200 con ingresos, egresos, saldo neto y consumo interno (sin fechas = mes en curso) · 400 período inválido */
  @Get('financiero')
  financiero(@Query() f: FiltrosPeriodoOpcionalDto): Promise<ReporteFinanciero> {
    return this.reportes.financiero(f.desde, f.hasta);
  }
}
