/** Controlador: FinanceController - Endpoints (solo Administrador) */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { FinanceService, IngresoFinanciero, ListaIngresos } from './finance.service';
import { CreateIngresoFinancieroDto } from './dto/create-ingreso-financiero.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RolUsuario } from '../users/entities/user.entity';
import type { UsuarioAutenticado } from '../auth/strategies/jwt.strategy';

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RolUsuario.ADMINISTRADOR)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  /** Registrar ingreso no proveniente de ventas */
  @Post('ingresos')
  registrarIngreso(
    @Body() dto: CreateIngresoFinancieroDto,
    @CurrentUser() usuario: UsuarioAutenticado,
  ): Promise<IngresoFinanciero> {
    return this.financeService.registrarIngreso(dto, usuario.id_usuario);
  }

  @Get('ingresos')
  listarIngresos(@Query('desde') desde?: string, @Query('hasta') hasta?: string): Promise<ListaIngresos> {
    return this.financeService.listarIngresos(desde, hasta);
  }
}
